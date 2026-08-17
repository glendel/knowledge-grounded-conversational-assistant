import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { deepFreeze } from '../core/deep-freeze.js';
import { FoundationError } from '../core/foundation-error.js';

export const REQUIRED_CONTRACT_FILES = Object.freeze([
  'common.contract.json',
  'assistant-runtime-config.contract.json',
  'observability-config.contract.json',
  'white-label-boundary-config.contract.json',
  'operation-result.contract.json',
  'observation-event.contract.json',
  'knowledge-record.contract.json',
  'conversation-message.contract.json',
  'conversation-turn-request.contract.json',
  'conversation-turn.contract.json',
  'active-chat-memory.contract.json',
  'chat-memory-config.contract.json',
  'chat-memory-turn.contract.json',
  'chat-memory-summary.contract.json',
  'chat-memory-fact.contract.json',
  'chat-memory-snapshot.contract.json',
  'conversation-runtime-config.contract.json',
  'runtime-conversation-context.contract.json',
  'runtime-conversation-turn.contract.json',
  'ai-provider-registration.contract.json',
  'ai-provider-lane.contract.json',
  'ai-capability-route.contract.json',
  'prose-generation-request.contract.json',
  'prose-generation-result.contract.json',
  'ai-capability-failure.contract.json',
  'model-qualification-record.contract.json',
  'provider-prose-qualification-dataset.contract.json',
  'registered-caller.contract.json',
  'gateway-config.contract.json',
  'gateway-error.contract.json',
  'gateway-nonce.contract.json',
  'gateway-job.contract.json',
  'gateway-callback-outbox.contract.json',
  'gateway-source-expansion.contract.json',
  'http-turn.contract.json',
  'http-turn-ack.contract.json',
  'http-turn-callback.contract.json',
  'source-expansion-request.contract.json',
  'source-expansion-result.contract.json',
  'improvement-item.contract.json',
  'evaluation-case.contract.json',
  'knowledge-source.contract.json',
  'knowledge-extraction.contract.json',
  'knowledge-document.contract.json',
  'knowledge-approval.contract.json',
  'knowledge-index.contract.json',
  'knowledge-lexical-index.contract.json',
  'knowledge-relationship-map.contract.json',
  'knowledge-review-briefing.contract.json',
  'knowledge-administration-config.contract.json'
]);

function createValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true, validateFormats: true });
  addFormats(ajv);
  return ajv;
}

function assertContractMetadata(contract, fileName) {
  if (!contract || Array.isArray(contract) || typeof contract !== 'object') throw new FoundationError(`${fileName} must contain a JSON object.`, { path: fileName });
  if (contract.$schema !== 'https://json-schema.org/draft/2020-12/schema') throw new FoundationError(`${fileName} must declare the supported JSON Schema draft.`, { path: fileName });
  if (typeof contract.$id !== 'string' || !/\/v\d+(?:$|[?#])/.test(contract.$id)) throw new FoundationError(`${fileName} must have a stable versioned contract ID.`, { path: fileName });
  if (contract.type !== 'object' || contract.additionalProperties !== false) throw new FoundationError(`${fileName} must define a strict object boundary.`, { path: fileName });
  if (!Array.isArray(contract.required) || !contract.required.includes('schemaVersion')) throw new FoundationError(`${fileName} must require schemaVersion.`, { path: fileName });
  if (!contract.properties || typeof contract.properties !== 'object') throw new FoundationError(`${fileName} must declare properties.`, { path: fileName });
}

export function validateContractInstance(contract, value) {
  const ajv = createValidator();
  const validate = ajv.compile(contract);
  const valid = validate(value);
  const failures = (validate.errors ?? []).map((error) => error.keyword === 'additionalProperties' ? `${error.instancePath || '$'}.${error.params.additionalProperty} is not allowed.` : `${error.instancePath || '$'} ${error.message ?? 'is invalid.'}`);
  return deepFreeze({ valid, failures });
}

export async function loadContractRegistry({ contractsDirectory } = {}) {
  if (typeof contractsDirectory !== 'string' || contractsDirectory.length === 0) throw new TypeError('contractsDirectory is required.');
  const available = await readdir(contractsDirectory);
  const missing = REQUIRED_CONTRACT_FILES.filter((fileName) => !available.includes(fileName));
  if (missing.length > 0) throw new FoundationError(`Required contracts are missing: ${missing.join(', ')}.`, { code: 'CONTRACT_MISSING', path: contractsDirectory });
  const ajv = createValidator();
  const contracts = {};
  for (const fileName of REQUIRED_CONTRACT_FILES) {
    const contractPath = path.join(contractsDirectory, fileName);
    let contract;
    try {
      contract = JSON.parse(await readFile(contractPath, 'utf8'));
    } catch (cause) {
      throw new FoundationError(`Cannot read strict JSON contract ${fileName}.`, { code: 'CONTRACT_INVALID_JSON', path: contractPath, cause });
    }
    assertContractMetadata(contract, fileName);
    try {
      ajv.addSchema(contract);
    } catch (cause) {
      throw new FoundationError(`Contract ${fileName} cannot be compiled.`, { code: 'CONTRACT_SCHEMA_INVALID', path: fileName, cause });
    }
    contracts[fileName] = contract;
  }
  return deepFreeze(contracts);
}
