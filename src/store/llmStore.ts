import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ModelStatus =
  | 'idle'          // 미다운로드
  | 'downloading'   // 다운로드 중
  | 'ready'         // 사용 가능
  | 'running'       // 추론 중
  | 'error';        // 오류

export interface LlmStore {
  // Phase 1 (Transformers.js)
  phase1Enabled: boolean;
  phase1Status: ModelStatus;
  phase1Progress: number;       // 0~100
  phase1ModelId: string;
  phase1Error: string | null;

  // Phase 2 (WebLLM) — opt-in
  phase2Enabled: boolean;
  phase2Status: ModelStatus;
  phase2Progress: number;
  phase2ModelId: string;
  phase2Error: string | null;

  setPhase1Enabled: (v: boolean) => void;
  setPhase1Status: (s: ModelStatus) => void;
  setPhase1Progress: (p: number) => void;
  setPhase1Error: (e: string | null) => void;

  setPhase2Enabled: (v: boolean) => void;
  setPhase2Status: (s: ModelStatus) => void;
  setPhase2Progress: (p: number) => void;
  setPhase2Error: (e: string | null) => void;
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

      setPhase1Enabled: (v) => set({ phase1Enabled: v }),
      setPhase1Status: (s) => set({ phase1Status: s }),
      setPhase1Progress: (p) => set({ phase1Progress: p }),
      setPhase1Error: (e) => set({ phase1Error: e }),

      setPhase2Enabled: (v) => set({ phase2Enabled: v }),
      setPhase2Status: (s) => set({ phase2Status: s }),
      setPhase2Progress: (p) => set({ phase2Progress: p }),
      setPhase2Error: (e) => set({ phase2Error: e }),
    }),
    {
      name: '@llm_settings',
      storage: createJSONStorage(() => localStorage),
      // 런타임 상태는 persist 제외
      partialize: (s) => ({
        phase1Enabled: s.phase1Enabled,
        phase1ModelId: s.phase1ModelId,
        phase2Enabled: s.phase2Enabled,
        phase2ModelId: s.phase2ModelId,
      }),
    }
  )
);
