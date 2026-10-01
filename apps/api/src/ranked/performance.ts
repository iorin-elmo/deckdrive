import type { GameEvent, PlayerId } from '@deck-drive/game-engine';

/** Counts HP lost to this player from replay events, excluding block and self damage. */
export function sumHpDamageDealt(
  events: readonly GameEvent[],
  sourceId: PlayerId,
  opponentId: PlayerId,
): number {
  let total = 0;
  let pendingHit = false;
  for (const event of events) {
    if (event.type === 'DAMAGE_DEALT') {
      pendingHit = event.sourceId === sourceId && event.targetId === opponentId;
    } else if (event.type === 'BLOCK_REDUCED' && pendingHit && event.targetId === opponentId) {
      // The engine emits this between DAMAGE_DEALT and ENTITY_DAMAGED.
    } else if (event.type === 'ENTITY_DAMAGED') {
      if (pendingHit && event.targetId === opponentId) total += event.amount;
      pendingHit = false;
    } else {
      pendingHit = false;
    }
  }
  return total;
}
