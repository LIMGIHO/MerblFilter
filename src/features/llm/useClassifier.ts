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
  const initWorkerRef = useRef<(() => void) | null>(null);
  const retryCountRef = useRef(0);
  const {
    phase1ModelId,
    phase1Status,
    setPhase1Status,
    setPhase1Progress,
    setPhase1Error,
  } = useLlmStore();

  // Worker 초기화
  // webpack 5 네이티브 패턴: new Worker(new URL(...)) 인라인으로 사용해야
  // webpack이 worker 전용 번들을 생성함. 변수로 분리하면 static media 파일로
  // 처리되어 bare import 구문이 번들 없이 Worker에 전달되는 SyntaxError 발생.
  //
  // Next.js dev 모드 주의: 레이지 컴파일로 인해 Worker 번들이 처음 요청 시
  // 503을 반환할 수 있음. onerror에서 최대 5회 자동 재시도.
  // 모든 재시도 실패 시 workerRef를 null로 설정 → loadModel 재호출 시 재초기화.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let currentWorker: Worker | null = null;
    const MAX_RETRIES = 5;
    let cancelled = false;

    const initWorker = () => {
      if (cancelled) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const worker = new Worker(new URL('./llm.worker.ts', import.meta.url));
      currentWorker = worker;
      workerRef.current = worker;

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
        if (cancelled) return;
        // dev 모드 레이지 컴파일 503 → 자동 재시도
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          setTimeout(initWorker, 500 * retryCountRef.current);
          return;
        }
        // 모든 재시도 실패 → workerRef를 null로 표시해 loadModel에서 재초기화 가능하게 함
        workerRef.current = null;
        setPhase1Status('error');
        setPhase1Error(err.message || 'Worker 초기화 실패');
      };
    };

    // initWorker를 loadModel에서도 호출할 수 있도록 ref에 저장
    initWorkerRef.current = initWorker;

    initWorker();

    return () => {
      cancelled = true;
      initWorkerRef.current = null;
      currentWorker?.terminate();
    };
  }, []);

  const loadModel = useCallback(() => {
    // Worker가 null이면 재초기화 (dev 모드 503 후 사용자가 재시도 버튼 클릭 시)
    if (!workerRef.current) {
      retryCountRef.current = 0; // 사용자가 직접 재시도 → 재시도 카운트 초기화
      initWorkerRef.current?.();
    }
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
