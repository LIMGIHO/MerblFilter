'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useLlmStore } from '@/store/llmStore';
import { BlogComment } from '@/domain/comment/types';

type LlmLabel = 'spam' | 'promo' | 'negative' | 'neutral' | 'positive';

export interface ClassifyResult {
  commentNo: number;
  label: LlmLabel;
  score: number;
}

interface UseClassifierReturn {
  loadModel: () => void;
  classify: (comments: BlogComment[], onResult: (results: ClassifyResult[]) => void) => void;
  isReady: boolean;
}

export function useClassifier(): UseClassifierReturn {
  const workerRef = useRef<Worker | null>(null);
  const {
    phase1ModelId,
    phase1Status,
    setPhase1Status,
    setPhase1Progress,
    setPhase1Error,
  } = useLlmStore();

  // Worker 초기화
  // 문제: Next.js dev 모드에서 new Worker(url)이 503을 반환 (Sec-Fetch-Dest: worker 요청만)
  // 해결: fetch() → Blob URL로 Worker 생성 (fetch는 200 반환)
  // URL 획득: webpack 런타임(__webpack_require__)에서 컴파일된 청크 URL 계산
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let worker: Worker | null = null;
    let blobUrl: string | null = null;

    // webpack 런타임에서 컴파일된 worker 청크 URL을 계산
    // __webpack_require__는 webpack 모듈 컨텍스트 내에서 접근 가능
    // 청크 ID는 Next.js의 파일경로 기반 네이밍 규칙에서 유래
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wr: any = (globalThis as any).__webpack_require__ ?? null;
    const chunkId = '_app-pages-browser_src_features_llm_llm_worker_ts';
    const workerChunkUrl = wr?.p !== undefined
      ? new URL(wr.p + wr.u(chunkId), wr.b).href
      : null;

    if (!workerChunkUrl) {
      setPhase1Status('error');
      setPhase1Error('Worker URL 계산 실패 (webpack 컨텍스트 없음)');
      return;
    }

    // fetch() → Blob URL Worker (new Worker(url)의 503 문제 우회)
    fetch(workerChunkUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((code) => {
        const blob = new Blob([code], { type: 'text/javascript' });
        blobUrl = URL.createObjectURL(blob);
        worker = new Worker(blobUrl);

        worker.onmessage = (e: MessageEvent) => {
          const { type, payload } = e.data as { type: string; payload: Record<string, unknown> };

          if (type === 'progress') {
            setPhase1Progress(Number(payload.progress ?? 0));
            setPhase1Status('downloading');
          }
          if (type === 'loaded') {
            setPhase1Status('ready');
            setPhase1Progress(100);
          }
          if (type === 'error') {
            setPhase1Status('error');
            setPhase1Error(String(payload.message ?? '알 수 없는 오류'));
          }
        };

        worker.onerror = (err) => {
          setPhase1Status('error');
          setPhase1Error(err.message || 'Worker 초기화 실패');
        };

        workerRef.current = worker;
      })
      .catch((err) => {
        setPhase1Status('error');
        setPhase1Error(`Worker 스크립트 로드 실패: ${err.message}`);
      });

    return () => {
      worker?.terminate();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, []);

  const loadModel = useCallback(() => {
    if (!workerRef.current) return;
    setPhase1Status('downloading');
    setPhase1Progress(0);
    setPhase1Error(null);
    workerRef.current.postMessage({ type: 'load', payload: { modelId: phase1ModelId } });
  }, [phase1ModelId]);

  const classify = useCallback(
    (comments: BlogComment[], onResult: (results: ClassifyResult[]) => void) => {
      if (!workerRef.current || phase1Status !== 'ready') return;

      setPhase1Status('running');
      const simplified = comments.map((c) => ({
        commentNo: c.commentNo,
        contents: c.contents,
      }));

      const handler = (e: MessageEvent) => {
        const { type, payload } = e.data as { type: string; payload: Record<string, unknown> };
        if (type === 'classify_result') {
          onResult(payload.results as ClassifyResult[]);
          setPhase1Status('ready');
          workerRef.current?.removeEventListener('message', handler);
        }
      };

      workerRef.current.addEventListener('message', handler);
      workerRef.current.postMessage({ type: 'classify', payload: { comments: simplified } });
    },
    [phase1Status]
  );

  return {
    loadModel,
    classify,
    isReady: phase1Status === 'ready',
  };
}
