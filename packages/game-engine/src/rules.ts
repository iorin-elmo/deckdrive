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
  readonly initialDrawCount: number;
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
  if (new Set(options.players.map((player) => player.id)).size !== options.players.length) {
    throw new RangeError('A battle requires unique player IDs.');
  }
  const cardInstanceIds = options.players.flatMap((player) =>
    player.drawPile.map((card) => card.id),
  );
  if (new Set(cardInstanceIds).size !== cardInstanceIds.length) {
    throw new RangeError('A battle requires unique card instance IDs.');
  }
  if (!isNonNegativeInteger(options.initialDrawCount)) {
    throw new RangeError('Initial draw count must be a non-negative integer.');
  }
  if (!isNonNegativeInteger(options.turnDrawCount)) {
    throw new RangeError('Turn draw count must be a non-negative integer.');
  }

  let players: BattlePlayerState[] = options.players.map((player) => ({
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
  }));
  const emitted = eventEmitter([]);
  players = draw(players, 0, options.initialDrawCount, emitted);

  return {
    matchId: options.matchId,
    engineVersion: options.engineVersion,
    rulesVersion: options.rulesVersion,
    cardDataVersion: options.cardDataVersion,
    seed: options.seed,
    turn: 1,
    activePlayerId: firstPlayer.id,
    phase: 'PLAYER_TURN',
    initialDrawCount: options.initialDrawCount,
    turnDrawCount: options.turnDrawCount,
    stack: [],
    events: emitted.values,
    players,
  };
}

export function validateRuleAction(
  state: BattleState,
  action: GameAction,
  definitions?: CardDefinitionSource,
): ValidationResult {
  return prepareRuleAction(state, action, definitions).validation;
}

export interface PreparedRuleAction {
  readonly validation: ValidationResult;
  readonly definition: CardDefinition | undefined;
}

export function prepareRuleAction(
  state: BattleState,
  action: GameAction,
  definitions?: CardDefinitionSource,
): PreparedRuleAction {
  if (!isValidAction(action)) {
    return prepared(invalid('UNKNOWN_ACTION_TYPE', 'The action is malformed or not supported.'));
  }
  const player = state.players.find((candidate) => candidate.id === action.playerId);
  if (player === undefined)
    return prepared(invalid('PLAYER_NOT_FOUND', 'The action player is not in this battle.'));
  if (!isNonNegativeInteger(state.turnDrawCount)) {
    return prepared(
      invalid('INVALID_TURN_DRAW_COUNT', 'Turn draw count must be a non-negative integer.'),
    );
  }
  if (calculateResult(state).status !== 'IN_PROGRESS')
    return prepared(invalid('MATCH_FINISHED', 'The match has finished.'));
  if (player.hp <= 0) return prepared(invalid('PLAYER_DEFEATED', 'A defeated player cannot act.'));
  if (state.phase !== 'PLAYER_TURN')
    return prepared(invalid('INVALID_PHASE', 'Actions require PLAYER_TURN.'));
  if (state.activePlayerId !== action.playerId)
    return prepared(invalid('NOT_ACTIVE_PLAYER', 'Only the active player can act.'));
  if (action.type === 'END_TURN') return prepared({ ok: true });
  if (action.type !== 'PLAY_CARD') {
    return prepared(invalid('UNKNOWN_ACTION_TYPE', 'The action type is not supported.'));
  }

  const card = player.hand.find((candidate) => candidate.id === action.cardInstanceId);
  if (card === undefined)
    return prepared(invalid('CARD_NOT_IN_HAND', 'The selected card is not in the player hand.'));
  const definition = resolve(card.definitionId, definitions);
  if (!isRecord(definition) || definition.id !== card.definitionId)
    return prepared(
      invalid('CARD_DEFINITION_NOT_FOUND', 'No definition was supplied for this card.'),
    );
  if (!isValidDefinition(definition)) {
    return prepared(
      invalid('INVALID_CARD_DEFINITION', 'The supplied card definition is malformed.'),
    );
  }
  if (definition.effects.some((effect) => effect.type === 'CUSTOM')) {
    return prepared(
      invalid('UNSUPPORTED_EFFECT', 'CUSTOM effects are not supported by the basic resolver.'),
    );
  }
  if (player.energy < definition.cost)
    return prepared(
      invalid('INSUFFICIENT_ENERGY', 'The active player does not have enough energy.'),
    );
  if (
    definition.effects.some((effect) => effect.target === 'ENEMY') &&
    targetId(state.players, action.playerId, action.targetId) === undefined
  ) {
    return prepared(invalid('INVALID_TARGET', 'The card requires a valid enemy target.'));
  }
  return prepared({ ok: true }, definition);
}

