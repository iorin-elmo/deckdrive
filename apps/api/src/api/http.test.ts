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
});
