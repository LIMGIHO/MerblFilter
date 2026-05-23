# 댓글 품질 필터 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 감성 분류(긍정/부정/중립)를 제거하고, 임베딩 유사도 기반으로 "읽을만한 댓글"만 보여주는 품질 필터로 교체한다.

**Architecture:** 1단계 전처리 필터(15자 미만·스팸 키워드)로 명백한 노이즈를 걸러내고, 나머지는 `paraphrase-multilingual-MiniLM-L12-v2` 임베딩 모델과 사전 내장 예시 댓글의 코사인 유사도로 `worth_reading` / `noise` / `spam` 을 결정한다. 분류 결과는 0~100 점수 + 태그(`경험공유` / `의견있음` / `noise` / `spam`)로 UI에 표시한다.

**Tech Stack:** @xenova/transformers (feature-extraction pipeline), esbuild (worker 번들), Zustand, Next.js App Router, vitest

---

## 파일 변경 목록

| 파일 | 작업 |
|------|------|
| `src/domain/comment/types.ts` | `_llmLabel` 타입 교체, `_llmScore` / `_llmTag` 추가 |
| `src/features/llm/useClassifier.ts` | `ClassifyResult` 타입 교체, `phase1ModelId` 참조 제거 |
| `src/features/llm/llm.worker.ts` | 완전 재작성 — 임베딩 모델, 예시 세트, 분류 로직 |
| `src/store/llmStore.ts` | `phase1ModelId` 필드 및 persist 제거 |
| `src/app/posts/CommentsPanel.tsx` | 필터 상태 교체, 품질 필터 ON/OFF 로직 |
| `src/app/posts/[postId]/PostComments.tsx` | `LlmLabel` 타입 참조 제거 |
| `src/features/llm/LocalLLMPanel.tsx` | UI 전면 교체 — 점수+태그 배지, 필터 카운트 |
| `src/features/comments/CommentItem.tsx` | 배지 표시 로직 업데이트 |
| `public/llm-worker.js` | `pnpm build:worker` 재빌드 |

---

## Task 1: 타입 정의 업데이트

**Files:**
- Modify: `src/domain/comment/types.ts:35`
- Modify: `src/features/llm/useClassifier.ts:7-13`

- [ ] **Step 1: `BlogComment` 타입 변경**

`src/domain/comment/types.ts` 의 35번째 줄을 아래로 교체한다:

```typescript
// 변경 전
_llmLabel?: 'spam' | 'promo' | 'negative' | 'neutral' | 'positive';

// 변경 후
_llmLabel?: 'worth_reading' | 'noise' | 'spam';
_llmScore?: number;   // 0~100
_llmTag?: '경험공유' | '의견있음' | 'noise' | 'spam';
```

- [ ] **Step 2: `useClassifier.ts` 타입 변경**

`src/features/llm/useClassifier.ts` 상단의 `LlmLabel`과 `ClassifyResult`를 교체한다:

```typescript
// 변경 전
type LlmLabel = 'spam' | 'promo' | 'negative' | 'neutral' | 'positive';

export interface ClassifyResult {
  commentNo: number;
  label: LlmLabel;
  score: number;
}

// 변경 후
export type QualityLabel = 'worth_reading' | 'noise' | 'spam';
export type QualityTag = '경험공유' | '의견있음' | 'noise' | 'spam';

export interface ClassifyResult {
  commentNo: number;
  label: QualityLabel;
  score: number;   // 0~100
  tag: QualityTag;
}
```

- [ ] **Step 3: TypeScript 컴파일 확인**

```bash
cd /Users/limgiho/Desktop/Source/MeblFilter/MerblFilter_Backup/merblFilter
pnpm tsc --noEmit 2>&1 | head -30
```

타입 오류가 새로 생긴 파일 목록을 확인한다. 이후 태스크에서 순서대로 수정한다.

- [ ] **Step 4: 커밋**

```bash
git add src/domain/comment/types.ts src/features/llm/useClassifier.ts
git commit -m "feat: 댓글 품질 필터 타입 정의 (QualityLabel, ClassifyResult)"
```

---

## Task 2: llmStore에서 phase1ModelId 제거

