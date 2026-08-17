import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { parseChatCliArguments } from '../../bin/chat-cli.js';

test('requires explicit deployment and isolated runtime data roots', () => {
  assert.throws(
    () => parseChatCliArguments(['--deployment-root', 'relative', '--runtime-data-dir', 'relative', '--conversation-id', 'conversation-001', '--user-id', 'user-001']),
    /absolute paths/
  );
  const options = parseChatCliArguments([
    '--deployment-root', path.resolve('C:/synthetic/deployment'),
    '--runtime-data-dir', path.resolve('C:/synthetic/runtime'),
    '--conversation-id', 'conversation-001',
    '--user-id', 'user-001',
    '--message', 'Hello.'
  ]);
  assert.equal(options.message, 'Hello.');
  assert.equal(options.conversationId, 'conversation-001');
});
