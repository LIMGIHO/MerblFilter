import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface Blog {
  blogId: string;
  name: string;
}

interface BlogStore {
  blogs: Blog[];
  activeBlogId: string;
  addBlog: (blog: Blog) => void;
  removeBlog: (blogId: string) => void;
  setActiveBlog: (blogId: string) => void;
}

export const useBlogStore = create<BlogStore>()(
  persist(
    (set, get) => ({
      blogs: [{ blogId: 'ranto28', name: '메르님 블로그' }],
      activeBlogId: 'ranto28',

      addBlog: (blog) =>
        set((state) => ({
          blogs: state.blogs.find((b) => b.blogId === blog.blogId)
            ? state.blogs
            : [...state.blogs, blog],
        })),

      removeBlog: (blogId) =>
        set((state) => {
          const next = state.blogs.filter((b) => b.blogId !== blogId);
          if (next.length === 0) return state; // 마지막 블로그는 삭제 불가
          const nextActive =
            state.activeBlogId === blogId ? (next[0]?.blogId ?? state.activeBlogId) : state.activeBlogId;
          return { blogs: next, activeBlogId: nextActive };
        }),

      setActiveBlog: (blogId) => {
        if (get().blogs.find((b) => b.blogId === blogId)) {
          set({ activeBlogId: blogId });
        }
      },
    }),
    {
      name: '@blog-store',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
