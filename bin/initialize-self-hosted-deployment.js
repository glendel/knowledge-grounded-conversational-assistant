import { access, copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseSelfHostedInitializerArguments(argumentsList) {
  const values = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--help') return Object.freeze({ help: true });
    if (argument !== '--deployment-root') throw new Error('Unsupported argument: ' + argument);
    const value = argumentsList[index + 1];
    if (!value || value.startsWith('--')) throw new Error('--deployment-root requires an absolute path.');
    values.deploymentRoot = value;
    index += 1;
  }
  if (!values.deploymentRoot || !path.isAbsolute(values.deploymentRoot)) throw new Error('--deployment-root is required and must be absolute.');
  return Object.freeze({ help: false, deploymentRoot: path.resolve(values.deploymentRoot) });
}

export async function initializeSelfHostedDeployment({ argumentsList = process.argv.slice(2), output = process.stdout, coreRoot = CORE_ROOT } = {}) {
  let options;
  try {
    options = parseSelfHostedInitializerArguments(argumentsList);
  } catch (error) {
    output.write(error.message + '\n' + usage());
    return 2;
  }
  if (options.help) {
    output.write(usage());
    return 0;
  }
  const resolvedCoreRoot = path.resolve(coreRoot);
  if (options.deploymentRoot !== resolvedCoreRoot) {
    output.write('Self-hosted initialization requires --deployment-root to be this Core checkout. Use an external deployment root without this command.\n');
    return 2;
  }
  const directories = [
    'app/knowledge/sources',
    'app/knowledge/extracted',
    'app/knowledge/drafts',
    'app/knowledge/approved',
    'app/knowledge/indexes',
    'app/knowledge/evaluations',
    'app/evaluations/provider-qualification',
    'tmp'
  ];
  for (const relativePath of directories) await mkdir(path.join(resolvedCoreRoot, relativePath), { recursive: true });
  await copyIfMissing(path.join(resolvedCoreRoot, 'app-template', 'README.md'), path.join(resolvedCoreRoot, 'app', 'README.md'));
  const templateDirectory = path.join(resolvedCoreRoot, 'config', 'templates');
  const templates = await readdir(templateDirectory, { withFileTypes: true });
  for (const template of templates.filter((entry) => entry.isFile() && entry.name.endsWith('.example.json'))) {
    await copyIfMissing(path.join(templateDirectory, template.name), path.join(resolvedCoreRoot, 'config', template.name.replace('.example.json', '.json')));
  }
  output.write('Initialized ignored self-hosted deployment folders and generic configuration. Configure app/, config/, and .env before running a provider or conversation command. Existing local files were preserved.\n');
  return 0;
}

function usage() {
  return 'Usage: node ./bin/initialize-self-hosted-deployment.js --deployment-root <absolute-clone-root>\nCreates only ignored local deployment folders. It never writes credentials, business identity, or provider configuration.\n';
}

async function copyIfMissing(source, destination) {
  try {
    await access(destination);
  } catch {
    await copyFile(source, destination);
  }
}

if (process.argv[1]?.endsWith('/initialize-self-hosted-deployment.js') || process.argv[1]?.endsWith('\\initialize-self-hosted-deployment.js')) {
  initializeSelfHostedDeployment().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write('Self-hosted initialization failed: ' + error.message + '\n');
    process.exitCode = 1;
  });
}
