import {
  applyBattleInputV2,
  calculateResultV2,
  type BattleStateV2,
  type CardDefinitionV2,
  type GameActionV2,
  type PlayCardChoice,
} from './protocol-v2.js';
import { pool, poolChoiceRange, effectivePoolCost } from './pool-rules.js';
import type { PlayerId, CardInstanceId } from './index.js';

/** Candidate construction only: every candidate is checked by the authoritative engine. */
export function legalActionsV2(
  state: BattleStateV2,
  definitions: readonly CardDefinitionV2[],
  playerId: PlayerId,
): readonly GameActionV2[] {
  if (calculateResultV2(state).status !== 'IN_PROGRESS') return [];
  const actor = state.players.find((player) => player.id === playerId);
  if (!actor) return [];
  const pending = state.pendingCardChoice;
  if (pending) {
    if (pending.ownerPlayerId !== playerId || pending.deadlineCommandSequence === undefined)
      return [];
    if (pending.choiceKind === 'CARDS') {
      return combinations(pending.candidateIds as CardInstanceId[], pending.minSelections)
        .map(
          (ids) =>
            ({
              type: 'SUBMIT_CARD_CHOICE',
              playerId,
              choiceRequestId: pending.choiceRequestId,
              choice: { kind: 'CARDS', cardInstanceIds: ids },
            }) as GameActionV2,
        )
        .filter(valid);
    }
    return pending.candidateIds
      .map(
        (id) =>
          ({
            type: 'SUBMIT_CARD_CHOICE',
            playerId,
            choiceRequestId: pending.choiceRequestId,
            choice:
              pending.choiceKind === 'RECIPE'
                ? { kind: 'RECIPE', recipeId: id }
                : { kind: 'CARD', cardInstanceId: id },
          }) as GameActionV2,
      )
      .filter(valid);
  }
  if (state.activePlayerId !== playerId) return [];
  const actions: GameActionV2[] = [];
  const def = (id: string) => definitions.find((entry) => entry.id === id);
  for (const card of actor.hand) {
    const definition = def(card.definitionId);
    if (!definition) continue;
    let sets: readonly (readonly PlayCardChoice[])[] = [[]];
    const available = actor.hand.filter(
      (entry) => entry.id !== card.id && !pool(actor).arrowQueue.includes(entry.id),
    );
    const poolEffect = definition.effects.find((effect) => effect.type === 'POOL_CARD');
    const range = poolEffect?.type === 'POOL_CARD' ? poolChoiceRange(poolEffect.cardId) : undefined;
    if (range) {
      const candidates = actor[range.zone].filter(
        (entry) =>
          entry.id !== card.id &&
          (range.loaded
            ? pool(actor).arrowQueue.includes(entry.id)
            : !pool(actor).arrowQueue.includes(entry.id)) &&
          (!range.arrow || def(entry.definitionId)?.keywords?.includes('arrow')),
      );
      sets = Array.from({ length: range.max - range.min + 1 }, (_, index) =>
        combinations(
          candidates.map((entry) => entry.id),
          range.min + index,
        ),
      )
        .flat()
        .map((ids) => [{ kind: 'CARD_INSTANCES', cardInstanceIds: ids }]);
    }
    for (const effect of definition.effects) {
      if (effect.type === 'TRANSFORM_HAND_CARD')
        sets = available.map((entry) => [{ kind: 'CARD_INSTANCES', cardInstanceIds: [entry.id] }]);
      if (effect.type === 'SYNTHESIZE' && effect.mode !== 'ALL_MATERIALS') {
        if ((actor.pool?.values.sageCatalyst ?? 0) > 0) {
          sets = [[]];
          continue;
        }
        const cards = (
          effect.mode === 'SAGE_RECIPE' ? [...available, ...actor.discard] : available
        ).filter((entry) => def(entry.definitionId)?.keywords?.includes('material'));
        const count = effect.mode === 'NORMAL' ? 2 : 3;
        sets = combinations(
          cards.map((entry) => entry.id),
          count,
        ).flatMap((ids) =>
          [undefined, 'ALCHEMY_RED_BLUE', 'ALCHEMY_RED_CATALYST', 'ALCHEMY_BLUE_CATALYST'].map(
            (recipe) => [
              { kind: 'CARD_INSTANCES', cardInstanceIds: ids } as PlayCardChoice,
              ...(recipe ? [{ kind: 'RECIPE', recipeId: recipe } as PlayCardChoice] : []),
            ],
          ),
        );
      }
      if (effect.type === 'SEAL_GRIMOIRE' || effect.type === 'EXHAUST_GRIMOIRE_ADVANCE_WISH')
        sets = available
          .filter((entry) => def(entry.definitionId)?.keywords?.includes('grimoire'))
          .map((entry) => [{ kind: 'CARD_INSTANCES', cardInstanceIds: [entry.id] }]);
      if (effect.type === 'ADVANCE_CHANT' || effect.type === 'EXHAUST_GRIMOIRE_ADVANCE_WISH') {
        const chants = state.chantQueue.filter(
          (entry) =>
            entry.ownerPlayerId === playerId &&
            (effect.type !== 'EXHAUST_GRIMOIRE_ADVANCE_WISH' ||
              entry.sourceDefinitionId === 'mage_017'),
        );
        if (chants.length)
          sets = sets.flatMap((choices) =>
            chants.map((entry) => [
              ...choices,
              { kind: 'CHANT_ENTRY', chantEntryId: entry.chantEntryId } as PlayCardChoice,
            ]),
          );
      }
    }
    for (const choices of sets) {
      const action: GameActionV2 = {
        type: 'PLAY_CARD',
        playerId,
        cardInstanceId: card.id,
        ...(choices.length ? { choices } : {}),
      };
      if (valid(action)) actions.push(action);
    }
  }
  actions.push({ type: 'END_TURN', playerId });
  return actions;
  function valid(action: GameActionV2): boolean {
    return applyBattleInputV2(
      state,
      { kind: 'CLIENT_ACTION', inputSequence: state.lastInputSequence + 1, payload: action },
      definitions,
    ).ok;
  }
}
export interface PlayChoiceOptionsV2 {
  readonly cardInstanceId: CardInstanceId;
  readonly candidateIds: readonly CardInstanceId[];
  readonly min: number;
  readonly max: number;
  readonly chantIds: readonly string[];
  readonly cost: number;
}
/** Complete target choices for the UI; CPU candidate previews can remain bounded. */
export function playChoiceOptionsV2(
  state: BattleStateV2,
  definitions: readonly CardDefinitionV2[],
  playerId: PlayerId,
): readonly PlayChoiceOptionsV2[] {
  const actor = state.players.find((player) => player.id === playerId);
  if (!actor) return [];
  const def = (card: (typeof actor.hand)[number]) =>
    definitions.find(
      (definition) =>
        definition.id === card.definitionId && definition.version === card.definitionVersion,
    );
  return actor.hand.flatMap((card) => {
    const definition = def(card);
    if (!definition) return [];
    let candidates: readonly (typeof card)[] = [],
      min = 0,
      max = 0,
      chantIds: string[] = [];
    const available = actor.hand.filter(
      (entry) => entry.id !== card.id && !pool(actor).arrowQueue.includes(entry.id),
    );
    for (const effect of definition.effects) {
      if (effect.type === 'POOL_CARD') {
        const range = poolChoiceRange(effect.cardId);
        if (range) {
          min = range.min;
          max = range.max;
          candidates = actor[range.zone].filter(
            (entry) =>
              entry.id !== card.id &&
              (range.loaded
                ? pool(actor).arrowQueue.includes(entry.id)
                : !pool(actor).arrowQueue.includes(entry.id)) &&
              (!range.arrow || def(entry)?.keywords?.includes('arrow')),
          );
        }
      }
      if (effect.type === 'TRANSFORM_HAND_CARD') {
        min = max = 1;
        candidates = available;
      }
      if (
        effect.type === 'SYNTHESIZE' &&
        effect.mode !== 'ALL_MATERIALS' &&
        !pool(actor).values.sageCatalyst
      ) {
        min = max = effect.mode === 'NORMAL' ? 2 : 3;
        candidates = (
          effect.mode === 'SAGE_RECIPE' ? [...available, ...actor.discard] : available
        ).filter((entry) =>
          def(entry)?.keywords?.includes(
            effect.mode === 'COMPLETE_REACTION' ? 'reagent' : 'material',
          ),
        );
      }
      if (effect.type === 'SEAL_GRIMOIRE' || effect.type === 'EXHAUST_GRIMOIRE_ADVANCE_WISH') {
        min = max = 1;
        candidates = available.filter((entry) => def(entry)?.keywords?.includes('grimoire'));
      }
      if (effect.type === 'ADVANCE_CHANT' || effect.type === 'EXHAUST_GRIMOIRE_ADVANCE_WISH')
        chantIds = state.chantQueue
          .filter(
            (entry) =>
              entry.ownerPlayerId === playerId &&
              (effect.type !== 'EXHAUST_GRIMOIRE_ADVANCE_WISH' ||
                entry.sourceDefinitionId === 'mage_017'),
          )
          .map((entry) => entry.chantEntryId);
    }
    return [
      {
        cardInstanceId: card.id,
        candidateIds: candidates.map((entry) => entry.id),
        min,
        max,
        chantIds,
        cost: effectivePoolCost(actor, card, definition),
      },
    ];
  });
}
function combinations(ids: readonly CardInstanceId[], count: number): CardInstanceId[][] {
  if (count === 0) return [[]];
  const output: CardInstanceId[][] = [];
  function visit(start: number, selected: CardInstanceId[]): void {
    if (output.length >= 512) return;
    if (selected.length === count) {
      output.push(selected);
      return;
    }
    for (let index = start; index < ids.length; index++)
      visit(index + 1, [...selected, ids[index]!]);
  }
  visit(0, []);
  return output;
}
