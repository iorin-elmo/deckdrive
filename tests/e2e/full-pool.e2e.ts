import { expect, test } from '@playwright/test';

test('starts a complete-pool CPU battle with the selected deck and restores it after reload', async ({
  page,
}) => {
  let started = false;
  const battle = {
    id: 'battle-pool',
    status: 'IN_PROGRESS',
    mode: 'CPU',
    inviteCode: null,
    state: {
      lastInputSequence: 0,
      turn: 1,
      activePlayerId: 'player-1',
      phase: 'PLAYER_TURN',
      players: ['player-1', 'cpu'].map((id) => ({
        id,
        hp: 30,
        maxHp: 30,
        energy: 3,
        block: 0,
        hand: [],
        discard: [],
        exhaust: [],
        synthesisCount: 0,
        alchemyStage: 0,
      })),
      chantQueue: [],
      events: [],
    },
    result: { status: 'IN_PROGRESS' },
    legalActions: [{ type: 'END_TURN', playerId: 'player-1' }],
  };
  await page.addInitScript(() =>
    sessionStorage.setItem(
      'deckdrive-session',
      JSON.stringify({ state: { playerId: 'player-1', previewMode: false }, version: 0 }),
    ),
  );
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/v1/auth/session') return json({ playerId: 'player-1', csrfToken: 'token' });
    if (path === '/api/v1/me')
      return json({ id: 'player-1', displayName: 'Pool tester', balances: {} });
    if (path === '/api/v1/cards') return json({ cards: [] });
    if (path === '/api/v1/decks')
      return json({ decks: [{ id: 'deck-1', name: 'Test deck', cards: [{ quantity: 30 }] }] });
    if (path === '/api/v1/alpha-battles' && route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toMatchObject({ mode: 'CPU', deckId: 'deck-1' });
      started = true;
      return json(battle);
    }
    if (path.endsWith('/actions')) {
      const body = route.request().postDataJSON();
      expect(body.action).toEqual({ type: 'END_TURN', playerId: 'player-1' });
      expect(body.requestId).toBeTruthy();
      expect(body.expectedSequence).toBe(0);
      battle.state.lastInputSequence = 2;
      battle.state.turn = 2;
      return json(battle);
    }
    if (path.startsWith('/api/v1/alpha-battles/')) return json(started ? battle : null);
    return json({});
  });
  await page.goto('/battle/cpu');
  await expect(page.getByRole('heading', { name: '全カードで対戦' })).toBeVisible();
  await page.getByRole('button', { name: 'CPU戦', exact: true }).click();
  await expect(page).toHaveURL(/battle\/test\/battle-pool/);
  await page.getByRole('button', { name: 'ターン終了', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'ターン終了', exact: true })).toBeEnabled();
});

test('shows exchange costs, copy limits and submits an idempotency key', async ({ page }) => {
  let exchanged = false;
  await page.addInitScript(() =>
    sessionStorage.setItem(
      'deckdrive-session',
      JSON.stringify({ state: { playerId: 'player-1', previewMode: false }, version: 0 }),
    ),
  );
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/v1/auth/session') return json({ playerId: 'player-1', csrfToken: 'token' });
    if (path === '/api/v1/me')
      return json({
        id: 'player-1',
        displayName: 'Pool tester',
        balances: { EXCHANGE_POINT: exchanged ? 75 : 100 },
      });
    if (path === '/api/v1/collection')
      return json({ cards: [{ cardVersionId: 'version-1', quantity: exchanged ? 3 : 2 }] });
    if (path === '/api/v1/card-exchange') {
      if (route.request().method() === 'POST') {
        expect(route.request().postDataJSON()).toEqual({ cardVersionId: 'version-1' });
        expect(route.request().headers()['idempotency-key']).toBeTruthy();
        exchanged = true;
        return json({});
      }
      return json({
        costs: { N: 25 },
        cards: [
          { id: 'version-1', cardId: 'sword_001', definition: { name: '試験カード', rarity: 'N' } },
        ],
      });
    }
    return json({});
  });
  await page.goto('/exchange');
  const button = page.getByRole('button', { name: '25ポイントで1枚交換' });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByText('N ／ 所持 3/3')).toBeVisible();
  await expect(button).toBeDisabled();
});