**Files:**
- Modify: `src/store/llmStore.ts`

모델 ID는 Worker 내부에 하드코딩하므로 store에서 관리할 필요가 없다.

- [ ] **Step 1: `LlmStore` 인터페이스에서 `phase1ModelId` 제거**

`src/store/llmStore.ts` 를 아래와 같이 수정한다:

```typescript
export interface LlmStore {
  // Phase 1 (Transformers.js — 댓글 분류)
  phase1Enabled: boolean;
  phase1Status: ModelStatus;
  phase1Progress: number;
  // phase1ModelId 제거
  phase1Error: string | null;

  // Phase 2 는 그대로 유지
  // ...

  setPhase1Enabled: (v: boolean) => void;
  setPhase1Status: (s: ModelStatus) => void;
  setPhase1Progress: (p: number) => void;
  setPhase1Error: (e: string | null) => void;
  // setPhase1ModelId 없음
}
```

- [ ] **Step 2: `create()` 초기값과 `partialize`에서 `phase1ModelId` 제거**

```typescript
// create() 내부 초기값
phase1Enabled: false,
phase1Status: 'idle',
phase1Progress: 0,
// phase1ModelId: 'Xenova/...' ← 이 줄 삭제
phase1Error: null,

// partialize
partialize: (s) => ({
  phase1Enabled: s.phase1Enabled,
  // phase1ModelId 줄 삭제
  phase2Enabled: s.phase2Enabled,
  phase2ModelId: s.phase2ModelId,
  phase2HasDownloaded: s.phase2HasDownloaded,
  phase2DownloadedModels: s.phase2DownloadedModels,
}),
```

- [ ] **Step 3: `useClassifier.ts`에서 `phase1ModelId` 참조 제거**

`src/features/llm/useClassifier.ts` 의 `useLlmStore` 구조분해에서 `phase1ModelId`를 제거하고, `loadModel`과 `postMessage`에서도 modelId 전달을 제거한다:

```typescript
// 변경 전
const {
  phase1ModelId,
  phase1Status,
  setPhase1Status,
  setPhase1Progress,
  setPhase1Error,
} = useLlmStore();

// 변경 후
const {
  phase1Status,
  setPhase1Status,
  setPhase1Progress,
  setPhase1Error,
} = useLlmStore();
```

```typescript
// loadModel() 내부 — 변경 전
pendingLoadModelRef.current = phase1ModelId;
// ...
workerRef.current.postMessage({ type: 'load', payload: { modelId: phase1ModelId } });
// initWorker 내부
worker.postMessage({ type: 'load', payload: { modelId: pendingLoadModelRef.current } });

// 변경 후 — modelId 없이 단순 'load' 신호만 전송
pendingLoadModelRef.current = 'pending';   // truthy flag 역할만
// ...
workerRef.current.postMessage({ type: 'load', payload: {} });
// initWorker 내부
if (pendingLoadModelRef.current) {
  worker.postMessage({ type: 'load', payload: {} });
}
```

```typescript
// loadModel useCallback deps 변경 전
}, [phase1ModelId]);

// 변경 후
}, []);
```

- [ ] **Step 4: 커밋**

```bash
git add src/store/llmStore.ts src/features/llm/useClassifier.ts
git commit -m "refactor: phase1ModelId store에서 제거, worker 내부 하드코딩"
```

---

## Task 3: llm.worker.ts 전면 재작성

**Files:**
- Modify: `src/features/llm/llm.worker.ts` (전체 교체)

- [ ] **Step 1: `llm.worker.ts` 전체를 아래 코드로 교체**

