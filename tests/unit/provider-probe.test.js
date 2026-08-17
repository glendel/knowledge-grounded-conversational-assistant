import assert from 'node:assert/strict';
import test from 'node:test';

import { parseProviderProbeArguments } from '../../bin/provider-probe.js';

const ROOT = 'C:/deployments/alfred-project-guide';
const RUNTIME = 'C:/deployments/alfred-project-guide/runtime-data';

test('provider probe requires explicit absolute deployment and runtime roots', () => {
  assert.throws(() => parseProviderProbeArguments(['--deployment-root', ROOT, '--runtime-data-dir', 'runtime-data', '--lane', 'lane', '--message', 'hello']), /must be absolute/);
  assert.throws(() => parseProviderProbeArguments(['--deployment-root', ROOT, '--runtime-data-dir', RUNTIME, '--lane', 'lane']), /--message is required/);
});

test('provider probe accepts an explicit disposable probe without defaulting a lane', () => {
  assert.deepEqual(parseProviderProbeArguments(['--deployment-root', ROOT, '--runtime-data-dir', RUNTIME, '--lane', 'alfred-openrouter-primary', '--message', 'Describe the project Core.', '--language', 'en', '--show-text']), {
    help: false,
    deploymentRoot: ROOT,
    runtimeDataDirectory: RUNTIME,
    laneId: 'alfred-openrouter-primary',
    message: 'Describe the project Core.',
    language: 'en',
    showText: true,
    json: false
  });
});
