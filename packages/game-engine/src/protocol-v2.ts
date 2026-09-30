import type {
  CardDefinitionId,
  CardInstanceId,
  EntityId,
  MatchId,
  PlayerId,
  Status,
} from './index.js';
import { SeededRandom } from './random/index.js';
import { sha256Hex } from './sha256.js';

export const battleProtocolVersion = 2 as const;
export const normalSynthesisOutputDefinitionsV2 = [
  { id: 'alchemist_005', version: '1.0.0' },
  { id: 'alchemist_006', version: '1.0.0' },
] as const;

export type Visibility = 'ownerOnly' | 'allPlayers';
export type SpecialVictoryId = 'MAGE_GRAND_WISH' | 'ALCHEMY_SAGE_STONE';

export type TerminalBattleResultV2 =
  | { readonly status: 'DRAW'; readonly reason: 'SIMULTANEOUS_HP_DEPLETION' }
  | {
      readonly status: 'WIN';
      readonly winnerId: PlayerId;
      readonly reason: 'HP_DEPLETION';
    }
  | {
      readonly status: 'WIN';
      readonly winnerId: PlayerId;
      readonly reason: 'SPECIAL_VICTORY';
      readonly specialVictoryId: SpecialVictoryId;
    };

export type BattleResultV2 = { readonly status: 'IN_PROGRESS' } | TerminalBattleResultV2;
export type BattlePhaseV2 = 'PLAYER_TURN' | 'PENDING_CARD_CHOICE' | 'MATCH_END';

export interface CardInstanceV2 {
  readonly id: CardInstanceId;
  readonly definitionId: CardDefinitionId;
  readonly definitionVersion: string;
  readonly costModifier: number;
  readonly visibility: Visibility;
}

export interface ChantEntry {
  readonly chantEntryId: string;
  readonly ownerPlayerId: PlayerId;
  readonly visibility: 'allPlayers';
  readonly sourceDefinitionId: CardDefinitionId;
  readonly sourceDefinitionVersion: string;
  readonly remaining: number;
  readonly completionEffects: readonly CardEffectV2[];
  readonly damageDelay: number;
  readonly sequence: number;
}

export interface PendingDefenseEffectV2 {
  readonly pendingEffectId: string;
  readonly ownerPlayerId: PlayerId;
  readonly targetPlayerId: PlayerId;
  readonly sourceCardInstanceId: CardInstanceId;
  readonly sourceDefinitionId: CardDefinitionId;
  readonly sourceDefinitionVersion: string;
  readonly effectType: 'MAGE_GRIMOIRE_SEAL';
  readonly trigger: 'NEXT_DAMAGE_HIT';
  readonly expiresOn: 'MATCH_END';
  readonly createdSequence: number;
  readonly amount: 5;
  readonly remainingTriggers: 1;
  readonly visibility: 'allPlayers';
}

export type PendingChoiceKind = 'CARD' | 'CARDS' | 'RECIPE';

export interface PendingCardChoice {
  readonly choiceRequestId: string;
  readonly ownerPlayerId: PlayerId;
  readonly sourceInputSequence: number;
  readonly sourceCardInstanceId: CardInstanceId;
  readonly sourceDefinitionId: CardDefinitionId;
  readonly sourceDefinitionVersion: string;
  readonly choiceKind: PendingChoiceKind;
  readonly candidateIds: readonly string[];
  readonly minSelections: number;
  readonly maxSelections: number;
  readonly resolution: PendingChoiceResolution;
  /** Issued deadline sequence; wall-clock and authorization material stay outside battle state. */
  readonly deadlineCommandSequence: number | undefined;
  /** Digest of the issued deadline record; no clock value or authorization token is stored here. */
  readonly deadlineCommitment?: string;
  readonly continuation?: {
    readonly sourceCard: CardInstanceV2;
    readonly sourceDefinition: CardDefinitionV2;
    readonly action: PlayCardActionV2;
    readonly nextEffectIndex: number;
  };
}

export type PendingChoiceResolution =
  | { readonly type: 'MOVE_DRAW_PILE_CARD_TO_HAND' }
  | { readonly type: 'MOVE_DRAW_PILE_CARD_TO_HAND_AND_SHUFFLE' }
  | { readonly type: 'NONE' };

export interface BattlePlayerStateV2 {
  readonly id: PlayerId;
  readonly hp: number;
  readonly maxHp: number;
  readonly energy: number;
  readonly maxEnergy: number;
  readonly block: number;
  readonly drawPile: readonly CardInstanceV2[];
  readonly hand: readonly CardInstanceV2[];
  readonly discard: readonly CardInstanceV2[];
  readonly exhaust: readonly CardInstanceV2[];
  readonly statuses: readonly Status[];
  readonly pendingEffects: readonly PendingDefenseEffectV2[];
  readonly synthesisCount: number;
  readonly alchemyStage: 0 | 1 | 2 | 3;
}

export interface BattleStateV2 {
  readonly matchId: MatchId;
  readonly engineVersion: string;
  readonly rulesVersion: string;
  readonly cardDataVersion: string;
  readonly battleProtocolVersion: typeof battleProtocolVersion;
  readonly seed: string;
  readonly rngState: number;
  readonly turn: number;
  readonly activePlayerId: PlayerId;
  readonly phase: BattlePhaseV2;
  readonly turnDrawCount: number;
  readonly initialDrawCount: number;
  readonly players: readonly BattlePlayerStateV2[];
  readonly chantQueue: readonly ChantEntry[];
  readonly chantEntrySequence: number;
  readonly generatedCardSequence: number;
  readonly nextChoiceRequestSequence: number;
  readonly pendingEffectSequence: number;
  readonly pendingCardChoice: PendingCardChoice | undefined;
  readonly terminalResult: TerminalBattleResultV2 | undefined;
  readonly lastInputSequence: number;
  readonly events: readonly GameEventV2[];
}

export type PlayCardChoice =
  | { readonly kind: 'CARD_INSTANCES'; readonly cardInstanceIds: readonly CardInstanceId[] }
  | { readonly kind: 'RECIPE'; readonly recipeId: string }
  | { readonly kind: 'CHANT_ENTRY'; readonly chantEntryId: string };

export interface PlayCardActionV2 {
  readonly type: 'PLAY_CARD';
  readonly playerId: PlayerId;
  readonly cardInstanceId: CardInstanceId;
  readonly targetId?: EntityId | PlayerId;
  readonly choices?: readonly PlayCardChoice[];
}

export interface EndTurnActionV2 {
  readonly type: 'END_TURN';
  readonly playerId: PlayerId;
}

export type SubmittedCardChoice =
  | { readonly kind: 'CARD'; readonly cardInstanceId: CardInstanceId }
  | { readonly kind: 'CARDS'; readonly cardInstanceIds: readonly CardInstanceId[] }
  | { readonly kind: 'RECIPE'; readonly recipeId: string };

export interface SubmitCardChoiceAction {
  readonly type: 'SUBMIT_CARD_CHOICE';
  readonly playerId: PlayerId;
  readonly choiceRequestId: string;
  readonly choice: SubmittedCardChoice;
}

export type GameActionV2 = PlayCardActionV2 | EndTurnActionV2 | SubmitCardChoiceAction;

export interface CardChoiceDeadlineIssuedCommand {
  readonly type: 'CARD_CHOICE_DEADLINE_ISSUED';
  readonly playerId: PlayerId;
  readonly choiceRequestId: string;
  readonly issuedAt: number;
  readonly deadlineAt: number;
  readonly timeoutAuthorization: string;
}

export interface CardChoiceTimeoutCommand {
  readonly type: 'CARD_CHOICE_TIMEOUT';
  readonly playerId: PlayerId;
  readonly choiceRequestId: string;
  readonly deadlineCommandSequence: number;
  readonly deadlineAt: number;
  readonly timeoutAt: number;
  readonly timeoutAuthorization: string;
  readonly timeoutAttestation: string;
}

export type ServerCommand = CardChoiceDeadlineIssuedCommand | CardChoiceTimeoutCommand;

export type BattleInput =
  | {
      readonly inputSequence: number;
      readonly kind: 'CLIENT_ACTION';
      readonly payload: GameActionV2;
    }
  | {
      readonly inputSequence: number;
      readonly kind: 'SERVER_COMMAND';
      readonly payload: ServerCommand;
    };

export type CardEffectV2 =
  | { readonly type: 'DAMAGE'; readonly amount: number; readonly target: 'SELF' | 'ENEMY' }
  | { readonly type: 'HEAL'; readonly amount: number; readonly target: 'SELF' }
  | { readonly type: 'GAIN_BLOCK'; readonly amount: number; readonly target: 'SELF' }
  | { readonly type: 'DRAW'; readonly amount: number; readonly target: 'SELF' }
  | { readonly type: 'GAIN_ENERGY'; readonly amount: number; readonly target: 'SELF' }
  | {
      readonly type: 'START_CHANT';
      readonly countdown: number;
      readonly damageDelay?: number;
      readonly completionEffects: readonly CardEffectV2[];
    }
  | { readonly type: 'ADVANCE_CHANT'; readonly amount: number; readonly drawOnComplete?: boolean }
  | { readonly type: 'RESOLVE_ALL_CHANTS'; readonly blockPerChant: number }
  | { readonly type: 'GAIN_BLOCK_PER_CHANT'; readonly amount: number }
  | { readonly type: 'EXHAUST_GRIMOIRE_ADVANCE_WISH'; readonly amount: number }
  | {
      readonly type: 'SYNTHESIZE';
      readonly mode: 'NORMAL' | 'SAGE_RECIPE' | 'COMPLETE_REACTION' | 'ALL_MATERIALS';
    }
  | { readonly type: 'DRAW_SYNTHESIS_COUNT'; readonly maximum: number }
  | { readonly type: 'SET_ALCHEMY_STAGE'; readonly requiredStage: 1; readonly stage: 3 }
  | {
      readonly type: 'SPECIAL_VICTORY';
      readonly specialVictoryId: SpecialVictoryId;
      readonly requiredAlchemyStage?: 3;
    }
  | {
      readonly type: 'REQUEST_CARD_CHOICE';
      readonly from: 'DRAW_PILE';
      readonly maximumCost?: number;
    }
  | { readonly type: 'TRANSFORM_HAND_CARD' }
  | { readonly type: 'SEAL_GRIMOIRE' };

export interface CardDefinitionV2 {
  readonly id: CardDefinitionId;
  readonly version: string;
  readonly cost: number;
  readonly class?: string;
  readonly effects: readonly CardEffectV2[];
  readonly keywords?: readonly string[];
  readonly deckLimit?: number | null;
}

export type CardDefinitionSourceV2 =
  | readonly CardDefinitionV2[]
  | {
      readonly resolve: (id: CardDefinitionId, version: string) => CardDefinitionV2 | undefined;
    };

export type GameEventV2Type =
  | 'CARD_PLAYED'
  | 'EFFECT_STARTED'
  | 'DAMAGE_DEALT'
  | 'BLOCK_REDUCED'
  | 'ENTITY_DAMAGED'
  | 'HEALED'
  | 'BLOCK_GAINED'
  | 'ENERGY_GAINED'
  | 'CARD_DRAWN'
  | 'CARD_DISCARDED'
  | 'CARD_EXHAUSTED'
  | 'CARD_CREATED'
  | 'DECK_CARD_REVEALED'
  | 'DECK_SHUFFLED'
  | 'TURN_STARTED'
  | 'TURN_ENDED'
  | 'CHANT_STARTED'
  | 'CHANT_ADVANCED'
  | 'CHANT_DELAYED'
  | 'CHANT_COMPLETED'
  | 'CHANT_CANCELLED'
  | 'SYNTHESIS_RESOLVED'
  | 'ALCHEMY_STAGE_CHANGED'
  | 'CARD_CHOICE_REQUESTED'
  | 'CARD_CHOICE_SUBMITTED'
  | 'CARD_CHOICE_TIMED_OUT'
  | 'CARD_MOVED'
  | 'DAMAGE_PREVENTED'
  | 'STATUS_APPLIED'
  | 'STATUS_CONSUMED'
  | 'PENDING_EFFECT_CREATED'
  | 'PENDING_EFFECT_CONSUMED'
  | 'PENDING_EFFECT_EXPIRED'
  | 'MATCH_FINISHED';

interface GameEventBaseV2<Type extends GameEventV2Type> {
  readonly type: Type;
  readonly sequence: number;
  readonly [key: string]: unknown;
}

type CardPoolAuditEventType = 'CARD_MOVED' | 'CARD_EXHAUSTED' | 'DECK_SHUFFLED';

