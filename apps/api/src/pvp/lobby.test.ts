import { describe, expect, it } from 'vitest';
import { createInitialBattleState, type PlayerId } from '@deck-drive/game-engine';

import { PvpLobby } from './lobby.js';

describe('PvpLobby queue lifecycle', () => {
  it('returns the newest queue instead of a retained status from the previous match', () => {
    const lobby = new PvpLobby<string>({
      now: () => 1_000,
      createState: ({ matchId, players }) =>
        createInitialBattleState({
          matchId,
          seed: 'lobby-test',
          engineVersion: '1.0.0',
          rulesVersion: '1.0.0',
          cardDataVersion: '1.0.0',
          initialDrawCount: 0,
          turnDrawCount: 0,
          players: players.map((player) => ({ id: player.playerId, drawPile: [] })),
        }),
    });
    const first = { playerId: 'player-1' as PlayerId, deck: 'deck-1' };
    const second = { playerId: 'player-2' as PlayerId, deck: 'deck-2' };
    lobby.enqueueCasual(first);
    const matched = lobby.enqueueCasual(second);
    if (matched.status !== 'MATCHED') throw new Error('Expected a matched pair.');
    lobby.markCasualMatched(matched.queueId, matched.matchId);
    lobby.setCasualParticipants(matched.queueId, [first.playerId, second.playerId]);
    lobby.commitCasual(matched.queueId);
    lobby.remove(matched.matchId);

    const next = lobby.enqueueCasual(first);
    expect(next.status).toBe('QUEUED');
    expect(lobby.casualStatusForPlayer(first.playerId)).toEqual(next);
    expect(lobby.casualStatusForPlayer(second.playerId)).toEqual({
      status: 'MATCHED',
      queueId: matched.queueId,
      matchId: matched.matchId,
    });
  });
});
