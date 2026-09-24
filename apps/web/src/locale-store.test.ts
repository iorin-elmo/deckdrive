import { describe, expect, it } from 'vitest';

import { useLocaleStore } from './locale-store.js';

describe('useLocaleStore', () => {
  it('defaults to Japanese and allows switching to English', () => {
    expect(useLocaleStore.getState().locale).toBe('ja');

    useLocaleStore.getState().setLocale('en');
    expect(useLocaleStore.getState().locale).toBe('en');

    useLocaleStore.setState({ locale: 'ja' });
  });
});
