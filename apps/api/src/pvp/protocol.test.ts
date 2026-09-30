import { describe, expect, it } from 'vitest';
import { createInitialBattleState } from '@deck-drive/game-engine';
import type { BattleState, CardInstance, MatchId, PlayerId } from '@deck-drive/game-engine';

import { parseClientMessage, projectBattleState, projectEvent } from './protocol.js';

function state(): BattleState {
  const card = (id: string): CardInstance => ({
    id: id as CardInstance['id'],
    definitionId: 'strike',
  });
  return createInitialBattleState({
    matchId: 'match-1' as MatchId,
    engineVersion: '1.0.0',
    rulesVersion: '1.0.0',
    cardDataVersion: '1.0.0',
    seed: 'secret-seed',
    initialDrawCount: 1,
    turnDrawCount: 1,
    players: [
      { id: 'player-1' as PlayerId, drawPile: [card('p1-hidden')] },
      { id: 'player-2' as PlayerId, drawPile: [card('p2-hidden')] },
    ],
  });
}

describe('PvP protocol', () => {
  it('projects only the viewer hand and never exposes seed or pile contents', () => {
    const projection = projectBattleState(state(), 'player-1' as PlayerId);
    expect(projection).not.toHaveProperty('seed');
    expect(projection.players[0]).toMatchObject({ hand: [{ id: 'p1-hidden' }], drawPileCount: 0 });
    expect(projection.players[1]).toMatchObject({ hand: [], drawPileCount: 0 });
    expect(projection.players[1]).not.toHaveProperty('drawPile.0');
  });

  it('redacts opponent draw events', () => {
    expect(
      projectEvent(
        {
          type: 'CARD_DRAWN',
          sequence: 1,
          playerId: 'player-2' as PlayerId,
          cardInstanceId: 'secret' as CardInstance['id'],
        },
        'player-1' as PlayerId,
      ),
    ).toEqual({ type: 'CARD_DRAWN', sequence: 1, playerId: 'player-2', count: 1 });
  });

  it('redacts opponent card instance IDs when a card is played', () => {
    expect(
      projectEvent(
        {
          type: 'CARD_PLAYED',
          sequence: 2,
          playerId: 'player-2' as PlayerId,
          cardInstanceId: 'secret' as CardInstance['id'],
        },
        'player-1' as PlayerId,
      ),
    ).toEqual({ type: 'CARD_PLAYED', sequence: 2, playerId: 'player-2' });
  });

  it('replaces effect IDs because the engine derives them from hidden card IDs', () => {
    expect(
      projectEvent(
        { type: 'EFFECT_STARTED', sequence: 3, effectId: 'secret-card:1' },
        'player-1' as PlayerId,
      ),
    ).toEqual({ type: 'EFFECT_STARTED', sequence: 3, effectId: 'effect-3' });
  });

  it('rejects malformed and forged action messages', () => {
    expect(
      parseClientMessage({
        type: 'ACTION',
        requestId: 'r',
        sequence: 0,
        action: { type: 'END_TURN' },
      }),
    ).toBeNull();
    expect(parseClientMessage({ type: 'RESYNC', afterEventSequence: -1 })).toBeNull();
    expect(parseClientMessage({ type: 'PING', requestId: 'r' })).toEqual({
      type: 'PING',
      requestId: 'r',
    });
  });
});
