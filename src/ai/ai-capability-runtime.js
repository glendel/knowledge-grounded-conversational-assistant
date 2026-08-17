import { createCapabilityRouter } from './capability-router.js';

export function createAiCapabilityRuntime({ configuration, contracts, adapters, qualificationRecords = [], environment = process.env, fetchImpl = globalThis.fetch, now, sleep, observe } = {}) {
  if (!configuration || !contracts) throw new TypeError('configuration and contracts are required.');
  if (!Array.isArray(qualificationRecords)) throw new TypeError('qualificationRecords must be an array.');
  return createCapabilityRouter({
    configuration,
    contracts,
    ...(adapters ? { adapters } : {}),
    qualificationRecords,
    environment,
    fetchImpl,
    ...(now ? { now } : {}),
    ...(sleep ? { sleep } : {}),
    ...(observe ? { observe } : {})
  });
}
