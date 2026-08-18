import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { parseProviderProbeArguments } from '../../bin/provider-probe.js';

const ROOT = 'C:/deployments/alfred-project-guide';
const TMP = 'C:/deployments/alfred-project-guide/tmp/probes';

test('provider probe requires an explicit temporary directory inside the deployment tmp root', () => {
  assert.throws(() => parseProviderProbeArguments(['--deployment-root', ROOT, '--tmp-dir', 'tmp', '--lane', 'lane', '--message', 'hello']), /must be absolute/);
  assert.throws(() => parseProviderProbeArguments(['--deployment-root', ROOT, '--tmp-dir', 'C:/outside/tmp', '--lane', 'lane', '--message', 'hello']), /inside <deployment-root>\/tmp/);
  assert.throws(() => parseProviderProbeArguments(['--deployment-root', ROOT, '--tmp-dir', TMP, '--lane', 'lane']), /--message is required/);
});

test('provider probe accepts an explicit disposable probe without defaulting a lane', () => {
  assert.deepEqual(parseProviderProbeArguments(['--deployment-root', ROOT, '--tmp-dir', TMP, '--lane', 'alfred-openrouter-primary', '--message', 'Describe the project Core.', '--language', 'en', '--show-text']), {
    help: false,
    deploymentRoot: path.resolve(ROOT),
    temporaryDirectory: path.resolve(TMP),
    laneId: 'alfred-openrouter-primary',
    message: 'Describe the project Core.',
    language: 'en',
    showText: true,
    json: false
  });
});
