/**
 * Public, dependency-free contracts for deterministic battles.
 *
 * State transition and effect resolution are deliberately introduced in later
 * milestones. Consumers must treat a failed result as an unchanged state.
 */
export const packageName = '@deck-drive/game-engine' as const;

type Brand<Value, Name extends string> = Value & {
  readonly __brand: Name;
};

export type MatchId = Brand<string, 'MatchId'>;
export type PlayerId = Brand<string, 'PlayerId'>;
export type CardDefinitionId = Brand<string, 'CardDefinitionId'>;
export type CardInstanceId = Brand<string, 'CardInstanceId'>;
export type EntityId = Brand<string, 'EntityId'>;

export type BattlePhase =
  | 'MATCH_INIT'
  | 'DRAW'
  | 'PLAYER_TURN'
  | 'ACTION'
  | 'RESOLVE'
  | 'CHECK_WIN'
  | 'NEXT_TURN'
  | 'MATCH_END';

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
  readonly rulesVersion: string;
  readonly cardDataVersion: string;
  readonly seed: string;
  readonly turn: number;
  readonly activePlayerId: PlayerId;
  readonly phase: BattlePhase;
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
      readonly result: BattleResult;
    };

export type ActionValidationCode =
  'PLAYER_NOT_FOUND' | 'NOT_ACTIVE_PLAYER' | 'INVALID_PHASE' | 'CARD_NOT_IN_HAND';

export type ValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: ActionValidationCode;
      readonly message: string;
    };

export interface EngineError {
  readonly code: ActionValidationCode | 'ACTION_NOT_IMPLEMENTED';
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

export type BattleResult =
  | { readonly status: 'IN_PROGRESS' }
  | { readonly status: 'DRAW' }
  | { readonly status: 'WIN'; readonly winnerId: PlayerId };

export function validateAction(state: BattleState, action: GameAction): ValidationResult {
  const player = state.players.find((candidate) => candidate.id === action.playerId);

  if (player === undefined) {
    return invalidAction('PLAYER_NOT_FOUND', 'The action player is not in this battle.');
  }

  if (state.phase !== 'PLAYER_TURN') {
    return invalidAction('INVALID_PHASE', 'Actions can only be submitted during PLAYER_TURN.');
  }

  if (state.activePlayerId !== action.playerId) {
    return invalidAction('NOT_ACTIVE_PLAYER', 'Only the active player can submit an action.');
  }

  if (
    action.type === 'PLAY_CARD' &&
    !player.hand.some((card) => card.id === action.cardInstanceId)
  ) {
    return invalidAction('CARD_NOT_IN_HAND', 'The selected card is not in the player hand.');
  }

  return { ok: true };
}

/**
 * Applies validation only until E03 adds rule effects. A valid action must not
 * be reported as a successful no-op, so callers cannot mistake this contract
 * milestone for complete game-rule support.
 */
export function applyAction(state: BattleState, action: GameAction): EngineResult {
  const validation = validateAction(state, action);

  if (!validation.ok) {
    return { ok: false, state, events: [], error: validation };
  }

  return {
    ok: false,
    state,
    events: [],
    error: {
      code: 'ACTION_NOT_IMPLEMENTED',
      message: 'Action resolution is introduced in E03.',
    },
  };
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

function invalidAction(code: ActionValidationCode, message: string): ValidationResult {
  return { ok: false, code, message };
}
