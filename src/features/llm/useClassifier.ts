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
  const initWorkerRef = useRef<(() => void) | null>(null);
  const retryCountRef = useRef(0);
  const pendingLoadModelRef = useRef<string | null>(null);
  const {
    phase1ModelId,
    phase1Status,
    setPhase1Status,
    setPhase1Progress,
    setPhase1Error,
  } = useLlmStore();

  // Worker 초기화
  //
  // public/llm-worker.js = esbuild로 독립 빌드된 Worker 전용 번들
  //   → llm.worker.ts + @xenova/transformers만 포함, react-dom/Next.js 런타임 없음
  //   → webpack HMR 영향 없는 정적 파일 (항상 200)
  //
  // Blob URL 방식:
  //   COEP credentialless 환경에서 new Worker('/llm-worker.js') 직접 URL은
  //   Chrome이 CORP 헤더 없다는 이유로 onerror 발생시킴.
  //   fetch → Blob → new Worker(blobUrl) 패턴으로 우회.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let currentWorker: Worker | null = null;
    const MAX_RETRIES = 10;
    let cancelled = false;

    const initWorker = async () => {
      if (cancelled) return;

      let worker: Worker;
      try {
        const res = await fetch('/llm-worker.js');
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        worker = new Worker(blobUrl);
        URL.revokeObjectURL(blobUrl); // Worker가 이미 로드했으므로 즉시 해제 가능
      } catch (err) {
        if (cancelled) return;
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          const delay = 500 * Math.min(retryCountRef.current, 6);
          setTimeout(initWorker, delay);
        } else {
          pendingLoadModelRef.current = null;
          setPhase1Status('error');
          setPhase1Error(String((err as Error).message ?? 'Worker 로드 실패'));
        }
        return;
      }

      currentWorker = worker;
      workerRef.current = worker;

      worker.onmessage = (e: MessageEvent) => {
        const { type, payload } = e.data as { type: string; payload: Record<string, unknown> };
        if (type === 'progress') {
          setPhase1Progress(Number(payload.progress ?? 0));
          setPhase1Status('downloading');
        }
        if (type === 'loaded') {
          pendingLoadModelRef.current = null;
          setPhase1Status('ready');
          setPhase1Progress(100);
        }
        if (type === 'error') {
          pendingLoadModelRef.current = null;
          setPhase1Status('error');
          setPhase1Error(String(payload.message ?? '알 수 없는 오류'));
        }
      };
      worker.onerror = (err) => {
        if (cancelled) return;
        workerRef.current = null;
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          const delay = 500 * Math.min(retryCountRef.current, 6);
          setTimeout(initWorker, delay);
          return;
        }
        pendingLoadModelRef.current = null;
        setPhase1Status('error');
        setPhase1Error(err.message || 'Worker 초기화 실패');
      };

      // 이전 Worker가 죽는 동안 loadModel이 호출됐다면 → 새 Worker에 자동 재전송
      if (pendingLoadModelRef.current) {
        worker.postMessage({ type: 'load', payload: { modelId: pendingLoadModelRef.current } });
      }
    };

    initWorkerRef.current = initWorker;
    initWorker();

    return () => {
      cancelled = true;
      initWorkerRef.current = null;
      currentWorker?.terminate();
    };
  }, []);

  const loadModel = useCallback(() => {
    // pending 먼저 설정 → initWorker(async)가 완료되면 자동으로 load 메시지 전송
    pendingLoadModelRef.current = phase1ModelId;
    setPhase1Status('downloading');
    setPhase1Progress(0);
    setPhase1Error(null);

    if (!workerRef.current) {
      // Worker가 없으면 재초기화 (async initWorker가 완료 후 pendingLoad 자동 전송)
      retryCountRef.current = 0;
      initWorkerRef.current?.();
      return;
    }
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
