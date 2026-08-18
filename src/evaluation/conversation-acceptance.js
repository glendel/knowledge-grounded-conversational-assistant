import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createConversationRuntime, processConversationTurn } from '../conversation/conversation-runtime.js';
import { writeJsonAtomic } from '../core/safe-filesystem.js';
import { createDeploymentDescriptor } from '../deployment/deployment-descriptor.js';
import { loadDeploymentQualificationRecords } from '../deployment/provider-qualification-records.js';
import { redactSensitiveText } from '../security/content-safety.js';

const OUTPUT_DIRECTORY = 'conversation-acceptance';

export async function runConversationAcceptance({ deploymentRoot, datasetPath, temporaryDirectory, runId = `acceptance-${randomUUID()}`, resume = false, maxTurns = null, environment = process.env, output = process.stdout, includeTranscript = false, now = () => new Date(), descriptorFactory = createDeploymentDescriptor, qualificationLoader = loadDeploymentQualificationRecords, runtimeFactory = defaultRuntimeFactory, turnProcessor = processConversationTurn } = {}) {
  assertAbsolutePath(deploymentRoot, 'deploymentRoot');
  assertAbsolutePath(datasetPath, 'datasetPath');
  assertAbsolutePath(temporaryDirectory, 'temporaryDirectory');
  assertRunId(runId);
  assertInside(deploymentRoot, path.join('app', 'evaluations'), datasetPath, 'datasetPath');
  assertInside(deploymentRoot, 'tmp', temporaryDirectory, 'temporaryDirectory');
  if (maxTurns !== null && (!Number.isInteger(maxTurns) || maxTurns < 1)) throw new Error('maxTurns must be a positive integer when supplied.');

  const datasetRaw = await readFile(datasetPath, 'utf8');
  const dataset = JSON.parse(datasetRaw);
  validateDataset(dataset);
  const descriptor = await descriptorFactory({ deploymentRoot });
  const qualificationRecords = await qualificationLoader({ descriptor });
  const events = [];
  const runtime = await runtimeFactory({ descriptor, qualificationRecords, environment, observe: (event) => events.push(event) });
  const fingerprint = sha256(datasetRaw);
  const artifactPath = path.join(temporaryDirectory, OUTPUT_DIRECTORY, `${runId}.json`);
  const record = await loadOrCreateRecord({ artifactPath, resume, runId, dataset, fingerprint, descriptor, now });
  const completedKeys = new Set(record.outcomes.map((outcome) => outcome.scenarioId + '\u0000' + outcome.turnId));
  let processed = 0;

  for (const scenario of dataset.scenarios) {
    for (const turn of scenario.turns) {
      const key = scenario.id + '\u0000' + turn.id;
      if (completedKeys.has(key)) continue;
      if (maxTurns !== null && processed >= maxTurns) return persistAndReport({ record, artifactPath, now, output, includeTranscript, completed: false });
      const eventStart = events.length;
      const result = await turnProcessor(runtime, { conversationId: scenario.conversationId, userId: scenario.userId, message: turn.message });
      record.outcomes.push(assessTurn({ scenario, turn, result, events: events.slice(eventStart) }));
      processed += 1;
      refreshRecord(record, now);
      await writeJsonAtomic(temporaryDirectory, path.join(OUTPUT_DIRECTORY, `${runId}.json`), record);
    }
  }
  return persistAndReport({ record, artifactPath, now, output, includeTranscript, completed: true });
}

async function defaultRuntimeFactory({ descriptor, qualificationRecords, environment, observe }) {
  return createConversationRuntime({ descriptor, qualificationRecords, environment, observe });
}

