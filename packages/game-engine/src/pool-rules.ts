import type {
  CardInstanceV2,
  CardDefinitionV2,
  BattlePlayerStateV2,
  PlayCardActionV2,
} from './protocol-v2.js';

export interface PoolState {
  readonly values: Readonly<Record<string, number>>;
  readonly arrowQueue: readonly string[];
  readonly modifiers: Readonly<
    Record<
      string,
      {
        readonly damage?: number;
        readonly fixedCost?: number;
        readonly expires?: boolean;
        readonly temporaryCopy?: boolean;
        readonly returnTop?: boolean;
      }
    >
  >;
}
export interface PoolContext {
  readonly action: PlayCardActionV2;
  readonly source: CardInstanceV2;
  readonly definition: CardDefinitionV2;
  actor(): BattlePlayerStateV2;
  enemy(): BattlePlayerStateV2;
  replace(player: BattlePlayerStateV2): void;
  resolve(card: CardInstanceV2): CardDefinitionV2 | undefined;
  damage(amount: number, self?: boolean, ignoreBlock?: boolean): void;
  draw(amount: number): void;
  block(amount: number): void;
  heal(amount: number): void;
  energy(amount: number): void;
  move(
    id: string,
    from: 'hand' | 'discard' | 'drawPile',
    to: 'hand' | 'drawPile' | 'discard' | 'exhaust',
    index?: number,
  ): void;
  shuffle(): void;
  refill(): void;
  reveal(card: CardInstanceV2, index: number, publicCard?: boolean): void;
  copy(card: CardInstanceV2): CardInstanceV2 | undefined;
  request(ids: readonly string[], resolution: 'TOP_THREE' | 'ZERO_COST' | 'ARROW_SEARCH'): void;
  emit(type: string, data: Readonly<Record<string, unknown>>): void;
  alive(): boolean;
}
export const pool = (player: BattlePlayerStateV2): PoolState =>
  player.pool ?? { values: {}, arrowQueue: [], modifiers: {} };
export const value = (player: BattlePlayerStateV2, key: string): number =>
  pool(player).values[key] ?? 0;
