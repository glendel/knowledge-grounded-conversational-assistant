import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';

import { createConversationRuntime, processConversationTurn } from '../src/conversation/conversation-runtime.js';
import { createDeploymentDescriptor } from '../src/deployment/deployment-descriptor.js';
import { loadDeploymentQualificationRecords } from '../src/deployment/provider-qualification-records.js';

export function parseChatCliArguments(argumentsList) {
  const values = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--help') return Object.freeze({ help: true });
    if (!argument.startsWith('--')) throw new Error('Unknown argument: ' + argument);
    const key = argument.slice(2);
    const value = argumentsList[index + 1];
    if (!value || value.startsWith('--')) throw new Error('Missing value for --' + key);
    values[key] = value;
    index += 1;
  }
  for (const key of ['deployment-root', 'runtime-data-dir', 'conversation-id', 'user-id']) {
    if (!values[key]) throw new Error('--' + key + ' is required.');
  }
  if (!path.isAbsolute(values['deployment-root']) || !path.isAbsolute(values['runtime-data-dir'])) {
    throw new Error('--deployment-root and --runtime-data-dir must be absolute paths.');
  }
  return Object.freeze({
    help: false,
    deploymentRoot: values['deployment-root'],
    runtimeDataDirectory: values['runtime-data-dir'],
    conversationId: values['conversation-id'],
    userId: values['user-id'],
    message: values.message ?? null
  });
}

export async function runChatCli({ argumentsList = process.argv.slice(2), environment = process.env, output = process.stdout, errorOutput = process.stderr } = {}) {
  let options;
  try {
    options = parseChatCliArguments(argumentsList);
  } catch (error) {
    errorOutput.write(error.message + '\n');
    errorOutput.write(usage());
    return 2;
  }
  if (options.help) {
    output.write(usage());
    return 0;
  }
  const descriptor = await createDeploymentDescriptor({ deploymentRoot: options.deploymentRoot });
  const qualificationRecords = await loadDeploymentQualificationRecords({ descriptor });
  const runtime = createConversationRuntime({ descriptor, qualificationRecords, environment });
  if (options.message !== null) return processOneTurn(runtime, options, options.message, output, errorOutput);

  const terminal = createInterface({ input: process.stdin, output });
  try {
    output.write('Type /exit to finish.\n');
    while (true) {
      const message = await terminal.question('You: ');
      if (message.trim().toLocaleLowerCase('und') === '/exit') break;
      await processOneTurn(runtime, options, message, output, errorOutput);
    }
  } finally {
    terminal.close();
  }
  return 0;
}

async function processOneTurn(runtime, options, message, output, errorOutput) {
  const result = await processConversationTurn(runtime, {
    conversationId: options.conversationId,
    userId: options.userId,
    message
  });
  if (result.status !== 'success') {
    errorOutput.write('Assistant unavailable: ' + (result.failure?.code ?? 'AI_CAPABILITY_FAILURE') + '\n');
    return 1;
  }
  output.write('Assistant: ' + result.turn.text + '\n');
  return 0;
}

function usage() {
  return 'Usage: node ./bin/chat-cli.js --deployment-root <absolute-path> --runtime-data-dir <absolute-path> --conversation-id <opaque-id> --user-id <opaque-id> [--message <text>]\n';
}

if (process.argv[1]?.endsWith('/chat-cli.js') || process.argv[1]?.endsWith('\\chat-cli.js')) {
  runChatCli().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write('Chat CLI failed: ' + error.message + '\n');
    process.exitCode = 1;
  });
}