export interface CardMovedEventV2 extends GameEventBaseV2<'CARD_MOVED'> {
  readonly playerId: PlayerId;
  readonly ownerPlayerId: PlayerId;
  readonly cardInstanceId: CardInstanceId;
  readonly definitionId: CardDefinitionId;
  readonly definitionVersion: string;
  readonly from: 'hand' | 'discard' | 'drawPile';
  readonly fromZone: 'hand' | 'discard' | 'drawPile';
  readonly fromIndex: number;
  readonly to: 'hand' | 'drawPile';
  readonly toZone: 'hand' | 'drawPile';
  readonly toIndex: number;
  readonly sourceCardInstanceId: CardInstanceId | null;
  readonly sourceDefinitionId: CardDefinitionId | null;
  readonly sourceDefinitionVersion: string | null;
  readonly positionVisibility?: Visibility;
  readonly reason: string;
  readonly visibility: Visibility;
}

export interface CardExhaustedEventV2 extends GameEventBaseV2<'CARD_EXHAUSTED'> {
  readonly playerId: PlayerId;
  readonly ownerPlayerId: PlayerId;
  readonly cardInstanceId: CardInstanceId;
  readonly definitionId: CardDefinitionId;
  readonly definitionVersion: string;
  readonly sourceCardInstanceId: CardInstanceId | null;
  readonly sourceDefinitionId: CardDefinitionId | null;
  readonly sourceDefinitionVersion: string | null;
  readonly from: 'hand' | 'discard';
  readonly fromZone: 'hand' | 'discard';
  readonly fromIndex: number;
  readonly toZone: 'exhaust';
  readonly toIndex: number;
  readonly reason: string;
  readonly visibility: Visibility;
}

export interface DeckShuffledEventV2 extends GameEventBaseV2<'DECK_SHUFFLED'> {
  readonly playerId: PlayerId;
  readonly ownerPlayerId: PlayerId;
  readonly pile: 'drawPile';
  readonly reason: 'DRAW_PILE_EMPTY_RECYCLE' | 'ALCHEMY_TRANSFORM';
  readonly cardInstanceIds: readonly CardInstanceId[];
  readonly cardInstanceIdsBefore: readonly CardInstanceId[];
  readonly sourceCardInstanceId: CardInstanceId | null;
  readonly sourceDefinitionId: CardDefinitionId | null;
  readonly sourceDefinitionVersion: string | null;
  readonly rngStateBefore: number;
  readonly rngStateAfter: number;
  readonly visibility: 'ownerOnly';
}

export type GameEventV2 =
  | CardMovedEventV2
  | CardExhaustedEventV2
  | DeckShuffledEventV2
  | GameEventBaseV2<Exclude<GameEventV2Type, CardPoolAuditEventType>>;

type GameEventInputV2 = GameEventV2 extends infer Event
  ? Event extends GameEventV2
    ? Omit<Event, 'sequence'>
    : never
  : never;

export type BattleInputValidationCode =
  | 'INVALID_INPUT_SEQUENCE'
  | 'MALFORMED_INPUT'
  | 'PLAYER_NOT_FOUND'
  | 'NOT_ACTIVE_PLAYER'
  | 'INVALID_PHASE'
  | 'MATCH_FINISHED'
  | 'CARD_NOT_IN_HAND'
  | 'CARD_DEFINITION_NOT_FOUND'
  | 'INVALID_CARD_DEFINITION'
  | 'INSUFFICIENT_ENERGY'
  | 'INVALID_TARGET'
  | 'INVALID_CHOICE'
  | 'INVALID_ALCHEMY_STAGE'
  | 'INVALID_SERVER_COMMAND';

export type BattleInputResult =
  | {
      readonly ok: true;
      readonly state: BattleStateV2;
      readonly events: readonly GameEventV2[];
    }
  | {
      readonly ok: false;
      readonly state: BattleStateV2;
      readonly events: readonly GameEventV2[];
      readonly error: { readonly code: BattleInputValidationCode; readonly message: string };
    };

export interface CreateInitialBattleStateV2Options {
  readonly matchId: MatchId;
  readonly engineVersion: string;
  readonly rulesVersion: string;
  readonly cardDataVersion: string;
  readonly seed: string;
  readonly initialDrawCount: number;
  readonly turnDrawCount: number;
  readonly players: readonly {
    readonly id: PlayerId;
    readonly drawPile: readonly CardInstanceV2[];
  }[];
}

export type ServerCommandAuthorizer = (
  state: BattleStateV2,
  input: Extract<BattleInput, { readonly kind: 'SERVER_COMMAND' }>,
) => boolean;

interface MutableResolution {
  players: BattlePlayerStateV2[];
  chantQueue: ChantEntry[];
  chantEntrySequence: number;
  generatedCardSequence: number;
  nextChoiceRequestSequence: number;
  pendingEffectSequence: number;
  pendingCardChoice: PendingCardChoice | undefined;
  terminalResult: TerminalBattleResultV2 | undefined;
  rngState: number;
}

interface EventEmitter {
  readonly values: GameEventV2[];
  emit(event: GameEventInputV2): void;
}

export function createInitialBattleStateV2(
  options: CreateInitialBattleStateV2Options,
): BattleStateV2 {
  if (options.players.length !== 2) throw new RangeError('A battle requires exactly two players.');
  if (new Set(options.players.map((player) => player.id)).size !== 2) {
    throw new RangeError('A battle requires unique player IDs.');
  }
  if (
    !isNonNegativeInteger(options.initialDrawCount) ||
    !isNonNegativeInteger(options.turnDrawCount)
  ) {
    throw new RangeError('Draw counts must be non-negative integers.');
  }
  const allCardIds = options.players.flatMap((player) => player.drawPile.map((card) => card.id));
  if (new Set(allCardIds).size !== allCardIds.length) {
    throw new RangeError('A battle requires unique card instance IDs.');
  }
  if (allCardIds.some((id) => id.startsWith('generated:'))) {
    throw new RangeError('Initial card instance IDs cannot use the generated: prefix.');
  }
  for (const card of options.players.flatMap((player) => player.drawPile))
    validateCardInstance(card);

  const emitter = eventEmitter([]);
  const resolution: MutableResolution = {
    players: options.players.map((player) => ({
      id: player.id,
      hp: 30,
      maxHp: 30,
      energy: 3,
      maxEnergy: 3,
      block: 0,
      drawPile: [...player.drawPile],
      hand: [],
      discard: [],
      exhaust: [],
      statuses: [],
      pendingEffects: [],
      synthesisCount: 0,
      alchemyStage: 0,
    })),
    chantQueue: [],
    chantEntrySequence: 0,
    generatedCardSequence: 0,
    nextChoiceRequestSequence: 1,
    pendingEffectSequence: 0,
    pendingCardChoice: undefined,
    terminalResult: undefined,
    rngState: seedToUint32(options.seed),
  };
  for (let index = 0; index < resolution.players.length; index += 1) {
    drawCards(resolution, index, options.initialDrawCount, emitter);
  }
  return {
    matchId: options.matchId,
    engineVersion: options.engineVersion,
    rulesVersion: options.rulesVersion,
    cardDataVersion: options.cardDataVersion,
    battleProtocolVersion,
    seed: options.seed,
    rngState: resolution.rngState,
    turn: 1,
    activePlayerId: options.players[0]!.id,
    phase: 'PLAYER_TURN',
    turnDrawCount: options.turnDrawCount,
    initialDrawCount: options.initialDrawCount,
    players: resolution.players,
    chantQueue: [],
    chantEntrySequence: 0,
    generatedCardSequence: 0,
    nextChoiceRequestSequence: 1,
    pendingEffectSequence: 0,
    pendingCardChoice: undefined,
    terminalResult: undefined,
    lastInputSequence: 0,
    events: emitter.values,
  };
}

export function calculateResultV2(state: BattleStateV2): BattleResultV2 {
  const living = state.players.filter((player) => player.hp > 0);
  if (living.length === 0) return { status: 'DRAW', reason: 'SIMULTANEOUS_HP_DEPLETION' };
  if (living.length === 1) {
    return { status: 'WIN', winnerId: living[0]!.id, reason: 'HP_DEPLETION' };
  }
  return state.terminalResult ?? { status: 'IN_PROGRESS' };
}

/** All percentage based rule values use integer floor semantics. */
export function applyPercentageFloor(value: number, percent: number): number {
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(percent)) {
    throw new TypeError('Percentage rules require safe integers.');
  }
  return Math.floor((value * percent) / 100);
}

/** Produces the player-facing state without exposing another player's owner-only card IDs. */
export function projectBattleStateV2(state: BattleStateV2, viewerId: PlayerId): unknown {
  const publicState: Record<string, unknown> = { ...state };
  delete publicState.seed;
  delete publicState.rngState;
  const ownerPending = state.pendingCardChoice && { ...state.pendingCardChoice };
  if (ownerPending) delete (ownerPending as { deadlineCommitment?: string }).deadlineCommitment;
  return {
    ...publicState,
    players: state.players.map((player) => ({
      ...player,
      drawPile: player.drawPile.map((card) =>
        player.id === viewerId ? card : { visibility: 'ownerOnly' },
      ),
      hand: player.hand.map((card) => projectCard(card, player.id === viewerId)),
      discard: player.discard.map((card) => projectCard(card, player.id === viewerId)),
      exhaust: player.exhaust.map((card) => projectCard(card, player.id === viewerId)),
    })),
    pendingCardChoice:
      state.pendingCardChoice?.ownerPlayerId === viewerId
        ? ownerPending
        : state.pendingCardChoice === undefined
          ? undefined
          : {
              ownerPlayerId: state.pendingCardChoice.ownerPlayerId,
              choiceKind: state.pendingCardChoice.choiceKind,
            },
    events: state.events.map((event) => projectGameEventV2(event, viewerId)),
  };
}

export function applyBattleInputV2(
  state: BattleStateV2,
  input: BattleInput,
  definitions: CardDefinitionSourceV2,
  authorizeServerCommand?: ServerCommandAuthorizer,
): BattleInputResult {
  if (!isBattleInputShape(input)) {
    return failure(state, 'MALFORMED_INPUT', 'The battle input is malformed.');
  }
  if (
    !isPositiveSafeInteger(input.inputSequence) ||
    input.inputSequence !== state.lastInputSequence + 1
  ) {
    return failure(
      state,
      'INVALID_INPUT_SEQUENCE',
      'Input sequences must be contiguous and server assigned.',
    );
  }
  if (state.phase === 'MATCH_END' || calculateResultV2(state).status !== 'IN_PROGRESS') {
    return failure(state, 'MATCH_FINISHED', 'The match has finished.');
  }
  if (input.kind === 'SERVER_COMMAND') {
    return applyServerCommand(state, input, definitions, authorizeServerCommand);
  }
  return applyClientAction(state, input.inputSequence, input.payload, definitions);
}

function applyClientAction(
  state: BattleStateV2,
  inputSequence: number,
  action: GameActionV2,
  definitions: CardDefinitionSourceV2,
): BattleInputResult {
  const playerIndex = state.players.findIndex((player) => player.id === action.playerId);
  if (playerIndex < 0)
    return failure(state, 'PLAYER_NOT_FOUND', 'The action player is not in this battle.');
  if (state.phase === 'PENDING_CARD_CHOICE') {
    if (action.type !== 'SUBMIT_CARD_CHOICE') {
      return failure(state, 'INVALID_PHASE', 'Only the pending card choice may be submitted.');
    }
    return submitChoice(state, inputSequence, action, definitions);
  }
  if (action.type === 'SUBMIT_CARD_CHOICE') {
    return failure(state, 'INVALID_PHASE', 'No card choice is pending.');
  }
  if (state.activePlayerId !== action.playerId) {
    return failure(state, 'NOT_ACTIVE_PLAYER', 'Only the active player can act.');
  }
  if (action.type === 'END_TURN') return endTurn(state, inputSequence, playerIndex, definitions);
  if (action.type !== 'PLAY_CARD') return failure(state, 'MALFORMED_INPUT', 'Unknown action type.');
  return playCard(state, inputSequence, playerIndex, action, definitions);
}

