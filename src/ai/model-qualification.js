import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { FoundationError } from '../core/foundation-error.js';
import { validateContractInstance } from '../contracts/contract-registry.js';

export async function loadModelQualificationRecords({ directory, contract, ignoredFileNames = [] }) {
  const entries = await readdir(directory, { withFileTypes: true });
  const records = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || ignoredFileNames.includes(entry.name)) continue;
    let record;
    try { record = JSON.parse(await readFile(path.join(directory, entry.name), 'utf8')); } catch (cause) { throw new FoundationError(`Cannot read model qualification record ${entry.name}.`, { code: 'MODEL_QUALIFICATION_INVALID_JSON', path: entry.name, cause }); }
    const validation = validateContractInstance(contract, record);
    if (!validation.valid) throw new FoundationError(`Model qualification record ${entry.name} is invalid: ${validation.failures.join('; ')}`, { code: 'MODEL_QUALIFICATION_INVALID', path: entry.name });
    records.push(Object.freeze(record));
  }
  return Object.freeze(records);
}

export async function loadProviderProseQualificationDataset({ filePath, contract }) {
  let dataset;
  try { dataset = JSON.parse(await readFile(filePath, 'utf8')); } catch (cause) { throw new FoundationError('Cannot read provider prose qualification dataset.', { code: 'PROVIDER_QUALIFICATION_DATASET_INVALID_JSON', path: filePath, cause }); }
  const validation = validateContractInstance(contract, dataset);
  if (!validation.valid) throw new FoundationError(`Provider prose qualification dataset is invalid: ${validation.failures.join('; ')}`, { code: 'PROVIDER_QUALIFICATION_DATASET_INVALID', path: filePath });
  const languages = new Set(dataset.cases.map((item) => item.language));
  if (!languages.has('es') || !languages.has('en')) throw new FoundationError('Provider prose qualification dataset must contain Spanish and English cases.', { code: 'PROVIDER_QUALIFICATION_DATASET_INCOMPLETE', path: filePath });
  return Object.freeze(dataset);
}

export function isLaneQualified({ lane, provider, records }) {
  if (provider.kind === 'deterministic') return true;
  if (typeof lane.qualificationRecordId !== 'string') return false;
  return records.some((record) => record.id === lane.qualificationRecordId && record.status === 'approved' && record.laneId === lane.id && record.providerId === provider.id && record.model === lane.model && Object.values(record.results).every(Boolean));
}
