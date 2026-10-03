import { expect, test } from '@playwright/test';

test.use({ baseURL: 'http://127.0.0.1:4174' });

test('denies the management console to a non-admin session', async ({ page }) => {
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ displayName: 'Player', csrfToken: 'csrf' }),
    }),
  );
  await page.route('**/api/v1/admin/session', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'ADMIN_FORBIDDEN' }),
    }),
  );
  await page.goto('/');
  await expect(page.getByText('このDiscordアカウントには管理権限がありません。')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '管理メニュー' })).toHaveCount(0);
});

test('shows the owner console and reuses a grant ID after a lost response', async ({ page }) => {
  const requests: { requestId: string }[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/v1/auth/session') return json({ displayName: 'Owner', csrfToken: 'csrf' });
    if (path === '/api/v1/admin/session') return json({ role: 'OWNER' });
    if (path === '/api/v1/admin/players') return json({ items: [] });
    if (path === '/api/v1/admin/actions') {
      requests.push(JSON.parse(route.request().postData()!) as { requestId: string });
      if (requests.length === 1) return route.abort('failed');
      return json({ id: 'audit-1', before: { balance: 0 }, after: { balance: 10 } });
    }
    return json({ error: 'NOT_FOUND' }, 404);
  });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: '管理メニュー' })).toBeVisible();
  await page.getByRole('button', { name: '付与・シミュレーション' }).click();
  await page.getByLabel('プレイヤーID').fill('00000000-0000-0000-0000-000000000001');
  await page.getByLabel('数量').fill('10');
  await page.getByLabel('理由').fill('Support');
  await page.getByRole('button', { name: '実行して監査ログへ記録' }).click();
  await expect(page.getByRole('button', { name: '同じリクエストIDで再試行' })).toBeVisible();
  await page.getByRole('button', { name: '同じリクエストIDで再試行' }).click();
  await expect(page.getByText('操作を記録しました。')).toBeVisible();
  const ids = requests.map((request) => request.requestId);
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
});