function playCard(
  state: BattleStateV2,
  inputSequence: number,
  playerIndex: number,
  action: PlayCardActionV2,
  definitions: CardDefinitionSourceV2,
): BattleInputResult {
  const player = state.players[playerIndex]!;
  const cardIndex = player.hand.findIndex((card) => card.id === action.cardInstanceId);
  if (cardIndex < 0) return failure(state, 'CARD_NOT_IN_HAND', 'The selected card is not in hand.');
  const card = player.hand[cardIndex]!;
  const definition = resolveDefinition(definitions, card.definitionId, card.definitionVersion);
  if (
    definition === undefined ||
    definition.id !== card.definitionId ||
    definition.version !== card.definitionVersion
  ) {
    return failure(
      state,
      'CARD_DEFINITION_NOT_FOUND',
      'The exact card definition version is unavailable.',
    );
  }
  if (!isValidCardDefinitionV2(definition)) {
    return failure(state, 'INVALID_CARD_DEFINITION', 'The card definition is malformed.');
  }
  if (
    definition.effects.some((effect) => effect.type === 'SYNTHESIZE' && effect.mode === 'NORMAL')
  ) {
    for (const output of normalSynthesisOutputDefinitionsV2) {
      const outputDefinition = resolveDefinition(definitions, output.id, output.version);
      if (
        outputDefinition === undefined ||
        outputDefinition.id !== output.id ||
        outputDefinition.version !== output.version
      )
        return failure(
          state,
          'CARD_DEFINITION_NOT_FOUND',
          `Missing fixed recipe output ${output.id}@${output.version}.`,
        );
      if (!isValidCardDefinitionV2(outputDefinition))
        return failure(
          state,
          'INVALID_CARD_DEFINITION',
          'The fixed recipe output definition is malformed.',
        );
    }
  }
  const choiceError = validatePlayChoices(state, playerIndex, action, definition, definitions);
  if (choiceError !== undefined) return failure(state, choiceError.code, choiceError.message);
  const cost = Math.max(0, definition.cost + card.costModifier);
  if (player.energy < cost) return failure(state, 'INSUFFICIENT_ENERGY', 'Not enough energy.');

  const emitter = eventEmitter(state.events);
  const mutable = mutableFrom(state);
  const actor = mutable.players[playerIndex]!;
  const publicCard: CardInstanceV2 = { ...card, visibility: 'allPlayers' };
  mutable.players[playerIndex] = {
    ...actor,
    energy: actor.energy - cost,
    hand: removeAt(actor.hand, cardIndex),
  };
  emitter.emit({
    type: 'CARD_PLAYED',
    playerId: action.playerId,
    cardInstanceId: publicCard.id,
    definitionId: publicCard.definitionId,
    definitionVersion: publicCard.definitionVersion,
    visibility: publicCard.visibility,
  });

  for (const [effectIndex, effect] of definition.effects.entries()) {
    if (resultFromMutable(state, mutable).status !== 'IN_PROGRESS') break;
    emitter.emit({ type: 'EFFECT_STARTED', effectId: `${card.id}:${String(effectIndex + 1)}` });
    applyEffect(
      state,
      mutable,
      playerIndex,
      action,
      publicCard,
      definition,
      effect,
      definitions,
      emitter,
    );
    if (mutable.pendingCardChoice !== undefined) {
      mutable.pendingCardChoice = {
        ...mutable.pendingCardChoice,
        continuation: {
          sourceCard: publicCard,
          sourceDefinition: definition,
          action,
          nextEffectIndex: effectIndex + 1,
        },
      };
      break;
    }
  }

  const actorAfterEffects = mutable.players[playerIndex]!;
  mutable.players[playerIndex] = {
    ...actorAfterEffects,
    discard: [...actorAfterEffects.discard, publicCard],
  };
  emitter.emit({
    type: 'CARD_DISCARDED',
    playerId: action.playerId,
    cardInstanceId: publicCard.id,
    definitionId: publicCard.definitionId,
    definitionVersion: publicCard.definitionVersion,
    visibility: publicCard.visibility,
  });
  return finishResolution(state, inputSequence, mutable, emitter);
}

function applyEffect(
  baseState: BattleStateV2,
  mutable: MutableResolution,
  actorIndex: number,
  action: PlayCardActionV2,
  sourceCard: CardInstanceV2,
  sourceDefinition: CardDefinitionV2,
  effect: CardEffectV2,
  definitions: CardDefinitionSourceV2,
  emitter: EventEmitter,
): void {
  const actor = mutable.players[actorIndex]!;
  switch (effect.type) {
    case 'DRAW':
      drawCards(mutable, actorIndex, effect.amount, emitter);
      return;
    case 'HEAL': {
      const amount = Math.min(effect.amount, actor.maxHp - actor.hp);
      mutable.players[actorIndex] = { ...actor, hp: actor.hp + amount };
      if (amount > 0) emitter.emit({ type: 'HEALED', targetId: actor.id, amount });
      return;
    }
    case 'GAIN_BLOCK':
      mutable.players[actorIndex] = { ...actor, block: actor.block + effect.amount };
      emitter.emit({ type: 'BLOCK_GAINED', targetId: actor.id, amount: effect.amount });
      return;
    case 'GAIN_ENERGY':
      mutable.players[actorIndex] = { ...actor, energy: actor.energy + effect.amount };
      emitter.emit({ type: 'ENERGY_GAINED', targetId: actor.id, amount: effect.amount });
      return;
    case 'DAMAGE':
      applyDamage(mutable, actorIndex, action, effect.amount, effect.target, emitter);
      return;
    case 'START_CHANT':
      startChant(mutable, actor.id, sourceCard, effect, emitter);
      return;
    case 'ADVANCE_CHANT': {
      const choice = choiceOf(action, 'CHANT_ENTRY');
      if (choice !== undefined) {
        const completed = advanceChant(
          baseState,
          mutable,
          actorIndex,
          choice.chantEntryId,
          effect.amount,
          definitions,
          emitter,
        );
        if (
          completed &&
          effect.drawOnComplete === true &&
          resultFromMutable(baseState, mutable).status === 'IN_PROGRESS'
        )
          drawCards(mutable, actorIndex, 1, emitter);
      }
      return;
    }
    case 'RESOLVE_ALL_CHANTS': {
      const ids = mutable.chantQueue
        .filter((entry) => entry.ownerPlayerId === actor.id)
        .map((entry) => entry.chantEntryId);
      let completed = 0;
      for (const id of ids) {
        if (resultFromMutable(baseState, mutable).status !== 'IN_PROGRESS') break;
        if (
          advanceChant(
            baseState,
            mutable,
            actorIndex,
            id,
            Number.MAX_SAFE_INTEGER,
            definitions,
            emitter,
          )
        )
          completed += 1;
      }
      if (completed > 0 && resultFromMutable(baseState, mutable).status === 'IN_PROGRESS') {
        const current: BattlePlayerStateV2 = mutable.players[actorIndex]!;
        const amount = completed * effect.blockPerChant;
        mutable.players[actorIndex] = { ...current, block: current.block + amount };
        emitter.emit({ type: 'BLOCK_GAINED', targetId: current.id, amount });
      }
      return;
    }
    case 'GAIN_BLOCK_PER_CHANT': {
      const amount =
        effect.amount *
        mutable.chantQueue.filter((entry) => entry.ownerPlayerId === actor.id).length;
      if (amount > 0) {
        mutable.players[actorIndex] = { ...actor, block: actor.block + amount };
        emitter.emit({ type: 'BLOCK_GAINED', targetId: actor.id, amount });
      }
      return;
    }
    case 'EXHAUST_GRIMOIRE_ADVANCE_WISH':
      exhaustGrimoireAndAdvanceWish(
        baseState,
        mutable,
        actorIndex,
        action,
        effect.amount,
        definitions,
        emitter,
      );
      return;
    case 'SYNTHESIZE':
      synthesize(
        baseState,
        mutable,
        actorIndex,
        action,
        sourceCard,
        sourceDefinition,
        effect.mode,
        definitions,
        emitter,
      );
      return;
    case 'DRAW_SYNTHESIS_COUNT':
      drawCards(mutable, actorIndex, Math.min(effect.maximum, actor.synthesisCount), emitter);
      return;
    case 'SET_ALCHEMY_STAGE':
      mutable.players[actorIndex] = { ...actor, alchemyStage: effect.stage };
      emitter.emit({
        type: 'ALCHEMY_STAGE_CHANGED',
        playerId: actor.id,
        before: actor.alchemyStage,
        after: effect.stage,
      });
      return;
    case 'SPECIAL_VICTORY':
      mutable.terminalResult = {
        status: 'WIN',
        winnerId: actor.id,
        reason: 'SPECIAL_VICTORY',
        specialVictoryId: effect.specialVictoryId,
      };
      return;
    case 'REQUEST_CARD_CHOICE':
      requestDrawPileChoice(
        baseState,
        mutable,
        actorIndex,
        sourceCard,
        sourceDefinition,
        effect,
        definitions,
        emitter,
      );
      return;
    case 'TRANSFORM_HAND_CARD':
      transformHandCard(
        baseState,
        mutable,
        actorIndex,
        action,
        sourceCard,
        sourceDefinition,
        definitions,
        emitter,
      );
      return;
    case 'SEAL_GRIMOIRE':
      sealGrimoire(mutable, actorIndex, action, sourceCard, emitter);
      return;
  }
}

function endTurn(
  state: BattleStateV2,
  inputSequence: number,
  currentIndex: number,
  definitions: CardDefinitionSourceV2,
): BattleInputResult {
  const emitter = eventEmitter(state.events);
  const mutable = mutableFrom(state);
  const current = mutable.players[currentIndex]!;
  const nextIndex = currentIndex === 0 ? 1 : 0;
  const next = mutable.players[nextIndex]!;
  emitter.emit({ type: 'TURN_ENDED', playerId: current.id });
  mutable.players[nextIndex] = { ...next, energy: next.maxEnergy };
  emitter.emit({ type: 'TURN_STARTED', playerId: next.id });

  const ownChants = mutable.chantQueue
    .filter((entry) => entry.ownerPlayerId === next.id)
    .map((entry) => entry.chantEntryId);
  for (const id of ownChants) {
    if (resultFromMutable(state, mutable).status !== 'IN_PROGRESS') break;
    advanceChant(state, mutable, nextIndex, id, 1, definitions, emitter);
  }
  if (resultFromMutable(state, mutable).status === 'IN_PROGRESS') {
    drawCards(mutable, nextIndex, state.turnDrawCount, emitter);
  }
  const nextTurn = nextIndex === 0 ? state.turn + 1 : state.turn;
  return finishResolution(state, inputSequence, mutable, emitter, next.id, nextTurn);
}

function applyServerCommand(
  state: BattleStateV2,
  input: Extract<BattleInput, { readonly kind: 'SERVER_COMMAND' }>,
  definitions: CardDefinitionSourceV2,
  authorize?: ServerCommandAuthorizer,
): BattleInputResult {
  if (authorize?.(state, input) !== true) {
    return failure(state, 'INVALID_SERVER_COMMAND', 'The server command authorization is invalid.');
  }
  const pending = state.pendingCardChoice;
  const command = input.payload;
  if (
    pending === undefined ||
    pending.choiceRequestId !== command.choiceRequestId ||
    pending.ownerPlayerId !== command.playerId
  ) {
    return failure(
      state,
      'INVALID_SERVER_COMMAND',
      'The command does not match the pending choice.',
    );
  }
  if (command.type === 'CARD_CHOICE_DEADLINE_ISSUED') {
    if (command.deadlineAt - command.issuedAt !== 60_000) {
      return failure(
        state,
        'INVALID_SERVER_COMMAND',
        'The choice deadline must be exactly 60 seconds after issuance.',
      );
    }
    if (pending.deadlineCommandSequence !== undefined) {
      return failure(
        state,
        'INVALID_SERVER_COMMAND',
        'The pending choice already has a deadline command.',
      );
    }
    return {
      ok: true,
      state: {
        ...state,
        pendingCardChoice: {
          ...pending,
          deadlineCommandSequence: input.inputSequence,
          deadlineCommitment: calculateDeadlineCommitmentV2(
            state.matchId,
            input.inputSequence,
            command.playerId,
            command.choiceRequestId,
            command.deadlineAt,
            command.timeoutAuthorization,
          ),
        },
        lastInputSequence: input.inputSequence,
      },
      events: [],
    };
  }
  if (command.type !== 'CARD_CHOICE_TIMEOUT') {
    return failure(state, 'INVALID_SERVER_COMMAND', 'Unknown server command.');
  }
  if (pending.deadlineCommandSequence !== command.deadlineCommandSequence) {
    return failure(
      state,
      'INVALID_SERVER_COMMAND',
      'The timeout does not reference the issued deadline command.',
    );
  }
  if (
    pending.deadlineCommitment !==
    calculateDeadlineCommitmentV2(
      state.matchId,
      command.deadlineCommandSequence,
      command.playerId,
      command.choiceRequestId,
      command.deadlineAt,
      command.timeoutAuthorization,
    )
  ) {
    return failure(
      state,
      'INVALID_SERVER_COMMAND',
      'The timeout does not match the issued deadline.',
    );
  }
  if (command.timeoutAt < command.deadlineAt) {
    return failure(state, 'INVALID_SERVER_COMMAND', 'The timeout precedes its deadline.');
  }
  const emitter = eventEmitter(state.events);
  emitter.emit({
    type: 'CARD_CHOICE_TIMED_OUT',
    choiceRequestId: pending.choiceRequestId,
    playerId: pending.ownerPlayerId,
    visibility: 'ownerOnly',
  });
  const mutable = mutableFrom(state);
  mutable.pendingCardChoice = undefined;
  if (pending.resolution.type === 'MOVE_DRAW_PILE_CARD_TO_HAND_AND_SHUFFLE') {
    shuffleDrawPile(
      mutable,
      mutable.players.findIndex((player) => player.id === pending.ownerPlayerId),
      'ALCHEMY_TRANSFORM',
      emitter,
      {
        id: pending.sourceCardInstanceId,
        definitionId: pending.sourceDefinitionId,
        definitionVersion: pending.sourceDefinitionVersion,
      },
    );
  }
  resumeChoiceEffects(state, mutable, pending, definitions, emitter);
  const resumed = finishResolution(state, input.inputSequence, mutable, emitter);
  if (!resumed.ok || resumed.state.phase !== 'PLAYER_TURN') return resumed;
  const result = endTurn(
    resumed.state,
    input.inputSequence,
    resumed.state.players.findIndex((p) => p.id === pending.ownerPlayerId),
    definitions,
  );
  return result.ok ? { ...result, events: [...emitter.values, ...result.events] } : result;
}

