// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, MemoryRouter } from 'react-router-dom';

import { App } from './app.js';
import type { PvpSocketLike } from './pvp.js';
import { useSessionStore } from './store.js';

class TestSocket implements PvpSocketLike {
  static instances: TestSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  readonly sent: string[] = [];
  readonly readyState = 1;

  constructor() {
    TestSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {}

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

function stateMessage(actionSequence: number, requestId?: string) {
  return {
    type: 'STATE',
    protocolVersion: 1,
    matchId: 'match-1',
    actionSequence,
    eventSequence: actionSequence * 2,
    snapshotActionIndex: actionSequence,
    ...(requestId === undefined ? {} : { requestId }),
    state: {
      turn: actionSequence,
      phase: 'PLAYER_TURN',
      cardDataVersion: '1.0.0',
      activePlayerId: actionSequence % 2 === 0 ? 'player-1' : 'player-2',
      players: ['player-1', 'player-2'].map((id) => ({
        id,
        hp: 30,
        maxHp: 30,
        energy: 3,
        maxEnergy: 3,
        block: 0,
        hand: [],
        statuses: [],
      })),
    },
  };
}

describe('PvP recovery in the routed UI', () => {
  let root: Root;
  let container: HTMLDivElement;
  let queryClient: QueryClient;
  const inviteStorageKey = 'deckdrive:pvp:invite:player-1';
  const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    TestSocket.instances = [];
    vi.stubGlobal('WebSocket', TestSocket);
    const stored = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
        removeItem: (key: string) => stored.delete(key),
      },
    });
    useSessionStore.getState().setPlayerId('player-1');
    queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    queryClient.setQueryData(['oauth-session'], { playerId: 'player-1' });
    queryClient.setQueryData(['me', 'player-1', false], {
      id: 'player-1',
      displayName: 'Player',
      balances: {},
    });
    queryClient.setQueryData(['cards', false], []);
    queryClient.setQueryData(['decks', 'player-1', false], []);
    container = document.createElement('div');
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    if (originalLocalStorage === undefined) Reflect.deleteProperty(window, 'localStorage');
    else Object.defineProperty(window, 'localStorage', originalLocalStorage);
    useSessionStore.getState().clearPlayerId();
    vi.unstubAllGlobals();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function render(path: string) {
    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            MemoryRouter,
            { initialEntries: [path] },
            createElement(
              Fragment,
              null,
              createElement(Link, { to: '/battle/pvp', id: 'return-to-lobby' }, 'Return to lobby'),
              createElement(App),
            ),
          ),
        ),
      );
    });
  }

  it('unlocks actions on a delayed success response without replacing newer battle state', async () => {
    await render('/battle/pvp/match-1');
    const socket = TestSocket.instances[0]!;
    await act(async () => {
      socket.onopen?.();
      socket.receive(stateMessage(0));
    });
    const endTurn = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'End turn',
    )!;
    expect(endTurn.disabled).toBe(false);
    await act(async () => endTurn.click());
    const action = socket.sent
      .map((entry) => JSON.parse(entry) as { type: string; requestId?: string })
      .find((message) => message.type === 'ACTION')!;
    expect(action.requestId).toBeDefined();
    await act(async () => socket.receive(stateMessage(2)));
    expect(endTurn.disabled).toBe(true);
    await act(async () => socket.receive(stateMessage(1, action.requestId)));
    expect(endTurn.disabled).toBe(false);
    expect(container.textContent).toContain('Turn 2');
  });

  it('consumes a matched private invite so returning to the lobby does not reopen that match', async () => {
    window.localStorage.setItem(inviteStorageKey, 'INVITE');
    queryClient.setQueryData(['pvp-private-status', 'player-1', 'INVITE', false], {
      status: 'MATCHED',
      inviteCode: 'INVITE',
      matchId: 'match-1',
    });
    await render('/battle/pvp');
    expect(TestSocket.instances).toHaveLength(1);
    expect(window.localStorage.getItem(inviteStorageKey)).toBeNull();
    await act(async () => container.querySelector<HTMLAnchorElement>('#return-to-lobby')!.click());
    expect(container.textContent).toContain('Enter the arena');
    expect(TestSocket.instances).toHaveLength(1);
  });
});
