import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function generateClient(): Promise<void> {
  const prismaCli = fileURLToPath(
    new URL('../node_modules/prisma/build/index.js', import.meta.url),
  );
  const generate = spawn(process.execPath, [prismaCli, 'generate'], { stdio: 'inherit' });

  await new Promise<void>((resolve, reject) => {
    generate.once('error', reject);
    generate.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Prisma client generation exited with code ${String(code)}.`));
    });
  });
}

await generateClient();
await import('./seed.js');
