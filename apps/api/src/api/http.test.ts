import { once } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import type { ApiApplication } from './application.js';
import { createApiHttpServer, maximumRequestBodyBytes } from './http.js';

describe('createApiHttpServer', () => {
  it('returns a client error for malformed JSON instead of leaving the request open', async () => {
    const application = { handle: vi.fn() } as unknown as ApiApplication;
    const server = createApiHttpServer(application);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('Expected a TCP server address.');

    try {
      const response = await fetch(`http://127.0.0.1:${String(address.port)}/api/v1/decks`, {
        method: 'POST',
        body: '{',
      });
      await expect(response.json()).resolves.toEqual({ error: 'INVALID_REQUEST' });
      expect(response.status).toBe(400);
      expect(application.handle).not.toHaveBeenCalled();
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('rejects request bodies larger than the configured memory limit', async () => {
    const application = { handle: vi.fn() } as unknown as ApiApplication;
    const server = createApiHttpServer(application);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('Expected a TCP server address.');

    try {
      const response = await fetch(`http://127.0.0.1:${String(address.port)}/api/v1/decks`, {
        method: 'POST',
        body: Buffer.alloc(maximumRequestBodyBytes + 1),
      });
      await expect(response.json()).resolves.toEqual({ error: 'PAYLOAD_TOO_LARGE' });
      expect(response.status).toBe(413);
      expect(response.headers.get('connection')).toBe('close');
      expect(application.handle).not.toHaveBeenCalled();
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('returns a generic server error when the application unexpectedly rejects', async () => {
    const application = {
      handle: vi.fn().mockRejectedValue(new Error('database connection secret')),
    } as unknown as ApiApplication;
    const server = createApiHttpServer(application);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('Expected a TCP server address.');

    try {
      const response = await fetch(`http://127.0.0.1:${String(address.port)}/api/v1/cards`);
      await expect(response.json()).resolves.toEqual({ error: 'INTERNAL_ERROR' });
      expect(response.status).toBe(500);
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('serves CORS preflight and response headers for an allowed web origin', async () => {
    const application = {
      handle: vi.fn().mockResolvedValue({ status: 200, body: { cards: [] } }),
    } as unknown as ApiApplication;
    const server = createApiHttpServer(application, {
      allowedOrigins: ['http://localhost:5173'],
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('Expected a TCP server address.');

    try {
      const baseUrl = `http://127.0.0.1:${String(address.port)}/api/v1/cards`;
      const preflight = await fetch(baseUrl, {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,x-deckdrive-player-id',
        },
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
      expect(application.handle).not.toHaveBeenCalled();

      const response = await fetch(baseUrl, {
        headers: {
          origin: 'http://localhost:5173',
          'x-deckdrive-player-id': 'player-1',
        },
      });
      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(application.handle).toHaveBeenCalledOnce();
    } finally {
      server.close();
      await once(server, 'close');
    }
  });
});