export function calculateDeadlineCommitmentV2(
  matchId: MatchId,
  sequence: number,
  playerId: PlayerId,
  choiceRequestId: string,
  deadlineAt: number,
  timeoutAuthorization: string,
): string {
  return sha256Hex(
    JSON.stringify([
      matchId,
      sequence,
      playerId,
      choiceRequestId,
      deadlineAt,
      timeoutAuthorization,
    ]),
  );
}

function submitChoice(
  state: BattleStateV2,
  inputSequence: number,
  action: SubmitCardChoiceAction,
  definitions: CardDefinitionSourceV2,
): BattleInputResult {
  const pending = state.pendingCardChoice;
  if (
    pending === undefined ||
    pending.choiceRequestId !== action.choiceRequestId ||
    pending.ownerPlayerId !== action.playerId ||
    pending.deadlineCommandSequence === undefined
  ) {
    return failure(
      state,
      'INVALID_CHOICE',
      'The submitted choice does not match the pending request.',
    );
  }
  const selected = selectedIds(action.choice);
  if (
    selected.length < pending.minSelections ||
    selected.length > pending.maxSelections ||
    new Set(selected).size !== selected.length ||
    selected.some((id) => !pending.candidateIds.includes(id)) ||
    !choiceKindMatches(pending.choiceKind, action.choice.kind)
  ) {
    return failure(
      state,
      'INVALID_CHOICE',
      'The submitted choice is outside the authoritative candidates.',
    );
  }
  const emitter = eventEmitter(state.events);
  const mutable = mutableFrom(state);
  emitter.emit({
    type: 'CARD_CHOICE_SUBMITTED',
    choiceRequestId: pending.choiceRequestId,
    playerId: action.playerId,
    selectedIds: selected,
    visibility: 'ownerOnly',
  });
  if (
    (pending.resolution.type === 'MOVE_DRAW_PILE_CARD_TO_HAND' ||
      pending.resolution.type === 'MOVE_DRAW_PILE_CARD_TO_HAND_AND_SHUFFLE') &&
    selected[0] !== undefined
  ) {
    const playerIndex = mutable.players.findIndex((player) => player.id === action.playerId);
    const player = mutable.players[playerIndex]!;
    const cardIndex = player.drawPile.findIndex((card) => card.id === selected[0]);
    const card = player.drawPile[cardIndex]!;
    mutable.players[playerIndex] = {
      ...player,
      drawPile: removeAt(player.drawPile, cardIndex),
      hand: [...player.hand, card],
    };
    emitter.emit({
      type: 'CARD_MOVED',
      playerId: player.id,
      ownerPlayerId: player.id,
      cardInstanceId: card.id,
      definitionId: card.definitionId,
      definitionVersion: card.definitionVersion,
      from: 'drawPile',
      fromZone: 'drawPile',
      fromIndex: cardIndex,
      to: 'hand',
      toZone: 'hand',
      toIndex: player.hand.length,
      sourceCardInstanceId: pending.sourceCardInstanceId,
      sourceDefinitionId: pending.sourceDefinitionId,
      sourceDefinitionVersion: pending.sourceDefinitionVersion,
      positionVisibility: 'ownerOnly',
      reason: 'CARD_CHOICE',
      visibility: card.visibility,
    });
    if (pending.resolution.type === 'MOVE_DRAW_PILE_CARD_TO_HAND_AND_SHUFFLE') {
      shuffleDrawPile(mutable, playerIndex, 'ALCHEMY_TRANSFORM', emitter, {
        id: pending.sourceCardInstanceId,
        definitionId: pending.sourceDefinitionId,
        definitionVersion: pending.sourceDefinitionVersion,
      });
    }
  }
  mutable.pendingCardChoice = undefined;
  resumeChoiceEffects(state, mutable, pending, definitions, emitter);
  return finishResolution(state, inputSequence, mutable, emitter);
}

function resumeChoiceEffects(
  state: BattleStateV2,
  mutable: MutableResolution,
  pending: PendingCardChoice,
  definitions: CardDefinitionSourceV2,
  emitter: EventEmitter,
): void {
  const continuation = pending.continuation;
  if (continuation === undefined) return;
  const { sourceCard, sourceDefinition, action } = continuation;
  const actorIndex = mutable.players.findIndex((player) => player.id === pending.ownerPlayerId);
  for (let index = continuation.nextEffectIndex; index < sourceDefinition.effects.length; index++) {
    if (resultFromMutable(state, mutable).status !== 'IN_PROGRESS') break;
    emitter.emit({ type: 'EFFECT_STARTED', effectId: `${sourceCard.id}:${String(index + 1)}` });
    applyEffect(
      state,
      mutable,
      actorIndex,
      action,
      sourceCard,
      sourceDefinition,
      sourceDefinition.effects[index]!,
      definitions,
      emitter,
    );
    if (mutable.pendingCardChoice !== undefined) {
      mutable.pendingCardChoice = {
        ...mutable.pendingCardChoice,
        continuation: { ...continuation, nextEffectIndex: index + 1 },
      };
      break;
    }
  }
}

function requestDrawPileChoice(
  state: BattleStateV2,
  mutable: MutableResolution,
  actorIndex: number,
  sourceCard: CardInstanceV2,
  sourceDefinition: CardDefinitionV2,
  effect: Extract<CardEffectV2, { readonly type: 'REQUEST_CARD_CHOICE' }>,
  definitions: CardDefinitionSourceV2,
  emitter: EventEmitter,
): void {
  refillDrawPileIfEmpty(mutable, actorIndex, emitter);
  const actor = mutable.players[actorIndex]!;
  for (const [index, card] of actor.drawPile.entries()) {
    emitter.emit({
      type: 'DECK_CARD_REVEALED',
      playerId: actor.id,
      ownerPlayerId: actor.id,
      cardInstanceId: card.id,
      definitionId: card.definitionId,
      definitionVersion: card.definitionVersion,
      zone: 'drawPile',
      index,
      position: index,
      positionVisibility: 'ownerOnly',
      sourceCardInstanceId: sourceCard.id,
      sourceDefinitionId: sourceCard.definitionId,
      sourceDefinitionVersion: sourceCard.definitionVersion,
      reason: 'CARD_CHOICE',
      visibility: card.visibility,
    });
  }
  const candidates = actor.drawPile.filter((card) => {
    const definition = resolveDefinition(definitions, card.definitionId, card.definitionVersion);
    return (
      definition !== undefined &&
      (effect.maximumCost === undefined ||
        definition.cost + card.costModifier <= effect.maximumCost)
    );
  });
  if (candidates.length === 0) return;
  const sequence = mutable.nextChoiceRequestSequence;
  const request: PendingCardChoice = {
    choiceRequestId: `choice:${String(sequence)}`,
    ownerPlayerId: actor.id,
    sourceInputSequence: state.lastInputSequence + 1,
    sourceCardInstanceId: sourceCard.id,
    sourceDefinitionId: sourceDefinition.id,
    sourceDefinitionVersion: sourceDefinition.version,
    choiceKind: 'CARD',
    candidateIds: candidates.map((card) => card.id),
    minSelections: 1,
    maxSelections: 1,
    resolution: { type: 'MOVE_DRAW_PILE_CARD_TO_HAND' },
    deadlineCommandSequence: undefined,
  };
  mutable.nextChoiceRequestSequence += 1;
  mutable.pendingCardChoice = request;
  emitter.emit({
    type: 'CARD_CHOICE_REQUESTED',
    choiceRequestId: request.choiceRequestId,
    playerId: actor.id,
    choiceKind: request.choiceKind,
    candidateIds: request.candidateIds,
    visibility: 'ownerOnly',
  });
}

function transformHandCard(
  state: BattleStateV2,
  mutable: MutableResolution,
  actorIndex: number,
  action: PlayCardActionV2,
  sourceCard: CardInstanceV2,
  sourceDefinition: CardDefinitionV2,
  definitions: CardDefinitionSourceV2,
  emitter: EventEmitter,
): void {
  const selectedId = choiceOf(action, 'CARD_INSTANCES')?.cardInstanceIds[0];
  if (selectedId === undefined) return;
  let actor = mutable.players[actorIndex]!;
  const selectedIndex = actor.hand.findIndex((card) => card.id === selectedId);
  const selected = actor.hand[selectedIndex]!;
  const selectedDefinition = resolveDefinition(
    definitions,
    selected.definitionId,
    selected.definitionVersion,
  )!;
  const maximumCost = Math.max(0, selectedDefinition.cost + selected.costModifier);
  actor = {
    ...actor,
    hand: removeAt(actor.hand, selectedIndex),
    exhaust: [...actor.exhaust, selected],
  };
  mutable.players[actorIndex] = actor;
  emitter.emit({
    type: 'CARD_EXHAUSTED',
    playerId: actor.id,
    ownerPlayerId: actor.id,
    cardInstanceId: selected.id,
    definitionId: selected.definitionId,
    definitionVersion: selected.definitionVersion,
    sourceCardInstanceId: sourceCard.id,
    sourceDefinitionId: sourceCard.definitionId,
    sourceDefinitionVersion: sourceCard.definitionVersion,
    from: 'hand',
    fromZone: 'hand',
    fromIndex: selectedIndex,
    toZone: 'exhaust',
    toIndex: actor.exhaust.length - 1,
    reason: 'ALCHEMY_TRANSFORM',
    visibility: selected.visibility,
  });
  refillDrawPileIfEmpty(mutable, actorIndex, emitter);
  actor = mutable.players[actorIndex]!;
  for (const [position, card] of actor.drawPile.entries()) {
    emitter.emit({
      type: 'DECK_CARD_REVEALED',
      playerId: actor.id,
      ownerPlayerId: actor.id,
      cardInstanceId: card.id,
      definitionId: card.definitionId,
      definitionVersion: card.definitionVersion,
      zone: 'drawPile',
      index: position,
      position,
      positionVisibility: 'ownerOnly',
      sourceCardInstanceId: sourceCard.id,
      sourceDefinitionId: sourceCard.definitionId,
      sourceDefinitionVersion: sourceCard.definitionVersion,
      reason: 'ALCHEMY_TRANSFORM',
      visibility: card.visibility,
    });
  }
  const candidates = actor.drawPile.filter((card) => {
    const definition = resolveDefinition(definitions, card.definitionId, card.definitionVersion);
    return (
      definition !== undefined && Math.max(0, definition.cost + card.costModifier) <= maximumCost
    );
  });
  if (candidates.length === 0) {
    shuffleDrawPile(mutable, actorIndex, 'ALCHEMY_TRANSFORM', emitter, sourceCard);
    return;
  }
  const sequence = mutable.nextChoiceRequestSequence;
  const request: PendingCardChoice = {
    choiceRequestId: `choice:${String(sequence)}`,
    ownerPlayerId: actor.id,
    sourceInputSequence: state.lastInputSequence + 1,
    sourceCardInstanceId: sourceCard.id,
    sourceDefinitionId: sourceDefinition.id,
    sourceDefinitionVersion: sourceDefinition.version,
    choiceKind: 'CARD',
    candidateIds: candidates.map((card) => card.id),
    minSelections: 1,
    maxSelections: 1,
    resolution: { type: 'MOVE_DRAW_PILE_CARD_TO_HAND_AND_SHUFFLE' },
    deadlineCommandSequence: undefined,
  };
  mutable.nextChoiceRequestSequence += 1;
  mutable.pendingCardChoice = request;
  emitter.emit({
    type: 'CARD_CHOICE_REQUESTED',
    choiceRequestId: request.choiceRequestId,
    playerId: actor.id,
    choiceKind: request.choiceKind,
    candidateIds: request.candidateIds,
    visibility: 'ownerOnly',
  });
}