```typescript
/// <reference lib="webworker" />
import { pipeline, env } from '@xenova/transformers';

// ── 환경 설정 ─────────────────────────────────────────────────────────
env.useBrowserCache = true;
env.allowLocalModels = false;

// Blob Worker 대응: self.location.href = 'blob:http://...'
// 상대 경로 '/wasm/'은 blob URL 기준으로 해석 불가 → origin 추출 후 절대 URL 구성
const _pageOrigin = (() => {
  const href = (self as unknown as WorkerGlobalScope).location.href;
  try {
    return new URL(href.startsWith('blob:') ? href.slice(5) : href).origin;
  } catch {
    return (self as unknown as WorkerGlobalScope).location.origin;
  }
})();
env.backends.onnx.wasm.wasmPaths = `${_pageOrigin}/wasm/`;
(env.backends.onnx.wasm as Record<string, unknown>).numThreads = 1;

// ── 모델 ID ───────────────────────────────────────────────────────────
const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

// ── 예시 세트 ─────────────────────────────────────────────────────────
const SHOW_EXAMPLES: Array<{ text: string; tag: '경험공유' | '의견있음' }> = [
  // 경험공유
  { text: '저도 지방에서 올라와서 처음엔 정말 막막했는데 공감이 많이 됩니다', tag: '경험공유' },
  { text: '저 역시 비슷한 상황을 겪었는데 그때 이 글을 읽었더라면 좋았을 것 같아요', tag: '경험공유' },
  { text: '15년 전 일인데 아직도 그때 기억이 생생하네요', tag: '경험공유' },
  { text: '우리 아이도 작년에 비슷한 일이 있었는데 정말 힘들었거든요', tag: '경험공유' },
  { text: '저도 예전에 이런 선택의 기로에서 고민했는데 결국 이쪽을 선택했어요', tag: '경험공유' },
  { text: '제가 겪어보니 생각보다 훨씬 어렵더라고요', tag: '경험공유' },
  { text: '저는 다른 방향을 선택했는데 지금 돌아보면 후회가 되기도 해요', tag: '경험공유' },
  { text: '저도 한때 이 문제로 정말 많이 고민했었어요', tag: '경험공유' },
  // 의견있음
  { text: '개인적으로 이 부분은 조금 다르게 생각해요', tag: '의견있음' },
  { text: '제 생각엔 이것보다 저 방법이 더 나을 것 같기도 한데요', tag: '의견있음' },
  { text: '좋은 글인데 한 가지 아쉬운 점은 구체적인 사례가 없다는 거예요', tag: '의견있음' },
  { text: '동의하는 부분도 있지만 현실적으로 쉽지 않은 측면도 있죠', tag: '의견있음' },
  { text: '이런 시각도 있구나 싶었어요. 저는 반대로 생각하고 있었거든요', tag: '의견있음' },
  { text: '항상 좋은 글 감사한데 이번엔 살짝 아쉬웠어요', tag: '의견있음' },
  { text: '말씀하신 방법 외에 다른 방법도 있을 것 같아서요', tag: '의견있음' },
];

const HIDE_EXAMPLES: string[] = [
  '놀랐어요!',
  '감사합니다 잘 봤어요',
  '철렁했습니다',
  'ㅎㅎ 좋은 글이네요',
  '깜짝 놀랐어요^^',
  '잘 봤습니다~',
  '오늘도 좋은 글 감사해요',
  '응원합니다!',
  '화이팅이요',
  '헉 저도 몰랐어요',
];

// ── 전처리 필터 ───────────────────────────────────────────────────────
const SPAM_KEYWORDS = ['구독', '방문해주세요', '놀러오세요', '이웃추가'];
const NOISE_ONLY_PATTERN = /^[ㅎㅋㅠㅜㅡ~^.!?\\s]+$/;

type QualityLabel = 'worth_reading' | 'noise' | 'spam';
type QualityTag = '경험공유' | '의견있음' | 'noise' | 'spam';

interface PrefilterResult {
  filtered: true;
  label: QualityLabel;
  score: number;
  tag: QualityTag;
}

function prefilter(text: string): PrefilterResult | null {
  if (text.length < 15) return { filtered: true, label: 'noise', score: 5, tag: 'noise' };
  if (NOISE_ONLY_PATTERN.test(text)) return { filtered: true, label: 'noise', score: 5, tag: 'noise' };
  if (SPAM_KEYWORDS.some((k) => text.includes(k))) return { filtered: true, label: 'spam', score: 0, tag: 'spam' };
  return null;
}

// ── HTML 제거 ─────────────────────────────────────────────────────────
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── 코사인 유사도 ─────────────────────────────────────────────────────
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── 임베딩 추출 헬퍼 ─────────────────────────────────────────────────
async function embed(extractor: Awaited<ReturnType<typeof pipeline>>, text: string): Promise<number[]> {
  const output = await (extractor as (t: string, opts: object) => Promise<{ data: Float32Array }>)(
    text,
    { pooling: 'mean', normalize: true }
  );
  return Array.from(output.data);
}

// ── 임베딩 기반 분류 ──────────────────────────────────────────────────
function classifyByEmbedding(
  commentVec: number[],
  showEmbeddings: Array<{ vec: number[]; tag: '경험공유' | '의견있음' }>,
  hideEmbeddings: number[][]
): { label: QualityLabel; score: number; tag: QualityTag } {
  const showScores = showEmbeddings.map((e) => ({
    sim: cosineSimilarity(commentVec, e.vec),
    tag: e.tag,
  }));
  const hideScores = hideEmbeddings.map((v) => cosineSimilarity(commentVec, v));

  const bestShow = showScores.reduce((a, b) => (a.sim > b.sim ? a : b));
  const bestHide = Math.max(...hideScores);

  // 어느 예시와도 유사도가 낮으면 기본값 SHOW (안전 처리)
  if (bestShow.sim < 0.4 && bestHide < 0.4) {
    return { label: 'worth_reading', score: 50, tag: '경험공유' };
  }

  // -1~1 범위의 차이를 0~100 으로 정규화
  const raw = (bestShow.sim - bestHide + 1) / 2;
  const score = Math.round(Math.max(0, Math.min(100, raw * 100)));

  if (score >= 50) {
    return { label: 'worth_reading', score, tag: bestShow.tag };
  }
  return { label: 'noise', score, tag: 'noise' };
}

// ── 상태 ──────────────────────────────────────────────────────────────
let extractor: Awaited<ReturnType<typeof pipeline>> | null = null;
let showEmbeddings: Array<{ vec: number[]; tag: '경험공유' | '의견있음' }> | null = null;
let hideEmbeddings: number[][] | null = null;

// ── 메시지 핸들러 ─────────────────────────────────────────────────────
self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data as {
    type: 'load' | 'classify' | 'unload';
    payload: Record<string, unknown>;
  };

  // ── load ────────────────────────────────────────────────────────────
  if (type === 'load') {
    if (extractor && showEmbeddings && hideEmbeddings) {
      self.postMessage({ type: 'loaded', payload: {} });
      return;
    }

    try {
      self.postMessage({ type: 'progress', payload: { progress: 0, message: '모델 초기화 중...' } });

      extractor = await pipeline('feature-extraction', MODEL_ID, {
        progress_callback: (info: { progress?: number; status?: string }) => {
          const pct = Math.round(info?.progress ?? 0);
          self.postMessage({
            type: 'progress',
            payload: { progress: pct, message: info?.status ?? '다운로드 중...' },
          });
        },
      });

      // 예시 임베딩 사전 계산 (모델 로드 직후 1회)
      self.postMessage({ type: 'progress', payload: { progress: 100, message: '예시 임베딩 준비 중...' } });

      showEmbeddings = await Promise.all(
        SHOW_EXAMPLES.map(async (e) => ({
          vec: await embed(extractor!, e.text),
          tag: e.tag,
        }))
      );
      hideEmbeddings = await Promise.all(HIDE_EXAMPLES.map((t) => embed(extractor!, t)));

      self.postMessage({ type: 'loaded', payload: {} });
    } catch (err) {
      self.postMessage({ type: 'error', payload: { message: String(err) } });
    }
  }

  // ── classify ────────────────────────────────────────────────────────
  if (type === 'classify') {
    if (!extractor || !showEmbeddings || !hideEmbeddings) {
      self.postMessage({ type: 'error', payload: { message: '모델이 로드되지 않았습니다' } });
      return;
    }

    const comments = payload.comments as Array<{ commentNo: number; contents: string }>;
    const results: Array<{ commentNo: number; label: QualityLabel; score: number; tag: QualityTag }> = [];

    for (let i = 0; i < comments.length; i++) {
      const c = comments[i];
      const text = stripHtml(c.contents).slice(0, 512);

      // 1단계: 전처리 필터
      const pre = prefilter(text);
      if (pre) {
        results.push({ commentNo: c.commentNo, label: pre.label, score: pre.score, tag: pre.tag });
      } else {
        // 2단계: 임베딩 유사도
        try {
          const vec = await embed(extractor, text);
          const result = classifyByEmbedding(vec, showEmbeddings, hideEmbeddings);
          results.push({ commentNo: c.commentNo, ...result });
        } catch {
          // 분류 실패 시 안전하게 SHOW 처리
          results.push({ commentNo: c.commentNo, label: 'worth_reading', score: 50, tag: '경험공유' });
        }
      }

      // 진행률 보고 (10개마다)
      if (i % 10 === 0 || i === comments.length - 1) {
        const pct = Math.round(((i + 1) / comments.length) * 100);
        self.postMessage({ type: 'classify_progress', payload: { progress: pct } });
      }
    }

    self.postMessage({ type: 'classify_result', payload: { results } });
  }

  // ── unload ──────────────────────────────────────────────────────────
  if (type === 'unload') {
    extractor = null;
    showEmbeddings = null;
    hideEmbeddings = null;
    self.postMessage({ type: 'unloaded' });
  }
};
```

