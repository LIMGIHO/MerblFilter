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
  // 'load' 요청이 pending 중인 modelId. onerror로 worker가 죽어도 재시도 후 자동 재전송.
  const pendingLoadModelRef = useRef<string | null>(null);
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
  // Next.js dev 모드: 레이지 컴파일로 Worker 번들이 첫 요청 시 503 반환 가능.
  // onerror 즉시 workerRef=null → 재시도 성공 시 pendingLoad 자동 재전송.
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
          pendingLoadModelRef.current = null; // 로드 완료 → pending 해제
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
        // onerror 즉시 null: loadModel이 죽은 worker에 메시지 보내는 것을 막음
        workerRef.current = null;

        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          setTimeout(initWorker, 500 * retryCountRef.current);
          return;
        }
        // 모든 재시도 실패
        pendingLoadModelRef.current = null;
        setPhase1Status('error');
        setPhase1Error(err.message || 'Worker 초기화 실패');
      };

      // 이전 worker가 죽는 동안 loadModel이 호출됐다면 → 새 worker에 자동 재전송
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
    // Worker가 없거나 죽어있으면 재초기화
    if (!workerRef.current) {
      retryCountRef.current = 0;
      initWorkerRef.current?.();
    }
    if (!workerRef.current) return;
    pendingLoadModelRef.current = phase1ModelId; // 재시도 중 worker가 죽어도 추적
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
