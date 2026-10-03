import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { finished } from 'node:stream/promises';

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
  write?: (line: string) => void,
  now: () => Date = () => new Date(),
  file = process.env.LOG_FILE,
) {
  let stream: WriteStream | undefined;
  if (write === undefined && file) {
    try {
      mkdirSync(dirname(file), { recursive: true });
      stream = createWriteStream(file, { flags: 'a', encoding: 'utf8' });
      stream.on('error', () => process.stderr.write('JSON log file write failed\n'));
    } catch {
      process.stderr.write('JSON log file setup failed\n');
    }
  }
  let overflowReported = false;
  const sink =
    write ??
    ((line: string) => {
      process.stdout.write(line);
      if (stream === undefined || stream.destroyed || stream.writableEnded) return;
      if (stream.writableLength + Buffer.byteLength(line) > 1024 * 1024) {
        if (!overflowReported) process.stderr.write('JSON log file buffer full; dropping lines\n');
        overflowReported = true;
        return;
      }
      overflowReported = false;
      stream.write(line);
    });
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
    sink(`${JSON.stringify({ level, event, timestamp: now().toISOString(), ...safe })}\n`);
  };
  return {
    info: (event: string, fields?: LogFields) => log('info', event, fields),
    warn: (event: string, fields?: LogFields) => log('warn', event, fields),
    error: (event: string, fields?: LogFields) => log('error', event, fields),
    close: async () => {
      if (stream === undefined || stream.destroyed || stream.writableEnded) return;
      stream.end();
      try {
        await finished(stream);
      } catch {
        // The error listener above reports file failures; stdout remains available.
      }
    },
  };
}
