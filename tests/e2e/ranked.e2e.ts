import { expect, test, type Page } from '@playwright/test';

const season = {
  id: 'season-1',
  startsAt: '2026-09-01T00:00:00.000Z',
  endsAt: '2026-12-01T00:00:00.000Z',
};

async function signedIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'deckdrive-locale',
      JSON.stringify({ state: { locale: 'en' }, version: 0 }),
    );
    sessionStorage.setItem(
      'deckdrive-session',
      JSON.stringify({
        state: { playerId: 'player-1', previewMode: false },
        version: 0,
      }),
    );
  });
}

async function mockRankedApi(
  page: Page,
  options: {
    noSeason?: boolean;
    profileUnavailable?: () => boolean;
    queueMatched?: () => boolean;
    queueCancelled?: () => boolean;
    rankedPost?: () => void;
    queueRead?: () => void;
    rrGoal?: number;
  } = {},
) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/v1/auth/session')
      return json({ playerId: 'player-1', displayName: 'Player', csrfToken: 'token' });
    if (path === '/api/v1/me') return json({ id: 'player-1', displayName: 'Player', balances: {} });
    if (path === '/api/v1/decks')
      return json({ decks: [{ id: 'deck-1', name: 'Ready deck', cards: [{ quantity: 30 }] }] });
    if (path === '/api/v1/ranked/profile') {
      if (options.profileUnavailable?.()) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
      return json(
        options.noSeason
          ? { season: null, rating: null, rank: null, rr: null, rrGoal: 100 }
          : {
              season,
              rating: 1500,
              rank: { name: 'GOLD', division: 'III' },
              rr: 25,
              rrGoal: options.rrGoal ?? 100,
              completedGames: 3,
            },
      );
    }
    if (path === '/api/v1/ranked/history')
      return json({
        items: options.noSeason
          ? []
          : [
              {
                id: 'entry-1',
                matchId: 'match-1',
                seasonId: 'season-1',
                outcome: 'WIN',
                ratingBefore: 1480,
                ratingAfter: 1500,
                delta: 20,
                createdAt: '2026-09-20T00:00:00.000Z',
              },
            ],
        nextCursor: null,
      });
    if (path === '/api/v1/matches/ranked' && route.request().method() === 'POST') {
      options.rankedPost?.();
      return json({ status: 'QUEUED', queueId: 'queue-1' }, 202);
    }
    if (path === '/api/v1/matches/ranked/queue/queue-1' && route.request().method() === 'DELETE')
      return json({ status: 'CANCELLED', queueId: 'queue-1' });
    if (path === '/api/v1/matches/ranked/queue/queue-1') {
      options.queueRead?.();
      return json(
        options.queueCancelled?.()
          ? { status: 'CANCELLED', queueId: 'queue-1' }
          : options.queueMatched?.()
            ? { status: 'MATCHED', queueId: 'queue-1', matchId: 'match-1' }
            : { status: 'WAITING', queueId: 'queue-1' },
      );
    }
    return json({ error: 'NOT_FOUND' }, 404);
  });
}

test('shows rank and history, restores a queued match after reload, and opens the arena', async ({
  page,
}) => {
  let matched = false;
  await signedIn(page);
  await mockRankedApi(page, { queueMatched: () => matched, rrGoal: 80 });
  await page.goto('/ranked');

  await expect(page.getByRole('heading', { name: 'Rank and season' })).toBeVisible();
  await expect(page.getByText('Gold III')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Rank Rating: 25 / 80' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View match result' })).toHaveAttribute(
    'href',
    '/result/match-1',
  );
  await page.getByRole('button', { name: 'Find ranked opponent' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Waiting for an opponent' }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('deckdrive:ranked:queue:player-1')))
    .toBe(JSON.stringify({ queueId: 'queue-1', deckId: 'deck-1' }));

  matched = true;
  await page.reload();
  await expect(page).toHaveURL(/\/battle\/pvp\/match-1$/);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('deckdrive:ranked:queue:player-1')))
    .toBeNull();
});

test('refreshes a waiting search and can cancel it', async ({ page }) => {
  let posts = 0;
  let queueReads = 0;
  await page.clock.install();
  await signedIn(page);
  await mockRankedApi(page, {
    rankedPost: () => {
      posts += 1;
    },
    queueRead: () => {
      queueReads += 1;
    },
  });
  await page.goto('/ranked');
  await page.getByRole('button', { name: 'Find ranked opponent' }).click();
  await expect.poll(() => posts).toBe(1);
  await expect(page.getByRole('button', { name: 'Cancel matchmaking' })).toBeVisible();
  await expect.poll(() => queueReads).toBeGreaterThan(0);

  await page.clock.runFor(30_100);
  await expect.poll(() => posts).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: 'Cancel matchmaking' }).click();
  await expect(page.getByText('Matchmaking was cancelled.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find ranked opponent' })).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('deckdrive:ranked:queue:player-1')))
    .toBeNull();
});

test('shows empty season and history on mobile and exposes keyboard navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signedIn(page);
  await mockRankedApi(page, { noSeason: true });
  await page.goto('/ranked');

  await expect(page.getByText('No active season')).toBeVisible();
  await expect(page.getByText('No ranked results yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find ranked opponent' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const menu = page.getByRole('button', { name: 'Open navigation' });
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(
    page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'Ranked' }),
  ).toBeVisible();
});

test('recovers from a profile error through the visible retry action', async ({ page }) => {
  let unavailable = true;
  await signedIn(page);
  await mockRankedApi(page, { profileUnavailable: () => unavailable });
  await page.goto('/ranked');

  await expect(page.getByText('Ranked status could not be loaded.')).toBeVisible({
    timeout: 20_000,
  });
  unavailable = false;
  await page.getByRole('button', { name: 'Try again' }).first().click();
  await expect(page.getByText('Gold III')).toBeVisible();
});
