import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

interface SessionState {
  readonly playerId: string | null;
  readonly previewMode: boolean;
  setPlayerId: (playerId: string) => void;
  enablePreview: () => void;
  clearPlayerId: () => void;
}

const memoryStorage = new Map<string, string>();

const fallbackStorage: StateStorage = {
  getItem: (name) => memoryStorage.get(name) ?? null,
  setItem: (name, value) => memoryStorage.set(name, value),
  removeItem: (name) => memoryStorage.delete(name),
};

function sessionStateStorage(): StateStorage {
  if (typeof window === 'undefined') return fallbackStorage;
  try {
    return window.sessionStorage;
  } catch {
    return fallbackStorage;
  }
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      playerId: null,
      previewMode: false,
      setPlayerId: (playerId) => set({ playerId, previewMode: false }),
      enablePreview: () => set({ playerId: 'preview-player', previewMode: true }),
      clearPlayerId: () => set({ playerId: null, previewMode: false }),
    }),
    { name: 'deckdrive-session', storage: createJSONStorage(sessionStateStorage) },
  ),
);