export function applyRuleAction(
  state: BattleState,
  action: GameAction,
  resolvedDefinition?: CardDefinition,
) {
  if (action.type === 'END_TURN') return endTurn(state, action.playerId);
  const playerIndex = state.players.findIndex((player) => player.id === action.playerId);
  const card = state.players[playerIndex]!.hand.find(
    (candidate) => candidate.id === action.cardInstanceId,
  )!;
  const definition = resolvedDefinition!;
  const emitted = eventEmitter(state.events);
  let players = clonePlayers(state.players);
  const actor = players[playerIndex]!;
  players[playerIndex] = {
    ...actor,
    energy: actor.energy - definition.cost,
    hand: removeCardAt(
      actor.hand,
      actor.hand.findIndex((item) => item.id === card.id),
    ),
  };
  emitted.emit({ type: 'CARD_PLAYED', playerId: action.playerId, cardInstanceId: card.id });

  for (const [effectIndex, effect] of definition.effects.entries()) {
    if (calculateResult({ ...state, players }).status !== 'IN_PROGRESS') break;
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
  players = draw(players, nextIndex, state.turnDrawCount, emitted);
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
  if (typeof definitions !== 'object' || definitions === null) return undefined;
  if (Array.isArray(definitions)) {
    const definition = definitions.find((candidate) => isRecord(candidate) && candidate.id === id);
    return definition as CardDefinition | undefined;
  }
  if (!('resolve' in definitions) || typeof definitions.resolve !== 'function') return undefined;
  return definitions.resolve(id);
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

function removeCardAt(cards: readonly CardInstance[], index: number): CardInstance[] {
  return [...cards.slice(0, index), ...cards.slice(index + 1)];
}

type WithoutSequence<Event> = Event extends unknown ? Omit<Event, 'sequence'> : never;
type EventInput = WithoutSequence<GameEvent>;
interface EventEmitter {
  readonly values: GameEvent[];
  emit(event: EventInput): void;
}
function eventEmitter(existing: readonly GameEvent[]): EventEmitter {
  const values: GameEvent[] = [];
  const lastSequence = existing.at(-1)?.sequence ?? 0;
  return {
    values,
    emit(event) {
      values.push({ ...event, sequence: lastSequence + values.length + 1 } as GameEvent);
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

function prepared(
  validation: ValidationResult,
  definition: CardDefinition | undefined = undefined,
): PreparedRuleAction {
  return { validation, definition };
}

function isValidDefinition(definition: unknown): definition is CardDefinition {
  if (!isRecord(definition) || !Array.isArray(definition.effects)) {
    return false;
  }
  return (
    typeof definition.id === 'string' &&
    definition.id.length > 0 &&
    isNonNegativeInteger(definition.cost) &&
    definition.effects.length > 0 &&
    [...definition.effects].every(isValidEffect)
  );
}

function isValidEffect(effect: unknown): effect is CardEffect {
  if (!isRecord(effect)) return false;
  switch (effect.type) {
    case 'DAMAGE':
      return (
        isPositiveInteger(effect.amount) && (effect.target === 'SELF' || effect.target === 'ENEMY')
      );
    case 'HEAL':
    case 'GAIN_BLOCK':
    case 'DRAW':
      return isPositiveInteger(effect.amount) && effect.target === 'SELF';
    case 'CUSTOM':
      return (
        typeof effect.resolver === 'string' &&
        effect.resolver.trim().length > 0 &&
        (effect.target === 'SELF' || effect.target === 'ENEMY')
      );
    default:
      return false;
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidAction(action: unknown): action is GameAction {
  if (!isRecord(action) || typeof action.playerId !== 'string') return false;
  if (action.type === 'END_TURN') return true;
  return (
    action.type === 'PLAY_CARD' &&
    typeof action.cardInstanceId === 'string' &&
    (action.targetId === undefined || typeof action.targetId === 'string')
  );
}
