import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const packageName = '@deck-drive/logger' as const;

export function correlationId(value: string | readonly string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' && /^[A-Za-z0-9_-]{1,100}$/u.test(candidate)
    ? candidate
    : randomUUID();
}

export type LogLevel = 'info' | 'warn' | 'error';
export interface LogFields {
  readonly requestId?: string;
  readonly matchId?: string;
  readonly playerId?: string;
  readonly action?: string;
  readonly code?: string;
  readonly status?: number;
  readonly method?: string;
  readonly path?: string;
  readonly durationMs?: number;
}

const allowedFields = new Set<keyof LogFields>([
  'requestId',
  'matchId',
  'playerId',
  'action',
  'code',
  'status',
  'method',
  'path',
  'durationMs',
]);

/** Only explicit operational fields may enter JSON logs; arbitrary payloads are discarded. */
export function createLogger(
  write: (line: string) => void = (line) => {
    process.stdout.write(line);
    const file = process.env.LOG_FILE;
    if (file) {
      try {
        mkdirSync(dirname(file), { recursive: true });
        appendFileSync(file, line, 'utf8');
      } catch {
        process.stderr.write('JSON log file write failed\n');
      }
    }
  },
  now: () => Date = () => new Date(),
) {
  const log = (level: LogLevel, event: string, fields: LogFields = {}) => {
    const safe: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (!allowedFields.has(key as keyof LogFields)) continue;
      if (typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
      if (typeof value === 'string') {
        const redacted =
          key === 'path'
            ? value.replace(
                /(\/api\/v1\/matches\/private\/)[^/]+(?=\/(?:join|status)(?:\/|$))/gu,
                '$1:inviteCode',
              )
            : value;
        safe[key] = redacted.replace(/[\r\n\t]/gu, ' ').slice(0, 200);
      }
    }
    write(`${JSON.stringify({ level, event, timestamp: now().toISOString(), ...safe })}\n`);
  };
  return {
    info: (event: string, fields?: LogFields) => log('info', event, fields),
    warn: (event: string, fields?: LogFields) => log('warn', event, fields),
    error: (event: string, fields?: LogFields) => log('error', event, fields),
  };
}
