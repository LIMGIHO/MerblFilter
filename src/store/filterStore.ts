import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  FilterSettings,
  DEFAULT_FILTER_SETTINGS,
  FILTER_SETTINGS_KEY,
  normalizeFilterSettings,
} from '@/domain/filter/filterSettings';

interface FilterStore {
  settings: FilterSettings;
  setSettings: (patch: Partial<FilterSettings>) => void;
  resetSettings: () => void;
  addBlockedUser: (user: string) => void;
  removeBlockedUser: (user: string) => void;
  addFavoriteUser: (user: string) => void;
  removeFavoriteUser: (user: string) => void;
}

export const useFilterStore = create<FilterStore>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_FILTER_SETTINGS,

      setSettings: (patch) =>
        set((s) => ({
          settings: normalizeFilterSettings({ ...s.settings, ...patch }),
        })),

      resetSettings: () => set({ settings: DEFAULT_FILTER_SETTINGS }),

      addBlockedUser: (user) => {
        const trimmed = user.trim();
        if (!trimmed) return;
        const current = get().settings.blockedUsers;
        if (current.includes(trimmed)) return;
        set((s) => ({
          settings: normalizeFilterSettings({
            ...s.settings,
            blockedUsers: [...s.settings.blockedUsers, trimmed],
          }),
        }));
      },

      removeBlockedUser: (user) =>
        set((s) => ({
          settings: normalizeFilterSettings({
            ...s.settings,
            blockedUsers: s.settings.blockedUsers.filter((u) => u !== user),
          }),
        })),

      addFavoriteUser: (user) => {
        const trimmed = user.trim();
        if (!trimmed) return;
        const current = get().settings.favoriteUsers;
        if (current.includes(trimmed)) return;
        set((s) => ({
          settings: normalizeFilterSettings({
            ...s.settings,
            favoriteUsers: [...s.settings.favoriteUsers, trimmed],
          }),
        }));
      },

      removeFavoriteUser: (user) =>
        set((s) => ({
          settings: normalizeFilterSettings({
            ...s.settings,
            favoriteUsers: s.settings.favoriteUsers.filter((u) => u !== user),
          }),
        })),
    }),
    {
      name: FILTER_SETTINGS_KEY,
      storage: createJSONStorage(() => localStorage),
    }
  )
);
