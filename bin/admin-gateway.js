import process from 'node:process';

import { createDeploymentDescriptor } from '../src/deployment/deployment-descriptor.js';
import { FoundationError } from '../src/core/foundation-error.js';
import { createGatewayRuntime } from '../src/gateway/gateway-runtime.js';
import { cleanupGatewayStore, listGatewayCallbacks, listGatewayJobs } from '../src/gateway/gateway-store.js';

export async function runGatewayAdministration(argumentsList, { environment = process.env, stdout = process.stdout } = {}) {
  const { command, deploymentRoot } = parseOptions(argumentsList);
  if (command === 'help') { stdout.write('Usage: node ./bin/admin-gateway.js --deployment-root <absolute-path> <jobs|callbacks|cleanup>\n'); return null; }
  const descriptor = await createDeploymentDescriptor({ deploymentRoot });
  const runtime = await createGatewayRuntime({ descriptor, environment });
  if (command === 'cleanup') {
    const result = await cleanupGatewayStore(runtime.store);
    stdout.write(`${JSON.stringify(result)}\n`);
    return result;
  }
  const records = command === 'jobs' ? await listGatewayJobs(runtime.store) : await listGatewayCallbacks(runtime.store);
  const safe = records.map((item) => command === 'jobs'
    ? ({ id: item.id, callerId: item.callerId, requestId: item.requestId, status: item.status, attemptCount: item.attemptCount, callbackId: item.callbackId, acceptedAt: item.acceptedAt, updatedAt: item.updatedAt, expiresAt: item.expiresAt })
    : ({ id: item.id, jobId: item.jobId, callerId: item.callerId, status: item.status, attemptCount: item.attemptCount, maxAttempts: item.maxAttempts, lastStatusCode: item.lastStatusCode, lastFailureCategory: item.lastFailureCategory, updatedAt: item.updatedAt, expiresAt: item.expiresAt }));
  stdout.write(`${JSON.stringify(safe)}\n`);
  return Object.freeze(safe);
}

function parseOptions(values) {
  if (values.length === 1 && ['help', '--help', '-h'].includes(values[0])) return { command: 'help', deploymentRoot: null };
  if (values.length !== 3 || values[0] !== '--deployment-root' || !['jobs', 'callbacks', 'cleanup'].includes(values[2])) throw new FoundationError('Gateway administration arguments are invalid.', { code: 'GATEWAY_ADMIN_ARGUMENT_INVALID' });
  if (!/^(?:[A-Za-z]:[\\/]|\/)/u.test(values[1])) throw new FoundationError('--deployment-root must be an absolute path.', { code: 'GATEWAY_ADMIN_ARGUMENT_INVALID' });
  return { deploymentRoot: values[1], command: values[2] };
}

if (process.argv[1]?.endsWith('/admin-gateway.js') || process.argv[1]?.endsWith('\\admin-gateway.js')) {
  runGatewayAdministration(process.argv.slice(2)).catch((error) => { process.stderr.write(`Gateway administration failed: ${error.message}\n`); process.exitCode = 1; });
}
