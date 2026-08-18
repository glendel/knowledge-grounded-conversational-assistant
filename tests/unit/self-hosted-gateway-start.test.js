import assert from 'node:assert/strict';
import test from 'node:test';

import { runSelfHostedGateway } from '../../bin/start-self-hosted-gateway.js';

test('self-hosted gateway start supplies only its explicit current clone root', async () => {
  let received = null;
  await runSelfHostedGateway(['--host', '127.0.0.1', '--port', '4000'], {
    currentWorkingDirectory: 'C:/assistants/example',
    gatewayService: async (argumentsList) => { received = argumentsList; }
  });
  assert.deepEqual(received, ['--deployment-root', 'C:\\assistants\\example', '--host', '127.0.0.1', '--port', '4000']);
});

test('self-hosted gateway start refuses a second deployment root', async () => {
  await assert.rejects(() => runSelfHostedGateway(['--deployment-root', 'C:/other']), /Do not pass --deployment-root/);
});
