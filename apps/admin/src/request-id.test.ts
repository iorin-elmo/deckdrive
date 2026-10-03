import { describe, expect, it } from 'vitest';
import { clearPendingAdminRequestId, pendingAdminRequestId } from './request-id.js';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe('admin action request IDs', () => {
  it('reuses the ID after an uncertain result and changes it for a new operation', async () => {
    const storage = memoryStorage();
    const grant = { action: 'GRANT_CURRENCY', amount: 10, reason: 'Support' };
    const first = await pendingAdminRequestId(grant, storage);
    expect(await pendingAdminRequestId(grant, storage)).toBe(first);
    expect(await pendingAdminRequestId({ ...grant, amount: 20 }, storage)).not.toBe(first);
    clearPendingAdminRequestId(storage);
    expect(await pendingAdminRequestId(grant, storage)).not.toBe(first);
  });
});
