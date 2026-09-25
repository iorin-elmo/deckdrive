import {
  basicCardDefinitions,
  maximumCardCopies,
  packCardDefinitions,
  type CardDefinition,
} from '@deck-drive/card-definitions';
import { openPack, type PackCard } from '@deck-drive/pack-engine';

export interface CardSummary {
  readonly cardId: string;
  readonly version: string;
  readonly definition: CardDefinition;
}

export interface DeckCard {
  readonly cardVersionId: string;
  readonly position: number;
  readonly quantity: number;
  readonly cardVersion: CardSummary;
}

export interface Deck {
  readonly id: string;
  readonly name: string;
  readonly cardDataVersion: string;
  readonly cards: readonly DeckCard[];
}

export interface DeckCardInput {
  readonly cardVersionId: string;
  readonly quantity: number;
  readonly position: number;
}

export interface DeckInput {
  readonly name: string;
  readonly cardDataVersion: string;
  readonly cards: readonly DeckCardInput[];
}

export interface OwnedCard {
  readonly cardVersionId: string;
  readonly quantity: number;
  readonly cardVersion: CardSummary;
}

export interface Collection {
  readonly cardDataVersion: string;
  readonly cards: readonly OwnedCard[];
}

export interface Player {
  readonly id: string;
  readonly displayName: string;
  readonly balances: Readonly<Record<string, number>>;
}

export interface PackProduct {
  readonly id: 'NORMAL_PACK' | 'RARE_PACK' | 'BOX' | 'WEEKLY_BOX' | 'MONTHLY_BUNDLE';
  readonly gemCost: number;
  readonly limit: { readonly period: 'WEEK' | 'MONTH'; readonly maximum: number } | null;
}

export interface PackOpening {
  readonly openingId: string;
  readonly productId: PackProduct['id'];
  readonly gemCost: number;
  readonly cards: readonly { readonly id: string; readonly rarity: string }[];
  readonly exchangePoints: number;
}

export interface BattlePlayer {
  readonly id: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly energy: number;
  readonly maxEnergy: number;
  readonly block: number;
  readonly hand: readonly { readonly id: string; readonly definitionId: string }[];
  readonly statuses: readonly { readonly id: string; readonly stacks: number }[];
}

export interface BattleState {
  readonly matchId: string;
  readonly cardDataVersion: string;
  readonly turn: number;
  readonly phase: string;
  readonly players: readonly BattlePlayer[];
}

export interface CpuMatch {
  readonly id: string;
  readonly difficulty: 'EASY' | 'NORMAL' | 'HARD' | 'EXPERT';
  readonly state: BattleState;
}

export interface Mission {
  readonly id: string;
  readonly cadence: 'DAILY' | 'WEEKLY';
  readonly metric: string;
  readonly target: number;
  readonly progress: number;
  readonly claimedAt: string | null;
  readonly periodStart: string;
  readonly reward: { readonly currency: 'GEM' | 'EXCHANGE_POINT'; readonly amount: number };
}

export interface Progression {
  readonly experience: number;
  readonly level: number;
  readonly loginClaimedToday: boolean;
}

export interface Cosmetic {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly description: string;
  readonly acquiredAt: string | null;
}

export interface DeckDriveClient {
  developmentLogin(email: string, displayName: string): Promise<{ playerId: string }>;
  session(): Promise<{ playerId: string; displayName: string }>;
  logout(): Promise<void>;
  oauthStartUrl(provider: 'discord'): string;
  me(playerId: string): Promise<Player>;
  cards(): Promise<readonly CardSummary[]>;
  collection(playerId: string): Promise<Collection>;
  packs(playerId: string): Promise<readonly PackProduct[]>;
  openPack(
    playerId: string,
    productId: PackProduct['id'],
    idempotencyKey: string,
  ): Promise<PackOpening>;
  decks(playerId: string): Promise<readonly Deck[]>;
  createDeck(playerId: string, input: DeckInput): Promise<Deck>;
  updateDeck(playerId: string, deckId: string, input: DeckInput): Promise<Deck>;
  startCpuMatch(
    playerId: string,
    deckId: string,
    difficulty: CpuMatch['difficulty'],
  ): Promise<CpuMatch>;
  match(playerId: string, matchId: string): Promise<MatchState>;
  missions(playerId: string): Promise<readonly Mission[]>;
  claimMission(playerId: string, missionId: string): Promise<unknown>;
  progression(playerId: string): Promise<Progression>;
  claimLoginReward(playerId: string): Promise<unknown>;
  cosmetics(playerId: string): Promise<readonly Cosmetic[]>;
}

