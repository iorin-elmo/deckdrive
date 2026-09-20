import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { assertDevelopmentDatabaseEnvironment } from './seed-environment.js';

assertDevelopmentDatabaseEnvironment();

const prismaCli = fileURLToPath(
  new URL('../../node_modules/prisma/build/index.js', import.meta.url),
);
const reset = spawn(process.execPath, [prismaCli, 'migrate', 'reset', '--force'], {
  stdio: 'inherit',
});

reset.once('error', (error: Error) => {
  throw error;
});
reset.once('exit', (code: number | null) => {
  process.exitCode = code ?? 1;
});
