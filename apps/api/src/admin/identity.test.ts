import { describe, expect, it, vi } from 'vitest';

import { adminRoleForUser, discordOwnerId } from './identity.js';

describe('adminRoleForUser', () => {
  it('accepts only the configured Discord account', async () => {
    const findUnique = vi.fn().mockResolvedValue({ providerUserId: discordOwnerId });
    await expect(
      adminRoleForUser({ oAuthAccount: { findUnique } } as never, 'user-1'),
    ).resolves.toBe('OWNER');
    expect(findUnique).toHaveBeenCalledWith({
      where: { userId_provider: { userId: 'user-1', provider: 'DISCORD' } },
      select: { providerUserId: true },
    });
  });

  it.each([null, { providerUserId: 'another-discord-user' }])(
    'rejects users without that Discord identity',
    async (account) => {
      const findUnique = vi.fn().mockResolvedValue(account);
      await expect(
        adminRoleForUser({ oAuthAccount: { findUnique } } as never, 'user-2'),
      ).resolves.toBeNull();
    },
  );
});
