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
const NOISE_ONLY_PATTERN = /^[ㅎㅋㅠㅜㅡ~^.!?\s]+$/;

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
