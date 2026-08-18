import process from 'node:process';
import path from 'node:path';

import { createDeploymentDescriptor } from '../src/deployment/deployment-descriptor.js';
import {
  analyzeSource,
  approveDraft,
  buildIndexes,
  classifySource,
  createDraft,
  createKnowledgeAdministration,
  evaluateKnowledgeBase,
  extractSource,
  rejectDraft,
  reviewKnowledgeBase,
  scanSources,
  validateKnowledgeBase
} from '../src/knowledge/knowledge-administration.js';

export function parseKnowledgeAdministrationArguments(argumentsList) {
  if (argumentsList.length === 1 && argumentsList[0] === '--help') return Object.freeze({ help: true });
  if (argumentsList.length < 3 || argumentsList[0] !== '--deployment-root') throw new Error('--deployment-root must be the first option and requires an absolute path.');
  const deploymentRoot = argumentsList[1];
  if (!path.isAbsolute(deploymentRoot)) throw new Error('--deployment-root must be an absolute path.');
  const command = argumentsList[2];
  if (!command || command.startsWith('--')) throw new Error('A Knowledge Base administration command is required.');
  const remaining = argumentsList.slice(3);
  const subcommand = remaining[0] && !remaining[0].startsWith('--') ? remaining.shift() : null;
  return Object.freeze({ help: false, deploymentRoot: path.resolve(deploymentRoot), command, subcommand, options: parseOptions(remaining) });
}

export async function runKnowledgeAdministration({ argumentsList = process.argv.slice(2), output = process.stdout, errorOutput = process.stderr } = {}) {
  let options;
  try {
    options = parseKnowledgeAdministrationArguments(argumentsList);
  } catch (error) {
    errorOutput.write(error.message + '\n' + usage());
    return 2;
  }
  if (options.help) {
    output.write(usage());
    return 0;
  }
  try {
    const descriptor = await createDeploymentDescriptor({ deploymentRoot: options.deploymentRoot });
    const service = await createKnowledgeAdministration({ deploymentRoot: descriptor.deploymentRoot, configuration: descriptor.configuration, contracts: descriptor.contracts });
    const result = await execute(service, options);
    output.write(JSON.stringify(result) + '\n');
    return 0;
  } catch (error) {
    errorOutput.write('Knowledge administration failed: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    return 1;
  }
}

async function execute(service, { command, subcommand, options }) {
  if (command === 'scan' && !subcommand) return scanSources(service);
  if (command === 'classify' && !subcommand) return classifySource(service, { sourceId: required(options, 'source'), authority: required(options, 'authority'), storageClassification: required(options, 'storage-class') });
  if (command === 'extract' && !subcommand) return extractSource(service, { sourceId: required(options, 'source') });
  if (command === 'analyze' && !subcommand) return analyzeSource(service, { sourceId: required(options, 'source'), aiAdministrator: options.ai ?? 'authorized-ai-administrator' });
  if (command === 'draft' && subcommand === 'create') return createDraft(service, { sourceId: required(options, 'source'), documentId: required(options, 'id'), title: required(options, 'title'), language: options.language ?? 'en', aiAdministrator: options.ai ?? 'authorized-ai-administrator' });
  if (command === 'validate' && !subcommand) return validateKnowledgeBase(service);
  if (command === 'review' && !subcommand) return reviewKnowledgeBase(service, { aiAdministrator: options.ai ?? 'authorized-ai-administrator' });
  if (command === 'approve' && !subcommand) return approveDraft(service, { documentId: required(options, 'draft'), approvedBy: required(options, 'approved-by'), declaration: required(options, 'declaration') });
  if (command === 'reject' && !subcommand) return rejectDraft(service, { documentId: required(options, 'draft'), rejectedBy: required(options, 'rejected-by'), reason: required(options, 'reason') });
  if (command === 'index' && subcommand === 'build') return buildIndexes(service);
  if (command === 'evaluate' && !subcommand) return evaluateKnowledgeBase(service);
  throw new Error('Unsupported Knowledge Base administration command.');
}

function parseOptions(raw) {
  const options = {};
  for (let index = 0; index < raw.length; index += 1) {
    const token = raw[index];
    if (!token.startsWith('--')) throw new Error('Unexpected argument: ' + token);
    const key = token.slice(2);
    const value = raw[index + 1];
    if (!value || value.startsWith('--')) throw new Error('Option --' + key + ' requires a value.');
    if (key in options) throw new Error('Option --' + key + ' may appear only once.');
    options[key] = value;
    index += 1;
  }
  return Object.freeze(options);
}

function required(options, key) {
  if (!options[key]) throw new Error('Option --' + key + ' is required.');
  return options[key];
}

function usage() {
  return 'Usage: node ./bin/admin-knowledge.js --deployment-root <absolute-path> <command>\nCommands: scan | classify --source <id> --authority <authoritative|supporting|historical|unclassified> --storage-class <local_only|safe_to_track|protected_store> | extract --source <id> | analyze --source <id> [--ai <administrator-id>] | draft create --source <id> --id <knowledge-id> --title <title> [--language <language>] [--ai <administrator-id>] | validate | review [--ai <administrator-id>] | approve --draft <knowledge-id> --approved-by <human-id> --declaration HUMAN_APPROVAL_CONFIRMED | reject --draft <knowledge-id> --rejected-by <human-id> --reason <reason> | index build | evaluate\n';
}

if (process.argv[1]?.endsWith('/admin-knowledge.js') || process.argv[1]?.endsWith('\\admin-knowledge.js')) {
  process.exitCode = await runKnowledgeAdministration();
}
