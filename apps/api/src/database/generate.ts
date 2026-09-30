import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const prismaCli = fileURLToPath(
  new URL('../../node_modules/prisma/build/index.js', import.meta.url),
);
const generate = spawn(process.execPath, [prismaCli, 'generate'], {
  env: { ...process.env, PRISMA_GENERATE_ONLY: 'true' },
  stdio: 'inherit',
});

generate.once('error', (error: Error) => {
  throw error;
});
generate.once('exit', (code: number | null) => {
  process.exitCode = code ?? 1;
});
