/// <reference lib="webworker" />
import { pipeline, env } from '@xenova/transformers';

// Transformers.js 설정
// IndexedDB 캐시 사용 (브라우저 내 저장)
env.useBrowserCache = true;
env.allowLocalModels = false;

type LlmLabel = 'spam' | 'promo' | 'negative' | 'neutral' | 'positive';

// 감성 레이블 → 우리 레이블 매핑
function mapLabel(rawLabel: string, score: number): LlmLabel {
  const l = rawLabel.toLowerCase();
  if (l.includes('1 star') || l.includes('very negative') || (l.includes('negative') && score > 0.7)) return 'negative';
  if (l.includes('2 star') || l.includes('negative')) return 'negative';
  if (l.includes('4 star') || l.includes('5 star') || l.includes('positive')) return 'positive';
  if (l.includes('3 star') || l.includes('neutral')) return 'neutral';
  return 'neutral';
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
      const texts = batch.map((c) => c.contents.slice(0, 512)); // 최대 512자

      try {
        const outputs = await (classifier as (texts: string[]) => Promise<Array<{ label: string; score: number }>[]>)(texts);
        for (let j = 0; j < batch.length; j++) {
          const out = outputs[j];
          const top = Array.isArray(out) ? out[0] : out;
          results.push({
            commentNo: batch[j].commentNo,
            label: mapLabel(top.label, top.score),
            score: top.score,
          });
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
