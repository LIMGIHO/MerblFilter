'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useLlmStore } from '@/store/llmStore';
import { BlogComment } from '@/domain/comment/types';

export type QualityLabel = 'worth_reading' | 'noise' | 'spam';
export type QualityTag = '경험공유' | '의견있음' | 'noise' | 'spam';

export interface ClassifyResult {
  commentNo: number;
  label: QualityLabel;
  score: number;   // 0~100
  tag: QualityTag;
}

interface UseClassifierReturn {
  loadModel: () => void;
  classify: (comments: BlogComment[], onResult: (results: ClassifyResult[]) => void) => void;
  isReady: boolean;
}

export function useClassifier(): UseClassifierReturn {
  const workerRef = useRef<Worker | null>(null);
  const {
    phase1Status,
    setPhase1Status,
    setPhase1Progress,
    setPhase1Error,
  } = useLlmStore();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let worker: Worker | null = null;

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

    // Next.js 15 dev 서버는 { type: 'module' } Worker를 정상 처리함
    // Blob URL Worker는 origin=null → IndexedDB(useBrowserCache) SecurityError로 멈춤
    worker = new Worker(workerUrl, { type: 'module' });
    attachHandlers(worker);

    return () => {
      worker?.terminate();
    };
  }, []);

  const loadModel = useCallback(() => {
    if (!workerRef.current) return;
    setPhase1Status('downloading');
    setPhase1Progress(0);
    setPhase1Error(null);
    workerRef.current.postMessage({ type: 'load', payload: {} });
  }, []);

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
