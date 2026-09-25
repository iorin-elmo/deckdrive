export const sessionCookieName = 'deckdrive_session';
export const csrfCookieName = 'deckdrive_csrf';
export const oauthStateCookieName = 'deckdrive_oauth';

export interface CookieOptions {
  readonly httpOnly?: boolean;
  readonly secure?: boolean;
  readonly sameSite?: 'Lax' | 'Strict';
  readonly maxAge?: number;
  readonly path?: string;
}

export function parseCookies(value: string | undefined): Readonly<Record<string, string>> {
  if (value === undefined || value.length === 0) return {};
  return Object.fromEntries(
    value.split(';').flatMap((part) => {
      const separator = part.indexOf('=');
      if (separator < 1) return [];
      const name = part.slice(0, separator).trim();
      try {
        return [[name, decodeURIComponent(part.slice(separator + 1).trim())]];
      } catch {
        return [];
      }
    }),
  );
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const attributes = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? '/'}`];
  if (options.maxAge !== undefined)
    attributes.push(`Max-Age=${String(Math.max(0, options.maxAge))}`);
  if (options.httpOnly) attributes.push('HttpOnly');
  if (options.secure) attributes.push('Secure');
  if (options.sameSite !== undefined) attributes.push(`SameSite=${options.sameSite}`);
  return attributes.join('; ');
}
