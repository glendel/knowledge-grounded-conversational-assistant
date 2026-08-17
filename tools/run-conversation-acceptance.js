import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { createConversationRuntime, processConversationTurn } from '../src/conversation/conversation-runtime.js';
import { createDeploymentDescriptor } from '../src/deployment/deployment-descriptor.js';
import { loadDeploymentQualificationRecords } from '../src/deployment/provider-qualification-records.js';

export async function runConversationAcceptance({ deploymentRoot, datasetPath, environment = process.env, output = process.stdout, includeReplies = false } = {}) {
  if (!path.isAbsolute(deploymentRoot) || !path.isAbsolute(datasetPath)) throw new Error('deploymentRoot and datasetPath must be absolute paths.');
  const dataset = JSON.parse(await readFile(datasetPath, 'utf8'));
  validateDataset(dataset);
  const descriptor = await createDeploymentDescriptor({ deploymentRoot });
  const qualificationRecords = await loadDeploymentQualificationRecords({ descriptor });
  const runtime = createConversationRuntime({ descriptor, qualificationRecords, environment });
  const outcomes = [];
  for (const scenario of dataset.scenarios) {
    for (const turn of scenario.turns) {
      const result = await processConversationTurn(runtime, {
        conversationId: scenario.conversationId,
        userId: scenario.userId,
        message: turn.message
      });
      const outcome = assessTurn(result, turn, { includeReplies });
      outcomes.push({ scenarioId: scenario.id, turnId: turn.id, ...outcome });
    }
  }
  const report = {
    schemaVersion: 1,
    datasetId: dataset.id,
    scenarioCount: dataset.scenarios.length,
    turnCount: outcomes.length,
    passed: outcomes.every((outcome) => outcome.passed),
    outcomes
  };
  output.write(JSON.stringify(report, null, 2) + '\n');
  return report;
}

function assessTurn(result, expectation, { includeReplies }) {
  const failures = [];
  if (result.status !== 'success') failures.push('technical_failure:' + (result.failure?.code ?? 'unknown'));
  if (expectation.evidenceState && result.turn?.evidenceState !== expectation.evidenceState) failures.push('evidence_state_mismatch');
  if (expectation.language && result.turn?.language !== expectation.language) failures.push('language_mismatch');
  if (typeof result.turn?.text === 'string' && result.turn.text.length < 2) failures.push('reply_too_short');
  return {
    passed: failures.length === 0,
    failures,
    ...(includeReplies ? { reply: result.turn?.text ?? null } : {})
  };
}

function validateDataset(dataset) {
  if (!dataset || dataset.schemaVersion !== 1 || typeof dataset.id !== 'string' || !Array.isArray(dataset.scenarios) || dataset.scenarios.length === 0) {
    throw new Error('Acceptance dataset must contain schemaVersion 1, id, and scenarios.');
  }
  for (const scenario of dataset.scenarios) {
    if (typeof scenario.id !== 'string' || typeof scenario.conversationId !== 'string' || typeof scenario.userId !== 'string' || !Array.isArray(scenario.turns) || scenario.turns.length === 0) {
      throw new Error('Each acceptance scenario must contain identifiers and turns.');
    }
    for (const turn of scenario.turns) {
      if (typeof turn.id !== 'string' || typeof turn.message !== 'string') throw new Error('Each acceptance turn must contain id and message.');
      if (turn.evidenceState !== undefined && !['evidence', 'no_evidence'].includes(turn.evidenceState)) throw new Error('Acceptance evidenceState is invalid.');
    }
  }
}

function parseArguments(argumentsList) {
  const values = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--include-replies') values[argument] = true;
    else {
      values[argument] = argumentsList[index + 1];
      index += 1;
    }
  }
  return values;
}

if (process.argv[1]?.endsWith('/run-conversation-acceptance.js') || process.argv[1]?.endsWith('\\run-conversation-acceptance.js')) {
  const values = parseArguments(process.argv.slice(2));
  runConversationAcceptance({
    deploymentRoot: values['--deployment-root'],
    datasetPath: values['--dataset'],
    includeReplies: values['--include-replies'] === true
  }).then((report) => {
    process.exitCode = report.passed ? 0 : 1;
  }).catch((error) => {
    process.stderr.write('Conversation acceptance failed: ' + error.message + '\n');
    process.exitCode = 1;
  });
}
