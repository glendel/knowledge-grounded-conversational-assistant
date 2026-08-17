import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { FoundationError } from './foundation-error.js';

export function assertSafeRelativePath(relativePath, label = 'path') {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.length > 500) {
    throw new FoundationError(`${label} must be a non-empty relative path.`, { code: 'FILESYSTEM_PATH_INVALID', path: String(relativePath) });
  }
  if (relativePath.includes('\0') || path.isAbsolute(relativePath)) {
    throw new FoundationError(`${label} must not be absolute or contain null bytes.`, { code: 'FILESYSTEM_PATH_INVALID', path: relativePath });
  }
  const normalized = path.normalize(relativePath);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`) || normalized.startsWith('/') || normalized.startsWith('\\')) {
    throw new FoundationError(`${label} escapes its allowed directory.`, { code: 'FILESYSTEM_PATH_ESCAPE', path: relativePath });
  }
  return normalized;
}

export function resolveInside(rootDirectory, relativePath, label = 'path') {
  const root = path.resolve(rootDirectory);
  const normalized = assertSafeRelativePath(relativePath, label);
  const candidate = path.resolve(root, normalized);
  const relative = path.relative(root, candidate);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new FoundationError(`${label} escapes its allowed directory.`, { code: 'FILESYSTEM_PATH_ESCAPE', path: relativePath });
  }
  return candidate;
}

export async function assertDirectoryWithoutSymlinks(directory, { create = false, rootDirectory = directory } = {}) {
  const root = path.resolve(rootDirectory);
  const target = path.resolve(directory);
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new FoundationError('Directory escapes its allowed root.', { code: 'FILESYSTEM_PATH_ESCAPE', path: directory });
  }
  if (create) await mkdir(target, { recursive: true });
  const volumeRoot = path.parse(root).root || path.sep;
  const rootSegments = path.relative(volumeRoot, root).split(path.sep).filter(Boolean);
  const targetSegments = relative === '' ? [] : relative.split(path.sep).filter(Boolean);
  let current = volumeRoot;
  for (const segment of [...rootSegments, ...targetSegments]) {
    current = path.join(current, segment);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) {
      throw new FoundationError('Symbolic links are not permitted in governed storage paths.', { code: 'FILESYSTEM_SYMLINK_FORBIDDEN', path: current });
    }
  }
  return target;
}

export async function readFileLimited(filePath, { maxBytes, encoding = null } = {}) {
  const metadata = await lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new FoundationError('Expected a regular non-symbolic file.', { code: 'FILESYSTEM_FILE_INVALID', path: filePath });
  }
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || metadata.size > maxBytes) {
    throw new FoundationError(`File exceeds the permitted size limit of ${maxBytes} bytes.`, { code: 'FILESYSTEM_SIZE_LIMIT', path: filePath });
  }
  return readFile(filePath, encoding ?? undefined);
}

export async function readStrictJsonFile(filePath, { maxBytes = 1_000_000 } = {}) {
  const raw = await readFileLimited(filePath, { maxBytes, encoding: 'utf8' });
  if (raw.charCodeAt(0) === 0xFEFF) {
    throw new FoundationError('Strict JSON must be UTF-8 without a BOM.', { code: 'JSON_BOM_FORBIDDEN', path: filePath });
  }
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new FoundationError('Strict JSON could not be parsed.', { code: 'JSON_INVALID', path: filePath, cause });
  }
}

export async function writeJsonAtomic(rootDirectory, relativePath, value) {
  const destination = resolveInside(rootDirectory, relativePath, 'output path');
  const parent = path.dirname(destination);
  await assertDirectoryWithoutSymlinks(parent, { create: true, rootDirectory });
  const temporary = path.join(parent, `.${path.basename(destination)}.${randomUUID()}.tmp`);
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporary, destination);
  } catch (cause) {
    await unlink(temporary).catch(() => undefined);
    throw new FoundationError('Atomic JSON artifact write failed.', { code: 'FILESYSTEM_WRITE_FAILED', path: destination, cause });
  }
  return destination;
}

export async function writeTextAtomic(rootDirectory, relativePath, text) {
  if (typeof text !== 'string') throw new FoundationError('Text artifact must be a string.', { code: 'FILESYSTEM_TEXT_INVALID' });
  const destination = resolveInside(rootDirectory, relativePath, 'output path');
  const parent = path.dirname(destination);
  await assertDirectoryWithoutSymlinks(parent, { create: true, rootDirectory });
  const temporary = path.join(parent, `.${path.basename(destination)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, text.replace(/\r\n/g, '\n'), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporary, destination);
  } catch (cause) {
    await unlink(temporary).catch(() => undefined);
    throw new FoundationError('Atomic text artifact write failed.', { code: 'FILESYSTEM_WRITE_FAILED', path: destination, cause });
  }
  return destination;
}

export async function sha256File(filePath, { maxBytes }) {
  const bytes = await readFileLimited(filePath, { maxBytes });
  return Object.freeze({ byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}

export async function listRegularFiles(rootDirectory, { maxDepth = 4, maxFiles = 1_000 } = {}) {
  await assertDirectoryWithoutSymlinks(rootDirectory, { rootDirectory });
  const root = await realpath(rootDirectory);
  const files = [];
  async function visit(directory, depth) {
    if (depth > maxDepth) throw new FoundationError('Source directory exceeds the permitted nesting depth.', { code: 'FILESYSTEM_DEPTH_LIMIT', path: directory });
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) throw new FoundationError('Symbolic links are not permitted in source directories.', { code: 'FILESYSTEM_SYMLINK_FORBIDDEN', path: path.join(directory, entry.name) });
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(candidate, depth + 1);
      if (entry.isFile() && !entry.name.startsWith('.')) {
        files.push(candidate);
        if (files.length > maxFiles) throw new FoundationError('Source directory exceeds the permitted file count.', { code: 'FILESYSTEM_FILE_COUNT_LIMIT', path: rootDirectory });
      }
    }
  }
  await visit(root, 0);
  return Object.freeze(files);
}