export function setValue(
  ctx: PoolContext,
  player: BattlePlayerStateV2,
  key: string,
  amount: number,
): void {
  if (value(player, key) === amount) return;
  ctx.replace({
    ...player,
    pool: { ...pool(player), values: { ...pool(player).values, [key]: amount } },
  });
  ctx.emit('POOL_STATUS_CHANGED', {
    playerId: player.id,
    key,
    amount,
    sourceDefinitionId: ctx.source.definitionId,
  });
}
function add(ctx: PoolContext, key: string, amount = 1): void {
  setValue(ctx, ctx.actor(), key, value(ctx.actor(), key) + amount);
}
function tag(ctx: PoolContext, card: CardInstanceV2, keyword: string): boolean {
  return ctx.resolve(card)?.keywords?.includes(keyword) === true;
}
export function poolChoiceRange(
  id: string,
):
  | { min: number; max: number; zone: 'hand' | 'discard'; arrow?: boolean; loaded?: boolean }
  | undefined {
  if (id === 'hunter_001') return { min: 0, max: 1, zone: 'hand', arrow: true };
  if (id === 'hunter_009') return { min: 0, max: 3, zone: 'hand', arrow: true };
  if (id === 'hunter_008') return { min: 1, max: 1, zone: 'hand', loaded: true };
  if (id === 'trickster_008') return { min: 1, max: 1, zone: 'discard' };
  if (
    ['trickster_001', 'trickster_004', 'trickster_006', 'trickster_007', 'neutral_002'].includes(id)
  )
    return { min: 1, max: 1, zone: 'hand' };
  return undefined;
}
export function effectivePoolCost(
  player: BattlePlayerStateV2,
  card: CardInstanceV2,
  definition: CardDefinitionV2,
): number {
  const fixed = pool(player).modifiers[card.id]?.fixedCost;
  if (fixed !== undefined) return Math.max(0, fixed);
  return Math.max(
    0,
    definition.cost +
      card.costModifier +
      value(player, 'freezeCost') +
      (value(player, 'timeTheftUses') > 0 ? value(player, 'timeTheftCost') : 0) -
      (value(player, 'tailwind') > 0 ? 1 : 0),
  );
}
export function beforePoolCard(ctx: PoolContext): void {
  const enemy = ctx.enemy();
  const attack =
    ctx.definition.type === 'ATTACK' ||
    ctx.definition.effects.some((effect) => effect.type === 'DAMAGE' && effect.target === 'ENEMY');
  if (attack && value(enemy, 'trap') > 0) {
    setValue(ctx, enemy, 'trap', 0);
    ctx.damage(6, true);
    if (ctx.alive()) setValue(ctx, ctx.actor(), 'trapPenalty', 3);
  }
  setValue(ctx, ctx.actor(), 'firstHit', 1);
  setValue(
    ctx,
    ctx.actor(),
    'swordBonus',
    ctx.definition.keywords?.includes('sword') ? value(ctx.actor(), 'nextSword') : 0,
  );
  if (ctx.definition.keywords?.includes('sword')) setValue(ctx, ctx.actor(), 'nextSword', 0);
  if (value(ctx.actor(), 'freezeCost') > 0) setValue(ctx, ctx.actor(), 'freezeCost', 0);
  if (value(ctx.actor(), 'timeTheftUses') > 0)
    setValue(ctx, ctx.actor(), 'timeTheftUses', value(ctx.actor(), 'timeTheftUses') - 1);
  if (value(ctx.actor(), 'tailwind') > 0) setValue(ctx, ctx.actor(), 'tailwind', 0);
  if (attack) {
    setValue(ctx, ctx.actor(), 'nullifyAttack', value(ctx.enemy(), 'preventAttack') > 0 ? 1 : 0);
    if (value(ctx.enemy(), 'preventAttack') > 0)
      setValue(ctx, ctx.enemy(), 'preventAttack', value(ctx.enemy(), 'preventAttack') - 1);
    setValue(ctx, ctx.actor(), 'attackPenalty', value(ctx.actor(), 'attackReduction'));
    setValue(ctx, ctx.actor(), 'attackReduction', 0);
    setValue(ctx, ctx.enemy(), 'hitVulnerability', value(ctx.enemy(), 'vulnerability'));
    setValue(ctx, ctx.enemy(), 'vulnerability', 0);
  }
}
export function afterPoolCard(ctx: PoolContext): void {
  if (!ctx.alive()) return;
  if (ctx.definition.keywords?.includes('sword')) {
    add(ctx, 'swordsThisTurn');
    if (value(ctx.actor(), 'swordLesson')) ctx.block(value(ctx.actor(), 'swordLesson'));
  }
  if (ctx.definition.keywords?.includes('magic')) {
    if (value(ctx.actor(), 'whiteBook') && !value(ctx.actor(), 'whiteUsed')) {
      ctx.heal(2 * value(ctx.actor(), 'whiteBook'));
      setValue(ctx, ctx.actor(), 'whiteUsed', 1);
    }
    if (value(ctx.actor(), 'blueBook') && !value(ctx.actor(), 'blueUsed')) {
      ctx.draw(value(ctx.actor(), 'blueBook'));
      setValue(ctx, ctx.actor(), 'blueUsed', 1);
    }
    if (value(ctx.actor(), 'chainBook'))
      add(ctx, 'nextChantShortening', value(ctx.actor(), 'chainBook'));
  }
  setValue(ctx, ctx.actor(), 'attackPenalty', 0);
  setValue(ctx, ctx.actor(), 'trapPenalty', 0);
  setValue(ctx, ctx.actor(), 'nullifyAttack', 0);
  setValue(ctx, ctx.actor(), 'swordBonus', 0);
  setValue(ctx, ctx.actor(), 'magicBonus', 0);
  setValue(ctx, ctx.enemy(), 'hitVulnerability', 0);
}
export function endPoolTurn(ctx: PoolContext): void {
  if (value(ctx.actor(), 'tailwind')) {
    ctx.draw(1);
    setValue(ctx, ctx.actor(), 'tailwind', 0);
  }
  if (value(ctx.actor(), 'plannedDraw')) ctx.damage(2, true);
  if (!ctx.alive()) return;
  const loss = value(ctx.actor(), 'endBlockLoss');
  if (loss) ctx.replace({ ...ctx.actor(), block: Math.max(0, ctx.actor().block - loss) });
  if (value(ctx.actor(), 'fortress') && ctx.actor().block > 0)
    ctx.draw(value(ctx.actor(), 'fortress'));
  for (const [id, mod] of Object.entries(pool(ctx.actor()).modifiers)) {
    if (mod.temporaryCopy) {
      const zone = (['hand', 'discard', 'drawPile'] as const).find((zone) =>
        ctx.actor()[zone].some((card) => card.id === id),
      );
      if (zone) ctx.move(id, zone, 'exhaust');
    } else if (
      mod.returnTop &&
      ctx.actor().hand.some((card) => card.id === id) &&
      !pool(ctx.actor()).arrowQueue.includes(id)
    )
      ctx.move(id, 'hand', 'drawPile', 0);
  }
  const actor = ctx.actor();
  for (const [id, mod] of Object.entries(pool(actor).modifiers))
    if (mod.expires)
      ctx.emit('CARD_COST_MODIFIER_EXPIRED', {
        playerId: actor.id,
        cardInstanceId: id,
        visibility: 'ownerOnly',
      });
  ctx.replace({
    ...actor,
    pool: {
      ...pool(actor),
      modifiers: Object.fromEntries(
        Object.entries(pool(actor).modifiers).map(([id, mod]) => {
          const { returnTop, temporaryCopy, ...remaining } = mod;
          void returnTop;
          void temporaryCopy;
          return [
            id,
            mod.expires ? (mod.damage === undefined ? {} : { damage: mod.damage }) : remaining,
          ];
        }),
      ),
    },
  });
  for (const key of [
    'swordsThisTurn',
    'firstHit',
    'whiteUsed',
    'blueUsed',
    'coreUsed',
    'plannedDraw',
    'endBlockLoss',
    'freezeCost',
  ])
    setValue(ctx, ctx.actor(), key, 0);
  setValue(ctx, ctx.enemy(), 'immortal', 0);
  setValue(ctx, ctx.enemy(), 'preventAttack', 0);
}
export function startPoolTurn(ctx: PoolContext): void {
  if (value(ctx.actor(), 'poison')) {
    ctx.damage(value(ctx.actor(), 'poison'), true, true);
    if (ctx.alive())
      setValue(ctx, ctx.actor(), 'poison', Math.max(0, value(ctx.actor(), 'poison') - 1));
  }
  if (!ctx.alive()) return;
  const revenge =
    Math.floor(value(ctx.actor(), 'revengeBlocked') / 2) * value(ctx.actor(), 'revenge');
  if (revenge) ctx.damage(revenge);
  setValue(ctx, ctx.actor(), 'revengeBlocked', 0);
  setValue(ctx, ctx.actor(), 'revenge', 0);
  if (!ctx.alive()) return;
  if (value(ctx.actor(), 'noticeDamage')) {
    ctx.damage(value(ctx.actor(), 'noticeDamage'), true);
    setValue(ctx, ctx.actor(), 'noticeDamage', 0);
  }
  if (!ctx.alive()) return;
  const loss = value(ctx.actor(), 'startBlockLoss');
  if (loss) ctx.replace({ ...ctx.actor(), block: Math.max(0, ctx.actor().block - loss) });
  const draw = value(ctx.actor(), 'startDraw'),
    block = value(ctx.actor(), 'startBlock');
  if (draw) ctx.draw(draw);
  if (block) ctx.block(block);
  for (const key of ['startBlockLoss', 'startDraw', 'startBlock'])
    setValue(ctx, ctx.actor(), key, 0);
}
export function resolvePoolCard(ctx: PoolContext, id: string): void {
  const selected =
    ctx.action.choices?.find((choice) => choice.kind === 'CARD_INSTANCES')?.cardInstanceIds ?? [];
  const first = selected[0];
  const hits = (amount: number, count = 1, ignore = false) => {
    for (let hit = 0; hit < count && ctx.alive(); hit++) ctx.damage(amount, false, ignore);
  };
  const load = () => {
    for (const cardId of selected) {
      const actor = ctx.actor(),
        card = actor.hand.find((entry) => entry.id === cardId)!;
      const cost = effectivePoolCost(actor, card, ctx.resolve(card)!);
      if (actor.energy < cost) continue;
      const before = pool(actor).arrowQueue;
      ctx.replace({
        ...actor,
        energy: actor.energy - cost,
        pool: { ...pool(actor), arrowQueue: [...before, cardId] },
      });
      ctx.emit('ARROW_LOADED', {
        ownerPlayerId: actor.id,
        cardInstanceId: cardId,
        before,
        after: [...before, cardId],
        visibility: 'ownerOnly',
      });
    }
  };
  const arrowEffect = (card: CardInstanceV2, penalty = 0) => {
    const bonus = pool(ctx.actor()).modifiers[card.id]?.damage ?? 0;
    switch (card.definitionId) {
      case 'hunter_003':
        hits(Math.max(0, 4 + bonus - penalty));
        if (ctx.alive()) setValue(ctx, ctx.enemy(), 'poison', value(ctx.enemy(), 'poison') + 2);
        break;
      case 'hunter_005':
        hits(Math.max(0, 6 + bonus - penalty), 1, true);
        break;
      case 'hunter_006':
        hits(Math.max(0, 3 + bonus - penalty));
        if (ctx.alive())
          setValue(ctx, ctx.enemy(), 'vulnerability', value(ctx.enemy(), 'vulnerability') + 4);
        break;
      case 'hunter_011':
        hits(Math.max(0, 10 + bonus - penalty));
        break;
    }
  };
  const fired: CardInstanceV2[] = [];
  const fire = (penalty = 0): void => {
    const actor = ctx.actor(),
      cardId = pool(actor).arrowQueue[0];
    if (!cardId || !ctx.alive()) return;
    const card = actor.hand.find((entry) => entry.id === cardId)!;
    ctx.emit('ARROW_FIRED', {
      ownerPlayerId: actor.id,
      cardInstanceId: card.id,
      definitionId: card.definitionId,
      definitionVersion: card.definitionVersion,
      visibility: 'allPlayers',
    });
    fired.push(card);
    arrowEffect(card, penalty);
    const current = ctx.actor(),
      before = pool(current).arrowQueue;
    ctx.replace({
      ...current,
      pool: { ...pool(current), arrowQueue: before.filter((entry) => entry !== card.id) },
    });
    ctx.emit('ARROW_REMOVED', {
      ownerPlayerId: current.id,
      cardInstanceId: card.id,
      before,
      after: pool(ctx.actor()).arrowQueue,
      visibility: 'ownerOnly',
    });
    ctx.move(card.id, 'hand', 'discard');
    if (
      ctx.alive() &&
      card.definitionId === 'hunter_011' &&
      pool(ctx.actor()).arrowQueue.length >= 3
    )
      fire();
  };
  switch (id) {
    case 'sword_001':
      hits(4 + (value(ctx.actor(), 'swordsThisTurn') === 0 ? 2 : 0));
      break;
    case 'sword_002':
      hits(3 + (ctx.actor().block > 0 ? 3 : 0));
      break;
    case 'sword_003':
      hits(6);
      add(ctx, 'endBlockLoss', 3);
      break;
    case 'sword_004':
      hits(4, 2);
      break;
    case 'sword_005':
      ctx.block(5);
      add(ctx, 'nextSword', 3);
      break;
    case 'sword_006':
      ctx.block(4);
      add(ctx, 'parry', 4);
      break;
    case 'sword_007':
      if (value(ctx.actor(), 'swordsThisTurn') > 0) add(ctx, 'swordForm', 2);
      break;
    case 'sword_008':
      ctx.draw(1);
      if (ctx.actor().hand.some((card) => tag(ctx, card, 'sword'))) ctx.energy(1);
      break;
    case 'sword_009':
      ctx.replace({ ...ctx.enemy(), block: Math.floor(ctx.enemy().block / 2) });
      hits(8);
      break;
    case 'sword_010': {
      const refund = value(ctx.actor(), 'swordsThisTurn') >= 2;
      hits(14);
      if (refund && ctx.alive()) ctx.energy(2);
      break;
    }
    case 'sword_011':
      add(ctx, 'swordLesson');
      break;
    case 'sword_012':
      for (const hit of [4, 3, 3]) {
        if (!ctx.alive()) break;
        ctx.replace({ ...ctx.enemy(), block: Math.max(0, ctx.enemy().block - 2) });
        hits(hit);
      }
      break;
    case 'guardian_001':
      ctx.block(6);
      break;
    case 'guardian_002':
      ctx.block(4);
      add(ctx, 'cover', 2);
      break;
    case 'guardian_003':
      ctx.block(3);
      ctx.draw(1);
      break;
    case 'guardian_004':
      hits(4 + Math.floor(ctx.actor().block / 3));
      break;
    case 'guardian_005':
      ctx.block(11);
      add(ctx, 'startBlockLoss', 4);
      break;
    case 'guardian_006':
      add(ctx, 'revenge');
      break;
    case 'guardian_007':
      add(ctx, 'blockLink');
      break;
    case 'guardian_008':
      ctx.block(15);
      add(ctx, 'startDraw');
      break;
    case 'guardian_009':
      if (ctx.actor().hp <= Math.floor(ctx.actor().maxHp / 2)) ctx.heal(8);
      else ctx.block(12);
      break;
    case 'guardian_010':
      add(ctx, 'fortress');
      break;
    case 'guardian_011':
      ctx.block(20);
      add(ctx, 'preventAttack');
      break;
    case 'guardian_012':
      setValue(ctx, ctx.actor(), 'immortal', 1);
      break;
    case 'mage_001':
      hits(5);
      break;
    case 'mage_002':
      hits(3);
      if (ctx.alive())
        setValue(ctx, ctx.enemy(), 'attackReduction', value(ctx.enemy(), 'attackReduction') + 2);
      break;
    case 'mage_003':
      ctx.energy(1);
      add(ctx, 'nextMagic', 2);
      break;
    case 'mage_007':
      hits(6);
      if (ctx.alive())
        setValue(ctx, ctx.enemy(), 'freezeCost', value(ctx.enemy(), 'freezeCost') + 1);
      break;
    case 'mage_008':
      add(ctx, 'chainBook');
      break;
    case 'mage_011':
      add(ctx, 'blackBook');
      break;
    case 'mage_012':
      add(ctx, 'whiteBook');
      break;
    case 'mage_013':
      add(ctx, 'redBook');
      break;
    case 'mage_014':
      add(ctx, 'blueBook');
      break;
    case 'alchemist_010':
      add(ctx, 'sageCatalyst');
      break;
    case 'alchemist_012':
      add(ctx, 'catalystCore');
      break;
    case 'hunter_001':
      ctx.block(3);
      load();
      break;
    case 'hunter_002':
      ctx.refill();
      {
        const cards = ctx.actor().drawPile.filter((card) => tag(ctx, card, 'arrow'));
        for (const card of cards) ctx.reveal(card, ctx.actor().drawPile.indexOf(card));
        if (cards.length)
          ctx.request(
            cards.map((card) => card.id),
            'ARROW_SEARCH',
          );
        else ctx.shuffle();
      }
      break;
    case 'hunter_003':
    case 'hunter_005':
    case 'hunter_006':
    case 'hunter_011':
      arrowEffect(ctx.source);
      break;
    case 'hunter_004':
      fire(1);
      if (ctx.alive()) fire(1);
      break;
    case 'hunter_007':
      add(ctx, 'trap');
      break;
    case 'hunter_008': {
      const actor = ctx.actor(),
        mod = pool(actor).modifiers[first!] ?? {};
      ctx.replace({
        ...actor,
        pool: {
          ...pool(actor),
          modifiers: {
            ...pool(actor).modifiers,
            [first!]: { ...mod, damage: (mod.damage ?? 0) + 2 },
          },
        },
      });
      break;
    }
    case 'hunter_009':
      ctx.block(3);
      load();
      break;
    case 'hunter_010':
      while (ctx.alive() && pool(ctx.actor()).arrowQueue.length) {
        const before = fired.length;
        fire();
        if (ctx.alive()) ctx.block((fired.length - before) * 2);
      }
      break;
    case 'hunter_012': {
      const snapshot = [...pool(ctx.actor()).arrowQueue];
      while (ctx.alive() && pool(ctx.actor()).arrowQueue.length) fire();
      for (const cardId of snapshot) {
        const card = fired.find((entry) => entry.id === cardId);
        if (!card || !ctx.alive()) continue;
        ctx.emit('ARROW_REPEATED', {
          ownerPlayerId: ctx.actor().id,
          cardInstanceId: cardId,
          definitionId: card.definitionId,
          definitionVersion: card.definitionVersion,
          repeatOrdinal: 1,
          visibility: 'allPlayers',
        });
        arrowEffect(card);
      }
      break;
    }
    case 'trickster_001':
      ctx.move(first!, 'hand', 'drawPile');
      ctx.draw(1);
      break;
    case 'trickster_002': {
      const before = new Set(ctx.actor().hand.map((card) => card.id));
      ctx.draw(1);
      const drawn = ctx.actor().hand.find((card) => !before.has(card.id));
      if (drawn && effectivePoolCost(ctx.actor(), drawn, ctx.resolve(drawn)!) <= 1) ctx.block(1);
      break;
    }
    case 'trickster_003':
      hits(3);
      if (ctx.alive())
        setValue(ctx, ctx.enemy(), 'attackReduction', value(ctx.enemy(), 'attackReduction') + 2);
      break;
    case 'trickster_004':
      ctx.move(first!, 'hand', 'discard');
      ctx.draw(2);
      break;
    case 'trickster_005':
      setValue(ctx, ctx.enemy(), 'noticeDamage', value(ctx.enemy(), 'noticeDamage') + 2);
      ctx.draw(1);
      break;
    case 'trickster_006':
      ctx.block(5);
      {
        const actor = ctx.actor();
        ctx.replace({
          ...actor,
          pool: {
            ...pool(actor),
            modifiers: {
              ...pool(actor).modifiers,
              [first!]: {
                ...pool(actor).modifiers[first!],
                returnTop: true,
              } as PoolState['modifiers'][string],
            },
          },
        });
      }
      break;
    case 'trickster_007': {
      const selectedCard = ctx.actor().hand.find((card) => card.id === first)!;
      const copy = ctx.copy(selectedCard);
      if (copy) {
        const actor = ctx.actor();
        ctx.replace({
          ...actor,
          pool: {
            ...pool(actor),
            modifiers: { ...pool(actor).modifiers, [copy.id]: { temporaryCopy: true } },
          },
        });
      }
      break;
    }
    case 'trickster_008':
      ctx.move(first!, 'discard', 'drawPile', 0);
      break;
    case 'trickster_009':
      hits(6);
      if (ctx.alive()) {
        setValue(ctx, ctx.enemy(), 'timeTheftUses', 2);
        setValue(ctx, ctx.enemy(), 'timeTheftCost', 1);
      }
      break;
    case 'trickster_010':
      ctx.draw(3);
      if (ctx.actor().hand.length)
        ctx.request(
          ctx.actor().hand.map((card) => card.id),
          'ZERO_COST',
        );
      break;
    case 'trickster_011':
      add(ctx, 'plannedDraw');
      break;
    case 'trickster_012': {
      const cards = [...ctx.actor().hand];
      for (const card of cards) ctx.move(card.id, 'hand', 'drawPile');
      ctx.shuffle();
      ctx.draw(cards.length);
      ctx.block(cards.length * 2);
      break;
    }
    case 'neutral_001':
      ctx.heal(4);
      break;
    case 'neutral_002':
      ctx.move(first!, 'hand', 'discard');
      ctx.draw(1);
      break;
    case 'neutral_003':
      ctx.block(5);
      break;
    case 'neutral_004':
      ctx.refill();
      {
        const cards = ctx.actor().drawPile.slice(0, 3);
        cards.forEach((card, index) => ctx.reveal(card, index));
        if (cards.length)
          ctx.request(
            cards.map((card) => card.id),
            'TOP_THREE',
          );
      }
      break;
    case 'neutral_005':
      ctx.heal(3);
      if (ctx.actor().hand.length <= 2) ctx.draw(1);
      break;
    case 'neutral_006':
      ctx.refill();
      {
        const card = ctx.actor().drawPile[0];
        if (card) {
          ctx.reveal(card, 0, true);
          ctx.block(Math.min(6, effectivePoolCost(ctx.actor(), card, ctx.resolve(card)!)));
        }
      }
      break;
    case 'neutral_007':
      ctx.heal(6);
      add(ctx, 'startBlock', 5);
      break;
    case 'neutral_008':
      add(ctx, 'tailwind');
      break;
    case 'neutral_009':
      if (ctx.actor().hp <= 10) {
        ctx.replace({ ...ctx.actor(), hp: 10 });
        hits(10);
      } else ctx.heal(8);
      break;
    default:
      throw new Error(`Unsupported pool rule: ${id}`);
  }
}
