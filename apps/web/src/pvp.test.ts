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

  it('rejects incomplete state messages before they reach UI state', () => {
    const socket = new FakeSocket();
    let malformed = 0;
    new PvpSocketClient(
      'match-1',
      { onMessage: () => {}, onMalformedMessage: () => (malformed += 1) },
      { socketFactory: () => socket },
    );
    socket.onmessage?.({ data: JSON.stringify({ type: 'STATE', protocolVersion: 1 }) });
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
      sockets[0]!.onmessage?.({
        data: JSON.stringify({
          type: 'STATE',
          protocolVersion: 1,
          matchId: 'match-1',
          actionSequence: 0,
          eventSequence: 7,
          snapshotActionIndex: 0,
          state: {},
        }),
      });
      sockets[0]!.onclose?.();
      vi.advanceTimersByTime(10);
      expect(sockets).toHaveLength(2);
      sockets[1]!.onopen?.();
      expect(JSON.parse(sockets[1]!.sent[0]!)).toEqual({
        type: 'RESYNC',
        afterEventSequence: 0,
      });
      client.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops retrying sockets that open but never deliver a usable state', () => {
    vi.useFakeTimers();
    try {
      const sockets: FakeSocket[] = [];
      const statuses: string[] = [];
      const client = new PvpSocketClient(
        'match-1',
        { onMessage: () => {}, onStatus: (status) => statuses.push(status) },
        {
          reconnectDelayMs: 10,
          maxReconnectAttempts: 2,
          socketFactory: () => {
            const socket = new FakeSocket();
            sockets.push(socket);
            return socket;
          },
        },
      );
      for (let attempt = 0; attempt < 3; attempt += 1) {
        sockets[attempt]!.onopen?.();
        sockets[attempt]!.onclose?.();
        vi.advanceTimersByTime(attempt === 0 ? 10 : 20);
      }
      expect(sockets).toHaveLength(3);
      expect(statuses.at(-1)).toBe('CLOSED');
      client.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps an unacknowledged action across a newer state and retries it after reconnect', () => {
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
      client.sendAction({ type: 'END_TURN', playerId: 'player-1' }, 0, 'request-1');
      sockets[0]!.onmessage?.({
        data: JSON.stringify({
          type: 'STATE',
          protocolVersion: 1,
          matchId: 'match-1',
          actionSequence: 1,
          eventSequence: 1,
          snapshotActionIndex: 0,
          state: {},
        }),
      });
      sockets[0]!.onclose?.();
      vi.advanceTimersByTime(10);
      sockets[1]!.onopen?.();
      expect(sockets[1]!.sent).toContain(
        JSON.stringify({
          type: 'ACTION',
          requestId: 'request-1',
          sequence: 0,
          action: { type: 'END_TURN', playerId: 'player-1' },
        }),
      );
      sockets[1]!.onmessage?.({
        data: JSON.stringify({
          type: 'STATE',
          protocolVersion: 1,
          matchId: 'match-1',
          actionSequence: 0,
          eventSequence: 1,
          snapshotActionIndex: 0,
          requestId: 'request-1',
          state: {},
        }),
      });
      sockets[1]!.onclose?.();
      vi.advanceTimersByTime(20);
      sockets[2]!.onopen?.();
      expect(sockets[2]!.sent).not.toContain(
        JSON.stringify({
          type: 'ACTION',
          requestId: 'request-1',
          sequence: 0,
          action: { type: 'END_TURN', playerId: 'player-1' },
        }),
      );
      client.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows a failed action to be retried on the open socket with the same request ID', () => {
    for (const code of ['MATCH_UNAVAILABLE', 'MAINTENANCE_MODE']) {
      const socket = new FakeSocket();
      const client = new PvpSocketClient(
        'match-1',
        { onMessage: () => {} },
        { socketFactory: () => socket },
      );
      client.sendAction({ type: 'END_TURN', playerId: 'player-1' }, 0, 'retry-me');
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'ERROR',
          protocolVersion: 1,
          code,
          message: 'retry',
          requestId: 'retry-me',
        }),
      });
      expect(client.retryAction('retry-me')).toBe(true);
      expect(socket.sent).toHaveLength(2);
      expect(socket.sent[0]).toBe(socket.sent[1]);
      client.close();
    }
  });
});
