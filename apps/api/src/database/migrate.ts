import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loadRootEnvironment } from './load-environment.js';
import { assertNoPrismaDatasourceOverrides } from './prisma-command-arguments.js';
import { assertDevelopmentDatabaseEnvironment } from './seed-environment.js';

loadRootEnvironment();
assertDevelopmentDatabaseEnvironment();

const arguments_ = process.argv.slice(2);
assertNoPrismaDatasourceOverrides(arguments_);

const prismaCli = fileURLToPath(
  new URL('../../node_modules/prisma/build/index.js', import.meta.url),
);
const migrate = spawn(process.execPath, [prismaCli, 'migrate', 'dev', ...arguments_], {
  stdio: 'inherit',
});

migrate.once('error', (error: Error) => {
  throw error;
});
migrate.once('exit', (code: number | null) => {
  process.exitCode = code ?? 1;
});
