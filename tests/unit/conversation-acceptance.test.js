import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runConversationAcceptance } from '../../src/evaluation/conversation-acceptance.js';
import { parseConversationAcceptanceArguments } from '../../tools/run-conversation-acceptance.js';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kgca-acceptance-'));
  const datasetPath = path.join(root, 'app', 'evaluations', 'conversation-evaluation.json');
  await mkdir(path.dirname(datasetPath), { recursive: true });
  await writeFile(datasetPath, JSON.stringify({
    schemaVersion: 1,
    id: 'conversation-evaluation-v1',
    scenarios: [{
      id: 'natural-continuity',
      conversationId: 'acceptance-conversation-001',
      userId: 'acceptance-user-001',
      turns: [
        { id: 'turn-001', message: 'Hello.', expect: { language: 'en', evidenceState: 'no_evidence', minimumReplyCharacters: 10 } },
        { id: 'turn-002', message: 'Can we continue?', expect: { language: 'en', evidenceState: 'no_evidence' } }
      ]
    }]
  }, null, 2), 'utf8');
  return { root, datasetPath, temporaryDirectory: path.join(root, 'tmp') };
}

function fakes() {
  return {
    descriptorFactory: async ({ deploymentRoot }) => ({ deploymentRoot, configuration: { assistant: { assistantId: 'example-assistant' } } }),
    qualificationLoader: async () => [],
    runtimeFactory: async ({ observe }) => ({ observe }),
    turnProcessor: async (runtime, { message }) => {
      runtime.observe({ eventType: 'ai.prose.completed', laneId: 'primary-lane', providerId: 'example-provider', model: 'example-model', attempt: 1 });
      return {
        status: 'success',
        turn: { text: `Natural reply for ${message} user@example.com`, language: 'en', evidenceState: 'no_evidence', sourcesAvailable: false, knowledgeVersion: null, completedAt: '2026-08-18T00:00:00.000Z' }
      };
    }
  };
}

test('persists a sanitized acceptance transcript after every turn and resumes the same dataset', async () => {
  const { root, datasetPath, temporaryDirectory } = await fixture();
  const output = { messages: [], write(message) { this.messages.push(message); } };
  try {
    const first = await runConversationAcceptance({ deploymentRoot: root, datasetPath, temporaryDirectory, runId: 'resume-run-001', maxTurns: 1, output, ...fakes() });
    assert.equal(first.completed, false);
    assert.equal(first.turnCount, 1);

    const second = await runConversationAcceptance({ deploymentRoot: root, datasetPath, temporaryDirectory, runId: 'resume-run-001', resume: true, output, ...fakes() });
    assert.equal(second.completed, true);
    assert.equal(second.passed, true);
    assert.equal(second.reviewStatus, 'human_review_required');
    const artifact = JSON.parse(await readFile(path.join(temporaryDirectory, 'conversation-acceptance', 'resume-run-001.json'), 'utf8'));
    assert.equal(artifact.outcomes.length, 2);
    assert.equal(artifact.outcomes[0].provider.laneId, 'primary-lane');
    assert.match(artifact.outcomes[0].response.text, /REDACTED_EMAIL/);
    assert.equal(artifact.review.findings.some((finding) => finding.code === 'sensitive_reply_redacted'), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects acceptance datasets and temporary paths outside their governed deployment locations', async () => {
  const { root, datasetPath } = await fixture();
  try {
    await assert.rejects(
      () => runConversationAcceptance({ deploymentRoot: root, datasetPath, temporaryDirectory: path.join(os.tmpdir(), 'outside'), runId: 'invalid-tmp', ...fakes() }),
      /temporaryDirectory must be inside the deployment tmp directory/
    );
    assert.throws(() => parseConversationAcceptanceArguments(['--deployment-root', root, '--dataset', datasetPath, '--tmp-dir', 'tmp']), /must be an absolute path/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('holds an exclusive run lease and lets an administrator explicitly recover only a stale lease', async () => {
  const { root, datasetPath, temporaryDirectory } = await fixture();
  try {
    let enteredTurn;
    const entered = new Promise((resolve) => { enteredTurn = resolve; });
    let releaseTurn;
    const release = new Promise((resolve) => { releaseTurn = resolve; });
    const first = runConversationAcceptance({
      deploymentRoot: root,
      datasetPath,
      temporaryDirectory,
      runId: 'active-run',
      maxTurns: 1,
      ...fakes(),
      turnProcessor: async () => {
        enteredTurn();
        await release;
        return { status: 'success', turn: { text: 'Natural reply.', language: 'en', evidenceState: 'no_evidence', sourcesAvailable: false, knowledgeVersion: null, completedAt: '2026-08-18T00:00:00.000Z' } };
      }
    });
    await entered;
    await assert.rejects(
      () => runConversationAcceptance({ deploymentRoot: root, datasetPath, temporaryDirectory, runId: 'active-run', maxTurns: 1, ...fakes() }),
      /already active or has a stale lease/
    );
    releaseTurn();
    await first;

    await mkdir(path.join(temporaryDirectory, 'conversation-acceptance'), { recursive: true });
    await writeFile(path.join(temporaryDirectory, 'conversation-acceptance', '.locked-run.lock'), '{"stale":true}\n', 'utf8');
    await assert.rejects(
      () => runConversationAcceptance({ deploymentRoot: root, datasetPath, temporaryDirectory, runId: 'locked-run', maxTurns: 1, ...fakes() }),
      /already active or has a stale lease/
    );
    const recovered = await runConversationAcceptance({ deploymentRoot: root, datasetPath, temporaryDirectory, runId: 'locked-run', recoverLock: true, maxTurns: 1, ...fakes() });
    assert.equal(recovered.turnCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
