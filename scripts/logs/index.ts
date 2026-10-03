import { existsSync, readFileSync } from 'node:fs';
import { loadRootEnvironment } from '../../apps/api/src/database/load-environment.js';

loadRootEnvironment();

const file = process.env.LOG_FILE;
if (!file) {
  process.stderr.write('LOG_FILE を指定してください。例: LOG_FILE=.deckdrive/api.log pnpm logs\n');
  process.exitCode = 1;
} else if (!existsSync(file)) {
  process.stderr.write(`ログファイルが見つかりません: ${file}\n`);
  process.exitCode = 1;
} else {
  const requestIdIndex = process.argv.indexOf('--request-id');
  const requestId = requestIdIndex < 0 ? undefined : process.argv[requestIdIndex + 1];
  const lines = readFileSync(file, 'utf8').split(/\r?\n/u).filter(Boolean);
  const selected = lines
    .filter((line) => {
      try {
        const value: unknown = JSON.parse(line);
        return (
          requestId === undefined ||
          (typeof value === 'object' &&
            value !== null &&
            'requestId' in value &&
            value.requestId === requestId)
        );
      } catch {
        return false;
      }
    })
    .slice(-100);
  for (const line of selected) process.stdout.write(`${line}\n`);
}
