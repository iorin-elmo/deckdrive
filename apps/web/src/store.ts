import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface SessionState {
  readonly playerId: string | null;
  readonly previewMode: boolean;
  setPlayerId: (playerId: string) => void;
  enablePreview: () => void;
  clearPlayerId: () => void;
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
    { name: 'deckdrive-session', storage: createJSONStorage(() => sessionStorage) },
  ),
);
