import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { validateContractInstance } from '../contracts/contract-registry.js';
import { FoundationError } from '../core/foundation-error.js';
import { assertDirectoryWithoutSymlinks, readStrictJsonFile, resolveInside } from '../core/safe-filesystem.js';

const QUALIFICATION_DIRECTORY = path.posix.join('app', 'evaluations', 'provider-qualification');

export async function loadDeploymentQualificationRecords({ descriptor } = {}) {
  if (!descriptor?.deploymentRoot || !descriptor?.contracts) throw new TypeError('A validated deployment descriptor is required.');
  const directory = resolveInside(descriptor.deploymentRoot, QUALIFICATION_DIRECTORY, 'provider qualification directory');
  if (!existsSync(directory)) return Object.freeze([]);
  await assertDirectoryWithoutSymlinks(directory, { rootDirectory: descriptor.deploymentRoot });
  const entries = await readdir(directory, { withFileTypes: true });
  const records = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith('.json')) continue;
    const recordPath = path.join(directory, entry.name);
    const value = await readStrictJsonFile(recordPath, { maxBytes: 2_000_000 });
    for (const record of Array.isArray(value) ? value : [value]) {
      assertContract(descriptor.contracts, 'model-qualification-record.contract.json', record);
      records.push(record);
    }
  }
  return Object.freeze(records);
}

function assertContract(contracts, fileName, value) {
  const contract = contracts[fileName];
  if (!contract) throw new FoundationError('Required contract is unavailable: ' + fileName, { code: 'DEPLOYMENT_CONTRACT_MISSING' });
  const validation = validateContractInstance(contract, value);
  if (!validation.valid) throw new FoundationError(fileName + ' validation failed: ' + validation.failures.join('; '), { code: 'DEPLOYMENT_QUALIFICATION_INVALID' });
}
