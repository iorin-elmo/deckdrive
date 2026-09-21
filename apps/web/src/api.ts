export interface CardDefinition {
  readonly id: string;
  readonly name: string;
  readonly class: string;
  readonly rarity: string;
  readonly cost: number;
  readonly type: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly deckLimit?: number | null;
}

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

export interface Player {
  readonly id: string;
  readonly displayName: string;
  readonly balances: Readonly<Record<string, number>>;
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
  readonly turn: number;
  readonly phase: string;
  readonly players: readonly BattlePlayer[];
}

export interface CpuMatch {
  readonly id: string;
  readonly difficulty: 'EASY' | 'NORMAL' | 'HARD' | 'EXPERT';
  readonly state: BattleState;
}

export interface DeckDriveClient {
  developmentLogin(email: string, displayName: string): Promise<{ playerId: string }>;
  me(playerId: string): Promise<Player>;
  cards(): Promise<readonly CardSummary[]>;
  collection(playerId: string): Promise<readonly OwnedCard[]>;
  decks(playerId: string): Promise<readonly Deck[]>;
  createDeck(playerId: string, input: DeckInput): Promise<Deck>;
  updateDeck(playerId: string, deckId: string, input: DeckInput): Promise<Deck>;
  startCpuMatch(
    playerId: string,
    deckId: string,
    difficulty: CpuMatch['difficulty'],
  ): Promise<CpuMatch>;
  match(playerId: string, matchId: string): Promise<MatchState>;
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

  async collection(playerId: string): Promise<readonly OwnedCard[]> {
    const response = await this.request<{ cards: readonly OwnedCard[] }>('/api/v1/collection', {
      playerId,
    });
    return response.cards;
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

  private async request<Result>(
    path: string,
    options: {
      readonly method?: 'GET' | 'POST' | 'PUT';
      readonly playerId?: string;
      readonly body?: unknown;
    } = {},
  ): Promise<Result> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          ...(options.playerId === undefined ? {} : { 'X-Deckdrive-Player-Id': options.playerId }),
          ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
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

function previewCard(
  cardId: string,
  name: string,
  cardClass: string,
  cost: number,
  type: string,
  description: string,
  keywords: readonly string[],
): CardSummary {
  return {
    cardId,
    version: '1.0.0',
    definition: {
      id: cardId,
      name,
      class: cardClass,
      rarity: 'BASIC',
      cost,
      type,
      description,
      keywords,
      deckLimit: 3,
    },
  };
}

const previewCards: readonly CardSummary[] = [
  previewCard('sword_strike', 'Strike', 'SWORD', 1, 'ATTACK', 'Deal 6 damage.', ['damage']),
  previewCard('guardian_guard', 'Guard', 'GUARDIAN', 1, 'SKILL', 'Gain 5 block.', ['block']),
  previewCard('neutral_insight', 'Insight', 'NEUTRAL', 1, 'SKILL', 'Draw 1 card.', ['draw']),
  previewCard('sword_lunge', 'Lunge', 'SWORD', 1, 'ATTACK', 'Deal 4 damage.', ['damage']),
  previewCard('sword_riposte', 'Riposte', 'SWORD', 1, 'ATTACK', 'Deal 5 damage.', ['damage']),
  previewCard('guardian_bulwark', 'Bulwark', 'GUARDIAN', 1, 'SKILL', 'Gain 7 block.', ['block']),
  previewCard('guardian_mend', 'Mend', 'GUARDIAN', 1, 'SKILL', 'Restore 3 health.', ['heal']),
  previewCard('neutral_focus', 'Focus', 'NEUTRAL', 0, 'SKILL', 'Draw 1 card.', ['draw']),
  previewCard('neutral_spark', 'Spark', 'NEUTRAL', 1, 'ATTACK', 'Deal 3 damage.', ['damage']),
  previewCard('neutral_recovery', 'Recovery', 'NEUTRAL', 1, 'SKILL', 'Restore 2 health.', ['heal']),
];

const previewDeck: Deck = {
  id: 'preview-starter-deck',
  name: 'Observatory starter',
  cardDataVersion: '1.0.0',
  cards: previewCards.map((card, position) => ({
    cardVersionId: `preview-${card.cardId}`,
    position,
    quantity: 3,
    cardVersion: card,
  })),
};

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
  async collection() {
    return previewCards.map((card) => ({
      cardVersionId: `preview-${card.cardId}`,
      quantity: 3,
      cardVersion: card,
    }));
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
};
