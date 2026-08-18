import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { parseKnowledgeAdministrationArguments } from '../../bin/admin-knowledge.js';

test('Knowledge Base administration requires an explicit absolute deployment root', () => {
  assert.throws(() => parseKnowledgeAdministrationArguments(['scan']), /deployment-root/);
  assert.throws(() => parseKnowledgeAdministrationArguments(['--deployment-root', 'relative', 'scan']), /absolute path/);
  const options = parseKnowledgeAdministrationArguments(['--deployment-root', path.resolve('C:/synthetic/deployment'), 'classify', '--source', 'source-001', '--authority', 'authoritative', '--storage-class', 'local_only']);
  assert.equal(options.command, 'classify');
  assert.equal(options.options.authority, 'authoritative');
});
