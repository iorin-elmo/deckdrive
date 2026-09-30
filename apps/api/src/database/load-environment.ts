import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

export function loadRootEnvironment(): void {
  config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)) });
}