- [ ] **Step 2: Worker 번들 재빌드**

```bash
cd /Users/limgiho/Desktop/Source/MeblFilter/MerblFilter_Backup/merblFilter
pnpm build:worker
```

예상 출력:
```
public/llm-worker.js  1.xmb
⚡ Done in ...ms
```

- [ ] **Step 3: 커밋**

```bash
git add src/features/llm/llm.worker.ts public/llm-worker.js
git commit -m "feat: llm.worker — 임베딩 품질 분류로 교체 (MiniLM + few-shot)"
```

---

## Task 4: CommentsPanel 필터 로직 교체

**Files:**
- Modify: `src/app/posts/CommentsPanel.tsx`
- Modify: `src/app/posts/[postId]/PostComments.tsx`

- [ ] **Step 1: CommentsPanel 상태 타입 교체**

`src/app/posts/CommentsPanel.tsx` 상단의 `LlmLabel` 타입과 상태 선언을 교체한다:

```typescript
// 삭제
type LlmLabel = 'spam' | 'promo' | 'negative' | 'neutral' | 'positive';

// 추가
import type { QualityLabel, QualityTag, ClassifyResult } from '@/features/llm/useClassifier';

// 상태 선언 교체
// 변경 전
const [llmLabelMap, setLlmLabelMap] = useState<Record<number, LlmLabel>>({});
const [hiddenLabels, setHiddenLabels] = useState<Set<LlmLabel>>(new Set());

// 변경 후
type LlmResult = { label: QualityLabel; score: number; tag: QualityTag };
const [llmResultMap, setLlmResultMap] = useState<Record<number, LlmResult>>({});
const [qualityFilterActive, setQualityFilterActive] = useState(false);
```

