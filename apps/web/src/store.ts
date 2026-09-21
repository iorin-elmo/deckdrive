import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface SessionState {
  readonly playerId: string | null;
  setPlayerId: (playerId: string) => void;
  clearPlayerId: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      playerId: null,
      setPlayerId: (playerId) => set({ playerId }),
      clearPlayerId: () => set({ playerId: null }),
    }),
    { name: 'deckdrive-session', storage: createJSONStorage(() => sessionStorage) },
  ),
);
