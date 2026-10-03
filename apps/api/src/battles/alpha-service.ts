import { randomBytes } from 'node:crypto';
import { allCardDefinitions } from '@deck-drive/card-definitions';
import {
  applyBattleInputV2,
  calculateResultV2,
  calculateDraftDefinitionRevision,
  createInitialBattleStateV2,
  isGameActionV2,
  legalActionsV2,
  playChoiceOptionsV2,
  projectBattleStateV2,
  projectReplayV2,
  recordReplayV2,
  SeededRandom,
  type BattleInput,
  type BattleStateV2,
  type CardDefinitionV2,
  type CardInstanceV2,
  type PlayerId,
  type MatchId,
  type CardInstanceId,
} from '@deck-drive/game-engine';
import type { AlphaBattle, Prisma, PrismaClient } from '../generated/prisma/client.js';
import { validateDeckCards } from '../decks/deck-validation.js';
import {
  createServerCommandAuthorizer,
  signDeadlineAuthorization,
  signTimeoutAttestation,
} from '../matches/server-command-auth.js';

type Tx = Prisma.TransactionClient;
const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export class AlphaBattleError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/** Durable HTTP transport for the complete pool. Row locks serialize actions and retries. */
export class AlphaBattleService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {}
  async active(playerId: string): Promise<unknown> {
    const row = await this.prisma.alphaBattle.findFirst({
      where: {
        AND: [
          {
            OR: [
              { status: 'IN_PROGRESS' },
              { status: 'WAITING', createdAt: { gte: new Date(this.now() - 600000) } },
            ],
          },
        ],
        OR: [{ hostId: playerId }, { guestId: playerId }],
      },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.read(playerId, row.id) : null;
  }
  async replay(playerId: string, id: string): Promise<unknown> {
    const row = await this.prisma.alphaBattle.findUnique({ where: { id } });
    if (!row || (row.hostId !== playerId && row.guestId !== playerId) || !row.initialState)
      throw new AlphaBattleError(404, 'BATTLE_NOT_FOUND');
    const definitions = row.definitions as unknown as CardDefinitionV2[];
    const authorizer = createServerCommandAuthorizer(this.secret);
    const recorded = recordReplayV2(
      row.initialState as unknown as BattleStateV2,
      row.inputs as unknown as BattleInput[],
      definitions,
      {
        battleProtocolVersion: 2,
        draftDefinitionRevision: calculateDraftDefinitionRevision(definitions),
        authorizeServerCommand: authorizer,
      },
    );
    if (!recorded.ok) throw new AlphaBattleError(500, 'REPLAY_RECORDING_FAILED');
    return projectReplayV2(recorded.replay, () => definitions, authorizer, playerId as PlayerId);
  }
  async start(playerId: string, body: unknown): Promise<unknown> {
    const input = record(body),
      mode = input.mode;
    if (!['CPU', 'CASUAL', 'PRIVATE'].includes(String(mode)))
      throw new AlphaBattleError(400, 'INVALID_MODE');
    const deck = await this.deck(this.prisma, playerId, String(input.deckId));
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(33333004)`;
      await tx.alphaBattle.updateMany({
        where: { status: 'WAITING', createdAt: { lt: new Date(this.now() - 600000) } },
        data: { status: 'EXPIRED' },
      });
      const existing = await tx.alphaBattle.findFirst({
        where: {
          status: { in: ['WAITING', 'IN_PROGRESS'] },
          OR: [{ hostId: playerId }, { guestId: playerId }],
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return this.view(existing, playerId);
      if (mode === 'CASUAL') {
        const waiting = await tx.alphaBattle.findFirst({
          where: {
            status: 'WAITING',
            mode: 'CASUAL',
            hostId: { not: playerId },
            createdAt: { gte: new Date(this.now() - 600000) },
          },
          orderBy: { createdAt: 'asc' },
        });
        if (waiting) return this.begin(tx, waiting, playerId, deck);
      }
      const row = await tx.alphaBattle.create({
        data: {
          hostId: playerId,
          mode: String(mode),
          decks: json([deck]),
          definitions: json(allCardDefinitions),
          ...(mode === 'PRIVATE'
            ? { inviteCode: randomBytes(6).toString('hex').toUpperCase() }
            : {}),
        },
      });
      return mode === 'CPU'
        ? this.begin(tx, row, undefined, this.cpuDeck(String(input.cpuClass ?? 'SWORD')))
        : this.view(row, playerId);
    });
  }
  async join(playerId: string, code: string, body: unknown): Promise<unknown> {
    const deck = await this.deck(this.prisma, playerId, String(record(body).deckId));
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(33333004)`;
      const row = await tx.alphaBattle.findUnique({ where: { inviteCode: code.toUpperCase() } });
      if (!row || row.mode !== 'PRIVATE') throw new AlphaBattleError(404, 'ROOM_NOT_FOUND');
      if (row.hostId === playerId || row.guestId === playerId) return this.view(row, playerId);
      if (row.status !== 'WAITING' || this.now() - row.createdAt.getTime() > 600000)
        throw new AlphaBattleError(409, 'ROOM_UNAVAILABLE');
      const existing = await tx.alphaBattle.findFirst({
        where: {
          status: { in: ['WAITING', 'IN_PROGRESS'] },
          OR: [{ hostId: playerId }, { guestId: playerId }],
        },
      });
      if (existing) throw new AlphaBattleError(409, 'ALREADY_IN_BATTLE');
      return this.begin(tx, row, playerId, deck);
    });
  }
  async read(playerId: string, id: string): Promise<unknown> {
    return this.change(playerId, id, undefined);
  }
  async action(playerId: string, id: string, body: unknown): Promise<unknown> {
    return this.change(playerId, id, record(body));
  }
  async cancel(playerId: string, id: string): Promise<unknown> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(33333004)`;
      await tx.$queryRaw`SELECT id FROM alpha_battles WHERE id = ${id}::uuid FOR UPDATE`;
      const row = await tx.alphaBattle.findUnique({ where: { id } });
      if (!row || row.hostId !== playerId) throw new AlphaBattleError(404, 'BATTLE_NOT_FOUND');
      if (row.status !== 'WAITING') throw new AlphaBattleError(409, 'BATTLE_ALREADY_STARTED');
      return this.view(
        await tx.alphaBattle.update({ where: { id }, data: { status: 'CANCELLED' } }),
        playerId,
      );
    });
  }
  private async change(
    playerId: string,
    id: string,
    request: Record<string, unknown> | undefined,
  ): Promise<unknown> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM alpha_battles WHERE id = ${id}::uuid FOR UPDATE`;
        const row = await tx.alphaBattle.findUnique({ where: { id } });
        if (!row || (row.hostId !== playerId && row.guestId !== playerId))
          throw new AlphaBattleError(404, 'BATTLE_NOT_FOUND');
        if (!row.state) {
          if (row.status === 'WAITING' && row.createdAt.getTime() + 600000 <= this.now())
            return this.view(
              await tx.alphaBattle.update({ where: { id }, data: { status: 'EXPIRED' } }),
              playerId,
            );
          return this.view(row, playerId);
        }
        let state = row.state as unknown as BattleStateV2;
        const defs = row.definitions as unknown as CardDefinitionV2[];
        const inputs = row.inputs as unknown as BattleInput[];
        const receipts = row.receipts as Record<string, { action: unknown; sequence: number }>;
        const apply = (input: BattleInput): void => {
          const result = applyBattleInputV2(
            state,
            input,
            defs,
            createServerCommandAuthorizer(this.secret),
          );
          if (!result.ok) throw new AlphaBattleError(409, result.error.code);
          state = result.state;
          inputs.push(input);
        };
        let choiceExpired = false;
        const pending = state.pendingCardChoice;
        if (pending?.deadlineCommandSequence !== undefined) {
          const issued = inputs.find(
            (input) => input.inputSequence === pending.deadlineCommandSequence,
          );
          if (
            issued?.kind !== 'SERVER_COMMAND' ||
            issued.payload.type !== 'CARD_CHOICE_DEADLINE_ISSUED'
          )
            throw new AlphaBattleError(500, 'DEADLINE_JOURNAL_MISSING');
          if (this.now() >= issued.payload.deadlineAt) {
            choiceExpired = true;
            const command = {
              type: 'CARD_CHOICE_TIMEOUT' as const,
              playerId: pending.ownerPlayerId,
              choiceRequestId: pending.choiceRequestId,
              deadlineCommandSequence: pending.deadlineCommandSequence,
              deadlineAt: issued.payload.deadlineAt,
              timeoutAt: this.now(),
              timeoutAuthorization: issued.payload.timeoutAuthorization,
            };
            apply({
              kind: 'SERVER_COMMAND',
              inputSequence: state.lastInputSequence + 1,
              payload: {
                ...command,
                timeoutAttestation: signTimeoutAttestation(
                  state,
                  state.lastInputSequence + 1,
                  command,
                  this.secret,
                ),
              },
            });
          }
        }
        if (request && !choiceExpired) {
          if (
            typeof request.requestId !== 'string' ||
            !/^[a-zA-Z0-9:-]{1,100}$/u.test(request.requestId) ||
            !isGameActionV2(request.action) ||
            request.action.playerId !== playerId
          )
            throw new AlphaBattleError(400, 'INVALID_ACTION');
          const key = `${playerId}:${request.requestId}`,
            previous = receipts[key];
          if (previous) {
            if (JSON.stringify(previous.action) !== JSON.stringify(request.action))
              throw new AlphaBattleError(409, 'IDEMPOTENCY_CONFLICT');
            return this.view(row, playerId);
          }
          if (request.expectedSequence !== state.lastInputSequence)
            throw new AlphaBattleError(409, 'STALE_BATTLE');
          if (inputs.length >= 5000 && request.action.type !== 'FORFEIT')
            throw new AlphaBattleError(409, 'BATTLE_INPUT_LIMIT');
          apply({
            kind: 'CLIENT_ACTION',
            inputSequence: state.lastInputSequence + 1,
            payload: request.action,
          });
          receipts[key] = { action: request.action, sequence: state.lastInputSequence };
        }
        this.advance(defs, apply, () => state);
        if (state.lastInputSequence === (row.state as unknown as BattleStateV2).lastInputSequence)
          return this.view(row, playerId);
        const updated = await tx.alphaBattle.update({
          where: { id },
          data: {
            state: json(state),
            inputs: json(inputs),
            receipts: json(receipts),
            status: calculateResultV2(state).status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'COMPLETED',
          },
        });
        return this.view(updated, playerId);
      },
      { timeout: 30000 },
    );
  }
  private advance(
    definitions: readonly CardDefinitionV2[],
    apply: (input: BattleInput) => void,
    current: () => BattleStateV2,
  ): void {
    for (let step = 0; step < 100; step++) {
      const state = current(),
        pending = state.pendingCardChoice;
      if (calculateResultV2(state).status !== 'IN_PROGRESS') return;
      if (pending && pending.deadlineCommandSequence === undefined) {
        const issuedAt = this.now(),
          command = {
            type: 'CARD_CHOICE_DEADLINE_ISSUED' as const,
            playerId: pending.ownerPlayerId,
            choiceRequestId: pending.choiceRequestId,
            issuedAt,
            deadlineAt: issuedAt + 60000,
          };
        apply({
          kind: 'SERVER_COMMAND',
          inputSequence: state.lastInputSequence + 1,
          payload: {
            ...command,
            timeoutAuthorization: signDeadlineAuthorization(
              state,
              state.lastInputSequence + 1,
              command,
              this.secret,
            ),
          },
        });
        continue;
      }
      const acting = pending?.ownerPlayerId ?? state.activePlayerId;
      if (!acting.startsWith('cpu:')) return;
      const choices = legalActionsV2(state, definitions, acting);
      if (!choices.length) return;
      let best = choices[0]!,
        score = -Infinity;
      for (const action of choices) {
        const result = applyBattleInputV2(
          state,
          { kind: 'CLIENT_ACTION', inputSequence: state.lastInputSequence + 1, payload: action },
          definitions,
        );
        if (!result.ok) continue;
        const own = result.state.players.find((player) => player.id === acting)!,
          enemy = result.state.players.find((player) => player.id !== acting)!;
        const value =
          (calculateResultV2(result.state).status === 'WIN' &&
          result.state.terminalResult?.status === 'WIN' &&
          result.state.terminalResult.winnerId === acting
            ? 100000
            : 0) -
          enemy.hp * 10 +
          own.hp * 4 +
          own.block +
          own.energy +
          own.hand.length * 2 +
          own.alchemyStage * 20 +
          (action.type === 'END_TURN' ? -100 : 0);
        if (value > score) {
          score = value;
          best = action;
        }
      }
      apply({ kind: 'CLIENT_ACTION', inputSequence: state.lastInputSequence + 1, payload: best });
    }
  }
  private async begin(
    tx: Tx,
    row: AlphaBattle,
    guestId: string | undefined,
    guestDeck: readonly { cardId: string; version: string; quantity: number }[],
  ): Promise<unknown> {
    const decks = [...(row.decks as unknown as (typeof guestDeck)[]), guestDeck],
      ids = [row.hostId, guestId ?? `cpu:${row.id}`];
    const seed = randomBytes(16).toString('hex'),
      rng = new SeededRandom(seed);
    const players = decks.map((deck, seat) => {
      const cards: CardInstanceV2[] = deck.flatMap((entry, index) =>
        Array.from({ length: entry.quantity }, (_, copy) => ({
          id: `${seat}:${index}:${copy}` as CardInstanceId,
          definitionId: entry.cardId,
          definitionVersion: entry.version,
          costModifier: 0,
          visibility: 'ownerOnly' as const,
        })),
      );
      for (let index = cards.length - 1; index > 0; index--) {
        const next = Math.floor(rng.next() * (index + 1));
        [cards[index], cards[next]] = [cards[next]!, cards[index]!];
      }
      return { id: ids[seat]! as PlayerId, drawPile: cards };
    });
    const state = createInitialBattleStateV2({
      matchId: row.id as MatchId,
      engineVersion: '3.0.0',
      rulesVersion: '3.0.0',
      cardDataVersion: '1.0.0',
      seed,
      players,
      initialDrawCount: 5,
      turnDrawCount: 5,
    });
    const updated = await tx.alphaBattle.update({
      where: { id: row.id },
      data: {
        guestId: guestId ?? null,
        decks: json(decks),
        state: json(state),
        initialState: json(state),
        status: 'IN_PROGRESS',
      },
    });
    return this.view(updated, guestId ?? row.hostId);
  }
  private view(row: AlphaBattle, playerId: string): unknown {
    const state = row.state as unknown as BattleStateV2 | null,
      defs = row.definitions as unknown as CardDefinitionV2[];
    return {
      id: row.id,
      mode: row.mode,
      status: row.status,
      inviteCode: row.inviteCode,
      expiresAt: new Date(row.createdAt.getTime() + 600000).toISOString(),
      state: state ? projectBattleStateV2(state, playerId as PlayerId) : null,
      result: state ? calculateResultV2(state) : null,
      legalActions: state ? legalActionsV2(state, defs, playerId as PlayerId) : [],
      choiceOptions: state ? playChoiceOptionsV2(state, defs, playerId as PlayerId) : [],
    };
  }
  private async deck(tx: Pick<Tx, 'deck' | 'playerCard'>, playerId: string, id: string) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(id))
      throw new AlphaBattleError(400, 'INVALID_DECK_ID');
    const deck = await tx.deck.findFirst({
      where: { id, playerId },
      include: { cards: { orderBy: { position: 'asc' }, include: { cardVersion: true } } },
    });
    if (!deck) throw new AlphaBattleError(404, 'DECK_NOT_FOUND');
    const owned = await tx.playerCard.findMany({
      where: { playerId, cardVersionId: { in: deck.cards.map((card) => card.cardVersionId) } },
    });
    validateDeckCards(
      deck.cards.map((card) => ({
        ...card,
        ownedQuantity:
          owned.find((entry) => entry.cardVersionId === card.cardVersionId)?.quantity ?? 0,
        deckLimit: (card.cardVersion.definition as unknown as { deckLimit: number | null })
          .deckLimit,
      })),
    );
    for (const card of deck.cards)
      if (
        !allCardDefinitions.some(
          (def) => def.id === card.cardVersion.cardId && def.version === card.cardVersion.version,
        )
      )
        throw new AlphaBattleError(400, 'UNSUPPORTED_CARD');
    return deck.cards.map((card) => ({
      cardId: card.cardVersion.cardId,
      version: card.cardVersion.version,
      quantity: card.quantity,
    }));
  }
  private cpuDeck(className: string) {
    const chosen = allCardDefinitions.filter((card) => card.class === className).slice(0, 10);
    if (chosen.length < 10) throw new AlphaBattleError(400, 'INVALID_CPU_CLASS');
    return chosen.map((card) => ({ cardId: card.id, version: card.version, quantity: 3 }));
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AlphaBattleError(400, 'INVALID_REQUEST');
  return value as Record<string, unknown>;
}
