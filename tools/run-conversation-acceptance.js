import process from 'node:process';
import path from 'node:path';

import { runConversationAcceptance } from '../src/evaluation/conversation-acceptance.js';

export function parseConversationAcceptanceArguments(argumentsList) {
  if (argumentsList.length === 1 && argumentsList[0] === '--help') return Object.freeze({ help: true });
  const values = {};
  const valueOptions = new Set(['--deployment-root', '--dataset', '--tmp-dir', '--run-id', '--max-turns']);
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--resume' || argument === '--include-transcript') {
      values[argument] = true;
      continue;
    }
    if (!valueOptions.has(argument)) throw new Error('Unsupported argument: ' + argument);
    const value = argumentsList[index + 1];
    if (!value || value.startsWith('--')) throw new Error(argument + ' requires a value.');
    values[argument] = value;
    index += 1;
  }
  for (const option of ['--deployment-root', '--dataset', '--tmp-dir']) if (!values[option]) throw new Error(option + ' is required.');
  for (const option of ['--deployment-root', '--dataset', '--tmp-dir']) if (!path.isAbsolute(values[option])) throw new Error(option + ' must be an absolute path.');
  return Object.freeze({
    help: false,
    deploymentRoot: path.resolve(values['--deployment-root']),
    datasetPath: path.resolve(values['--dataset']),
    temporaryDirectory: path.resolve(values['--tmp-dir']),
    runId: values['--run-id'] ?? undefined,
    resume: values['--resume'] === true,
    maxTurns: values['--max-turns'] === undefined ? null : Number(values['--max-turns']),
    includeTranscript: values['--include-transcript'] === true
  });
}

export async function runConversationAcceptanceCommand({ argumentsList = process.argv.slice(2), environment = process.env, output = process.stdout, errorOutput = process.stderr } = {}) {
  let options;
  try {
    options = parseConversationAcceptanceArguments(argumentsList);
  } catch (error) {
    errorOutput.write(error.message + '\n' + usage());
    return 2;
  }
  if (options.help) {
    output.write(usage());
    return 0;
  }
  try {
    const report = await runConversationAcceptance({ ...options, environment, output });
    return report.completed && report.passed === false ? 1 : 0;
  } catch (error) {
    errorOutput.write('Conversation acceptance failed: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    return 1;
  }
}

function usage() {
  return 'Usage: node --env-file-if-exists=<deployment .env> ./tools/run-conversation-acceptance.js --deployment-root <absolute-path> --dataset <absolute-path-inside-app/evaluations> --tmp-dir <absolute-path-inside-tmp> [--run-id <id>] [--resume] [--max-turns <count>] [--include-transcript]\nRuns model-led acceptance without exact-reply assertions. It persists a sanitized, resumable transcript only under tmp/.\n';
}

if (process.argv[1]?.endsWith('/run-conversation-acceptance.js') || process.argv[1]?.endsWith('\\run-conversation-acceptance.js')) {
  runConversationAcceptanceCommand().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
