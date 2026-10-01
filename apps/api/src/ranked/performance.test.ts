import { describe, expect, it } from 'vitest';
import type { GameEvent, PlayerId } from '@deck-drive/game-engine';

import { sumHpDamageDealt } from './performance.js';

const alice = 'alice' as PlayerId;
const bob = 'bob' as PlayerId;

describe('ranked performance from authoritative events', () => {
  it('counts actual HP damage after block and ignores self damage', () => {
    const events: GameEvent[] = [
      { type: 'DAMAGE_DEALT', sequence: 1, sourceId: alice, targetId: bob, amount: 10 },
      { type: 'BLOCK_REDUCED', sequence: 2, targetId: bob, amount: 7 },
      { type: 'ENTITY_DAMAGED', sequence: 3, targetId: bob, amount: 3 },
      { type: 'DAMAGE_DEALT', sequence: 4, sourceId: bob, targetId: bob, amount: 4 },
      { type: 'ENTITY_DAMAGED', sequence: 5, targetId: bob, amount: 4 },
      { type: 'DAMAGE_DEALT', sequence: 6, sourceId: alice, targetId: bob, amount: 100 },
      { type: 'ENTITY_DAMAGED', sequence: 7, targetId: bob, amount: 5 },
    ];
    expect(sumHpDamageDealt(events, alice, bob)).toBe(8);
  });

  it('does not attribute an unmatched damage event to the previous attacker', () => {
    const events: GameEvent[] = [
      { type: 'DAMAGE_DEALT', sequence: 1, sourceId: alice, targetId: bob, amount: 10 },
      { type: 'TURN_ENDED', sequence: 2, playerId: alice },
      { type: 'ENTITY_DAMAGED', sequence: 3, targetId: bob, amount: 10 },
    ];
    expect(sumHpDamageDealt(events, alice, bob)).toBe(0);
  });
});
