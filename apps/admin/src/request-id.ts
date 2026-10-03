const storageKey = 'deckdrive-admin-pending-request';

type Pending = { hash: string; requestId: string };
type RequestStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Reuse the same id after a response is lost, including after a page reload. */
export async function pendingAdminRequestId(
  payload: unknown,
  storage: RequestStorage = sessionStorage,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  let stored: Pending | null = null;
  try {
    stored = JSON.parse(storage.getItem(storageKey) || 'null') as Pending | null;
  } catch {
    /* A damaged tab value must not prevent an operation. */
  }
  const requestId =
    stored?.hash === hash && typeof stored.requestId === 'string'
      ? stored.requestId
      : crypto.randomUUID();
  storage.setItem(storageKey, JSON.stringify({ hash, requestId }));
  return requestId;
}

export function clearPendingAdminRequestId(storage: RequestStorage = sessionStorage): void {
  storage.removeItem(storageKey);
}
