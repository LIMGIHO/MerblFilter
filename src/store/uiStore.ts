import { create } from 'zustand';

/**
 * 전역 UI 레이아웃 상태
 * - contentPanelOffset: 우측 패널(AI/댓글)이 열렸을 때 콘텐츠가 밀린 픽셀
 *   PostList → 쓰기, TTSPlayer → 읽기
 */
interface UiStore {
  contentPanelOffset: number;
  setContentPanelOffset: (n: number) => void;
}

export const useUiStore = create<UiStore>()((set) => ({
  contentPanelOffset: 0,
  setContentPanelOffset: (n) => set({ contentPanelOffset: n }),
}));
