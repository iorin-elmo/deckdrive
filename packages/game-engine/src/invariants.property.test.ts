import { readFileSync, readdirSync } from 'node:fs';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { applyAction, createInitialBattleState } from './index.js';
import type {
  BattleState,
  CardDefinition,
  CardInstance,
  CardInstanceId,
  MatchId,
  PlayerId,
} from './index.js';

interface BattleFixture {
  readonly matchId: string;
  readonly seed: string;
  readonly initialDrawCount: number;
  readonly turnDrawCount: number;
  readonly players: readonly FixturePlayer[];
}

interface FixturePlayer {
  readonly id: string;
  readonly cards: readonly FixtureCard[];
}

interface FixtureCard {
  readonly id: string;
  readonly definitionId: string;
}

const fixturePath = new URL(
  '../../../tests/fixtures/battles/phase-1-invariants.json',
  import.meta.url,
);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as BattleFixture;
const definitions: readonly CardDefinition[] = [
  {
    id: 'strike',
    cost: 1,
    effects: [{ type: 'DAMAGE', amount: 6, target: 'ENEMY' }],
  },
  {
    id: 'guard',
    cost: 1,
    effects: [{ type: 'GAIN_BLOCK', amount: 5, target: 'SELF' }],
  },
];
const playerCardLimits = new Map(
  fixture.players.map((player) => [
    player.id,
    {
      deckSize: player.cards.length,
      cardDefinitionCounts: countByDefinition(player.cards),
      cardIds: player.cards.map((card) => card.id).sort(),
    },
  ]),
);

function createFixtureState(): BattleState {
  return createInitialBattleState({
    matchId: fixture.matchId as MatchId,
    engineVersion: '1.0.0',
    rulesVersion: '1.0.0',
    cardDataVersion: '1.0.0',
    seed: fixture.seed,
    initialDrawCount: fixture.initialDrawCount,
    turnDrawCount: fixture.turnDrawCount,
    players: fixture.players.map((player) => ({
      id: player.id as PlayerId,
      drawPile: player.cards.map(toCardInstance),
    })),
  });
}

function toCardInstance(card: FixtureCard): CardInstance {
  return {
    id: card.id as CardInstanceId,
    definitionId: card.definitionId,
  };
}

function runActions(choices: readonly boolean[]): BattleState {
  let state = createFixtureState();

  for (const playCard of choices) {
    const activePlayer = state.players.find((player) => player.id === state.activePlayerId)!;
    const selectedCard = playCard && activePlayer.energy > 0 ? activePlayer.hand[0] : undefined;
    const action =
      selectedCard === undefined
        ? { type: 'END_TURN' as const, playerId: activePlayer.id }
        : {
            type: 'PLAY_CARD' as const,
            playerId: activePlayer.id,
            cardInstanceId: selectedCard.id,
          };
    const result = applyAction(state, action, definitions);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Fixture action was rejected: ${result.error.code}`);
    expectInvariants(result.state, state.turn);
    state = result.state;
  }

  return state;
}

function expectInvariants(state: BattleState, previousTurn: number): void {
  expect(state.turn).toBeGreaterThanOrEqual(previousTurn);

  for (const player of state.players) {
    const limits = playerCardLimits.get(player.id);
    if (limits === undefined) throw new Error(`Unexpected player ${player.id}`);

    const cards = [...player.drawPile, ...player.hand, ...player.discard];
    expect(player.hp).toBeGreaterThanOrEqual(0);
    expect(player.energy).toBeGreaterThanOrEqual(0);
    expect(player.drawPile.length).toBeGreaterThanOrEqual(0);
    expect(player.hand.length).toBeGreaterThanOrEqual(0);
    expect(player.discard.length).toBeGreaterThanOrEqual(0);
    expect(player.drawPile.length).toBeLessThanOrEqual(limits.deckSize);
    expect(cards.map((card) => card.id).sort()).toEqual(limits.cardIds);

    for (const [definitionId, initialCount] of limits.cardDefinitionCounts) {
      expect(cards.filter((card) => card.definitionId === definitionId)).toHaveLength(initialCount);
      expect(initialCount).toBeLessThanOrEqual(3);
    }
  }
}

function countByDefinition(cards: readonly FixtureCard[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const card of cards) {
    counts.set(card.definitionId, (counts.get(card.definitionId) ?? 0) + 1);
  }

  return counts;
}

function readImplementationSources(directory: URL): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) return readImplementationSources(path);
    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      return [readFileSync(path, 'utf8')];
    }
    return [];
  });
}

describe('Phase 1 engine invariants', () => {
  it('preserves the §84 invariants over generated valid action sequences', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { maxLength: 40 }), (choices) => {
        const initial = createFixtureState();
        expectInvariants(initial, initial.turn);
        runActions(choices);
      }),
      { numRuns: 100 },
    );
  });

  it('leaves state unchanged for generated invalid actions', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 64 }), (missingCardId) => {
        const state = createFixtureState();
        const snapshot = structuredClone(state);
        const result = applyAction(
          state,
          {
            type: 'PLAY_CARD',
            playerId: state.activePlayerId,
            cardInstanceId: `missing-${missingCardId}` as CardInstanceId,
          },
          definitions,
        );

        expect(result.ok).toBe(false);
        expect(result.state).toBe(state);
        expect(result.events).toEqual([]);
        expect(state).toEqual(snapshot);
      }),
      { numRuns: 100 },
    );
  });

  it('produces the same state for the same seed and generated action sequence', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { maxLength: 40 }), (choices) => {
        expect(runActions(choices)).toEqual(runActions(choices));
      }),
      { numRuns: 100 },
    );
  });

  it('keeps implementation modules isolated from UI, CPU, and platform dependencies', () => {
    const sources = readImplementationSources(new URL('./', import.meta.url));
    const sourceWithoutComments = sources.join('\n').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gmu, '');
    const moduleSpecifiers = Array.from(
      sourceWithoutComments.matchAll(
        /\b(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)['"]([^'"]+)['"]/gu,
      ),
      (match) => match[1],
    );

    expect(sources).not.toHaveLength(0);
    expect(moduleSpecifiers.every((specifier) => specifier?.startsWith('.') === true)).toBe(true);
    expect(sourceWithoutComments).not.toMatch(/\bMath\.random\s*\(/u);
  });
});
