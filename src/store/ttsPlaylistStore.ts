import { create } from 'zustand';

export interface PlaylistItem {
  postId: string;
  blogId: string;
  title: string;
}

interface TtsPlaylistStore {
  items: PlaylistItem[];
  currentIndex: number;
  drawerOpen: boolean;

  add: (item: PlaylistItem) => void;
  remove: (postId: string) => void;
  setCurrentIndex: (i: number) => void;
  clear: () => void;
  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;
  has: (postId: string) => boolean;
}

export const useTtsPlaylistStore = create<TtsPlaylistStore>()((set, get) => ({
  items: [],
  currentIndex: -1,
  drawerOpen: false,

  add: (item) =>
    set((s) => {
      if (s.items.some((i) => i.postId === item.postId)) return s; // 중복 방지
      const newItems = [...s.items, item];
      return {
        items: newItems,
        // 처음 추가된 경우 현재 인덱스를 0으로
        currentIndex: s.currentIndex === -1 ? 0 : s.currentIndex,
      };
    }),

  remove: (postId) =>
    set((s) => {
      const idx = s.items.findIndex((i) => i.postId === postId);
      if (idx === -1) return s;
      const newItems = s.items.filter((i) => i.postId !== postId);
      let newIndex = s.currentIndex;
      if (newItems.length === 0) {
        newIndex = -1;
      } else if (idx < s.currentIndex) {
        newIndex = s.currentIndex - 1;
      } else if (idx === s.currentIndex) {
        newIndex = Math.min(s.currentIndex, newItems.length - 1);
      }
      return { items: newItems, currentIndex: newIndex };
    }),

  setCurrentIndex: (i) => set({ currentIndex: i }),

  clear: () => set({ items: [], currentIndex: -1 }),

  setDrawerOpen: (open) => set({ drawerOpen: open }),

  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),

  has: (postId) => get().items.some((i) => i.postId === postId),
}));