export interface MatchState {
  readonly id: string;
  readonly status: string;
  readonly initialState: BattleState;
  readonly finalState: BattleState | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export class DeckDriveApi implements DeckDriveClient {
  private readonly baseUrl: string;

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl.replace(/\/+$/u, '');
  }

  async developmentLogin(email: string, displayName: string): Promise<{ playerId: string }> {
    return this.request('/api/v1/auth/development', {
      method: 'POST',
      body: { email, displayName },
    });
  }

  async session(): Promise<{ playerId: string; displayName: string }> {
    return this.request('/api/v1/auth/session');
  }

  async logout(): Promise<void> {
    await this.request('/api/v1/auth/logout', { method: 'POST' });
  }

  oauthStartUrl(provider: 'discord'): string {
    return `${this.baseUrl}/api/v1/auth/oauth/${provider}/start`;
  }

  async me(playerId: string): Promise<Player> {
    return this.request('/api/v1/me', { playerId });
  }

  async cards(): Promise<readonly CardSummary[]> {
    const response = await this.request<{ cards: readonly CardSummary[] }>('/api/v1/cards');
    return response.cards;
  }

  async decks(playerId: string): Promise<readonly Deck[]> {
    const response = await this.request<{ decks: readonly Deck[] }>('/api/v1/decks', { playerId });
    return response.decks;
  }

  async collection(playerId: string): Promise<Collection> {
    return this.request<Collection>('/api/v1/collection', {
      playerId,
    });
  }

  async packs(playerId: string): Promise<readonly PackProduct[]> {
    const response = await this.request<{ products: readonly PackProduct[] }>('/api/v1/packs', {
      playerId,
    });
    return response.products;
  }

  async openPack(
    playerId: string,
    productId: PackProduct['id'],
    idempotencyKey: string,
  ): Promise<PackOpening> {
    return this.request(`/api/v1/packs/${encodeURIComponent(productId)}/open`, {
      method: 'POST',
      playerId,
      idempotencyKey,
    });
  }

  async createDeck(playerId: string, input: DeckInput): Promise<Deck> {
    return this.request('/api/v1/decks', { method: 'POST', playerId, body: input });
  }

  async updateDeck(playerId: string, deckId: string, input: DeckInput): Promise<Deck> {
    return this.request(`/api/v1/decks/${encodeURIComponent(deckId)}`, {
      method: 'PUT',
      playerId,
      body: input,
    });
  }

  async startCpuMatch(
    playerId: string,
    deckId: string,
    difficulty: CpuMatch['difficulty'],
  ): Promise<CpuMatch> {
    return this.request('/api/v1/matches', {
      method: 'POST',
      playerId,
      body: { deckId, difficulty },
    });
  }

  async match(playerId: string, matchId: string): Promise<MatchState> {
    return this.request(`/api/v1/matches/${encodeURIComponent(matchId)}`, { playerId });
  }

  async missions(playerId: string): Promise<readonly Mission[]> {
    const response = await this.request<{ missions: readonly Mission[] }>('/api/v1/missions', {
      playerId,
    });
    return response.missions;
  }

  async claimMission(playerId: string, missionId: string): Promise<unknown> {
    return this.request(`/api/v1/missions/${encodeURIComponent(missionId)}/claim`, {
      method: 'POST',
      playerId,
    });
  }

  async progression(playerId: string): Promise<Progression> {
    return this.request('/api/v1/progression', { playerId });
  }

