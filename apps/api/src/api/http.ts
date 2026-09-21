import {
  createServer,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';
import { finished } from 'node:stream/promises';

import { ApiApplication, type ApiRequest } from './application.js';

export const maximumRequestBodyBytes = 1024 * 1024;
const corsMethods = 'GET, POST, PUT, DELETE, OPTIONS';
const corsHeaders = 'content-type, x-deckdrive-player-id';

export interface ApiHttpServerOptions {
  readonly allowedOrigins?: readonly string[];
}

/** Native Node adapter for the framework-neutral Phase 4 controller. */
export function createApiHttpServer(
  application: ApiApplication,
  { allowedOrigins = [] }: ApiHttpServerOptions = {},
): Server {
  return createServer(async (request, response) => {
    const responseHeaders = corsResponseHeaders(request, allowedOrigins);
    try {
      if (request.method === 'OPTIONS') {
        response.writeHead(204, responseHeaders);
        response.end();
        return;
      }
      const apiRequest: ApiRequest = {
        method: request.method ?? 'GET',
        path: new URL(request.url ?? '/', 'http://localhost').pathname,
        headers: Object.fromEntries(
          Object.entries(request.headers).map(([name, value]) => [
            name,
            Array.isArray(value) ? value[0] : value,
          ]),
        ),
        body: await readJsonBody(request),
      };
      const apiResponse = await application.handle(apiRequest);
      writeJson(response, apiResponse.status, apiResponse.body, responseHeaders);
    } catch (error) {
      if (response.headersSent) return;
      if (error instanceof HttpRequestError) {
        if (error.status === 413) {
          await drainRequestBody(request);
          response.setHeader('connection', 'close');
        }
        writeJson(response, error.status, { error: error.code }, responseHeaders);
        return;
      }
      writeJson(response, 500, { error: 'INTERNAL_ERROR' }, responseHeaders);
    }
  });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'DELETE') return undefined;
  const contentLength = request.headers['content-length'];
  if (contentLength !== undefined && Number(contentLength) > maximumRequestBodyBytes) {
    throw new HttpRequestError(413, 'PAYLOAD_TOO_LARGE');
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.from(chunk);
    length += buffer.length;
    if (length > maximumRequestBodyBytes) {
      throw new HttpRequestError(413, 'PAYLOAD_TOO_LARGE');
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) throw new HttpRequestError(400, 'INVALID_REQUEST');
    throw error;
  }
}

async function drainRequestBody(request: IncomingMessage): Promise<void> {
  request.resume();
  await finished(request);
}

class HttpRequestError extends Error {
  constructor(
    readonly status: 400 | 413,
    readonly code: 'INVALID_REQUEST' | 'PAYLOAD_TOO_LARGE',
  ) {
    super(code);
  }
}

function corsResponseHeaders(
  request: IncomingMessage,
  allowedOrigins: readonly string[],
): OutgoingHttpHeaders {
  const origin = request.headers.origin;
  if (origin === undefined || !allowedOrigins.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': corsMethods,
    'access-control-allow-headers': corsHeaders,
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: OutgoingHttpHeaders = {},
): void {
  if (status === 204) {
    response.writeHead(status, headers);
    response.end();
    return;
  }
  response.writeHead(status, { ...headers, 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}
