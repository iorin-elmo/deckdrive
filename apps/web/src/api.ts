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

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export class DeckDriveApi {
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

  async match(
    playerId: string,
    matchId: string,
  ): Promise<{ id: string; status: string; finalState: BattleState | null }> {
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
