import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';

type ReadPostsState = {
  readPostIds: string[];
};

interface ReadPostsStore {
  readPostIds: Set<string>;
  markAsRead: (postId: string) => void;
  isRead: (postId: string) => boolean;
}

export const useReadPostsStore = create<ReadPostsStore>()(
  persist(
    (set, get) => ({
      readPostIds: new Set<string>(),

      markAsRead: (postId) =>
        set((s) => ({
          readPostIds: new Set([...s.readPostIds, postId]),
        })),

      isRead: (postId) => get().readPostIds.has(postId),
    }),
    {
      name: '@read_posts',
      storage: createJSONStorage(() => localStorage),
      partialize: (s): ReadPostsState => ({ readPostIds: [...s.readPostIds] }),
      merge: (persisted, current) => {
        const p = persisted as ReadPostsState | null;
        return {
          ...current,
          readPostIds: new Set(p?.readPostIds ?? []),
        };
      },
    }
  )
);
