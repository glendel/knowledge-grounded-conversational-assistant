import process from 'node:process';
import { fileURLToPath } from 'node:url';

import path from 'node:path';

import { runCoreBoundarySecurityCheck } from '../src/security/core-boundary-security.js';

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

runCoreBoundarySecurityCheck({ coreRoot })
  .then((report) => process.stdout.write(`Core boundary check passed: ${report.filesChecked} text files checked.\n`))
  .catch((error) => {
    process.stderr.write(`Core boundary check failed: ${error.message}\n`);
    process.exitCode = 1;
  });
