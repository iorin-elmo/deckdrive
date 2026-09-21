import { applyAction, validateAction } from '@deck-drive/game-engine';
import type { BattleState, CardDefinition, GameAction, PlayerId } from '@deck-drive/game-engine';

export type CpuDifficulty = 'EASY' | 'NORMAL' | 'HARD' | 'EXPERT';

/** A deterministic policy which can only return actions accepted by the engine. */
export function chooseCpuAction(
  state: BattleState,
  playerId: PlayerId,
  definitions: readonly CardDefinition[],
  difficulty: CpuDifficulty,
): GameAction {
  const legalActions = legalCpuActions(state, playerId, definitions);
  const fallback = legalActions.find((action) => action.type === 'END_TURN');
  if (fallback === undefined) throw new Error('CPU has no legal action.');

  if (difficulty === 'EASY')
    return legalActions.find((action) => action.type === 'PLAY_CARD') ?? fallback;
  const scored = legalActions.map((action) => ({
    action,
    score: scoreAction(state, action, definitions, difficulty),
  }));
  return scored.reduce((best, candidate) => (candidate.score > best.score ? candidate : best))
    .action;
}

export function legalCpuActions(
  state: BattleState,
  playerId: PlayerId,
  definitions: readonly CardDefinition[],
): readonly GameAction[] {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (player === undefined) return [];
  const opponent = state.players.find((candidate) => candidate.id !== playerId && candidate.hp > 0);
  const candidates: GameAction[] = [{ type: 'END_TURN', playerId }];
  for (const card of player.hand) {
    candidates.push({
      type: 'PLAY_CARD',
      playerId,
      cardInstanceId: card.id,
      ...(opponent === undefined ? {} : { targetId: opponent.id }),
    });
  }
  return candidates.filter((action) => validateAction(state, action, definitions).ok);
}

function scoreAction(
  state: BattleState,
  action: GameAction,
  definitions: readonly CardDefinition[],
  difficulty: Exclude<CpuDifficulty, 'EASY'>,
): number {
  const result = applyAction(state, action, definitions);
  if (!result.ok) return Number.NEGATIVE_INFINITY;
  const ownBefore = playerHealth(state, action.playerId);
  const enemyBefore = opponentHealth(state, action.playerId);
  const ownAfter = playerHealth(result.state, action.playerId);
  const enemyAfter = opponentHealth(result.state, action.playerId);
  const immediate = (enemyBefore - enemyAfter) * 10 + (ownAfter - ownBefore) * 3;
  if (difficulty === 'NORMAL') return immediate;
  const cardAdvantage =
    handSize(result.state, action.playerId) -
    handSize(state, action.playerId) +
    drawPileSize(result.state, action.playerId) -
    drawPileSize(state, action.playerId);
  if (difficulty === 'HARD') return immediate + cardAdvantage;
  return immediate + cardAdvantage + result.events.length / 100;
}

function playerHealth(state: BattleState, playerId: PlayerId): number {
  return state.players.find((player) => player.id === playerId)?.hp ?? 0;
}

function opponentHealth(state: BattleState, playerId: PlayerId): number {
  return state.players.find((player) => player.id !== playerId)?.hp ?? 0;
}

function handSize(state: BattleState, playerId: PlayerId): number {
  return state.players.find((player) => player.id === playerId)?.hand.length ?? 0;
}

function drawPileSize(state: BattleState, playerId: PlayerId): number {
  return state.players.find((player) => player.id === playerId)?.drawPile.length ?? 0;
}
