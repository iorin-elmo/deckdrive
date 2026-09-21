export interface CardDefinition {
  readonly id: string;
  readonly name: string;
  readonly class: string;
  readonly rarity: string;
  readonly cost: number;
  readonly type: string;
  readonly description: string;
  readonly keywords: readonly string[];
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
  decks(playerId: string): Promise<readonly Deck[]>;
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
  constructor(private readonly baseUrl = '') {}

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
      readonly method?: 'GET' | 'POST';
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

const previewCards: readonly CardSummary[] = [
  {
    cardId: 'sword_strike',
    version: '1.0.0',
    definition: {
      id: 'sword_strike',
      name: 'Strike',
      class: 'SWORD',
      rarity: 'BASIC',
      cost: 1,
      type: 'ATTACK',
      description: 'Deal 6 damage.',
      keywords: ['damage'],
    },
  },
  {
    cardId: 'guardian_guard',
    version: '1.0.0',
    definition: {
      id: 'guardian_guard',
      name: 'Guard',
      class: 'GUARDIAN',
      rarity: 'BASIC',
      cost: 1,
      type: 'SKILL',
      description: 'Gain 5 block.',
      keywords: ['block'],
    },
  },
  {
    cardId: 'neutral_insight',
    version: '1.0.0',
    definition: {
      id: 'neutral_insight',
      name: 'Insight',
      class: 'NEUTRAL',
      rarity: 'BASIC',
      cost: 1,
      type: 'SKILL',
      description: 'Draw 1 card.',
      keywords: ['draw'],
    },
  },
];

const previewDeck: Deck = {
  id: 'preview-starter-deck',
  name: 'Observatory starter',
  cardDataVersion: '1.0.0',
  cards: previewCards.map((card, position) => ({
    cardVersionId: `preview-${card.cardId}`,
    position,
    quantity: 10,
    cardVersion: card,
  })),
};

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
  async decks() {
    return [previewDeck];
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