- [ ] **Step 2: `setLlmLabelMap({})` 호출부를 `setLlmResultMap({})` 으로 교체**

CommentsPanel.tsx 에서 `setLlmLabelMap({})` 가 호출되는 두 곳(포스트 변경 시, 탭 변경 시)을 모두 교체한다:

```typescript
// 변경 전
setLlmLabelMap({});

// 변경 후
setLlmResultMap({});
setQualityFilterActive(false);
```

- [ ] **Step 3: 필터 함수 교체**

`CommentsPanel.tsx` 의 baseComments 계산과 댓글 필터 함수를 교체한다:

```typescript
// 변경 전 (약 164번째 줄)
const baseComments = (hiddenLabels.size > 0)
  ? structuredComments
  : (showAllComments ? structuredComments : ownerRelatedComments);

// 변경 후
const baseComments = (qualityFilterActive && Object.keys(llmResultMap).length > 0)
  ? structuredComments
  : (showAllComments ? structuredComments : ownerRelatedComments);
```

```typescript
// 변경 전 (약 180번째 줄)
if (hiddenLabels.size === 0) return true;
const label = llmLabelMap[c.commentNo];
return !label || !hiddenLabels.has(label);

// 변경 후
if (!qualityFilterActive || Object.keys(llmResultMap).length === 0) return true;
const result = llmResultMap[c.commentNo];
return !result || result.label === 'worth_reading';
```

