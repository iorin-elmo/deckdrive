import {
  applyAction,
  calculateResult,
  type BattleState,
  type CardInstance,
  type PlayerId,
} from './index.js';
import { SeededRandom } from './random/index.js';

/** Debug commands operate only on an isolated, persisted sandbox battle. */
export type DebugBattleCommand =
  | { readonly type: 'FORCE_DRAW'; readonly playerId: PlayerId; readonly cardInstanceId: string }
  | { readonly type: 'FORCE_RNG_SEED'; readonly seed: string }
  | { readonly type: 'SKIP_TURN' }
  | {
      readonly type: 'APPLY_STATUS';
      readonly playerId: PlayerId;
      readonly statusId: string;
      readonly stacks: number;
    }
  | { readonly type: 'KILL_ENTITY'; readonly playerId: PlayerId };

export function applyDebugBattleCommand(
  state: BattleState,
  command: DebugBattleCommand,
): BattleState {
  if (state.phase === 'MATCH_END' || calculateResult(state).status !== 'IN_PROGRESS')
    throw new RangeError('DEBUG_BATTLE_FINISHED');
  if (command.type === 'SKIP_TURN') {
    const result = applyAction(state, { type: 'END_TURN', playerId: state.activePlayerId });
    if (!result.ok) throw new RangeError(result.error.code);
    return result.state;
  }
  if (command.type === 'FORCE_RNG_SEED') {
    if (!command.seed || command.seed.length > 200) throw new RangeError('INVALID_SEED');
    return {
      ...state,
      seed: command.seed,
      players: state.players.map((player) => {
        const cards = [...player.drawPile];
        const rng = new SeededRandom(`${command.seed}:${player.id}`);
        for (let index = cards.length - 1; index > 0; index -= 1) {
          const swap = Math.floor(rng.next() * (index + 1));
          [cards[index], cards[swap]] = [cards[swap]!, cards[index]!];
        }
        return { ...player, drawPile: cards };
      }),
    };
  }
  const player = state.players.find((candidate) => candidate.id === command.playerId);
  if (player === undefined) throw new RangeError('DEBUG_PLAYER_NOT_FOUND');
  if (command.type === 'FORCE_DRAW') {
    const card = player.drawPile.find((candidate) => candidate.id === command.cardInstanceId);
    if (card === undefined) throw new RangeError('DEBUG_CARD_NOT_IN_DRAW_PILE');
    return {
      ...state,
      players: state.players.map((candidate) =>
        candidate.id !== command.playerId
          ? candidate
          : {
              ...candidate,
              drawPile: candidate.drawPile.filter((item) => item.id !== card.id),
              hand: [...candidate.hand, card],
            },
      ),
    };
  }
  if (command.type === 'APPLY_STATUS') {
    if (
      !command.statusId ||
      command.statusId.length > 80 ||
      !Number.isInteger(command.stacks) ||
      command.stacks < 1 ||
      command.stacks > 99
    )
      throw new RangeError('INVALID_STATUS');
    const existing = player.statuses.find((status) => status.id === command.statusId);
    if ((existing?.stacks ?? 0) + command.stacks > 99) throw new RangeError('INVALID_STATUS');
    return {
      ...state,
      players: state.players.map((candidate) =>
        candidate.id !== command.playerId
          ? candidate
          : {
              ...candidate,
              statuses: [
                ...candidate.statuses.filter((status) => status.id !== command.statusId),
                { id: command.statusId, stacks: (existing?.stacks ?? 0) + command.stacks },
              ],
            },
      ),
    };
  }
  return {
    ...state,
    phase: 'MATCH_END',
    players: state.players.map((candidate) =>
      candidate.id === command.playerId ? { ...candidate, hp: 0 } : candidate,
    ),
  };
}

export function replayDebugBattle(
  initial: BattleState,
  commands: readonly DebugBattleCommand[],
): BattleState {
  return commands.reduce(applyDebugBattleCommand, initial);
}

export function shuffleDebugDeck(
  cards: readonly CardInstance[],
  seed: string,
): readonly CardInstance[] {
  const result = [...cards];
  const rng = new SeededRandom(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng.next() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}
