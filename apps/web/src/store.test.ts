import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('useSessionStore', () => {
  it('uses in-memory storage when no browser window is available', async () => {
    vi.stubGlobal('window', undefined);

    const { useSessionStore } = await import('./store.js');

    useSessionStore.getState().enablePreview();

    expect(useSessionStore.getState()).toMatchObject({
      playerId: 'preview-player',
      previewMode: true,
    });
  });
});