- [ ] **Step 4: LocalLLMPanel props 교체**

CommentsPanel.tsx 에서 LocalLLMPanel을 렌더링하는 부분을 교체한다:

```typescript
// 변경 전 (약 270번째 줄)
<LocalLLMPanel
  comments={comments}
  onLabelsUpdate={setLlmLabelMap}
  labelMap={llmLabelMap}
  onHideLabelsChange={setHiddenLabels}
/>

// 변경 후
<LocalLLMPanel
  comments={comments}
  onResultsUpdate={(results) => {
    const map: Record<number, LlmResult> = {};
    results.forEach((r) => { map[r.commentNo] = { label: r.label, score: r.score, tag: r.tag }; });
    setLlmResultMap(map);
  }}
  resultMap={llmResultMap}
  qualityFilterActive={qualityFilterActive}
  onQualityFilterToggle={setQualityFilterActive}
/>
```

- [ ] **Step 5: 댓글 배지 표시 부분 교체**

CommentsPanel.tsx 의 약 349번째 줄 인라인 배지 표시를 교체한다:

```typescript
// 변경 전
{llmLabelMap[comment.commentNo] && llmLabelMap[comment.commentNo] !== 'neutral' && (
  <span ...>
    {llmLabelMap[comment.commentNo] === 'positive' ? '긍정' : ...}
  </span>
)}

// 변경 후
{(() => {
  const r = llmResultMap[comment.commentNo];
  if (!r || r.label !== 'worth_reading') return null;
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
      {r.tag} · {r.score}점
    </span>
  );
})()}
```

- [ ] **Step 6: PostComments.tsx LlmLabel 제거**

`src/app/posts/[postId]/PostComments.tsx` 에서 `LlmLabel` 타입 선언과 관련 상태를 제거한다:

```typescript
// 삭제
type LlmLabel = 'spam' | 'promo' | 'negative' | 'neutral' | 'positive';
const [llmLabelMap, setLlmLabelMap] = useState<Record<number, LlmLabel>>({});
const [hiddenLabels, setHiddenLabels] = useState<Set<LlmLabel>>(new Set());
setLlmLabelMap({});
```

PostComments.tsx 가 LocalLLMPanel을 직접 렌더링하지 않고 CommentsPanel에 위임한다면 이 파일은 LLM 관련 상태가 없어야 한다. `pnpm tsc --noEmit` 으로 오류 확인 후 정리한다.

- [ ] **Step 7: 커밋**

```bash
git add src/app/posts/CommentsPanel.tsx src/app/posts/[postId]/PostComments.tsx
git commit -m "feat: CommentsPanel — 품질 필터 상태로 교체 (llmResultMap, qualityFilterActive)"
```

---

## Task 5: LocalLLMPanel UI 전면 교체

**Files:**
- Modify: `src/features/llm/LocalLLMPanel.tsx`

- [ ] **Step 1: LocalLLMPanel.tsx 전체를 아래 코드로 교체**

