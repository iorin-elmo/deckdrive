import { once } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import type { ApiApplication } from './application.js';
import { createApiHttpServer } from './http.js';

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
});
