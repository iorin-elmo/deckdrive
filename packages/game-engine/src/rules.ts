import { calculateResult } from './index.js';
import type {
  ActionValidationCode,
  BattlePlayerState,
  BattleState,
  CardDefinitionId,
  CardInstance,
  EntityId,
  GameAction,
  GameEvent,
  MatchId,
  PlayerId,
  PlayCardAction,
  ValidationResult,
} from './index.js';

export type CardEffect =
  | {
      readonly type: 'DAMAGE';
      readonly amount: number;
      readonly target: 'SELF' | 'ENEMY';
    }
  | { readonly type: 'HEAL'; readonly amount: number; readonly target: 'SELF' }
  | { readonly type: 'GAIN_BLOCK'; readonly amount: number; readonly target: 'SELF' }
  | { readonly type: 'DRAW'; readonly amount: number; readonly target: 'SELF' }
  | {
      readonly type: 'CUSTOM';
      readonly resolver: string;
      readonly target: 'SELF' | 'ENEMY';
    };

/** Structural to keep the engine free of a card-definition runtime dependency. */
export interface CardDefinition {
  readonly id: CardDefinitionId;
  readonly cost: number;
  readonly effects: readonly CardEffect[];
}

export type CardDefinitionSource =
  | readonly CardDefinition[]
  | { readonly resolve: (id: CardDefinitionId) => CardDefinition | undefined };

export const initialHp = 30;
export const initialMaxEnergy = 3;

export interface CreateInitialBattleStateOptions {
  readonly matchId: MatchId;
  readonly engineVersion: string;
  readonly rulesVersion: string;
  readonly cardDataVersion: string;
  readonly seed: string;
  readonly turnDrawCount: number;
  readonly players: readonly {
    readonly id: PlayerId;
    readonly drawPile: readonly CardInstance[];
  }[];
}

export function createInitialBattleState(options: CreateInitialBattleStateOptions): BattleState {
  const firstPlayer = options.players[0];
  if (firstPlayer === undefined || options.players.length !== 2) {
    throw new RangeError('A battle requires exactly two players.');
  }
  if (!isNonNegativeInteger(options.turnDrawCount)) {
    throw new RangeError('Turn draw count must be a non-negative integer.');
  }

  return {
    matchId: options.matchId,
    engineVersion: options.engineVersion,
    rulesVersion: options.rulesVersion,
    cardDataVersion: options.cardDataVersion,
    seed: options.seed,
    turn: 1,
    activePlayerId: firstPlayer.id,
    phase: 'PLAYER_TURN',
    turnDrawCount: options.turnDrawCount,
    stack: [],
    events: [],
    players: options.players.map((player) => ({
      id: player.id,
      hp: initialHp,
      maxHp: initialHp,
      energy: initialMaxEnergy,
      maxEnergy: initialMaxEnergy,
      block: 0,
      drawPile: [...player.drawPile],
      hand: [],
      discard: [],
      statuses: [],
    })),
  };
}

export function validateRuleAction(
  state: BattleState,
  action: GameAction,
  definitions?: CardDefinitionSource,
): ValidationResult {
  const player = state.players.find((candidate) => candidate.id === action.playerId);
  if (player === undefined)
    return invalid('PLAYER_NOT_FOUND', 'The action player is not in this battle.');
  if (calculateResult(state).status !== 'IN_PROGRESS')
    return invalid('MATCH_FINISHED', 'The match has finished.');
  if (state.phase !== 'PLAYER_TURN')
    return invalid('INVALID_PHASE', 'Actions require PLAYER_TURN.');
  if (state.activePlayerId !== action.playerId)
    return invalid('NOT_ACTIVE_PLAYER', 'Only the active player can act.');
  if (action.type === 'END_TURN') return { ok: true };

  const card = player.hand.find((candidate) => candidate.id === action.cardInstanceId);
  if (card === undefined)
    return invalid('CARD_NOT_IN_HAND', 'The selected card is not in the player hand.');
  const definition = resolve(card.definitionId, definitions);
  if (definition === undefined)
    return invalid('CARD_DEFINITION_NOT_FOUND', 'No definition was supplied for this card.');
  if (!isValidDefinition(definition)) {
    return invalid('INVALID_CARD_DEFINITION', 'The supplied card definition is malformed.');
  }
  if (definition.effects.some((effect) => effect.type === 'CUSTOM')) {
    return invalid('UNSUPPORTED_EFFECT', 'CUSTOM effects are not supported by the basic resolver.');
  }
  if (player.energy < definition.cost)
    return invalid('INSUFFICIENT_ENERGY', 'The active player does not have enough energy.');
  if (
    definition.effects.some((effect) => effect.target === 'ENEMY') &&
    targetId(state.players, action.playerId, action.targetId) === undefined
  ) {
    return invalid('INVALID_TARGET', 'The card requires a valid enemy target.');
  }
  return { ok: true };
}