```typescript
'use client';

import { useState, useCallback } from 'react';
import { useLlmStore } from '@/store/llmStore';
import { useClassifier, ClassifyResult, QualityLabel, QualityTag } from './useClassifier';
import { BlogComment } from '@/domain/comment/types';

type LlmResult = { label: QualityLabel; score: number; tag: QualityTag };

interface LocalLLMPanelProps {
  comments: BlogComment[];
  onResultsUpdate: (results: ClassifyResult[]) => void;
  resultMap: Record<number, LlmResult>;
  qualityFilterActive: boolean;
  onQualityFilterToggle: (active: boolean) => void;
}

export default function LocalLLMPanel({
  comments,
  onResultsUpdate,
  resultMap,
  qualityFilterActive,
  onQualityFilterToggle,
}: LocalLLMPanelProps) {
  const {
    phase1Enabled,
    phase1Status,
    phase1Progress,
    phase1Error,
    setPhase1Enabled,
  } = useLlmStore();

  const { loadModel, classify, isReady } = useClassifier();
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = useCallback((enabled: boolean) => {
    setPhase1Enabled(enabled);
    if (enabled && (phase1Status === 'idle' || phase1Status === 'error')) loadModel();
  }, [phase1Status, loadModel, setPhase1Enabled]);

  const handleClassify = useCallback(() => {
    const visible = comments.filter((c) => c.replyLevel === 1);
    classify(visible, (results: ClassifyResult[]) => {
      onResultsUpdate(results);
    });
  }, [comments, classify, onResultsUpdate]);

  const totalClassified = Object.keys(resultMap).length;
  const hiddenCount = Object.values(resultMap).filter((r) => r.label !== 'worth_reading').length;
  const worthReadingCount = totalClassified - hiddenCount;

  return (
    <div className="relative">
      {/* 토글 버튼 */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="text-xs px-2.5 py-1 rounded-full transition flex items-center gap-1.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-teal-400 hover:text-teal-600 dark:hover:text-teal-400"
      >
        <span>✦ AI 필터</span>
        {phase1Status === 'downloading' && (
          <span className="text-teal-500 animate-pulse">{phase1Progress}%</span>
        )}
        {phase1Status === 'running' && (
          <span className="inline-block w-3 h-3 border border-teal-400 border-t-transparent rounded-full animate-spin" />
        )}
        {phase1Status === 'error' && (
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
        )}
        {phase1Status === 'ready' && (
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 inline-block" />
        )}
        {totalClassified > 0 && (
          <span className="bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 px-1.5 rounded-full text-[10px]">
            {worthReadingCount}
          </span>
        )}
      </button>

      {/* 패널 */}
      {isOpen && (
        <div className="absolute right-0 top-9 z-50 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-xs text-slate-700 dark:text-slate-200">✦ AI 댓글 필터</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => handleToggle(!phase1Enabled)}
                className={`relative rounded-full transition-colors ${phase1Enabled ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                style={{ height: '18px', width: '32px' }}
              >
                <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${phase1Enabled ? 'translate-x-3.5' : ''}`} />
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">활성화</span>
            </label>
          </div>

          {/* 모델 정보 */}
          <div className="text-[10px] text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 rounded-lg px-2.5 py-1.5">
            <div className="font-medium text-slate-500 dark:text-slate-400">paraphrase-multilingual-MiniLM-L12</div>
            <div>읽을만한 댓글 필터 (~120MB, IndexedDB 캐시)</div>
          </div>

          {/* 상태 표시 */}
          {phase1Enabled && (
            <div className="space-y-2">
              {phase1Status === 'idle' && (
                <button
                  onClick={loadModel}
                  className="w-full py-1.5 text-xs bg-teal-500 text-white rounded-xl hover:bg-teal-600 transition"
                >
                  모델 다운로드 시작
                </button>
              )}

              {phase1Status === 'downloading' && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
                    <span>다운로드 중...</span>
                    <span>{phase1Progress}%</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                    <div className="bg-teal-500 h-1.5 rounded-full transition-all" style={{ width: `${phase1Progress}%` }} />
                  </div>
                  <div className="text-[10px] text-teal-600 dark:text-teal-400">⚡ 처음 1회만 다운로드됩니다</div>
                </div>
              )}

              {phase1Status === 'ready' && (
                <button
                  onClick={handleClassify}
                  className="w-full py-1.5 text-xs bg-teal-500 text-white rounded-xl hover:bg-teal-600 transition flex items-center justify-center gap-1.5"
                >
                  <span>⚡ 댓글 분류 실행</span>
                  <span className="opacity-80">({comments.filter(c => c.replyLevel === 1).length}개)</span>
                </button>
              )}

              {phase1Status === 'running' && (
                <div className="text-center text-xs text-teal-600 dark:text-teal-400 flex items-center justify-center gap-2">
                  <span className="inline-block w-3 h-3 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                  분류 중...
                </div>
              )}

              {phase1Status === 'error' && (
                <div className="text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl p-2.5">
                  ❌ {phase1Error}
                  <button onClick={loadModel} className="block mt-1.5 text-red-500 hover:text-red-700 underline">재시도</button>
                </div>
              )}
            </div>
          )}

          {/* 분류 결과 + 필터 토글 */}
          {totalClassified > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  읽을만한 댓글 <span className="font-semibold text-teal-600">{worthReadingCount}개</span>
                  <span className="text-slate-400 dark:text-slate-500"> / {totalClassified}개</span>
                </div>
                <button
                  onClick={() => onQualityFilterToggle(!qualityFilterActive)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                    qualityFilterActive
                      ? 'bg-teal-500 text-white border-teal-500'
                      : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {qualityFilterActive ? '필터 ON' : '필터 OFF'}
                </button>
              </div>
              {qualityFilterActive && hiddenCount > 0 && (
                <div className="text-[10px] text-slate-400 dark:text-slate-500">
                  {hiddenCount}개 댓글이 필터됨
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 댓글 배지 (CommentsPanel에서 사용)
export function LlmQualityBadge({ label, score, tag }: { label: QualityLabel; score: number; tag: QualityTag }) {
  if (label !== 'worth_reading') return null;
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
      {tag} · {score}점
    </span>
  );
}
```

- [ ] **Step 2: CommentItem.tsx 배지 교체**

`src/features/comments/CommentItem.tsx` 127번째 줄 부근 배지 표시를 교체한다:

```typescript
// 변경 전
{comment._llmLabel && comment._llmLabel !== 'neutral' && (
  <span ...>
    {comment._llmLabel === 'positive' ? '긍정' : ...}
  </span>
)}

// 변경 후
{comment._llmLabel === 'worth_reading' && comment._llmScore !== undefined && comment._llmTag && (
  <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
    {comment._llmTag} · {comment._llmScore}점
  </span>
)}
```

- [ ] **Step 3: TypeScript 최종 확인**

```bash
pnpm tsc --noEmit 2>&1 | head -30
```

오류 없어야 한다.

- [ ] **Step 4: 커밋**

```bash
git add src/features/llm/LocalLLMPanel.tsx src/features/comments/CommentItem.tsx
git commit -m "feat: LocalLLMPanel UI — 품질 필터 ON/OFF, 점수+태그 배지"
```

---

## Task 6: 통합 테스트 및 Worker 최종 확인

**Files:**
- Test: `tests/filterEngine.spec.ts` (기존 테스트 통과 확인)

- [ ] **Step 1: 기존 vitest 테스트 통과 확인**

```bash
cd /Users/limgiho/Desktop/Source/MeblFilter/MerblFilter_Backup/merblFilter
pnpm test
```

예상 출력:
```
✓ tests/filterEngine.spec.ts (N tests)
Test Files  1 passed (1)
```

- [ ] **Step 2: 개발 서버 재시작 후 브라우저 동작 확인**

```bash
# 기존 서버 종료 후 재시작
lsof -i :3000 -t | xargs kill -9 2>/dev/null
pnpm dev > /tmp/nextdev.log 2>&1 &
sleep 8 && tail -3 /tmp/nextdev.log
```

예상 출력:
```
✓ Ready in ...ms
```

- [ ] **Step 3: 브라우저에서 순서대로 확인**

1. `http://localhost:3000/posts` 접속
2. 게시글 열기 → 댓글 패널 확인
3. "✦ AI 필터" 버튼 클릭 → 패널 열림
4. 활성화 토글 ON → "모델 다운로드 시작" 버튼 표시 확인
5. 다운로드 시작 → 진행률 표시 확인
6. 로드 완료 후 "댓글 분류 실행" 버튼 클릭
7. 분류 완료 후 "읽을만한 댓글 N개 / M개" 표시 확인
8. "필터 OFF" 버튼 클릭 → "필터 ON"으로 변경, 댓글 필터링 확인
9. 읽을만한 댓글에 `[경험공유 · 82점]` 형태 배지 표시 확인

- [ ] **Step 4: 최종 커밋**

```bash
git add -A
git commit -m "feat: 댓글 품질 필터 v2 완성 — 임베딩 few-shot, 점수+태그 UI"
```