  async claimLoginReward(playerId: string): Promise<unknown> {
    return this.request('/api/v1/login-rewards/claim', { method: 'POST', playerId });
  }

  async cosmetics(playerId: string): Promise<readonly Cosmetic[]> {
    const response = await this.request<{ cosmetics: readonly Cosmetic[] }>('/api/v1/cosmetics', {
      playerId,
    });
    return response.cosmetics;
  }

  private async request<Result>(
    path: string,
    options: {
      readonly method?: 'GET' | 'POST' | 'PUT';
      readonly playerId?: string;
      readonly body?: unknown;
      readonly idempotencyKey?: string;
    } = {},
  ): Promise<Result> {
    let response: Response;
    const csrf = csrfToken();
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          ...(options.playerId === undefined ? {} : { 'X-Deckdrive-Player-Id': options.playerId }),
          ...(options.idempotencyKey === undefined
            ? {}
            : { 'Idempotency-Key': options.idempotencyKey }),
          ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...((options.method === 'POST' || options.method === 'PUT') && csrf !== undefined
            ? { 'X-CSRF-Token': csrf }
            : {}),
        },
        credentials: 'include',
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch {
      throw new ApiError(0, 'API_UNAVAILABLE');
    }
    const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const code =
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof body.error === 'string'
          ? body.error
          : 'REQUEST_FAILED';
      throw new ApiError(response.status, code);
    }
    return body as Result;
  }
}

export const api = new DeckDriveApi(import.meta.env.VITE_API_URL ?? '');

function csrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const cookie = document.cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith('deckdrive_csrf='));
  if (cookie === undefined) return undefined;
  try {
    return decodeURIComponent(cookie.slice('deckdrive_csrf='.length));
  } catch {
    return undefined;
  }
}

const previewCards: readonly CardSummary[] = [...basicCardDefinitions, ...packCardDefinitions].map(
  (definition) => ({
    cardId: definition.id,
    version: definition.version,
    definition,
  }),
);

const previewDeckSize = 30;

function previewCopyLimit(card: CardSummary): number {
  return card.definition.deckLimit ?? maximumCardCopies;
}

function createPreviewDeckCards(cards: readonly CardSummary[]): readonly DeckCard[] {
  let remaining = previewDeckSize;
  const deckCards: DeckCard[] = [];
  for (const card of cards) {
    const quantity = Math.min(previewCopyLimit(card), remaining);
    if (quantity === 0) continue;
    deckCards.push({
      cardVersionId: `preview-${card.cardId}`,
      position: deckCards.length,
      quantity,
      cardVersion: card,
    });
    remaining -= quantity;
    if (remaining === 0) return deckCards;
  }
  throw new Error('The preview card catalog cannot create a legal 30-card deck.');
}

const previewDeck: Deck = {
  id: 'preview-starter-deck',
  name: 'Observatory starter',
  cardDataVersion: '1.0.0',
  cards: createPreviewDeckCards(previewCards),
};

const previewOwnedCards: readonly OwnedCard[] = previewCards.map((card) => ({
  cardVersionId: `preview-${card.cardId}`,
  quantity: previewCopyLimit(card),
  cardVersion: card,
}));

let savedPreviewDeck = previewDeck;

function previewDeckFromInput(id: string, input: DeckInput): Deck {
  const cardsByVersionId = new Map<string, CardSummary>(
    previewCards.map((card) => [`preview-${card.cardId}`, card] as const),
  );
  return {
    id,
    name: input.name,
    cardDataVersion: input.cardDataVersion,
    cards: input.cards.map((item) => {
      const cardVersion = cardsByVersionId.get(item.cardVersionId);
      if (cardVersion === undefined) throw new ApiError(400, 'INVALID_REQUEST');
      return { ...item, cardVersion };
    }),
  };
}

