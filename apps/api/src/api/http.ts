import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { ApiApplication, type ApiRequest } from './application.js';

export const maximumRequestBodyBytes = 1024 * 1024;

/** Native Node adapter for the framework-neutral Phase 4 controller. */
export function createApiHttpServer(application: ApiApplication): Server {
  return createServer(async (request, response) => {
    try {
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
      writeJson(response, apiResponse.status, apiResponse.body);
    } catch (error) {
      if (response.headersSent) return;
      if (error instanceof HttpRequestError) {
        if (error.status === 413) {
          request.resume();
          response.shouldKeepAlive = false;
        }
        writeJson(response, error.status, { error: error.code });
        return;
      }
      writeJson(response, 500, { error: 'INTERNAL_ERROR' });
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
  for await (const chunk of request) {
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

class HttpRequestError extends Error {
  constructor(
    readonly status: 400 | 413,
    readonly code: 'INVALID_REQUEST' | 'PAYLOAD_TOO_LARGE',
  ) {
    super(code);
  }
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  if (status === 204) {
    response.writeHead(status);
    response.end();
    return;
  }
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}
