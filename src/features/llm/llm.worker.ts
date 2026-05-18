/// <reference lib="webworker" />
import { pipeline, env } from '@xenova/transformers';

// Transformers.js 설정
// IndexedDB 캐시 사용 (브라우저 내 저장)
env.useBrowserCache = true;
env.allowLocalModels = false;

type LlmLabel = 'spam' | 'promo' | 'negative' | 'neutral' | 'positive';

// HTML 태그 제거 (댓글 contents에 <br> 등 포함될 수 있음)
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// 1~5star 전체 확률분포 가중평균으로 레이블 결정
// topk=5 결과: [{label:'1 star', score:0.x}, {label:'2 stars', score:0.x}, ...]
// 가중치: 1star=-2, 2star=-1, 3star=0, 4star=+1, 5star=+2
// 블로그 댓글 특성상 negative 기준을 엄격하게, positive는 조금 너그럽게
function computeLabel(scores: Array<{ label: string; score: number }>): { label: LlmLabel; score: number } {
  const WEIGHTS: Record<string, number> = {
    '1 star': -2, '2 stars': -1, '3 stars': 0, '4 stars': 1, '5 stars': 2,
    // fallback for non-star models
    'very negative': -2, 'negative': -1, 'neutral': 0, 'positive': 1, 'very positive': 2,
  };

  let weighted = 0;
  let topScore = 0;
  for (const s of scores) {
    const w = WEIGHTS[s.label.toLowerCase()] ?? 0;
    weighted += w * s.score;
    if (s.score > topScore) topScore = s.score;
  }

  // weighted 범위: -2 ~ +2
  // 블로그 댓글 기준:
  //   -1.0 이하 → 부정 (1~2star 위주)
  //   +0.5 이상 → 긍정 (4~5star 위주)
  //   그 외 → 중립
  if (weighted <= -1.0) return { label: 'negative', score: topScore };
  if (weighted >= 0.5)  return { label: 'positive', score: topScore };
  return { label: 'neutral', score: topScore };
}

let classifier: Awaited<ReturnType<typeof pipeline>> | null = null;
let currentModelId = '';

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data as {
    type: 'load' | 'classify' | 'unload';
    payload: Record<string, unknown>;
  };

  if (type === 'load') {
    const modelId = (payload.modelId as string) ?? 'Xenova/bert-base-multilingual-uncased-sentiment';

    if (classifier && currentModelId === modelId) {
      self.postMessage({ type: 'loaded', payload: { modelId } });
      return;
    }

    try {
      self.postMessage({ type: 'progress', payload: { progress: 0, message: '모델 초기화 중...' } });

      classifier = await pipeline('sentiment-analysis', modelId, {
        progress_callback: (info: { progress?: number; status?: string }) => {
          const pct = Math.round(info?.progress ?? 0);
          self.postMessage({
            type: 'progress',
            payload: { progress: pct, message: info?.status ?? '다운로드 중...' },
          });
        },
      });

      currentModelId = modelId;
      self.postMessage({ type: 'loaded', payload: { modelId } });
    } catch (err) {
      self.postMessage({ type: 'error', payload: { message: String(err) } });
    }
  }

  if (type === 'classify') {
    if (!classifier) {
      self.postMessage({ type: 'error', payload: { message: '모델이 로드되지 않았습니다' } });
      return;
    }

    const comments = payload.comments as Array<{ commentNo: number; contents: string }>;
    const batchSize = 16;
    const results: Array<{ commentNo: number; label: LlmLabel; score: number }> = [];

    for (let i = 0; i < comments.length; i += batchSize) {
      const batch = comments.slice(i, i + batchSize);
      // HTML 제거 후 512자 제한
      const texts = batch.map((c) => stripHtml(c.contents).slice(0, 512));

      try {
        // topk=5: 모든 클래스 확률분포를 가져와 가중평균으로 판정 (top-1 argmax보다 정확)
        const outputs = await (classifier as (
          texts: string[],
          opts: { topk: number }
        ) => Promise<Array<Array<{ label: string; score: number }>>>)(texts, { topk: 5 });

        for (let j = 0; j < batch.length; j++) {
          const allScores = outputs[j];
          const { label, score } = computeLabel(allScores);
          results.push({ commentNo: batch[j].commentNo, label, score });
        }
      } catch {
        // 배치 실패시 neutral로 처리
        batch.forEach((c) => results.push({ commentNo: c.commentNo, label: 'neutral', score: 0 }));
      }

      // 진행률 보고
      const pct = Math.round(((i + batch.length) / comments.length) * 100);
      self.postMessage({ type: 'classify_progress', payload: { progress: pct } });
    }

    self.postMessage({ type: 'classify_result', payload: { results } });
  }

  if (type === 'unload') {
    classifier = null;
    currentModelId = '';
    self.postMessage({ type: 'unloaded' });
  }
};
