import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { parseChatCliArguments } from '../../bin/chat-cli.js';

test('requires an explicit absolute deployment root', () => {
  assert.throws(
    () => parseChatCliArguments(['--deployment-root', 'relative', '--conversation-id', 'conversation-001', '--user-id', 'user-001']),
    /absolute path/
  );
  const options = parseChatCliArguments([
    '--deployment-root', path.resolve('C:/synthetic/deployment'),
    '--conversation-id', 'conversation-001',
    '--user-id', 'user-001',
    '--message', 'Hello.'
  ]);
  assert.equal(options.message, 'Hello.');
  assert.equal(options.conversationId, 'conversation-001');
});
