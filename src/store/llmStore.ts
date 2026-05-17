import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ModelStatus =
  | 'idle'
  | 'downloading'
  | 'ready'
  | 'running'
  | 'error';

export interface ModelOption {
  id: string;
  label: string;
  size: string;
  description: string;
}

export const WEBLLM_MODELS: ModelOption[] = [
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    label: '경량',
    size: '~300MB',
    description: '빠름, 정확도 낮음',
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    label: '기본',
    size: '~900MB',
    description: '균형잡힌 성능',
  },
  {
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    label: '고성능',
    size: '~2GB',
    description: '높은 정확도, 느림',
  },
];

export interface LlmStore {
  // Phase 1 (Transformers.js — 댓글 분류)
  phase1Enabled: boolean;
  phase1Status: ModelStatus;
  phase1Progress: number;
  phase1ModelId: string;
  phase1Error: string | null;

  // Phase 2 (WebLLM — 요약/프롬프트)
  phase2Enabled: boolean;
  phase2Status: ModelStatus;
  phase2Progress: number;
  phase2ModelId: string;
  phase2Error: string | null;
  phase2ProgressMessage: string;
  phase2HasDownloaded: boolean; // 최초 다운로드 완료 여부 (localStorage 유지)

  setPhase1Enabled: (v: boolean) => void;
  setPhase1Status: (s: ModelStatus) => void;
  setPhase1Progress: (p: number) => void;
  setPhase1Error: (e: string | null) => void;

  setPhase2Enabled: (v: boolean) => void;
  setPhase2Status: (s: ModelStatus) => void;
  setPhase2Progress: (p: number) => void;
  setPhase2ModelId: (id: string) => void;
  setPhase2Error: (e: string | null) => void;
  setPhase2ProgressMessage: (m: string) => void;
  setPhase2HasDownloaded: (v: boolean) => void;
}

export const useLlmStore = create<LlmStore>()(
  persist(
    (set) => ({
      phase1Enabled: false,
      phase1Status: 'idle',
      phase1Progress: 0,
      phase1ModelId: 'Xenova/bert-base-multilingual-uncased-sentiment',
      phase1Error: null,

      phase2Enabled: false,
      phase2Status: 'idle',
      phase2Progress: 0,
      phase2ModelId: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
      phase2Error: null,
      phase2ProgressMessage: '',
      phase2HasDownloaded: false,

      setPhase1Enabled: (v) => set({ phase1Enabled: v }),
      setPhase1Status: (s) => set({ phase1Status: s }),
      setPhase1Progress: (p) => set({ phase1Progress: p }),
      setPhase1Error: (e) => set({ phase1Error: e }),

      setPhase2Enabled: (v) => set({ phase2Enabled: v }),
      setPhase2Status: (s) => set({ phase2Status: s }),
      setPhase2Progress: (p) => set({ phase2Progress: p }),
      setPhase2ModelId: (id) => set({ phase2ModelId: id, phase2Status: 'idle' }),
      setPhase2Error: (e) => set({ phase2Error: e }),
      setPhase2ProgressMessage: (m) => set({ phase2ProgressMessage: m }),
      setPhase2HasDownloaded: (v) => set({ phase2HasDownloaded: v }),
    }),
    {
      name: '@llm_settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        phase1Enabled: s.phase1Enabled,
        phase1ModelId: s.phase1ModelId,
        phase2Enabled: s.phase2Enabled,
        phase2ModelId: s.phase2ModelId,
        phase2HasDownloaded: s.phase2HasDownloaded,
      }),
    }
  )
);
