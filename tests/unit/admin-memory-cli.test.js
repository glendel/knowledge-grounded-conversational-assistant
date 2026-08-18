import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { parseMemoryAdministrationArguments } from '../../bin/admin-memory.js';

test('memory administration requires an explicit root and only allows cleanup', () => {
  assert.throws(() => parseMemoryAdministrationArguments(['cleanup']), /deployment-root/);
  assert.throws(() => parseMemoryAdministrationArguments(['--deployment-root', 'relative', 'cleanup']), /absolute path/);
  assert.throws(() => parseMemoryAdministrationArguments(['--deployment-root', path.resolve('C:/synthetic/deployment'), 'delete']), /only supported/);
  const options = parseMemoryAdministrationArguments(['--deployment-root', path.resolve('C:/synthetic/deployment'), 'cleanup']);
  assert.equal(options.command, 'cleanup');
});
