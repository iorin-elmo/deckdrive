import { loadRootEnvironment } from '../../apps/api/src/database/load-environment.js';

loadRootEnvironment();
const base = process.env.HEALTH_BASE_URL ?? 'http://127.0.0.1:3000';
const endpoints = ['/health/live', '/health/ready'];
let healthy = true;
for (const endpoint of endpoints) {
  try {
    const response = await fetch(new URL(endpoint, base), { signal: AbortSignal.timeout(5000) });
    const body = await response.text();
    process.stdout.write(`${endpoint} ${response.status} ${body}\n`);
    if (!response.ok) healthy = false;
  } catch (error) {
    process.stderr.write(
      `${endpoint} ERROR ${error instanceof Error ? error.message : 'unknown'}\n`,
    );
    healthy = false;
  }
}
if (!healthy) process.exitCode = 1;
