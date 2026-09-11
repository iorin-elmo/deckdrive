/**
 * Public, dependency-free contracts for deterministic battles.
 *
 * State transition and effect resolution are deterministic and side-effect
 * free. Consumers must treat a failed result as an unchanged state.
 */
import { applyRuleAction, prepareRuleAction, validateRuleAction } from './rules.js';
import type { CardDefinitionSource } from './rules.js';

export const packageName = '@deck-drive/game-engine' as const;

export * from './random/index.js';
export { createInitialBattleState, initialHp, initialMaxEnergy } from './rules.js';
export type {
  CardDefinition,
  CardDefinitionSource,
  CardEffect,
  CreateInitialBattleStateOptions,
} from './rules.js';

type Brand<Value, Name extends string> = Value & {
  readonly __brand: Name;
};

export type MatchId = Brand<string, 'MatchId'>;
export type PlayerId = Brand<string, 'PlayerId'>;
/**
 * Card definitions are owned by a separate, dependency-free package. Keep this
 * structural so a CardDefinition.id can be used without a cross-package cast.
 */
export type CardDefinitionId = string;
export type CardInstanceId = Brand<string, 'CardInstanceId'>;
export type EntityId = Brand<string, 'EntityId'>;

/** Actions resolve atomically; only stable, externally observable phases are represented. */
export type BattlePhase = 'PLAYER_TURN' | 'MATCH_END';

/** A source of random values. Seeded implementations are added in E01. */
export interface RandomSource {
  next(): number;
}

/** A card in a battle is distinct from its versioned definition. */
export interface CardInstance {
  readonly id: CardInstanceId;
  readonly definitionId: CardDefinitionId;
}

export interface Status {
  readonly id: string;
  readonly stacks: number;
}

export interface EffectStackItem {
  readonly id: string;
  readonly sourceId: EntityId;
  readonly description: string;
}

export type EffectStack = readonly EffectStackItem[];

export interface BattlePlayerState {
  readonly id: PlayerId;
  readonly hp: number;
  readonly maxHp: number;
  readonly energy: number;
  readonly maxEnergy: number;
  readonly block: number;
  readonly drawPile: readonly CardInstance[];
  readonly hand: readonly CardInstance[];
  readonly discard: readonly CardInstance[];
  readonly statuses: readonly Status[];
}

export interface BattleState {
  readonly matchId: MatchId;
  readonly engineVersion: string;
  readonly rulesVersion: string;
  readonly cardDataVersion: string;
  readonly seed: string;
  readonly turn: number;
  readonly activePlayerId: PlayerId;
  readonly phase: BattlePhase;
  /** Explicit, replayable turn-start draw cadence. */
  readonly turnDrawCount: number;
  readonly players: readonly BattlePlayerState[];
  readonly stack: EffectStack;
  readonly events: readonly GameEvent[];
}

export interface PlayCardAction {
  readonly type: 'PLAY_CARD';
  readonly playerId: PlayerId;
  readonly cardInstanceId: CardInstanceId;
  readonly targetId?: EntityId | PlayerId;
}

export interface EndTurnAction {
  readonly type: 'END_TURN';
  readonly playerId: PlayerId;
}

/** Only player decisions belong here; effects and random values are engine-owned. */
export type GameAction = PlayCardAction | EndTurnAction;

export type TerminalBattleResult =
  { readonly status: 'DRAW' } | { readonly status: 'WIN'; readonly winnerId: PlayerId };