export function applyRuleAction(
  state: BattleState,
  action: GameAction,
  definitions?: CardDefinitionSource,
) {
  if (action.type === 'END_TURN') return endTurn(state, action.playerId);
  const playerIndex = state.players.findIndex((player) => player.id === action.playerId);
  const card = state.players[playerIndex]!.hand.find(
    (candidate) => candidate.id === action.cardInstanceId,
  )!;
  const definition = resolve(card.definitionId, definitions)!;
  const emitted = eventEmitter(state.events);
  let players = clonePlayers(state.players);
  const actor = players[playerIndex]!;
  players[playerIndex] = {
    ...actor,
    energy: actor.energy - definition.cost,
    hand: actor.hand.filter((item) => item.id !== card.id),
  };
  emitted.emit({ type: 'CARD_PLAYED', playerId: action.playerId, cardInstanceId: card.id });

  for (const [effectIndex, effect] of definition.effects.entries()) {
    emitted.emit({ type: 'EFFECT_STARTED', effectId: `${card.id}:${String(effectIndex + 1)}` });
    players = applyEffect(players, playerIndex, action, effect, emitted);
  }

  const resolvedActor = players[playerIndex]!;
  players[playerIndex] = { ...resolvedActor, discard: [...resolvedActor.discard, card] };
  emitted.emit({ type: 'CARD_DISCARDED', playerId: action.playerId, cardInstanceId: card.id });
  const result = calculateResult({ ...state, players });
  if (result.status !== 'IN_PROGRESS') emitted.emit({ type: 'MATCH_FINISHED', result });
  return finish(
    state,
    { ...state, players, phase: result.status === 'IN_PROGRESS' ? 'PLAYER_TURN' : 'MATCH_END' },
    emitted.values,
  );
}

function endTurn(state: BattleState, playerId: PlayerId) {
  const currentIndex = state.players.findIndex((player) => player.id === playerId);
  const nextIndex = nextLivingPlayerIndex(state.players, currentIndex);
  const nextPlayer = state.players[nextIndex]!;
  const emitted = eventEmitter(state.events);
  let players = clonePlayers(state.players);
  emitted.emit({ type: 'TURN_ENDED', playerId });
  players = draw(players, nextIndex, state.turnDrawCount ?? 0, emitted);
  players[nextIndex] = { ...players[nextIndex]!, energy: players[nextIndex]!.maxEnergy };
  emitted.emit({ type: 'TURN_STARTED', playerId: nextPlayer.id });
  return finish(
    state,
    {
      ...state,
      players,
      activePlayerId: nextPlayer.id,
      turn: nextIndex === 0 ? state.turn + 1 : state.turn,
      phase: 'PLAYER_TURN',
    },
    emitted.values,
  );
}

