import { randomUUID } from 'node:crypto';
import process from 'node:process';
import path from 'node:path';

import { createCapabilityRouter } from '../src/ai/capability-router.js';
import { writeJsonAtomic } from '../src/core/safe-filesystem.js';
import { createDeploymentDescriptor } from '../src/deployment/deployment-descriptor.js';

const CAPABILITY = 'conversation_generation';

export function parseProviderProbeArguments(argumentsList) {
  const values = {};
  const valueOptions = new Set(['--deployment-root', '--runtime-data-dir', '--lane', '--message', '--language']);
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--help') return Object.freeze({ help: true });
    if (argument === '--show-text' || argument === '--json') {
      values[argument.slice(2)] = true;
      continue;
    }
    if (!valueOptions.has(argument)) throw new Error('Unsupported argument: ' + argument);
    const value = argumentsList[index + 1];
    if (!value || value.startsWith('--')) throw new Error(argument + ' requires a value.');
    values[argument.slice(2)] = value;
    index += 1;
  }
  for (const key of ['deployment-root', 'runtime-data-dir', 'lane', 'message']) {
    if (!values[key]) throw new Error('--' + key + ' is required.');
  }
  if (!path.isAbsolute(values['deployment-root']) || !path.isAbsolute(values['runtime-data-dir'])) {
    throw new Error('--deployment-root and --runtime-data-dir must be absolute paths.');
  }
  if (values.message.length > 2_000) throw new Error('--message must contain at most 2000 characters.');
  return Object.freeze({
    help: false,
    deploymentRoot: values['deployment-root'],
    runtimeDataDirectory: values['runtime-data-dir'],
    laneId: values.lane,
    message: values.message,
    language: values.language ?? null,
    showText: values['show-text'] === true,
    json: values.json === true
  });
}

export async function runProviderProbe({ argumentsList = process.argv.slice(2), environment = process.env, output = process.stdout, errorOutput = process.stderr } = {}) {
  let options;
  try {
    options = parseProviderProbeArguments(argumentsList);
  } catch (error) {
    errorOutput.write(error.message + '\n' + usage());
    return 2;
  }
  if (options.help) {
    output.write(usage());
    return 0;
  }
  const descriptor = await createDeploymentDescriptor({ deploymentRoot: options.deploymentRoot });
  const configuredRoute = descriptor.configuration.aiCapabilityRoutes.routes.find((route) => route.capability === CAPABILITY);
  const lane = descriptor.configuration.aiProviderLanes.lanes.find((candidate) => candidate.id === options.laneId);
  if (!configuredRoute || !lane || ![configuredRoute.primaryLaneId, ...configuredRoute.fallbackLaneIds].includes(lane.id)) {
    errorOutput.write('--lane must be an enabled member of the configured conversation_generation route.\n');
    return 2;
  }
  const configuration = structuredClone(descriptor.configuration);
  configuration.aiCapabilityRoutes.routes = [{ ...configuredRoute, primaryLaneId: lane.id, fallbackLaneIds: [] }];
  const requestId = 'probe-' + randomUUID();
  const router = createCapabilityRouter({
    configuration,
    contracts: descriptor.contracts,
    environment,
    allowUnqualifiedNetwork: true
  });
  const outcome = await router.execute({
    schemaVersion: 1,
    requestId,
    capability: CAPABILITY,
    requestedAt: new Date().toISOString(),
    messages: [{ role: 'user', content: options.message }],
    generation: { languageHint: options.language, maxOutputCharacters: Math.min(lane.maxOutputCharacters, 1_200), temperature: null }
  });
  const report = Object.freeze({
    schemaVersion: 1,
    kind: 'provider_probe',
    requestId,
    laneId: lane.id,
    status: outcome.status,
    providerId: outcome.result?.providerId ?? null,
    model: outcome.result?.model ?? null,
    responseCharacterCount: outcome.result?.text.length ?? null,
    failureCode: outcome.failure?.code ?? null,
    completedAt: outcome.result?.completedAt ?? outcome.failure?.occurredAt ?? new Date().toISOString()
  });
  await writeJsonAtomic(options.runtimeDataDirectory, path.posix.join('provider-probes', requestId + '.json'), report);
  if (options.json) {
    output.write(JSON.stringify(options.showText && outcome.status === 'success' ? { ...report, text: outcome.result.text } : report) + '\n');
  } else if (outcome.status === 'success') {
    output.write('Provider probe succeeded for lane ' + lane.id + '. ' + (options.showText ? '\n\n' + outcome.result.text + '\n' : 'Response text was not persisted; use --show-text to inspect it.\n'));
  } else {
    output.write('Provider probe failed: ' + report.failureCode + '. A sanitized report was written to the runtime data directory.\n');
  }
  return outcome.status === 'success' ? 0 : 1;
}

function usage() {
  return 'Usage: node --env-file-if-exists=<deployment .env> ./bin/provider-probe.js --deployment-root <absolute-path> --runtime-data-dir <absolute-path> --lane <configured-lane> --message <non-sensitive synthetic probe> [--language en|es] [--show-text] [--json]\nThe probe makes an explicit, unqualified network check of one configured lane. It stores only a sanitized report, never the prompt, response text, provider body, or credentials.\n';
}

if (process.argv[1]?.endsWith('/provider-probe.js') || process.argv[1]?.endsWith('\\provider-probe.js')) {
  runProviderProbe().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write('Provider probe failed: ' + error.message + '\n');
    process.exitCode = 1;
  });
}
