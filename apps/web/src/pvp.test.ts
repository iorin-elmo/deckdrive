import { describe, expect, it } from 'vitest';

import { PvpSocketClient, webSocketUrl, type PvpSocketLike } from './pvp.js';

class FakeSocket implements PvpSocketLike {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  readonly sent: string[] = [];
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {}
}

describe('PvP socket client', () => {
  it('uses the WebSocket endpoint and sends intent-only messages', () => {
    expect(webSocketUrl('https://example.test/api', 'match/a')).toBe(
      'wss://example.test/ws/matches/match%2Fa',
    );
    const socket = new FakeSocket();
    const client = new PvpSocketClient(
      'match-1',
      { onMessage: () => {} },
      {
        baseUrl: 'http://localhost:3000',
        socketFactory: () => socket,
      },
    );
    client.sendAction({ type: 'END_TURN', playerId: 'player-1' }, 0, 'request-1');
    expect(JSON.parse(socket.sent[0]!)).toEqual({
      type: 'ACTION',
      requestId: 'request-1',
      sequence: 0,
      action: { type: 'END_TURN', playerId: 'player-1' },
    });
  });

  it('rejects malformed server messages before they reach UI state', () => {
    const socket = new FakeSocket();
    let malformed = 0;
    new PvpSocketClient(
      'match-1',
      {
        onMessage: () => {
          throw new Error('unexpected');
        },
        onMalformedMessage: () => {
          malformed += 1;
        },
      },
      { socketFactory: () => socket },
    );
    socket.onmessage?.({ data: '{"type":"STATE"' });
    expect(malformed).toBe(1);
  });
});
