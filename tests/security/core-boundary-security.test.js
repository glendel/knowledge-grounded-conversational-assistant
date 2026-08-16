import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { findCoreBoundaryViolations, runCoreBoundarySecurityCheck } from '../../src/security/core-boundary-security.js';

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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