export type GameEvent =
  | {
      readonly type: 'CARD_PLAYED';
      readonly sequence: number;
      readonly playerId: PlayerId;
      readonly cardInstanceId: CardInstanceId;
    }
  | {
      readonly type: 'EFFECT_STARTED';
      readonly sequence: number;
      readonly effectId: string;
    }
  | {
      readonly type: 'DAMAGE_DEALT';
      readonly sequence: number;
      readonly sourceId: EntityId | PlayerId;
      readonly targetId: EntityId | PlayerId;
      readonly amount: number;
    }
  | {
      readonly type: 'BLOCK_REDUCED';
      readonly sequence: number;
      readonly targetId: EntityId | PlayerId;
      readonly amount: number;
    }
  | {
      readonly type: 'ENTITY_DAMAGED';
      readonly sequence: number;
      readonly targetId: EntityId | PlayerId;
      readonly amount: number;
    }
  | {
      readonly type: 'HEALED';
      readonly sequence: number;
      readonly targetId: EntityId | PlayerId;
      readonly amount: number;
    }
  | {
      readonly type: 'BLOCK_GAINED';
      readonly sequence: number;
      readonly targetId: EntityId | PlayerId;
      readonly amount: number;
    }
  | {
      readonly type: 'CARDS_DRAWN';
      readonly sequence: number;
      readonly playerId: PlayerId;
      readonly cardInstanceIds: readonly CardInstanceId[];
    }
  | {
      readonly type: 'CARD_DRAWN';
      readonly sequence: number;
      readonly playerId: PlayerId;
      readonly cardInstanceId: CardInstanceId;
    }
  | {
      readonly type: 'CARD_DISCARDED';
      readonly sequence: number;
      readonly playerId: PlayerId;
      readonly cardInstanceId: CardInstanceId;
    }
  | {
      readonly type: 'STATUS_APPLIED';
      readonly sequence: number;
      readonly targetId: EntityId | PlayerId;
      readonly status: Status;
    }
  | {
      readonly type: 'STATUS_REMOVED';
      readonly sequence: number;
      readonly targetId: EntityId | PlayerId;
      readonly statusId: string;
    }
  | {
      readonly type: 'TURN_STARTED';
      readonly sequence: number;
      readonly playerId: PlayerId;
    }
  | {
      readonly type: 'TURN_ENDED';
      readonly sequence: number;
      readonly playerId: PlayerId;
    }
  | {
      readonly type: 'MATCH_FINISHED';
      readonly sequence: number;
      readonly result: TerminalBattleResult;
    };

export type ActionValidationCode =
  | 'PLAYER_NOT_FOUND'
  | 'NOT_ACTIVE_PLAYER'
  | 'INVALID_PHASE'
  | 'MATCH_FINISHED'
  | 'CARD_NOT_IN_HAND'
  | 'CARD_DEFINITION_NOT_FOUND'
  | 'INSUFFICIENT_ENERGY'
  | 'INVALID_TARGET'
  | 'INVALID_CARD_DEFINITION'
  | 'UNSUPPORTED_EFFECT'
  | 'INVALID_TURN_DRAW_COUNT'
  | 'PLAYER_DEFEATED'
  | 'UNKNOWN_ACTION_TYPE';

export type ValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: ActionValidationCode;
      readonly message: string;
    };

export interface EngineError {
  readonly code: ActionValidationCode;
  readonly message: string;
}

export type EngineResult =
  | {
      readonly ok: true;
      readonly state: BattleState;
      readonly events: readonly GameEvent[];
    }
  | {
      readonly ok: false;
      readonly state: BattleState;
      readonly events: readonly GameEvent[];
      readonly error: EngineError;
    };

export type BattleResult = { readonly status: 'IN_PROGRESS' } | TerminalBattleResult;

export function validateAction(
  state: BattleState,
  action: GameAction,
  definitions?: CardDefinitionSource,
): ValidationResult {
  return validateRuleAction(state, action, definitions);
}

/** Applies one decision without mutating the supplied state. */
export function applyAction(
  state: BattleState,
  action: GameAction,
  definitions?: CardDefinitionSource,
): EngineResult {
  const prepared = prepareRuleAction(state, action, definitions);
  const { validation } = prepared;

  if (!validation.ok) {
    return { ok: false, state, events: [], error: validation };
  }

  const result = applyRuleAction(state, action, prepared.definition);
  return { ok: true, ...result };
}

/** Returns the observable terminal result from player HP without mutating state. */
export function calculateResult(state: BattleState): BattleResult {
  const remainingPlayers = state.players.filter((player) => player.hp > 0);
  const winner = remainingPlayers[0];

  if (remainingPlayers.length === 1 && winner !== undefined) {
    return { status: 'WIN', winnerId: winner.id };
  }

  return remainingPlayers.length === 0 ? { status: 'DRAW' } : { status: 'IN_PROGRESS' };
}
