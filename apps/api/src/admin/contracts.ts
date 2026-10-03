import { maximumCardCopies } from '@deck-drive/card-definitions';
import { isFeatureFlagName, type FeatureFlagName } from './feature-flags.js';

export type AdminCommand =
  | {
      readonly action: 'GRANT_CURRENCY';
      readonly playerId: string;
      readonly currency: 'GEM' | 'EXCHANGE_POINT';
      readonly amount: number;
      readonly reason: string;
      readonly requestId: string;
    }
  | {
      readonly action: 'GRANT_CARD';
      readonly playerId: string;
      readonly cardVersionId: string;
      readonly quantity: number;
      readonly reason: string;
      readonly requestId: string;
    }
  | {
      readonly action: 'GRANT_COSMETIC';
      readonly playerId: string;
      readonly cosmeticId: string;
      readonly reason: string;
      readonly requestId: string;
    }
  | {
      readonly action: 'COMPLETE_MISSION';
      readonly playerId: string;
      readonly missionId: string;
      readonly reason: string;
      readonly requestId: string;
    }
  | {
      readonly action: 'SET_FLAG';
      readonly name: FeatureFlagName;
      readonly enabled: boolean;
      readonly reason: string;
      readonly requestId: string;
    }
  | {
      readonly action: 'SIMULATE_PACK';
      readonly productId: 'NORMAL_PACK' | 'RARE_PACK' | 'BOX';
      readonly seed: string;
      readonly reason: string;
      readonly requestId: string;
    }
  | {
      readonly action: 'GIVE_ALL_CARDS';
      readonly playerId: string;
      readonly reason: string;
      readonly requestId: string;
    }
  | {
      readonly action: 'SET_GEM' | 'SET_LEVEL' | 'SET_RATING';
      readonly playerId: string;
      readonly value: number;
      readonly reason: string;
      readonly requestId: string;
    }
  | {
      readonly action: 'START_DEBUG_BATTLE';
      readonly firstDeckId: string;
      readonly secondDeckId: string;
      readonly seed: string;
      readonly reason: string;
      readonly requestId: string;
    }
  | {
      readonly action: 'DEBUG_BATTLE_COMMAND';
      readonly battleId: string;
      readonly command: DebugCommandInput;
      readonly reason: string;
      readonly requestId: string;
    };

export type DebugCommandInput =
  | { readonly type: 'SKIP_TURN' }
  | { readonly type: 'FORCE_RNG_SEED'; readonly seed: string }
  | { readonly type: 'FORCE_DRAW'; readonly playerId: string; readonly cardInstanceId: string }
  | {
      readonly type: 'APPLY_STATUS';
      readonly playerId: string;
      readonly statusId: string;
      readonly stacks: number;
    }
  | { readonly type: 'KILL_ENTITY'; readonly playerId: string };

