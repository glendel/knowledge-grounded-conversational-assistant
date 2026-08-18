import process from 'node:process';

import { createDeploymentDescriptor } from '../src/deployment/deployment-descriptor.js';
import { FoundationError } from '../src/core/foundation-error.js';
import { createGatewayHttpServer } from '../src/gateway/gateway-server.js';
import { createGatewayRuntime, runGatewayWork } from '../src/gateway/gateway-runtime.js';
import { acquireGatewayWorkerLease } from '../src/gateway/gateway-store.js';

export async function runGatewayService(argumentsList, { environment = process.env, stdout = process.stdout } = {}) {
  const options = parseOptions(argumentsList);
  if (options.help) { stdout.write(helpText()); return null; }
  const descriptor = await createDeploymentDescriptor({ deploymentRoot: options.deploymentRoot });
  const runtime = await createGatewayRuntime({ descriptor, environment });
  const releaseLease = await acquireGatewayWorkerLease(runtime.store, { recover: options.recoverWorkerLock });
  if (options.processOnce) {
    try { return await runGatewayWork(runtime); } finally { await releaseLease(); }
  }
  const service = createGatewayHttpServer({ runtime });
  let address;
  try { address = await service.listen({ host: options.host, port: options.port }); } catch (error) { await releaseLease(); throw error; }
  const timer = setInterval(() => runGatewayWork(runtime).catch(() => undefined), 1_000);
  timer.unref();
  stdout.write(`KGCA gateway listening on http://${address.address}:${address.port}/v1/turns\n`);
  return Object.freeze({ runtime, service, address, stop: async () => { clearInterval(timer); await service.close(); await releaseLease(); } });
}

export function parseOptions(values) {
  const options = { help: false, deploymentRoot: null, host: '127.0.0.1', port: 3000, processOnce: false, recoverWorkerLock: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--help' || value === '-h') options.help = true;
    else if (value === '--process-once') options.processOnce = true;
    else if (value === '--recover-worker-lock') options.recoverWorkerLock = true;
    else if (['--deployment-root', '--host', '--port'].includes(value)) {
      const next = values[++index];
      if (!next || next.startsWith('--')) throw new FoundationError(`${value} requires a value.`, { code: 'GATEWAY_CLI_ARGUMENT_INVALID' });
      if (value === '--deployment-root') options.deploymentRoot = next;
      else if (value === '--host') options.host = next;
      else {
        const port = Number(next);
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new FoundationError('--port is invalid.', { code: 'GATEWAY_CLI_ARGUMENT_INVALID' });
        options.port = port;
      }
    } else throw new FoundationError(`Unknown gateway option: ${value}`, { code: 'GATEWAY_CLI_ARGUMENT_INVALID' });
  }
  if (!options.help && (!options.deploymentRoot || !/^(?:[A-Za-z]:[\\/]|\/)/u.test(options.deploymentRoot))) throw new FoundationError('--deployment-root must be an absolute path.', { code: 'GATEWAY_CLI_ARGUMENT_INVALID' });
  return Object.freeze(options);
}

function helpText() { return 'Usage: node --env-file-if-exists=<deployment .env> ./bin/gateway-service.js --deployment-root <absolute-path> [--host 127.0.0.1] [--port 3000] [--process-once] [--recover-worker-lock]\nUse --recover-worker-lock only after confirming a previous worker is stopped.\n'; }

if (process.argv[1]?.endsWith('/gateway-service.js') || process.argv[1]?.endsWith('\\gateway-service.js')) {
  runGatewayService(process.argv.slice(2)).catch((error) => { process.stderr.write(`Gateway service failed: ${error.message}\n`); process.exitCode = 1; });
}
