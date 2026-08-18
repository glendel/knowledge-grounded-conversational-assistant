import path from 'node:path';
import process from 'node:process';

import { runGatewayService } from './gateway-service.js';

export async function runSelfHostedGateway(argumentsList, {
  currentWorkingDirectory = process.cwd(),
  gatewayService = runGatewayService,
  environment = process.env,
  stdout = process.stdout
} = {}) {
  if (argumentsList.includes('--deployment-root')) throw new Error('gateway:start uses the current clone root. Do not pass --deployment-root.');
  return gatewayService(['--deployment-root', path.resolve(currentWorkingDirectory), ...argumentsList], { environment, stdout });
}

if (process.argv[1]?.endsWith('/start-self-hosted-gateway.js') || process.argv[1]?.endsWith('\\start-self-hosted-gateway.js')) {
  runSelfHostedGateway(process.argv.slice(2)).catch((error) => { process.stderr.write(`Self-hosted gateway failed: ${error.message}\n`); process.exitCode = 1; });
}