function applyEffect(
  players: BattlePlayerState[],
  actorIndex: number,
  action: PlayCardAction,
  effect: CardEffect,
  emitted: EventEmitter,
) {
  if (effect.type === 'CUSTOM') return players;
  if (effect.type === 'DRAW') return draw(players, actorIndex, effect.amount, emitted);
  const actor = players[actorIndex]!;
  if (effect.type === 'HEAL') {
    const amount = Math.min(effect.amount, actor.maxHp - actor.hp);
    players[actorIndex] = { ...actor, hp: actor.hp + amount };
    if (amount > 0) emitted.emit({ type: 'HEALED', targetId: actor.id, amount });
    return players;
  }
  if (effect.type === 'GAIN_BLOCK') {
    players[actorIndex] = { ...actor, block: actor.block + effect.amount };
    emitted.emit({ type: 'BLOCK_GAINED', targetId: actor.id, amount: effect.amount });
    return players;
  }
  const id =
    effect.target === 'SELF'
      ? action.playerId
      : targetId(players, action.playerId, action.targetId)!;
  const targetIndex = players.findIndex((player) => player.id === id);
  const target = players[targetIndex]!;
  const blocked = Math.min(target.block, effect.amount);
  const hpDamage = effect.amount - blocked;
  emitted.emit({
    type: 'DAMAGE_DEALT',
    sourceId: action.playerId,
    targetId: id,
    amount: effect.amount,
  });
  if (blocked > 0) emitted.emit({ type: 'BLOCK_REDUCED', targetId: id, amount: blocked });
  if (hpDamage > 0) emitted.emit({ type: 'ENTITY_DAMAGED', targetId: id, amount: hpDamage });
  players[targetIndex] = {
    ...target,
    block: target.block - blocked,
    hp: Math.max(0, target.hp - hpDamage),
  };
  return players;
}

function draw(
  players: BattlePlayerState[],
  playerIndex: number,
  amount: number,
  emitted: EventEmitter,
) {
  const player = players[playerIndex]!;
  const cards = player.drawPile.slice(0, amount);
  players[playerIndex] = {
    ...player,
    drawPile: player.drawPile.slice(cards.length),
    hand: [...player.hand, ...cards],
  };
  for (const card of cards)
    emitted.emit({ type: 'CARD_DRAWN', playerId: player.id, cardInstanceId: card.id });
  return players;
}

function resolve(
  id: CardDefinitionId,
  definitions?: CardDefinitionSource,
): CardDefinition | undefined {
  if (definitions === undefined) return undefined;
  return 'resolve' in definitions
    ? definitions.resolve(id)
    : definitions.find((definition) => definition.id === id);
}

function targetId(
  players: readonly BattlePlayerState[],
  playerId: PlayerId,
  requested: EntityId | PlayerId | undefined,
) {
  const id = requested ?? players.find((player) => player.id !== playerId && player.hp > 0)?.id;
  return players.some((player) => player.id === id && player.id !== playerId && player.hp > 0)
    ? (id as PlayerId)
    : undefined;
}

function nextLivingPlayerIndex(
  players: readonly BattlePlayerState[],
  currentIndex: number,
): number {
  for (let offset = 1; offset < players.length; offset += 1) {
    const index = (currentIndex + offset) % players.length;
    if ((players[index]?.hp ?? 0) > 0) return index;
  }
  return currentIndex;
}

function clonePlayers(players: readonly BattlePlayerState[]): BattlePlayerState[] {
  return players.map((player) => ({
    ...player,
    drawPile: [...player.drawPile],
    hand: [...player.hand],
    discard: [...player.discard],
  }));
}

type WithoutSequence<Event> = Event extends unknown ? Omit<Event, 'sequence'> : never;
type EventInput = WithoutSequence<GameEvent>;
interface EventEmitter {
  readonly values: GameEvent[];
  emit(event: EventInput): void;
}
function eventEmitter(existing: readonly GameEvent[]): EventEmitter {
  const values: GameEvent[] = [];
  return {
    values,
    emit(event) {
      values.push({ ...event, sequence: existing.length + values.length + 1 } as GameEvent);
    },
  };
}
function finish(
  prior: BattleState,
  state: Omit<BattleState, 'events'>,
  events: readonly GameEvent[],
) {
  return { state: { ...state, events: [...prior.events, ...events] }, events };
}
function invalid(code: ActionValidationCode, message: string): ValidationResult {
  return { ok: false, code, message };
}

function isValidDefinition(definition: CardDefinition): boolean {
  return (
    isNonNegativeInteger(definition.cost) &&
    definition.effects.length > 0 &&
    definition.effects.every((effect) =>
      effect.type === 'CUSTOM'
        ? typeof effect.resolver === 'string' && effect.resolver.trim().length > 0
        : isPositiveInteger(effect.amount),
    )
  );
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}
