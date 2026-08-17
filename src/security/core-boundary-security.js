import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { FoundationError } from '../core/foundation-error.js';

const REQUIRED_IGNORE_LINES = Object.freeze(['.env', '.env.*', '!.env.example', 'app/', 'deployments/', 'runtime-data/', 'tmp/']);
const FORBIDDEN_ROOT_PATHS = Object.freeze(['.env', 'app', 'deployments', 'runtime-data', 'tmp']);
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules']);
const TEXT_FILE = /(?:^|\/)(?:\.[^/]+|[^/]+\.(?:js|json|md|txt|yml|yaml|example)|[^/.]+)$/i;
const SECRET_VALUE_PATTERN = /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?(?!\$\{|<|your_|replace_|change_me|example|placeholder)[a-z0-9_-]{12,}/i;

export async function findCoreBoundaryViolations({ coreRoot, disallowedTerms = [], disallowedPathFragments = [] } = {}) {
  assertCoreRoot(coreRoot);
  const textFiles = await collectTextFiles(coreRoot);
  const terms = normalizeTerms(disallowedTerms, 'disallowedTerms');
  const fragments = normalizeTerms(disallowedPathFragments, 'disallowedPathFragments');
  const termPattern = terms.length === 0 ? null : new RegExp(terms.map(escapeRegularExpression).join('|'), 'iu');
  const violations = [];
  for (const filePath of textFiles) {
    const content = await readFile(filePath, 'utf8');
    const relativePath = path.relative(coreRoot, filePath).replaceAll('\\', '/');
    if (termPattern?.test(content)) violations.push(`${relativePath} contains a deployment-specific identity.`);
    if (fragments.some((fragment) => content.includes(fragment))) violations.push(`${relativePath} references a deployment-forbidden path.`);
    if (secretValuePatternIsPresent(content)) violations.push(`${relativePath} contains a possible credential value.`);
  }
  return Object.freeze({ filesChecked: textFiles.length, violations: Object.freeze(violations) });
}

export async function runCoreBoundarySecurityCheck({ coreRoot, disallowedTerms = [], disallowedPathFragments = [] } = {}) {
  assertCoreRoot(coreRoot);
  const gitignorePath = path.join(coreRoot, '.gitignore');
  const gitignore = await readFile(gitignorePath, 'utf8');
  const missingIgnoreRules = REQUIRED_IGNORE_LINES.filter((line) => !gitignore.split(/\r?\n/).includes(line));
  if (missingIgnoreRules.length > 0) {
    throw new FoundationError(`.gitignore is missing required Core rules: ${missingIgnoreRules.join(', ')}.`, { code: 'CORE_IGNORE_RULE_MISSING', path: gitignorePath });
  }

  const forbiddenPaths = [];
  for (const relativePath of FORBIDDEN_ROOT_PATHS) {
    if (relativePath === '.env.example') continue;
    if (await exists(path.join(coreRoot, relativePath))) forbiddenPaths.push(relativePath);
  }
  if (forbiddenPaths.length > 0) {
    throw new FoundationError(`Core contains deployment-owned or secret paths: ${forbiddenPaths.join(', ')}.`, { code: 'CORE_FORBIDDEN_PATH_PRESENT', path: coreRoot });
  }

  const report = await findCoreBoundaryViolations({ coreRoot, disallowedTerms, disallowedPathFragments });
  if (report.violations.length > 0) {
    throw new FoundationError(`Core boundary violations: ${report.violations.join('; ')}.`, { code: 'CORE_BOUNDARY_VIOLATION', path: coreRoot });
  }
  return Object.freeze({ ignoredSecretFiles: true, forbiddenDeploymentPaths: 0, coreBoundary: true, filesChecked: report.filesChecked });
}

async function collectTextFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const relativePath = path.join(prefix, entry.name);
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectTextFiles(filePath, relativePath));
    if (entry.isSymbolicLink()) {
      throw new FoundationError('Symbolic links are not permitted in the Core repository.', { code: 'CORE_SYMLINK_FORBIDDEN', path: filePath });
    }
    if (entry.isFile() && TEXT_FILE.test(relativePath.replaceAll('\\', '/'))) files.push(filePath);
  }
  return files;
}

function assertCoreRoot(coreRoot) {
  if (typeof coreRoot !== 'string' || coreRoot.length === 0) throw new TypeError('coreRoot is required.');
}

function normalizeTerms(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || value.trim().length === 0)) {
    throw new TypeError(`${label} must be an array of non-empty strings.`);
  }
  return values.map((value) => value.trim());
}

function secretValuePatternIsPresent(content) {
  SECRET_VALUE_PATTERN.lastIndex = 0;
  return SECRET_VALUE_PATTERN.test(content);
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
