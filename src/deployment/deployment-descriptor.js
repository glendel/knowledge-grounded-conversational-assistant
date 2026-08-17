import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCoreConfiguration } from '../config/core-configuration.js';
import { loadContractRegistry } from '../contracts/contract-registry.js';
import { FoundationError } from '../core/foundation-error.js';
import { assertDirectoryWithoutSymlinks, resolveInside } from '../core/safe-filesystem.js';

const DEFAULT_CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function createDeploymentDescriptor({ deploymentRoot, coreRoot = DEFAULT_CORE_ROOT } = {}) {
  const resolvedCoreRoot = await validateRoot(coreRoot, 'coreRoot', 'DEPLOYMENT_CORE_ROOT_INVALID');
  const resolvedDeploymentRoot = await validateRoot(deploymentRoot, 'deploymentRoot', 'DEPLOYMENT_ROOT_INVALID');
  assertSeparateRoots(resolvedCoreRoot, resolvedDeploymentRoot);

  const configDirectory = await requireOwnedDirectory(resolvedDeploymentRoot, 'config', 'DEPLOYMENT_CONFIG_DIRECTORY_MISSING');
  const appDirectory = await requireOwnedDirectory(resolvedDeploymentRoot, 'app', 'DEPLOYMENT_APP_DIRECTORY_MISSING');
  const contractsDirectory = await requireOwnedDirectory(resolvedCoreRoot, path.join('context', 'contracts'), 'CORE_CONTRACTS_DIRECTORY_MISSING');
  const configuration = await loadCoreConfiguration({ configDirectory });
  const contracts = await loadContractRegistry({ contractsDirectory });
  const paths = createDeploymentPaths({ deploymentRoot: resolvedDeploymentRoot, configDirectory, appDirectory, configuration });

  return Object.freeze({
    coreRoot: resolvedCoreRoot,
    deploymentRoot: resolvedDeploymentRoot,
    configuration,
    contracts,
    paths: Object.freeze(paths)
  });
}

async function validateRoot(candidate, label, code) {
  if (typeof candidate !== 'string' || candidate.length === 0 || !path.isAbsolute(candidate)) {
    throw new FoundationError(label + ' must be an explicit absolute path.', { code, path: String(candidate) });
  }
  const resolved = path.resolve(candidate);
  try {
    const metadata = await lstat(resolved);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new FoundationError(label + ' must be a regular non-symbolic directory.', { code, path: resolved });
    }
    await assertDirectoryWithoutSymlinks(resolved, { rootDirectory: resolved });
  } catch (error) {
    if (error instanceof FoundationError) throw error;
    throw new FoundationError(label + ' must be an existing readable directory.', { code, path: resolved, cause: error });
  }
  return resolved;
}

function assertSeparateRoots(coreRoot, deploymentRoot) {
  if (coreRoot === deploymentRoot || isWithin(coreRoot, deploymentRoot) || isWithin(deploymentRoot, coreRoot)) {
    throw new FoundationError('The deployment root must be separate from the Core checkout.', {
      code: 'DEPLOYMENT_ROOT_OVERLAP',
      path: deploymentRoot
    });
  }
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

async function requireOwnedDirectory(rootDirectory, relativePath, code) {
  const directory = resolveInside(rootDirectory, relativePath, relativePath);
  try {
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new FoundationError(relativePath + ' must be a regular non-symbolic directory.', { code, path: directory });
    }
    await assertDirectoryWithoutSymlinks(directory, { rootDirectory });
  } catch (error) {
    if (error instanceof FoundationError) throw error;
    throw new FoundationError(relativePath + ' directory is required in the selected deployment.', { code, path: directory, cause: error });
  }
  return directory;
}

function createDeploymentPaths({ deploymentRoot, configDirectory, appDirectory, configuration }) {
  const administration = configuration.knowledgeAdministration;
  return {
    configDirectory,
    appDirectory,
    runtimeDataDirectory: resolveInside(deploymentRoot, configuration.runtime.dataDirectory, 'runtime.dataDirectory'),
    chatMemoryDirectory: resolveInside(deploymentRoot, configuration.chatMemory.directory, 'chatMemory.directory'),
    gatewayDataDirectory: resolveInside(deploymentRoot, configuration.gateway.dataDirectory, 'gateway.dataDirectory'),
    knowledge: Object.freeze({
      sourcesDirectory: resolveInside(deploymentRoot, administration.sourcesDirectory, 'knowledgeAdministration.sourcesDirectory'),
      registryPath: resolveInside(deploymentRoot, administration.registryPath, 'knowledgeAdministration.registryPath'),
      extractedDirectory: resolveInside(deploymentRoot, administration.extractedDirectory, 'knowledgeAdministration.extractedDirectory'),
      draftsDirectory: resolveInside(deploymentRoot, administration.draftsDirectory, 'knowledgeAdministration.draftsDirectory'),
      approvedDirectory: resolveInside(deploymentRoot, administration.approvedDirectory, 'knowledgeAdministration.approvedDirectory'),
      indexesDirectory: resolveInside(deploymentRoot, administration.indexesDirectory, 'knowledgeAdministration.indexesDirectory'),
      evaluationsDirectory: resolveInside(deploymentRoot, administration.evaluationsDirectory, 'knowledgeAdministration.evaluationsDirectory')
    })
  };
}
