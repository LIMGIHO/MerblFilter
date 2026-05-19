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
  // dev 모드: Next.js dev 서버가 Sec-Fetch-Dest:worker 요청에 503을 반환
  //   → fetch() → Blob URL로 우회
  // production: new Worker(url) 직접 사용 (503 문제 없음)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let worker: Worker | null = null;
    let blobUrl: string | null = null;

    const workerUrl = new URL('./llm.worker.ts', import.meta.url);

    function attachHandlers(w: Worker) {
      w.onmessage = (e: MessageEvent) => {
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
      w.onerror = (err) => {
        setPhase1Status('error');
        setPhase1Error(err.message || 'Worker 초기화 실패');
      };
      workerRef.current = w;
    }

    if (process.env.NODE_ENV === 'development') {
      // dev: fetch → Blob URL (new Worker(url) 503 우회)
      fetch(workerUrl.href)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then((code) => {
          const blob = new Blob([code], { type: 'text/javascript' });
          blobUrl = URL.createObjectURL(blob);
          worker = new Worker(blobUrl);
          attachHandlers(worker);
        })
        .catch((err) => {
          setPhase1Status('error');
          setPhase1Error(`Worker 로드 실패: ${err.message}`);
        });
    } else {
      // production: 직접 생성
      worker = new Worker(workerUrl, { type: 'module' });
      attachHandlers(worker);
    }

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