export class AdminInputError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function parseAdminCommand(value: unknown): AdminCommand {
  const object = record(value);
  const reason = requiredString(object.reason, 'reason', 2000);
  const requestId = requiredString(object.requestId, 'requestId', 100);
  switch (object.action) {
    case 'GRANT_CURRENCY': {
      const currency = object.currency;
      if (currency !== 'GEM' && currency !== 'EXCHANGE_POINT')
        throw new AdminInputError('INVALID_CURRENCY');
      return {
        action: object.action,
        playerId: uuidString(object.playerId, 'playerId'),
        currency,
        amount: positiveInteger(object.amount, 'amount', 1_000_000),
        reason,
        requestId,
      };
    }
    case 'GRANT_CARD':
      return {
        action: object.action,
        playerId: uuidString(object.playerId, 'playerId'),
        cardVersionId: uuidString(object.cardVersionId, 'cardVersionId'),
        quantity: positiveInteger(object.quantity, 'quantity', maximumCardCopies),
        reason,
        requestId,
      };
    case 'GRANT_COSMETIC':
      return {
        action: object.action,
        playerId: uuidString(object.playerId, 'playerId'),
        cosmeticId: requiredString(object.cosmeticId, 'cosmeticId', 100),
        reason,
        requestId,
      };
    case 'COMPLETE_MISSION':
      return {
        action: object.action,
        playerId: uuidString(object.playerId, 'playerId'),
        missionId: requiredString(object.missionId, 'missionId', 100),
        reason,
        requestId,
      };
    case 'SET_FLAG': {
      const name = requiredString(object.name, 'name', 80);
      if (!isFeatureFlagName(name) || typeof object.enabled !== 'boolean')
        throw new AdminInputError('INVALID_FLAG');
      return { action: object.action, name, enabled: object.enabled, reason, requestId };
    }
    case 'SIMULATE_PACK': {
      const productId = object.productId;
      if (productId !== 'NORMAL_PACK' && productId !== 'RARE_PACK' && productId !== 'BOX')
        throw new AdminInputError('INVALID_PRODUCT');
      return {
        action: object.action,
        productId,
        seed: requiredString(object.seed, 'seed', 200),
        reason,
        requestId,
      };
    }
    case 'GIVE_ALL_CARDS':
      return {
        action: object.action,
        playerId: uuidString(object.playerId, 'playerId'),
        reason,
        requestId,
      };
    case 'SET_GEM':
    case 'SET_LEVEL':
    case 'SET_RATING':
      return {
        action: object.action,
        playerId: uuidString(object.playerId, 'playerId'),
        value:
          object.action === 'SET_LEVEL'
            ? positiveInteger(object.value, 'value', 100)
            : nonNegativeInteger(object.value, 'value', 1_000_000),
        reason,
        requestId,
      };
    case 'START_DEBUG_BATTLE':
      return {
        action: object.action,
        firstDeckId: uuidString(object.firstDeckId, 'firstDeckId'),
        secondDeckId: uuidString(object.secondDeckId, 'secondDeckId'),
        seed: requiredString(object.seed, 'seed', 200),
        reason,
        requestId,
      };
    case 'DEBUG_BATTLE_COMMAND':
      return {
        action: object.action,
        battleId: uuidString(object.battleId, 'battleId'),
        command: parseDebugCommand(object.command),
        reason,
        requestId,
      };
    default:
      throw new AdminInputError('UNKNOWN_ADMIN_ACTION');
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new AdminInputError('INVALID_ADMIN_ACTION');
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, name: string, maximum: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximum)
    throw new AdminInputError(`INVALID_${name.toUpperCase()}`);
  return value.trim();
}

export function uuidString(value: unknown, name: string): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)
  )
    throw new AdminInputError(`INVALID_${name.toUpperCase()}`);
  return value;
}

function positiveInteger(value: unknown, name: string, maximum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > maximum)
    throw new AdminInputError(`INVALID_${name.toUpperCase()}`);
  return value;
}

function nonNegativeInteger(value: unknown, name: string, maximum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > maximum)
    throw new AdminInputError(`INVALID_${name.toUpperCase()}`);
  return value;
}

function parseDebugCommand(value: unknown): DebugCommandInput {
  const command = record(value);
  switch (command.type) {
    case 'SKIP_TURN':
      return { type: command.type };
    case 'FORCE_RNG_SEED':
      return { type: command.type, seed: requiredString(command.seed, 'seed', 200) };
    case 'FORCE_DRAW':
      return {
        type: command.type,
        playerId: uuidString(command.playerId, 'playerId'),
        cardInstanceId: requiredString(command.cardInstanceId, 'cardInstanceId', 100),
      };
    case 'APPLY_STATUS':
      return {
        type: command.type,
        playerId: uuidString(command.playerId, 'playerId'),
        statusId: requiredString(command.statusId, 'statusId', 80),
        stacks: positiveInteger(command.stacks, 'stacks', 99),
      };
    case 'KILL_ENTITY':
      return { type: command.type, playerId: uuidString(command.playerId, 'playerId') };
    default:
      throw new AdminInputError('UNKNOWN_DEBUG_COMMAND');
  }
}