function sealGrimoire(
  mutable: MutableResolution,
  actorIndex: number,
  action: PlayCardActionV2,
  sourceCard: CardInstanceV2,
  emitter: EventEmitter,
): void {
  const selectedId = choiceOf(action, 'CARD_INSTANCES')?.cardInstanceIds[0];
  if (selectedId === undefined) return;
  const actor = mutable.players[actorIndex]!;
  const selectedIndex = actor.hand.findIndex((card) => card.id === selectedId);
  const selected = actor.hand[selectedIndex]!;
  const pendingEffect: PendingDefenseEffectV2 = {
    pendingEffectId: `pending:${String(++mutable.pendingEffectSequence)}`,
    ownerPlayerId: actor.id,
    targetPlayerId: actor.id,
    sourceCardInstanceId: sourceCard.id,
    sourceDefinitionId: sourceCard.definitionId,
    sourceDefinitionVersion: sourceCard.definitionVersion,
    effectType: 'MAGE_GRIMOIRE_SEAL',
    trigger: 'NEXT_DAMAGE_HIT',
    expiresOn: 'MATCH_END',
    createdSequence: mutable.pendingEffectSequence,
    amount: 5,
    remainingTriggers: 1,
    visibility: 'allPlayers',
  };
  mutable.players[actorIndex] = {
    ...actor,
    hand: removeAt(actor.hand, selectedIndex),
    drawPile: [...actor.drawPile, selected],
    pendingEffects: [...actor.pendingEffects, pendingEffect],
  };
  emitter.emit({
    type: 'CARD_MOVED',
    playerId: actor.id,
    ownerPlayerId: actor.id,
    cardInstanceId: selected.id,
    definitionId: selected.definitionId,
    definitionVersion: selected.definitionVersion,
    from: 'hand',
    fromZone: 'hand',
    fromIndex: selectedIndex,
    to: 'drawPile',
    toZone: 'drawPile',
    toIndex: actor.drawPile.length,
    sourceCardInstanceId: sourceCard.id,
    sourceDefinitionId: sourceCard.definitionId,
    sourceDefinitionVersion: sourceCard.definitionVersion,
    positionVisibility: 'ownerOnly',
    reason: 'MAGE_GRIMOIRE_SEAL',
    visibility: selected.visibility,
  });
  emitter.emit({
    type: 'PENDING_EFFECT_CREATED',
    ...pendingEffect,
  });
}

type NormalSynthesisRecipeId = 'ALCHEMY_RED_CATALYST' | 'ALCHEMY_BLUE_CATALYST';

function normalSynthesisRecipeCandidates(
  cards: readonly CardInstanceV2[],
  definitions: CardDefinitionSourceV2,
): readonly NormalSynthesisRecipeId[] {
  if (cards.length !== 2) return [];
  const tags = cards.map(
    (card) =>
      resolveDefinition(definitions, card.definitionId, card.definitionVersion)?.keywords ?? [],
  );
  const recipes: readonly {
    readonly id: NormalSynthesisRecipeId;
    readonly requirements: readonly [string, string];
  }[] = [
    { id: 'ALCHEMY_RED_CATALYST', requirements: ['reagent:red', 'catalyst'] },
    { id: 'ALCHEMY_BLUE_CATALYST', requirements: ['reagent:blue', 'catalyst'] },
  ];
  return recipes
    .filter(({ requirements }) => {
      const hasActualMatch = tags.some((cardTags) =>
        requirements.some((requirement) => cardTags.includes(requirement)),
      );
      if (!hasActualMatch) return false;
      const matches = (cardTags: readonly string[], requirement: string) =>
        cardTags.includes(requirement) || cardTags.includes('solvent');
      return (
        (matches(tags[0]!, requirements[0]) && matches(tags[1]!, requirements[1])) ||
        (matches(tags[0]!, requirements[1]) && matches(tags[1]!, requirements[0]))
      );
    })
    .map((recipe) => recipe.id);
}

function synthesize(
  state: BattleStateV2,
  mutable: MutableResolution,
  actorIndex: number,
  action: PlayCardActionV2,
  sourceCard: CardInstanceV2,
  sourceDefinition: CardDefinitionV2,
  mode: Extract<CardEffectV2, { readonly type: 'SYNTHESIZE' }>['mode'],
  definitions: CardDefinitionSourceV2,
  emitter: EventEmitter,
): void {
  const actor = mutable.players[actorIndex]!;
  const selectedChoice = choiceOf(action, 'CARD_INSTANCES');
  const selectedIds =
    mode === 'ALL_MATERIALS'
      ? actor.hand
          .filter((card) => hasKeyword(card, 'material', definitions))
          .map((card) => card.id)
      : [...(selectedChoice?.cardInstanceIds ?? [])];
  if (selectedIds.length === 0) return;
  const selected = selectedIds.map((id) => locateOwnedCard(mutable.players[actorIndex]!, id)!);
  let player = mutable.players[actorIndex]!;
  const exhaustedCards: CardInstanceV2[] = [];
  for (const located of selected) {
    const zoneCards = player[located.zone];
    const currentIndex = zoneCards.findIndex((card) => card.id === located.card.id);
    player = {
      ...player,
      [located.zone]: removeAt(zoneCards, currentIndex),
      exhaust: [...player.exhaust, located.card],
    };
    exhaustedCards.push(located.card);
    emitter.emit({
      type: 'CARD_EXHAUSTED',
      playerId: player.id,
      ownerPlayerId: player.id,
      cardInstanceId: located.card.id,
      definitionId: located.card.definitionId,
      definitionVersion: located.card.definitionVersion,
      sourceCardInstanceId: sourceCard.id,
      sourceDefinitionId: sourceCard.definitionId,
      sourceDefinitionVersion: sourceCard.definitionVersion,
      from: located.zone,
      fromZone: located.zone,
      fromIndex: currentIndex,
      toZone: 'exhaust',
      toIndex: player.exhaust.length - 1,
      reason: 'SYNTHESIS',
      visibility: located.card.visibility,
    });
  }
  const beforeCount = player.synthesisCount;
  player = { ...player, synthesisCount: beforeCount + 1 };
  mutable.players[actorIndex] = player;

  const keywords = exhaustedCards.map(
    (card) =>
      resolveDefinition(definitions, card.definitionId, card.definitionVersion)?.keywords ?? [],
  );
  let synthesisResult: 'SUCCESS' | 'FAILURE' | 'SPECIAL' = 'SPECIAL';
  let recipeId: string | null = null;
  let outputDefinitionId: string | undefined;
  if (mode === 'NORMAL') {
    const candidates = normalSynthesisRecipeCandidates(exhaustedCards, definitions);
    const selectedRecipe = choiceOf(action, 'RECIPE')?.recipeId;
    recipeId = candidates.length === 1 ? candidates[0]! : (selectedRecipe ?? null);
    if (recipeId === 'ALCHEMY_RED_CATALYST') {
      synthesisResult = 'SUCCESS';
      outputDefinitionId = 'alchemist_005';
    } else if (recipeId === 'ALCHEMY_BLUE_CATALYST') {
      synthesisResult = 'SUCCESS';
      outputDefinitionId = 'alchemist_006';
    } else {
      synthesisResult = 'FAILURE';
    }
  } else if (mode === 'SAGE_RECIPE') {
    const flattened = keywords.flat();
    if (['reagent:red', 'reagent:blue', 'reagent:white'].every((tag) => flattened.includes(tag))) {
      recipeId = 'ALCHEMY_SAGE_STONE';
      synthesisResult = 'SUCCESS';
      if (player.alchemyStage === 0) {
        mutable.players[actorIndex] = { ...player, alchemyStage: 1 };
      }
    } else {
      synthesisResult = 'FAILURE';
    }
  }
  let outputDefinition: CardDefinitionV2 | undefined;
  if (outputDefinitionId !== undefined) {
    outputDefinition = resolveAnyCurrentDefinition(definitions, outputDefinitionId);
    if (outputDefinition === undefined)
      throw new TypeError(`Missing fixed recipe output ${outputDefinitionId}@1.0.0.`);
    if (!canCreateCard(mutable.players[actorIndex]!, outputDefinition)) {
      synthesisResult = 'FAILURE';
      outputDefinition = undefined;
    }
  }
  emitter.emit({
    type: 'SYNTHESIS_RESOLVED',
    playerId: player.id,
    sourceCardInstanceId: sourceCard.id,
    sourceDefinitionId: sourceDefinition.id,
    sourceDefinitionVersion: sourceDefinition.version,
    materialCardInstanceIds: exhaustedCards.map((card) => card.id),
    materialZones: selected.map((item) => item.zone),
    result: synthesisResult,
    recipeId,
    beforeCount,
    afterCount: beforeCount + 1,
    visibility: exhaustedCards.every((card) => card.visibility === 'allPlayers')
      ? 'allPlayers'
      : 'ownerOnly',
  });
  if (mode === 'SAGE_RECIPE' && synthesisResult === 'SUCCESS' && player.alchemyStage === 0) {
    emitter.emit({ type: 'ALCHEMY_STAGE_CHANGED', playerId: player.id, before: 0, after: 1 });
  }
  if (synthesisResult === 'FAILURE') {
    const current = mutable.players[actorIndex]!;
    mutable.players[actorIndex] = { ...current, block: current.block + 2 };
    emitter.emit({ type: 'BLOCK_GAINED', targetId: current.id, amount: 2 });
    return;
  }
  if (mode === 'COMPLETE_REACTION') {
    for (const tags of keywords) {
      if (tags.includes('reagent:red'))
        applyDamage(mutable, actorIndex, action, 4, 'ENEMY', emitter);
      if (resultFromMutable(state, mutable).status !== 'IN_PROGRESS') return;
      if (tags.includes('reagent:blue')) {
        const current: BattlePlayerStateV2 = mutable.players[actorIndex]!;
        mutable.players[actorIndex] = { ...current, block: current.block + 4 };
        emitter.emit({ type: 'BLOCK_GAINED', targetId: current.id, amount: 4 });
      }
      if (tags.includes('reagent:white')) {
        const current: BattlePlayerStateV2 = mutable.players[actorIndex]!;
        const amount = Math.min(4, current.maxHp - current.hp);
        mutable.players[actorIndex] = { ...current, hp: current.hp + amount };
        if (amount > 0) emitter.emit({ type: 'HEALED', targetId: current.id, amount });
      }
    }
    return;
  }
  if (mode === 'ALL_MATERIALS') {
    for (let index = 0; index < exhaustedCards.length; index += 1) {
      if (resultFromMutable(state, mutable).status !== 'IN_PROGRESS') break;
      applyDamage(mutable, actorIndex, action, 4, 'ENEMY', emitter);
      if (resultFromMutable(state, mutable).status !== 'IN_PROGRESS') return;
      const current: BattlePlayerStateV2 = mutable.players[actorIndex]!;
      mutable.players[actorIndex] = { ...current, block: current.block + 4 };
      emitter.emit({ type: 'BLOCK_GAINED', targetId: current.id, amount: 4 });
    }
    return;
  }
  if (outputDefinition !== undefined) {
    createCard(
      mutable,
      actorIndex,
      outputDefinition,
      sourceCard,
      exhaustedCards.some((card) => hasKeyword(card, 'catalyst', definitions)) ? -1 : 0,
      emitter,
    );
  }
}

function exhaustGrimoireAndAdvanceWish(
  state: BattleStateV2,
  mutable: MutableResolution,
  actorIndex: number,
  action: PlayCardActionV2,
  amount: number,
  definitions: CardDefinitionSourceV2,
  emitter: EventEmitter,
): void {
  const cardChoice = choiceOf(action, 'CARD_INSTANCES');
  const chantChoice = choiceOf(action, 'CHANT_ENTRY');
  const cardId = cardChoice?.cardInstanceIds[0];
  if (cardId === undefined) return;
  let actor = mutable.players[actorIndex]!;
  const index = actor.hand.findIndex((card) => card.id === cardId);
  const card = actor.hand[index]!;
  actor = { ...actor, hand: removeAt(actor.hand, index), exhaust: [...actor.exhaust, card] };
  mutable.players[actorIndex] = actor;
  emitter.emit({
    type: 'CARD_EXHAUSTED',
    playerId: actor.id,
    ownerPlayerId: actor.id,
    cardInstanceId: card.id,
    definitionId: card.definitionId,
    definitionVersion: card.definitionVersion,
    sourceCardInstanceId: action.cardInstanceId,
    sourceDefinitionId:
      state.players[actorIndex]!.hand.find((item) => item.id === action.cardInstanceId)
        ?.definitionId ?? null,
    sourceDefinitionVersion:
      state.players[actorIndex]!.hand.find((item) => item.id === action.cardInstanceId)
        ?.definitionVersion ?? null,
    from: 'hand',
    fromZone: 'hand',
    fromIndex: index,
    toZone: 'exhaust',
    toIndex: actor.exhaust.length - 1,
    reason: 'MAGE_GRIMOIRE_BURN',
    visibility: card.visibility,
  });
  if (chantChoice !== undefined) {
    advanceChant(
      state,
      mutable,
      actorIndex,
      chantChoice.chantEntryId,
      amount,
      definitions,
      emitter,
    );
  }
}

