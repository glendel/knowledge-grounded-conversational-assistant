import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { FoundationError } from '../src/core/foundation-error.js';

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEXT_EXTENSIONS = new Set(['.example', '.js', '.json', '.md', '.txt', '.yaml', '.yml']);
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules']);

export async function lintCore({ rootDirectory = coreRoot } = {}) {
  const files = await collectTextFiles(rootDirectory);
  const failures = [];
  for (const filePath of files) {
    const content = await readFile(filePath, 'utf8');
    const relativePath = path.relative(rootDirectory, filePath);
    if (content.charCodeAt(0) === 0xFEFF) failures.push(`${relativePath} has a UTF-8 BOM.`);
    if (content.includes('\r')) failures.push(`${relativePath} does not use LF line endings.`);
    if (filePath.endsWith('.json')) {
      try {
        JSON.parse(content);
      } catch (error) {
        failures.push(`${relativePath} is not strict JSON: ${error.message}`);
      }
    }
    if (filePath.endsWith('.js')) {
      const syntax = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
      if (syntax.status !== 0) failures.push(`${relativePath} has invalid JavaScript syntax: ${syntax.stderr.trim()}`);
    }
  }
  if (failures.length > 0) throw new FoundationError(`Core lint failed:\n${failures.join('\n')}`, { code: 'CORE_LINT_FAILED' });
  return Object.freeze({ filesChecked: files.length });
}

async function collectTextFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name)) files.push(...await collectTextFiles(filePath));
    if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name))) files.push(filePath);
  }
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  lintCore()
    .then((report) => process.stdout.write(`Core lint passed: ${report.filesChecked} text files checked.\n`))
    .catch((error) => {
      process.stderr.write(`Core lint failed: ${error.message}\n`);
      process.exitCode = 1;
    });
}
