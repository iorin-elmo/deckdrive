import { describe, expect, it, vi } from 'vitest';

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

  it('reconnects and resumes from the last event cursor', () => {
    vi.useFakeTimers();
    try {
      const sockets: FakeSocket[] = [];
      const client = new PvpSocketClient(
        'match-1',
        { onMessage: () => {} },
        {
          reconnectDelayMs: 10,
          socketFactory: () => {
            const socket = new FakeSocket();
            sockets.push(socket);
            return socket;
          },
        },
      );
      sockets[0]!.onmessage?.({ data: JSON.stringify({ type: 'STATE', eventSequence: 7 }) });
      sockets[0]!.onclose?.();
      vi.advanceTimersByTime(10);
      expect(sockets).toHaveLength(2);
      sockets[1]!.onopen?.();
      expect(JSON.parse(sockets[1]!.sent[0]!)).toEqual({
        type: 'RESYNC',
        afterEventSequence: 7,
      });
      client.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
