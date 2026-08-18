import process from 'node:process';
import path from 'node:path';

import { createDeploymentDescriptor } from '../src/deployment/deployment-descriptor.js';
import { cleanupExpiredChatMemory, createChatMemoryRepository } from '../src/memory/chat-memory-repository.js';

export function parseMemoryAdministrationArguments(argumentsList) {
  if (argumentsList.length === 1 && argumentsList[0] === '--help') return Object.freeze({ help: true });
  if (argumentsList.length !== 3 || argumentsList[0] !== '--deployment-root') {
    throw new Error('Usage requires --deployment-root <absolute-path> cleanup.');
  }
  if (!path.isAbsolute(argumentsList[1])) throw new Error('--deployment-root must be an absolute path.');
  if (argumentsList[2] !== 'cleanup') throw new Error('The only supported memory administration command is cleanup.');
  return Object.freeze({ help: false, deploymentRoot: path.resolve(argumentsList[1]), command: 'cleanup' });
}

export async function runMemoryAdministration({ argumentsList = process.argv.slice(2), output = process.stdout, errorOutput = process.stderr } = {}) {
  let options;
  try {
    options = parseMemoryAdministrationArguments(argumentsList);
  } catch (error) {
    errorOutput.write(error.message + '\n' + usage());
    return 2;
  }
  if (options.help) {
    output.write(usage());
    return 0;
  }
  try {
    const descriptor = await createDeploymentDescriptor({ deploymentRoot: options.deploymentRoot });
    const repository = createChatMemoryRepository({
      projectRoot: descriptor.deploymentRoot,
      configuration: descriptor.configuration,
      contracts: descriptor.contracts
    });
    const result = await cleanupExpiredChatMemory(repository);
    output.write(JSON.stringify({ command: options.command, ...result }) + '\n');
    return 0;
  } catch (error) {
    errorOutput.write('Memory administration failed: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    return 1;
  }
}

function usage() {
  return 'Usage: node ./bin/admin-memory.js --deployment-root <absolute-path> cleanup\n';
}

if (process.argv[1]?.endsWith('/admin-memory.js') || process.argv[1]?.endsWith('\\admin-memory.js')) {
  process.exitCode = await runMemoryAdministration();
}
