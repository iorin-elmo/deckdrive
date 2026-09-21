import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { ApiApplication, type ApiRequest } from './application.js';

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
    } catch {
      writeJson(response, 400, { error: 'INVALID_REQUEST' });
    }
  });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'DELETE') return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
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