function createCard(
  mutable: MutableResolution,
  playerIndex: number,
  definition: CardDefinitionV2,
  sourceCard: CardInstanceV2,
  costModifier: number,
  emitter: EventEmitter,
): void {
  const player = mutable.players[playerIndex]!;
  const sequence = mutable.generatedCardSequence + 1;
  const card: CardInstanceV2 = {
    id: `generated:${String(sequence)}` as CardInstanceId,
    definitionId: definition.id,
    definitionVersion: definition.version,
    costModifier,
    visibility: 'ownerOnly',
  };
  mutable.generatedCardSequence = sequence;
  mutable.players[playerIndex] = { ...player, hand: [...player.hand, card] };
  emitter.emit({
    type: 'CARD_CREATED',
    playerId: player.id,
    cardInstanceId: card.id,
    definitionId: card.definitionId,
    definitionVersion: card.definitionVersion,
    sourceCardInstanceId: sourceCard.id,
    destination: 'hand',
    costModifier,
    visibility: card.visibility,
  });
}

function canCreateCard(player: BattlePlayerStateV2, definition: CardDefinitionV2): boolean {
  if (definition.deckLimit === null || definition.deckLimit === undefined) return true;
  const copies = [...player.drawPile, ...player.hand, ...player.discard, ...player.exhaust].filter(
    (card) => card.definitionId === definition.id && card.definitionVersion === definition.version,
  ).length;
  return copies < definition.deckLimit;
}

function startChant(
  mutable: MutableResolution,
  playerId: PlayerId,
  sourceCard: CardInstanceV2,
  effect: Extract<CardEffectV2, { readonly type: 'START_CHANT' }>,
  emitter: EventEmitter,
): void {
  const sequence = mutable.chantEntrySequence + 1;
  const entry: ChantEntry = {
    chantEntryId: `chant:${String(sequence)}`,
    ownerPlayerId: playerId,
    visibility: 'allPlayers',
    sourceDefinitionId: sourceCard.definitionId,
    sourceDefinitionVersion: sourceCard.definitionVersion,
    remaining: effect.countdown,
    completionEffects: effect.completionEffects,
    damageDelay: effect.damageDelay ?? 0,
    sequence,
  };
  mutable.chantEntrySequence = sequence;
  mutable.chantQueue.push(entry);
  emitter.emit({
    type: 'CHANT_STARTED',
    chantEntryId: entry.chantEntryId,
    ownerPlayerId: playerId,
    visibility: entry.visibility,
    sourceDefinitionId: entry.sourceDefinitionId,
    sourceDefinitionVersion: entry.sourceDefinitionVersion,
    before: null,
    after: entry.remaining,
    queueIndex: mutable.chantQueue.length - 1,
  });
}

function advanceChant(
  state: BattleStateV2,
  mutable: MutableResolution,
  actorIndex: number,
  chantEntryId: string,
  amount: number,
  definitions: CardDefinitionSourceV2,
  emitter: EventEmitter,
): boolean {
  const index = mutable.chantQueue.findIndex((entry) => entry.chantEntryId === chantEntryId);
  if (index < 0) return false;
  const entry = mutable.chantQueue[index]!;
  const after = Math.max(0, entry.remaining - amount);
  emitter.emit({
    type: 'CHANT_ADVANCED',
    chantEntryId,
    ownerPlayerId: entry.ownerPlayerId,
    visibility: entry.visibility,
    sourceDefinitionId: entry.sourceDefinitionId,
    sourceDefinitionVersion: entry.sourceDefinitionVersion,
    before: entry.remaining,
    after,
    queueIndex: index,
  });
  if (after > 0) {
    mutable.chantQueue[index] = { ...entry, remaining: after };
    return false;
  }
  mutable.chantQueue.splice(index, 1);
  emitter.emit({
    type: 'CHANT_COMPLETED',
    chantEntryId,
    ownerPlayerId: entry.ownerPlayerId,
    visibility: entry.visibility,
    sourceDefinitionId: entry.sourceDefinitionId,
    sourceDefinitionVersion: entry.sourceDefinitionVersion,
    before: entry.remaining,
    after: 0,
    queueIndex: index,
  });
  const ownerIndex = mutable.players.findIndex((player) => player.id === entry.ownerPlayerId);
  const pseudoCard: CardInstanceV2 = {
    id: `chant-source:${entry.chantEntryId}` as CardInstanceId,
    definitionId: entry.sourceDefinitionId,
    definitionVersion: entry.sourceDefinitionVersion,
    costModifier: 0,
    visibility: 'allPlayers',
  };
  const definition = resolveDefinition(
    definitions,
    entry.sourceDefinitionId,
    entry.sourceDefinitionVersion,
  ) ?? {
    id: entry.sourceDefinitionId,
    version: entry.sourceDefinitionVersion,
    cost: 0,
    effects: entry.completionEffects,
  };
  const pseudoAction: PlayCardActionV2 = {
    type: 'PLAY_CARD',
    playerId: entry.ownerPlayerId,
    cardInstanceId: pseudoCard.id,
  };
  for (const effect of entry.completionEffects) {
    if (resultFromMutable(state, mutable).status !== 'IN_PROGRESS') break;
    applyEffect(
      state,
      mutable,
      ownerIndex,
      pseudoAction,
      pseudoCard,
      definition,
      effect,
      definitions,
      emitter,
    );
  }
  return true;
}

function applyDamage(
  mutable: MutableResolution,
  actorIndex: number,
  action: PlayCardActionV2,
  amount: number,
  target: 'SELF' | 'ENEMY',
  emitter: EventEmitter,
): void {
  const actor = mutable.players[actorIndex]!;
  const targetIndex =
    target === 'SELF'
      ? actorIndex
      : mutable.players.findIndex((player) => player.id !== actor.id && player.hp > 0);
  const defender = mutable.players[targetIndex]!;
  const seals = defender.pendingEffects.filter(
    (effect) => effect.effectType === 'MAGE_GRIMOIRE_SEAL',
  );
  const prevented = Math.min(
    amount,
    seals.reduce((total, effect) => total + effect.amount, 0),
  );
  const effectiveAmount = amount - prevented;
  if (seals.length > 0) {
    emitter.emit({
      type: 'DAMAGE_PREVENTED',
      targetId: defender.id,
      pendingEffectIds: seals.map((effect) => effect.pendingEffectId),
      amount: prevented,
    });
    for (const seal of seals)
      emitter.emit({ type: 'PENDING_EFFECT_CONSUMED', ...seal, remainingTriggers: 0 });
  }
  const blocked = Math.min(defender.block, effectiveAmount);
  const hpDamage = Math.min(defender.hp, effectiveAmount - blocked);
  emitter.emit({
    type: 'DAMAGE_DEALT',
    sourceId: action.playerId,
    targetId: defender.id,
    amount: effectiveAmount,
    attemptedAmount: amount,
  });
  if (blocked > 0) emitter.emit({ type: 'BLOCK_REDUCED', targetId: defender.id, amount: blocked });
  if (hpDamage > 0)
    emitter.emit({ type: 'ENTITY_DAMAGED', targetId: defender.id, amount: hpDamage });
  mutable.players[targetIndex] = {
    ...defender,
    block: defender.block - blocked,
    hp: defender.hp - hpDamage,
    pendingEffects: defender.pendingEffects.filter(
      (effect) => effect.effectType !== 'MAGE_GRIMOIRE_SEAL',
    ),
  };
  if (mutable.players.some((player) => player.hp <= 0)) return;
  if (hpDamage > 0) {
    mutable.chantQueue = mutable.chantQueue.map((entry, queueIndex) => {
      if (entry.ownerPlayerId !== defender.id || entry.damageDelay <= 0) return entry;
      const delayed = { ...entry, remaining: entry.remaining + entry.damageDelay };
      emitter.emit({
        type: 'CHANT_DELAYED',
        chantEntryId: entry.chantEntryId,
        ownerPlayerId: entry.ownerPlayerId,
        visibility: entry.visibility,
        sourceDefinitionId: entry.sourceDefinitionId,
        sourceDefinitionVersion: entry.sourceDefinitionVersion,
        before: entry.remaining,
        after: delayed.remaining,
        queueIndex,
      });
      return delayed;
    });
  }
}

function drawCards(
  mutable: MutableResolution,
  playerIndex: number,
  amount: number,
  emitter: EventEmitter,
): void {
  for (let drawn = 0; drawn < amount; drawn += 1) {
    refillDrawPileIfEmpty(mutable, playerIndex, emitter);
    const player = mutable.players[playerIndex]!;
    const card = player.drawPile[0];
    if (card === undefined) break;
    mutable.players[playerIndex] = {
      ...player,
      drawPile: player.drawPile.slice(1),
      hand: [...player.hand, card],
    };
    emitter.emit({
      type: 'CARD_DRAWN',
      playerId: player.id,
      cardInstanceId: card.id,
      visibility: card.visibility,
    });
  }
}

function refillDrawPileIfEmpty(
  mutable: MutableResolution,
  playerIndex: number,
  emitter: EventEmitter,
): void {
  const player = mutable.players[playerIndex];
  if (player === undefined || player.drawPile.length > 0 || player.discard.length === 0) return;
  for (const [index, card] of player.discard.entries()) {
    emitter.emit({
      type: 'CARD_MOVED',
      playerId: player.id,
      ownerPlayerId: player.id,
      cardInstanceId: card.id,
      definitionId: card.definitionId,
      definitionVersion: card.definitionVersion,
      from: 'discard',
      fromZone: 'discard',
      fromIndex: index,
      to: 'drawPile',
      toZone: 'drawPile',
      toIndex: index,
      sourceCardInstanceId: null,
      sourceDefinitionId: null,
      sourceDefinitionVersion: null,
      positionVisibility: 'ownerOnly',
      reason: 'DRAW_PILE_EMPTY_RECYCLE',
      visibility: card.visibility,
    });
  }
  const rngStateBefore = mutable.rngState;
  const shuffled = shuffle(player.discard, rngStateBefore);
  mutable.rngState = shuffled.rngState;
  mutable.players[playerIndex] = { ...player, drawPile: shuffled.cards, discard: [] };
  emitter.emit({
    type: 'DECK_SHUFFLED',
    playerId: player.id,
    ownerPlayerId: player.id,
    pile: 'drawPile',
    reason: 'DRAW_PILE_EMPTY_RECYCLE',
    cardInstanceIds: shuffled.cards.map((card) => card.id),
    cardInstanceIdsBefore: player.discard.map((card) => card.id),
    sourceCardInstanceId: null,
    sourceDefinitionId: null,
    sourceDefinitionVersion: null,
    rngStateBefore,
    rngStateAfter: shuffled.rngState,
    visibility: 'ownerOnly',
  });
}

function shuffleDrawPile(
  mutable: MutableResolution,
  playerIndex: number,
  reason: 'ALCHEMY_TRANSFORM',
  emitter: EventEmitter,
  source?: {
    readonly id: CardInstanceId;
    readonly definitionId: CardDefinitionId;
    readonly definitionVersion: string;
  },
): void {
  const player = mutable.players[playerIndex];
  if (player === undefined || player.drawPile.length === 0) return;
  const rngStateBefore = mutable.rngState;
  const shuffled = shuffle(player.drawPile, rngStateBefore);
  mutable.rngState = shuffled.rngState;
  mutable.players[playerIndex] = { ...player, drawPile: shuffled.cards };
  emitter.emit({
    type: 'DECK_SHUFFLED',
    playerId: player.id,
    ownerPlayerId: player.id,
    pile: 'drawPile',
    reason,
    cardInstanceIds: shuffled.cards.map((card) => card.id),
    cardInstanceIdsBefore: player.drawPile.map((card) => card.id),
    sourceCardInstanceId: source?.id ?? null,
    sourceDefinitionId: source?.definitionId ?? null,
    sourceDefinitionVersion: source?.definitionVersion ?? null,
    rngStateBefore,
    rngStateAfter: shuffled.rngState,
    visibility: 'ownerOnly',
  });
}

