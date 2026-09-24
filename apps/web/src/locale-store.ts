import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export type Locale = 'en' | 'ja';
const isLocale = (value: unknown): value is Locale => value === 'en' || value === 'ja';

interface LocaleState {
  readonly locale: Locale;
  setLocale: (locale: Locale) => void;
}

const memoryStorage = new Map<string, string>();
const fallbackStorage: StateStorage = {
  getItem: (name) => memoryStorage.get(name) ?? null,
  setItem: (name, value) => memoryStorage.set(name, value),
  removeItem: (name) => memoryStorage.delete(name),
};

function localeStorage(): StateStorage {
  if (typeof window === 'undefined') return fallbackStorage;
  try {
    return window.localStorage;
  } catch {
    return fallbackStorage;
  }
}

export const useLocaleStore = create<LocaleState>()(
  persist((set) => ({ locale: 'ja', setLocale: (locale) => set({ locale }) }), {
    name: 'deckdrive-locale',
    storage: createJSONStorage(localeStorage),
    merge: (persisted, current) => {
      const locale = (persisted as Partial<LocaleState> | undefined)?.locale;
      return { ...current, locale: isLocale(locale) ? locale : current.locale };
    },
  }),
);
