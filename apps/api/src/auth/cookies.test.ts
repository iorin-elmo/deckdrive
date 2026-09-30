import { describe, expect, it } from 'vitest';

import { parseCookies, serializeCookie } from './cookies.js';

describe('auth cookies', () => {
  it('serializes server-session cookies with the required transport attributes', () => {
    expect(
      serializeCookie('deckdrive_session', 'opaque token', {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        maxAge: 60,
      }),
    ).toBe('deckdrive_session=opaque%20token; Path=/; Max-Age=60; HttpOnly; Secure; SameSite=Lax');
  });

  it('ignores malformed cookie fragments without rejecting valid cookies', () => {
    expect(parseCookies('deckdrive_session=token; malformed; deckdrive_csrf=value')).toEqual({
      deckdrive_session: 'token',
      deckdrive_csrf: 'value',
    });
  });
});