function finishResolution(
  state: BattleStateV2,
  inputSequence: number,
  mutable: MutableResolution,
  emitter: EventEmitter,
  activePlayerId = state.activePlayerId,
  turn = state.turn,
): BattleInputResult {
  let next: BattleStateV2 = {
    ...state,
    players: mutable.players,
    chantQueue: mutable.chantQueue,
    chantEntrySequence: mutable.chantEntrySequence,
    generatedCardSequence: mutable.generatedCardSequence,
    nextChoiceRequestSequence: mutable.nextChoiceRequestSequence,
    pendingEffectSequence: mutable.pendingEffectSequence,
    pendingCardChoice: mutable.pendingCardChoice,
    terminalResult: mutable.terminalResult,
    rngState: mutable.rngState,
    activePlayerId,
    turn,
    phase: mutable.pendingCardChoice === undefined ? 'PLAYER_TURN' : 'PENDING_CARD_CHOICE',
    lastInputSequence: inputSequence,
    events: [...state.events, ...emitter.values],
  };
  const result = calculateResultV2(next);
  if (result.status !== 'IN_PROGRESS') {
    for (const player of next.players) {
      for (const effect of player.pendingEffects) {
        emitter.emit({ type: 'PENDING_EFFECT_EXPIRED', ...effect, remainingTriggers: 0 });
      }
    }
    for (const [queueIndex, entry] of next.chantQueue.entries()) {
      emitter.emit({
        type: 'CHANT_CANCELLED',
        chantEntryId: entry.chantEntryId,
        ownerPlayerId: entry.ownerPlayerId,
        visibility: entry.visibility,
        sourceDefinitionId: entry.sourceDefinitionId,
        sourceDefinitionVersion: entry.sourceDefinitionVersion,
        before: entry.remaining,
        after: null,
        queueIndex,
      });
    }
    emitter.emit({ type: 'MATCH_FINISHED', result });
    next = {
      ...next,
      players: next.players.map((player) => ({ ...player, pendingEffects: [] })),
      phase: 'MATCH_END',
      chantQueue: [],
      pendingCardChoice: undefined,
      terminalResult: result,
      events: [...state.events, ...emitter.values],
    };
  }
  return { ok: true, state: next, events: emitter.values };
}

function validatePlayChoices(
  state: BattleStateV2,
  playerIndex: number,
  action: PlayCardActionV2,
  definition: CardDefinitionV2,
  definitions: CardDefinitionSourceV2,
): { code: BattleInputValidationCode; message: string } | undefined {
  const choices = action.choices ?? [];
  const kinds = choices.map((choice) => choice.kind);
  if (new Set(kinds).size !== kinds.length)
    return { code: 'INVALID_CHOICE', message: 'Choice kinds cannot be duplicated.' };
  const cards = choiceOf(action, 'CARD_INSTANCES')?.cardInstanceIds ?? [];
  if (new Set(cards).size !== cards.length)
    return { code: 'INVALID_CHOICE', message: 'A card cannot be selected twice.' };
  if (cards.includes(action.cardInstanceId))
    return { code: 'INVALID_CHOICE', message: 'The played card cannot select itself.' };
  const player = state.players[playerIndex]!;
  let normalRecipeChoiceRequired = false;
  for (const effect of definition.effects) {
    if (effect.type === 'ADVANCE_CHANT') {
      const choice = choiceOf(action, 'CHANT_ENTRY');
      if (
        state.chantQueue.some((entry) => entry.ownerPlayerId === player.id) &&
        (choice === undefined ||
          !state.chantQueue.some(
            (entry) =>
              entry.chantEntryId === choice.chantEntryId && entry.ownerPlayerId === player.id,
          ))
      ) {
        return { code: 'INVALID_CHOICE', message: 'A valid owned chant entry must be selected.' };
      }
    }
    if (effect.type === 'EXHAUST_GRIMOIRE_ADVANCE_WISH') {
      if (cards.length !== 1)
        return { code: 'INVALID_CHOICE', message: 'Exactly one grimoire must be selected.' };
      const selected = player.hand.find((card) => card.id === cards[0]);
      if (selected === undefined || !hasKeyword(selected, 'grimoire', definitions))
        return {
          code: 'INVALID_CHOICE',
          message: 'The selected card is not an owned grimoire in hand.',
        };
      const ownedWishes = state.chantQueue.filter(
        (entry) => entry.ownerPlayerId === player.id && entry.sourceDefinitionId === 'mage_017',
      );
      const chantChoice = choiceOf(action, 'CHANT_ENTRY');
      if (
        ownedWishes.length > 0 &&
        (chantChoice === undefined ||
          !ownedWishes.some((entry) => entry.chantEntryId === chantChoice.chantEntryId))
      ) {
        return { code: 'INVALID_CHOICE', message: 'A valid grand-wish chant must be selected.' };
      }
    }
    if (effect.type === 'SYNTHESIZE') {
      const expected =
        effect.mode === 'NORMAL'
          ? 2
          : effect.mode === 'SAGE_RECIPE' || effect.mode === 'COMPLETE_REACTION'
            ? 3
            : undefined;
      if (expected !== undefined && cards.length !== expected)
        return {
          code: 'INVALID_CHOICE',
          message: `Exactly ${String(expected)} materials must be selected.`,
        };
      if (effect.mode === 'ALL_MATERIALS' && cards.length > 0)
        return {
          code: 'INVALID_CHOICE',
          message: 'ALL_MATERIALS does not accept explicit material choices.',
        };
      for (const id of cards) {
        const located = locateOwnedCard(player, id);
        const allowedZone =
          effect.mode === 'SAGE_RECIPE'
            ? located?.zone === 'hand' || located?.zone === 'discard'
            : located?.zone === 'hand';
        if (
          located === undefined ||
          !allowedZone ||
          !hasKeyword(located.card, 'material', definitions)
        )
          return {
            code: 'INVALID_CHOICE',
            message: 'Every selected material must be in an allowed owned zone.',
          };
      }
      if (effect.mode === 'NORMAL') {
        const selectedCards = cards.map((id) => player.hand.find((card) => card.id === id)!);
        const candidates = normalSynthesisRecipeCandidates(selectedCards, definitions);
        const recipeChoice = choiceOf(action, 'RECIPE');
        normalRecipeChoiceRequired = candidates.length > 1;
        if (
          normalRecipeChoiceRequired &&
          (recipeChoice === undefined ||
            !candidates.some((candidate) => candidate === recipeChoice.recipeId))
        ) {
          return {
            code: 'INVALID_CHOICE',
            message: 'A valid recipe must be selected when multiple recipes match.',
          };
        }
      }
      if (
        effect.mode === 'COMPLETE_REACTION' &&
        cards.some((id) => {
          const located = locateOwnedCard(player, id)!;
          const tags =
            resolveDefinition(
              definitions,
              located.card.definitionId,
              located.card.definitionVersion,
            )?.keywords ?? [];
          return !tags.some(
            (tag) => tag === 'reagent:red' || tag === 'reagent:blue' || tag === 'reagent:white',
          );
        })
      ) {
        return {
          code: 'INVALID_CHOICE',
          message: 'This special synthesis requires colored reagents.',
        };
      }
    }
    if (effect.type === 'TRANSFORM_HAND_CARD') {
      if (cards.length !== 1)
        return { code: 'INVALID_CHOICE', message: 'Exactly one hand card must be selected.' };
      const selected = player.hand.find((card) => card.id === cards[0]);
      if (
        selected === undefined ||
        resolveDefinition(definitions, selected.definitionId, selected.definitionVersion) ===
          undefined
      ) {
        return {
          code: 'INVALID_CHOICE',
          message: 'The selected card must be an owned hand card with an exact definition.',
        };
      }
    }
    if (effect.type === 'SEAL_GRIMOIRE') {
      if (cards.length !== 1)
        return { code: 'INVALID_CHOICE', message: 'Exactly one grimoire must be selected.' };
      const selected = player.hand.find((card) => card.id === cards[0]);
      if (selected === undefined || !hasKeyword(selected, 'grimoire', definitions))
        return {
          code: 'INVALID_CHOICE',
          message: 'The selected card is not an owned grimoire in hand.',
        };
    }
    if (effect.type === 'SET_ALCHEMY_STAGE' && player.alchemyStage !== effect.requiredStage)
      return {
        code: 'INVALID_ALCHEMY_STAGE',
        message: 'The required alchemy stage has not been reached.',
      };
    if (
      effect.type === 'SPECIAL_VICTORY' &&
      effect.requiredAlchemyStage !== undefined &&
      player.alchemyStage !== effect.requiredAlchemyStage
    )
      return {
        code: 'INVALID_ALCHEMY_STAGE',
        message: 'The required alchemy stage has not been reached.',
      };
  }
  const requiredKinds = new Set<string>();
  for (const effect of definition.effects) {
    if (effect.type === 'SYNTHESIZE' && effect.mode !== 'ALL_MATERIALS')
      requiredKinds.add('CARD_INSTANCES');
    if (effect.type === 'EXHAUST_GRIMOIRE_ADVANCE_WISH') requiredKinds.add('CARD_INSTANCES');
    if (effect.type === 'TRANSFORM_HAND_CARD') requiredKinds.add('CARD_INSTANCES');
    if (effect.type === 'SEAL_GRIMOIRE') requiredKinds.add('CARD_INSTANCES');
    if (
      effect.type === 'EXHAUST_GRIMOIRE_ADVANCE_WISH' &&
      state.chantQueue.some(
        (entry) => entry.ownerPlayerId === player.id && entry.sourceDefinitionId === 'mage_017',
      )
    )
      requiredKinds.add('CHANT_ENTRY');
    if (
      effect.type === 'ADVANCE_CHANT' &&
      state.chantQueue.some((entry) => entry.ownerPlayerId === player.id)
    )
      requiredKinds.add('CHANT_ENTRY');
  }
  if (normalRecipeChoiceRequired) requiredKinds.add('RECIPE');
  if (choices.some((choice) => !requiredKinds.has(choice.kind)))
    return { code: 'INVALID_CHOICE', message: 'The action contains an unnecessary choice.' };
  return undefined;
}

function resultFromMutable(state: BattleStateV2, mutable: MutableResolution): BattleResultV2 {
  return calculateResultV2({
    ...state,
    players: mutable.players,
    terminalResult: mutable.terminalResult,
  });
}

function mutableFrom(state: BattleStateV2): MutableResolution {
  return {
    players: state.players.map((player) => ({
      ...player,
      drawPile: [...player.drawPile],
      hand: [...player.hand],
      discard: [...player.discard],
      exhaust: [...player.exhaust],
      statuses: [...player.statuses],
      pendingEffects: [...player.pendingEffects],
    })),
    chantQueue: state.chantQueue.map((entry) => ({
      ...entry,
      completionEffects: [...entry.completionEffects],
    })),
    chantEntrySequence: state.chantEntrySequence,
    generatedCardSequence: state.generatedCardSequence,
    nextChoiceRequestSequence: state.nextChoiceRequestSequence,
    pendingEffectSequence: state.pendingEffectSequence,
    pendingCardChoice: state.pendingCardChoice,
    terminalResult: state.terminalResult,
    rngState: state.rngState,
  };
}

function resolveDefinition(
  source: CardDefinitionSourceV2,
  id: string,
  version: string,
): CardDefinitionV2 | undefined {
  if (Array.isArray(source))
    return source.find((definition) => definition.id === id && definition.version === version);
  if (isRecord(source) && typeof source.resolve === 'function') return source.resolve(id, version);
  return undefined;
}

function resolveAnyCurrentDefinition(
  source: CardDefinitionSourceV2,
  id: string,
): CardDefinitionV2 | undefined {
  if (Array.isArray(source))
    return source.find((definition) => definition.id === id && definition.version === '1.0.0');
  if (isRecord(source) && typeof source.resolve === 'function') return source.resolve(id, '1.0.0');
  return undefined;
}

export function isValidCardDefinitionV2(value: unknown): value is CardDefinitionV2 {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.version === 'string' &&
    value.version.length > 0 &&
    isNonNegativeInteger(value.cost) &&
    (value.class === undefined || typeof value.class === 'string') &&
    (value.keywords === undefined ||
      (Array.isArray(value.keywords) &&
        isDense(value.keywords) &&
        value.keywords.every((keyword) => typeof keyword === 'string'))) &&
    (value.deckLimit === undefined ||
      value.deckLimit === null ||
      isNonNegativeInteger(value.deckLimit)) &&
    Array.isArray(value.effects) &&
    value.effects.length > 0 &&
    isDense(value.effects) &&
    value.effects.every(isValidEffect) &&
    value.effects.filter(consumesCardInstancesChoice).length <= 1
  );
}

