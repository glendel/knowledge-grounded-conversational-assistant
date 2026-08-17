import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { findCoreBoundaryViolations, runCoreBoundarySecurityCheck } from '../../src/security/core-boundary-security.js';

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const executeFile = promisify(execFile);
const SELF_HOSTED_IGNORE_RULES = '.env\n.env.*\n!.env.example\napp/\nconfig/*\n!config/templates/\n!config/templates/**\ndeployments/\nruntime-data/\ntmp/\n';

test('enforces Core secret and deployment-boundary protections', async () => {
  const result = await runCoreBoundarySecurityCheck({ coreRoot });
  assert.equal(result.ignoredSecretFiles, true);
  assert.equal(result.forbiddenDeploymentPaths, 0);
  assert.equal(result.coreBoundary, true);
});

test('detects synthetic identity and forbidden-path leakage', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'kgca-core-boundary-'));
  try {
    await mkdir(path.join(temporaryRoot, 'src'));
    await mkdir(path.join(temporaryRoot, 'docs'));
    await writeFile(path.join(temporaryRoot, 'src', 'leak.js'), "export const identity = 'Example Business';\n", 'utf8');
    await writeFile(path.join(temporaryRoot, 'docs', 'raw.md'), 'The deployment folder is forbidden-path.\n', 'utf8');
    const report = await findCoreBoundaryViolations({ coreRoot: temporaryRoot, disallowedTerms: ['example business'], disallowedPathFragments: ['forbidden-path'] });
    assert.equal(report.violations.length, 2);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('allows ignored self-hosted material but rejects it when force-added to Core', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'kgca-self-hosted-boundary-'));
  try {
    await writeFile(path.join(temporaryRoot, '.gitignore'), SELF_HOSTED_IGNORE_RULES, 'utf8');
    await mkdir(path.join(temporaryRoot, 'app', 'knowledge', 'sources'), { recursive: true });
    await mkdir(path.join(temporaryRoot, 'config'), { recursive: true });
    await writeFile(path.join(temporaryRoot, 'app', 'knowledge', 'sources', 'private.txt'), 'private deployment material\n', 'utf8');
    await writeFile(path.join(temporaryRoot, 'config', 'assistant.json'), '{"realAssistant":true}\n', 'utf8');
    await writeFile(path.join(temporaryRoot, '.env'), 'PROVIDER_TOKEN=<local-secret>\n', 'utf8');
    await executeFile('git', ['init', temporaryRoot]);

    const ignoredResult = await runCoreBoundarySecurityCheck({ coreRoot: temporaryRoot });
    assert.equal(ignoredResult.coreBoundary, true);

    await executeFile('git', ['-C', temporaryRoot, 'add', '-f', 'app/knowledge/sources/private.txt']);
    await assert.rejects(
      () => runCoreBoundarySecurityCheck({ coreRoot: temporaryRoot }),
      (error) => error.code === 'CORE_FORBIDDEN_PATH_TRACKED' && error.message.includes('app/knowledge/sources/private.txt')
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