function previewBattle(matchId: string): BattleState {
  return {
    matchId,
    cardDataVersion: '1.0.0',
    turn: 1,
    phase: 'PLAYER_TURN',
    players: [
      {
        id: 'preview-player',
        hp: 30,
        maxHp: 30,
        energy: 3,
        maxEnergy: 3,
        block: 0,
        hand: previewCards.map((card, index) => ({
          id: `preview-hand-${String(index)}`,
          definitionId: card.definition.id,
        })),
        statuses: [],
      },
      {
        id: 'cpu-preview',
        hp: 30,
        maxHp: 30,
        energy: 3,
        maxEnergy: 3,
        block: 0,
        hand: [],
        statuses: [],
      },
    ],
  };
}

/** Explicit local-only fixture client for inspecting Phase 5 UI without a database. */
export const previewApi: DeckDriveClient = {
  async developmentLogin() {
    return { playerId: 'preview-player' };
  },
  async session() {
    return { playerId: 'preview-player', displayName: 'Offline preview' };
  },
  async logout() {},
  oauthStartUrl() {
    return '/api/v1/auth/oauth/discord/start';
  },
  async me() {
    return {
      id: 'preview-player',
      displayName: 'Offline preview',
      balances: { GEM: 120, EXCHANGE_POINT: 6 },
    };
  },
  async cards() {
    return previewCards;
  },
  async collection(): Promise<Collection> {
    return {
      cardDataVersion: '1.0.0',
      cards: previewOwnedCards,
    };
  },
  async packs() {
    return [
      { id: 'NORMAL_PACK', gemCost: 100, limit: null },
      { id: 'RARE_PACK', gemCost: 500, limit: null },
      { id: 'BOX', gemCost: 1000, limit: null },
      { id: 'WEEKLY_BOX', gemCost: 900, limit: { period: 'WEEK', maximum: 1 } },
      { id: 'MONTHLY_BUNDLE', gemCost: 1000, limit: { period: 'MONTH', maximum: 1 } },
    ];
  },
  async openPack(_playerId, productId) {
    const openingProducts =
      productId === 'MONTHLY_BUNDLE'
        ? (['BOX', 'RARE_PACK'] as const)
        : productId === 'WEEKLY_BOX'
          ? (['BOX'] as const)
          : ([productId] as const);
    const pool: readonly PackCard[] = packCardDefinitions.map((definition) => ({
      id: definition.id,
      rarity: definition.rarity as PackCard['rarity'],
    }));
    const cards = openingProducts.flatMap(
      (openingProduct, index) =>
        openPack(`preview-${productId}-${String(index)}`, { cards: pool }, openingProduct).cards,
    );
    return {
      openingId: 'preview-opening',
      productId,
      gemCost:
        productId === 'NORMAL_PACK'
          ? 100
          : productId === 'RARE_PACK'
            ? 500
            : productId === 'WEEKLY_BOX'
              ? 900
              : 1000,
      cards,
      exchangePoints: 0,
    };
  },
  async decks() {
    return [savedPreviewDeck];
  },
  async createDeck(_playerId, input) {
    savedPreviewDeck = previewDeckFromInput('preview-custom-deck', input);
    return savedPreviewDeck;
  },
  async updateDeck(_playerId, deckId, input) {
    savedPreviewDeck = previewDeckFromInput(deckId, input);
    return savedPreviewDeck;
  },
  async startCpuMatch(_playerId, _deckId, difficulty) {
    const id = 'preview-cpu-match';
    return { id, difficulty, state: previewBattle(id) };
  },
  async match(_playerId, matchId) {
    const state = previewBattle(matchId);
    return { id: matchId, status: 'IN_PROGRESS', initialState: state, finalState: null };
  },
  async missions() {
    return [
      {
        id: 'daily.cpu-battle',
        cadence: 'DAILY' as const,
        metric: 'CPU_BATTLE',
        target: 1,
        progress: 0,
        claimedAt: null,
        periodStart: new Date().toISOString(),
        reward: { currency: 'GEM' as const, amount: 20 },
      },
    ];
  },
  async claimMission() {
    return {};
  },
  async progression() {
    return { experience: 0, level: 1, loginClaimedToday: false };
  },
  async claimLoginReward() {
    return {};
  },
  async cosmetics() {
    return [];
  },
};