async function loadOrCreateRecord({ artifactPath, resume, runId, dataset, fingerprint, descriptor, now }) {
  let existing = null;
  try {
    existing = JSON.parse(await readFile(artifactPath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new Error('Existing acceptance artifact could not be read.', { cause: error });
  }
  if (existing) {
    if (!resume) throw new Error('Acceptance run already exists; use --resume with the same run ID.');
    if (existing.datasetId !== dataset.id || existing.datasetSha256 !== fingerprint) throw new Error('Acceptance run does not match the supplied dataset.');
    return existing;
  }
  if (resume) throw new Error('No acceptance artifact exists for --resume.');
  const startedAt = timestamp(now);
  return {
    schemaVersion: 1,
    kind: 'conversation_acceptance_run',
    runId,
    datasetId: dataset.id,
    datasetSha256: fingerprint,
    assistantId: descriptor.configuration.assistant.assistantId,
    startedAt,
    updatedAt: startedAt,
    completed: false,
    passed: null,
    outcomes: [],
    review: { status: 'in_progress', findings: [], humanDecision: null }
  };
}

function assessTurn({ scenario, turn, result, events }) {
  const input = redactSensitiveText(turn.message);
  const reply = redactSensitiveText(result.turn?.text ?? '');
  const failures = [];
  if (result.status !== 'success') failures.push('technical_failure:' + (result.failure?.code ?? 'unknown'));
  if (turn.expect?.evidenceState && result.turn?.evidenceState !== turn.expect.evidenceState) failures.push('evidence_state_mismatch');
  if (turn.expect?.language && result.turn?.language !== turn.expect.language) failures.push('language_mismatch');
  if (result.status === 'success' && reply.text.length < (turn.expect?.minimumReplyCharacters ?? 2)) failures.push('reply_too_short');
  const findings = [
    ...failures.map((code) => ({ severity: 'blocker', code, message: 'Deterministic acceptance constraint failed.' })),
    ...(input.findings.length > 0 ? [{ severity: 'warning', code: 'sensitive_input_redacted', message: 'Sensitive candidate text was redacted from the stored transcript.' }] : []),
    ...(reply.findings.length > 0 ? [{ severity: 'warning', code: 'sensitive_reply_redacted', message: 'Sensitive candidate text was redacted from the stored transcript.' }] : [])
  ];
  return {
    scenarioId: scenario.id,
    turnId: turn.id,
    conversationId: scenario.conversationId,
    userId: scenario.userId,
    passed: failures.length === 0,
    failures,
    findings,
    request: { text: input.text, redactionKinds: input.findings.map((finding) => finding.kind) },
    response: result.status === 'success'
      ? { text: reply.text, redactionKinds: reply.findings.map((finding) => finding.kind), language: result.turn.language, evidenceState: result.turn.evidenceState, sourcesAvailable: result.turn.sourcesAvailable, knowledgeVersion: result.turn.knowledgeVersion, completedAt: result.turn.completedAt }
      : { failureCode: result.failure?.code ?? 'unknown' },
    provider: providerEvidence(events)
  };
}

function providerEvidence(events) {
  const relevant = events.filter((event) => event?.eventType === 'ai.prose.completed' || event?.eventType === 'ai.prose.failed');
  const completed = relevant.filter((event) => event.eventType === 'ai.prose.completed').at(-1);
  const last = completed ?? relevant.at(-1) ?? null;
  return last
    ? { laneId: last.laneId ?? null, providerId: last.providerId ?? null, model: last.model ?? null, attempt: last.attempt ?? null, outcome: last.eventType === 'ai.prose.completed' ? 'completed' : 'failed', failureCode: last.code ?? null }
    : null;
}

async function persistAndReport({ record, artifactPath, now, output, includeTranscript, completed }) {
  record.completed = completed;
  record.passed = completed ? record.outcomes.every((outcome) => outcome.passed) : null;
  record.review = summarizeReview(record.outcomes, completed, record.passed);
  refreshRecord(record, now);
  await writeJsonAtomic(path.dirname(path.dirname(artifactPath)), path.join(path.basename(path.dirname(artifactPath)), path.basename(artifactPath)), record);
  const report = {
    runId: record.runId,
    datasetId: record.datasetId,
    completed: record.completed,
    passed: record.passed,
    turnCount: record.outcomes.length,
    reviewStatus: record.review.status,
    artifactPath,
    ...(includeTranscript ? { transcript: record.outcomes } : {})
  };
  output.write(JSON.stringify(report, null, 2) + '\n');
  return Object.freeze(report);
}

function refreshRecord(record, now) {
  record.updatedAt = timestamp(now);
}

function summarizeReview(outcomes, completed, passed) {
  const findings = outcomes.flatMap((outcome) => outcome.findings.map((finding) => ({ scenarioId: outcome.scenarioId, turnId: outcome.turnId, ...finding })));
  const status = !completed ? 'in_progress' : passed ? 'human_review_required' : 'needs_attention';
  return { status, findings, humanDecision: null };
}

function validateDataset(dataset) {
  if (!dataset || dataset.schemaVersion !== 1 || !isIdentifier(dataset.id) || !Array.isArray(dataset.scenarios) || dataset.scenarios.length === 0) {
    throw new Error('Acceptance dataset must contain schemaVersion 1, an ID, and at least one scenario.');
  }
  for (const scenario of dataset.scenarios) {
    if (!isIdentifier(scenario.id) || !isIdentifier(scenario.conversationId) || !isIdentifier(scenario.userId) || !Array.isArray(scenario.turns) || scenario.turns.length === 0) {
      throw new Error('Each acceptance scenario must contain bounded identifiers and turns.');
    }
    for (const turn of scenario.turns) {
      if (!isIdentifier(turn.id) || typeof turn.message !== 'string' || turn.message.length === 0 || turn.message.length > 8_000) throw new Error('Each acceptance turn must contain a bounded ID and message.');
      if (turn.expect !== undefined) validateExpectation(turn.expect);
    }
  }
}

function validateExpectation(expectation) {
  if (!expectation || typeof expectation !== 'object' || Array.isArray(expectation)) throw new Error('Turn expectation must be an object.');
  for (const key of Object.keys(expectation)) if (!['evidenceState', 'language', 'minimumReplyCharacters'].includes(key)) throw new Error('Unsupported turn expectation: ' + key);
  if (expectation.evidenceState !== undefined && !['evidence', 'no_evidence'].includes(expectation.evidenceState)) throw new Error('Turn expectation evidenceState is invalid.');
  if (expectation.language !== undefined && (!isIdentifier(expectation.language) || expectation.language.length > 16)) throw new Error('Turn expectation language is invalid.');
  if (expectation.minimumReplyCharacters !== undefined && (!Number.isInteger(expectation.minimumReplyCharacters) || expectation.minimumReplyCharacters < 2 || expectation.minimumReplyCharacters > 3_000)) throw new Error('Turn expectation minimumReplyCharacters is invalid.');
}

function assertAbsolutePath(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error(label + ' must be an absolute path.');
}

function assertInside(root, relativeRoot, candidate, label) {
  const parent = path.resolve(root, relativeRoot);
  const target = path.resolve(candidate);
  const relative = path.relative(parent, target);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error(label + ' must be inside the deployment ' + relativeRoot.replaceAll(path.sep, '/') + ' directory.');
}

function assertRunId(value) {
  if (!isIdentifier(value)) throw new Error('runId must be a bounded opaque identifier.');
}

function isIdentifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}

function timestamp(now) {
  return now().toISOString();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
