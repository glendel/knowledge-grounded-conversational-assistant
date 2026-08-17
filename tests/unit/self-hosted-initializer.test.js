import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { initializeSelfHostedDeployment, parseSelfHostedInitializerArguments } from '../../bin/initialize-self-hosted-deployment.js';
import { createDeploymentDescriptor } from '../../src/deployment/deployment-descriptor.js';

const CORE_ROOT = path.resolve(import.meta.dirname, '..', '..');

test('self-hosted initializer requires one explicit absolute clone root', () => {
  assert.throws(() => parseSelfHostedInitializerArguments([]), /required and must be absolute/);
  assert.throws(() => parseSelfHostedInitializerArguments(['--deployment-root', 'relative']), /required and must be absolute/);
  assert.deepEqual(parseSelfHostedInitializerArguments(['--deployment-root', 'C:/assistants/example']), { help: false, deploymentRoot: 'C:\\assistants\\example' });
});

test('self-hosted initializer creates ignored deployment material without replacing local configuration', async () => {
  const selfHostedRoot = await mkdtemp(path.join(os.tmpdir(), 'kgca-self-hosted-initializer-'));
  const output = { messages: [], write(message) { this.messages.push(message); } };
  try {
    await cp(path.join(CORE_ROOT, 'app-template'), path.join(selfHostedRoot, 'app-template'), { recursive: true });
    await cp(path.join(CORE_ROOT, 'config', 'templates'), path.join(selfHostedRoot, 'config', 'templates'), { recursive: true });
    await cp(path.join(CORE_ROOT, 'context', 'contracts'), path.join(selfHostedRoot, 'context', 'contracts'), { recursive: true });

    const exitCode = await initializeSelfHostedDeployment({
      argumentsList: ['--deployment-root', selfHostedRoot],
      coreRoot: selfHostedRoot,
      output
    });
    assert.equal(exitCode, 0);
    assert.match(await readFile(path.join(selfHostedRoot, 'app', 'README.md'), 'utf8'), /A deployment root owns/i);
    assert.match(await readFile(path.join(selfHostedRoot, 'config', 'assistant.json'), 'utf8'), /supportedLanguages/);
    assert.match(await readFile(path.join(selfHostedRoot, 'config', 'knowledge-policy.json'), 'utf8'), /approvedOnly/);
    const descriptor = await createDeploymentDescriptor({ coreRoot: selfHostedRoot, deploymentRoot: selfHostedRoot });
    assert.equal(descriptor.mode, 'self_hosted');

    const localAssistantPath = path.join(selfHostedRoot, 'config', 'assistant.json');
    await writeFile(localAssistantPath, '{"locallyManaged":true}\n', 'utf8');
    const secondExitCode = await initializeSelfHostedDeployment({
      argumentsList: ['--deployment-root', selfHostedRoot],
      coreRoot: selfHostedRoot,
      output
    });
    assert.equal(secondExitCode, 0);
    assert.equal(await readFile(localAssistantPath, 'utf8'), '{"locallyManaged":true}\n');
    assert.match(output.messages.join(''), /Existing local files were preserved/);
  } finally {
    await rm(selfHostedRoot, { recursive: true, force: true });
  }
});