function consumesCardInstancesChoice(effect: CardEffectV2): boolean {
  return (
    effect.type === 'EXHAUST_GRIMOIRE_ADVANCE_WISH' ||
    effect.type === 'SYNTHESIZE' ||
    effect.type === 'TRANSFORM_HAND_CARD' ||
    effect.type === 'SEAL_GRIMOIRE'
  );
}

function isValidEffect(effect: unknown): effect is CardEffectV2 {
  if (!isRecord(effect) || typeof effect.type !== 'string') return false;
  switch (effect.type) {
    case 'DAMAGE':
      return (
        isPositiveSafeInteger(effect.amount) &&
        (effect.target === 'SELF' || effect.target === 'ENEMY')
      );
    case 'HEAL':
    case 'GAIN_BLOCK':
    case 'DRAW':
    case 'GAIN_ENERGY':
      return isPositiveSafeInteger(effect.amount) && effect.target === 'SELF';
    case 'START_CHANT':
      return (
        isPositiveSafeInteger(effect.countdown) &&
        (effect.damageDelay === undefined || isNonNegativeInteger(effect.damageDelay)) &&
        Array.isArray(effect.completionEffects) &&
        effect.completionEffects.length > 0 &&
        isDense(effect.completionEffects) &&
        effect.completionEffects.every(isValidChantCompletionEffect)
      );
    case 'ADVANCE_CHANT':
      return (
        isPositiveSafeInteger(effect.amount) &&
        (effect.drawOnComplete === undefined || typeof effect.drawOnComplete === 'boolean')
      );
    case 'RESOLVE_ALL_CHANTS':
      return isNonNegativeInteger(effect.blockPerChant);
    case 'GAIN_BLOCK_PER_CHANT':
    case 'EXHAUST_GRIMOIRE_ADVANCE_WISH':
      return isPositiveSafeInteger(effect.amount);
    case 'SYNTHESIZE':
      return (
        effect.mode === 'NORMAL' ||
        effect.mode === 'SAGE_RECIPE' ||
        effect.mode === 'COMPLETE_REACTION' ||
        effect.mode === 'ALL_MATERIALS'
      );
    case 'DRAW_SYNTHESIS_COUNT':
      return isPositiveSafeInteger(effect.maximum);
    case 'SET_ALCHEMY_STAGE':
      return effect.requiredStage === 1 && effect.stage === 3;
    case 'SPECIAL_VICTORY':
      return (
        (effect.specialVictoryId === 'MAGE_GRAND_WISH' &&
          effect.requiredAlchemyStage === undefined) ||
        (effect.specialVictoryId === 'ALCHEMY_SAGE_STONE' && effect.requiredAlchemyStage === 3)
      );
    case 'REQUEST_CARD_CHOICE':
      return (
        effect.from === 'DRAW_PILE' &&
        (effect.maximumCost === undefined || isNonNegativeInteger(effect.maximumCost))
      );
    case 'TRANSFORM_HAND_CARD':
    case 'SEAL_GRIMOIRE':
      return true;
    default:
      return false;
  }
}

function isValidChantCompletionEffect(effect: unknown): effect is CardEffectV2 {
  return (
    isValidEffect(effect) &&
    (effect.type === 'DAMAGE' ||
      (effect.type === 'SPECIAL_VICTORY' &&
        effect.specialVictoryId === 'MAGE_GRAND_WISH' &&
        effect.requiredAlchemyStage === undefined))
  );
}

function validateCardInstance(card: CardInstanceV2): void {
  if (
    typeof card.id !== 'string' ||
    typeof card.definitionId !== 'string' ||
    typeof card.definitionVersion !== 'string' ||
    !Number.isSafeInteger(card.costModifier) ||
    (card.visibility !== 'ownerOnly' && card.visibility !== 'allPlayers')
  ) {
    throw new TypeError('Card instances must use the protocol 2 versioned shape.');
  }
}

function hasKeyword(
  card: CardInstanceV2,
  keyword: string,
  definitions: CardDefinitionSourceV2,
): boolean {
  return (
    resolveDefinition(definitions, card.definitionId, card.definitionVersion)?.keywords?.includes(
      keyword,
    ) === true
  );
}

function locateOwnedCard(
  player: BattlePlayerStateV2,
  id: CardInstanceId,
): { card: CardInstanceV2; zone: 'hand' | 'discard' } | undefined {
  const hand = player.hand.find((card) => card.id === id);
  if (hand !== undefined) return { card: hand, zone: 'hand' };
  const discard = player.discard.find((card) => card.id === id);
  return discard === undefined ? undefined : { card: discard, zone: 'discard' };
}

function choiceOf<K extends PlayCardChoice['kind']>(
  action: PlayCardActionV2,
  kind: K,
): Extract<PlayCardChoice, { readonly kind: K }> | undefined {
  return action.choices?.find(
    (choice): choice is Extract<PlayCardChoice, { readonly kind: K }> => choice.kind === kind,
  );
}

function selectedIds(choice: SubmittedCardChoice): readonly string[] {
  if (choice.kind === 'CARD') return [choice.cardInstanceId];
  if (choice.kind === 'CARDS') return choice.cardInstanceIds;
  return [choice.recipeId];
}

function choiceKindMatches(
  expected: PendingChoiceKind,
  actual: SubmittedCardChoice['kind'],
): boolean {
  return expected === actual;
}

function projectCard(card: CardInstanceV2, isOwner: boolean): unknown {
  if (isOwner || card.visibility === 'allPlayers') return card;
  return { visibility: 'ownerOnly' };
}

export function projectGameEventV2(
  event: GameEventV2,
  viewerId: PlayerId,
): Record<string, unknown> {
  const ownerPlayerId = (event.ownerPlayerId ?? event.playerId) as PlayerId | undefined;
  const hiddenDrawPileMove =
    event.type === 'CARD_MOVED' && event.toZone === 'drawPile' && ownerPlayerId !== viewerId;
  if ((event.visibility === 'ownerOnly' || hiddenDrawPileMove) && ownerPlayerId !== viewerId) {
    const view: Record<string, unknown> = {
      type: event.type,
      sequence: event.sequence,
      visibility: event.visibility,
      ownerPlayerId,
      redacted: true,
    };
    return view;
  }
  const projected = { ...event } as Record<string, unknown>;
  delete projected.rngStateBefore;
  delete projected.rngStateAfter;
  if (ownerPlayerId !== viewerId && event.positionVisibility === 'ownerOnly') {
    for (const key of [
      'zone',
      'from',
      'to',
      'fromZone',
      'toZone',
      'index',
      'position',
      'fromIndex',
      'toIndex',
    ]) {
      delete projected[key];
    }
  }
  return projected;
}

function eventEmitter(existing: readonly GameEventV2[]): EventEmitter {
  const values: GameEventV2[] = [];
  const offset = existing.at(-1)?.sequence ?? 0;
  return {
    values,
    emit(event) {
      values.push({ ...event, sequence: offset + values.length + 1 } as GameEventV2);
    },
  };
}

function failure(
  state: BattleStateV2,
  code: BattleInputValidationCode,
  message: string,
): BattleInputResult {
  return { ok: false, state, events: [], error: { code, message } };
}

function removeAt<T>(values: readonly T[], index: number): T[] {
  return [...values.slice(0, index), ...values.slice(index + 1)];
}

function shuffle(
  cards: readonly CardInstanceV2[],
  initialState: number,
): { cards: CardInstanceV2[]; rngState: number } {
  const values = [...cards];
  const random = new SeededRandom(0);
  random.restore({ state: initialState });
  for (let index = values.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random.next() * (index + 1));
    [values[index], values[selected]] = [values[selected]!, values[index]!];
  }
  return { cards: values, rngState: random.snapshot().state };
}

function seedToUint32(seed: string): number {
  return new SeededRandom(seed).snapshot().state;
}

function isBattleInputShape(value: unknown): value is BattleInput {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['inputSequence', 'kind', 'payload']) ||
    !Number.isSafeInteger(value.inputSequence)
  )
    return false;
  if (value.kind === 'CLIENT_ACTION') return isGameActionV2(value.payload);
  if (value.kind === 'SERVER_COMMAND') return isServerCommand(value.payload);
  return false;
}

export function isGameActionV2(value: unknown): value is GameActionV2 {
  if (!isRecord(value) || typeof value.playerId !== 'string' || value.playerId.length === 0)
    return false;
  if (value.type === 'END_TURN') return hasOnlyKeys(value, ['type', 'playerId']);
  if (value.type === 'PLAY_CARD') {
    return (
      hasOnlyKeys(value, ['type', 'playerId', 'cardInstanceId', 'targetId', 'choices']) &&
      typeof value.cardInstanceId === 'string' &&
      value.cardInstanceId.length > 0 &&
      (value.targetId === undefined || typeof value.targetId === 'string') &&
      (value.choices === undefined ||
        (Array.isArray(value.choices) &&
          isDense(value.choices) &&
          value.choices.every(isPlayCardChoice)))
    );
  }
  if (value.type === 'SUBMIT_CARD_CHOICE') {
    return (
      hasOnlyKeys(value, ['type', 'playerId', 'choiceRequestId', 'choice']) &&
      typeof value.choiceRequestId === 'string' &&
      value.choiceRequestId.length > 0 &&
      isSubmittedCardChoice(value.choice)
    );
  }
  return false;
}

function isPlayCardChoice(value: unknown): value is PlayCardChoice {
  if (!isRecord(value)) return false;
  if (value.kind === 'CARD_INSTANCES') {
    return (
      hasOnlyKeys(value, ['kind', 'cardInstanceIds']) &&
      Array.isArray(value.cardInstanceIds) &&
      isDense(value.cardInstanceIds) &&
      value.cardInstanceIds.every((id) => typeof id === 'string' && id.length > 0)
    );
  }
  if (value.kind === 'RECIPE')
    return (
      hasOnlyKeys(value, ['kind', 'recipeId']) &&
      typeof value.recipeId === 'string' &&
      value.recipeId.length > 0
    );
  if (value.kind === 'CHANT_ENTRY')
    return (
      hasOnlyKeys(value, ['kind', 'chantEntryId']) &&
      typeof value.chantEntryId === 'string' &&
      value.chantEntryId.length > 0
    );
  return false;
}

function isSubmittedCardChoice(value: unknown): value is SubmittedCardChoice {
  if (!isRecord(value)) return false;
  if (value.kind === 'CARD')
    return (
      hasOnlyKeys(value, ['kind', 'cardInstanceId']) &&
      typeof value.cardInstanceId === 'string' &&
      value.cardInstanceId.length > 0
    );
  if (value.kind === 'CARDS') {
    return (
      hasOnlyKeys(value, ['kind', 'cardInstanceIds']) &&
      Array.isArray(value.cardInstanceIds) &&
      isDense(value.cardInstanceIds) &&
      value.cardInstanceIds.every((id) => typeof id === 'string' && id.length > 0)
    );
  }
  if (value.kind === 'RECIPE')
    return (
      hasOnlyKeys(value, ['kind', 'recipeId']) &&
      typeof value.recipeId === 'string' &&
      value.recipeId.length > 0
    );
  return false;
}

function isServerCommand(value: unknown): value is ServerCommand {
  if (
    !isRecord(value) ||
    typeof value.playerId !== 'string' ||
    value.playerId.length === 0 ||
    typeof value.choiceRequestId !== 'string' ||
    value.choiceRequestId.length === 0 ||
    !isNonNegativeSafeInteger(value.deadlineAt) ||
    typeof value.timeoutAuthorization !== 'string' ||
    value.timeoutAuthorization.length === 0
  )
    return false;
  if (value.type === 'CARD_CHOICE_DEADLINE_ISSUED') {
    return (
      hasOnlyKeys(value, [
        'type',
        'playerId',
        'choiceRequestId',
        'issuedAt',
        'deadlineAt',
        'timeoutAuthorization',
      ]) && isNonNegativeSafeInteger(value.issuedAt)
    );
  }
  if (value.type === 'CARD_CHOICE_TIMEOUT') {
    return (
      hasOnlyKeys(value, [
        'type',
        'playerId',
        'choiceRequestId',
        'deadlineCommandSequence',
        'deadlineAt',
        'timeoutAt',
        'timeoutAuthorization',
        'timeoutAttestation',
      ]) &&
      isPositiveSafeInteger(value.deadlineCommandSequence) &&
      isNonNegativeSafeInteger(value.timeoutAt) &&
      typeof value.timeoutAttestation === 'string' &&
      value.timeoutAttestation.length > 0
    );
  }
  return false;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isDense(values: readonly unknown[]): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (!(index in values)) return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
