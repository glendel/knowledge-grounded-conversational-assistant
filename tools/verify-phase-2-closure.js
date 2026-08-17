import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { FoundationError } from '../src/core/foundation-error.js';

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED_PATHS = Object.freeze([
  'src/core',
  'src/security',
  'src/observability',
  'src/contracts/contract-registry.js',
  'src/config/core-configuration.js',
  'src/ai/ai-capability-runtime.js',
  'src/knowledge/knowledge-administration.js',
  'context/contracts',
  'tests/unit',
  'tests/contracts',
  'tests/security',
  'tests/knowledge',
  'docs/architecture/phase-2-portable-kernel.md',
  'docs/architecture/phase-2-3-contract-foundation.md',
  'docs/architecture/phase-2-4-ai-capability-foundation.md',
  'docs/architecture/phase-2-5-knowledge-administration.md',
  'docs/architecture/north-star-conversation-quality-standard.md',
  'docs/architecture/phase-2-closure-certificate.md'
]);

const REQUIRED_SCRIPTS = Object.freeze([
  'check:boundary',
  'lint:foundation',
  'lint',
  'test:unit',
  'test:contracts',
  'test:security',
  'test',
  'verify:phase-2',
  'check'
]);

export async function verifyPhase2Closure({ rootDirectory = coreRoot } = {}) {
  const root = path.resolve(rootDirectory);
  const failures = [];
  for (const relativePath of REQUIRED_PATHS) {
    await access(path.join(root, relativePath)).catch(() => failures.push('Required Phase 2 path is missing: ' + relativePath));
  }

  const packageJson = await readJson(path.join(root, 'package.json'), 'package.json', failures);
  for (const script of REQUIRED_SCRIPTS) {
    if (typeof packageJson?.scripts?.[script] !== 'string') failures.push('Required package script is missing: ' + script);
  }
  if (packageJson?.dependencies?.['pdfjs-dist'] === undefined) failures.push('Phase 2 knowledge extraction dependency is missing: pdfjs-dist.');

  for (const prohibitedPath of ['app', 'bin']) {
    if (await exists(path.join(root, prohibitedPath))) failures.push('Phase 2 Core must not include a deployment-owned ' + prohibitedPath + '/ directory.');
  }

  const knowledgeSource = await readText(path.join(root, 'src/knowledge/knowledge-administration.js'), failures);
  if (knowledgeSource && (!knowledgeSource.includes('deploymentRoot') || knowledgeSource.includes('PROJECT_ROOT'))) {
    failures.push('Knowledge administration must require an explicit deploymentRoot and must not use PROJECT_ROOT.');
  }

  const certificate = await readText(path.join(root, 'docs/architecture/phase-2-closure-certificate.md'), failures);
  if (certificate && !certificate.includes('This repository still cannot run a real assistant.')) {
    failures.push('The Phase 2 certificate must retain the runtime limitation.');
  }

  if (failures.length > 0) {
    throw new FoundationError('Phase 2 closure verification failed:\n' + failures.join('\n'), { code: 'PHASE_2_CLOSURE_INVALID' });
  }
  return Object.freeze({ requiredPathsChecked: REQUIRED_PATHS.length, requiredScriptsChecked: REQUIRED_SCRIPTS.length });
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readText(filePath, failures) {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    failures.push('Required Phase 2 file cannot be read: ' + path.basename(filePath));
    return null;
  }
}

async function readJson(filePath, label, failures) {
  const content = await readText(filePath, failures);
  if (content === null) return null;
  try {
    return JSON.parse(content);
  } catch {
    failures.push(label + ' is not valid JSON.');
    return null;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyPhase2Closure()
    .then((report) => process.stdout.write('Phase 2 closure verification passed: ' + report.requiredPathsChecked + ' paths and ' + report.requiredScriptsChecked + ' scripts checked.\n'))
    .catch((error) => {
      process.stderr.write('Phase 2 closure verification failed: ' + error.message + '\n');
      process.exitCode = 1;
    });
}
