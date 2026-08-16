import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set(['.git', 'node_modules']);
const forbiddenPaths = [
  /^\.env(?:\.|$)/i,
  /^app\//i,
  /^deployments\//i,
  /^runtime-data\//i,
  /^tmp\//i
];
const allowedPaths = new Set(['.env.example']);
const secretValuePattern = /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?(?!\$\{|<|your_|replace_|change_me|example|placeholder)[a-z0-9_\-]{12,}/i;

const findings = [];
for (const relativePath of await walk(root)) {
  const normalized = relativePath.replaceAll('\\', '/');
  if (!allowedPaths.has(normalized) && forbiddenPaths.some((pattern) => pattern.test(normalized))) {
    findings.push(`${normalized}: deployment-owned or secret path is not permitted in Core.`);
    continue;
  }
  if (!isTextFile(normalized)) continue;
  const content = await readFile(path.join(root, relativePath), 'utf8');
  if (secretValuePattern.test(content)) findings.push(`${normalized}: possible credential value detected.`);
}

if (findings.length > 0) {
  console.error('Core boundary check failed:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log('Core boundary check passed.');
}

async function walk(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path.join(directory, entry.name), relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

function isTextFile(relativePath) {
  return /(?:^|\/)(?:[^/]+\.(?:js|json|md|txt|yml|yaml|example)|[^/.]+)$/i.test(relativePath);
}
