'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export type TTSStatus = 'idle' | 'loading' | 'playing' | 'paused';

export interface UseTTSReturn {
  isSupported: boolean;
  status: TTSStatus;
  rate: number;
  setRate: (r: number) => void;
  play: (text: string, onEnd?: () => void) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

/**
 * Edge TTS (Microsoft Neural) 기반 TTS 훅.
 * - 서버의 /api/tts 에서 MP3 스트림을 받아 MediaSource API로 즉시 재생
 * - 첫 청크 도착 즉시 재생 시작 → 로딩 체감 대폭 감소
 * - MediaSource 미지원 브라우저는 Blob 방식으로 자동 fallback
 */
export function useTTS(): UseTTSReturn {
  const [status, setStatus] = useState<TTSStatus>('idle');
  const [rate, setRateState] = useState(1.0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const onEndRef = useRef<(() => void) | undefined>(undefined);
  const cancelTokenRef = useRef(0);

  const isSupported = typeof window !== 'undefined' && typeof Audio !== 'undefined';

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelTokenRef.current++;
      cleanup();
    };
  }, [cleanup]);

  const stop = useCallback(() => {
    cancelTokenRef.current++;
    cleanup();
    onEndRef.current = undefined;
    setStatus('idle');
  }, [cleanup]);

  const play = useCallback(
    async (text: string, onEnd?: () => void) => {
      if (!isSupported || !text.trim()) return;

      cancelTokenRef.current++;
      const token = cancelTokenRef.current;
      cleanup();
      onEndRef.current = onEnd;
      setStatus('loading');

      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });

        if (token !== cancelTokenRef.current) return;
        if (!res.ok) throw new Error(`TTS 요청 실패: ${res.status}`);

        // MediaSource 스트리밍 지원 여부 확인
        const canStream =
          typeof MediaSource !== 'undefined' &&
          MediaSource.isTypeSupported('audio/mpeg') &&
          !!res.body;

        if (!canStream) {
          // Fallback: 전체 다운로드 후 재생 (구형 브라우저 / Safari 일부)
          const blob = await res.blob();
          if (token !== cancelTokenRef.current) return;
          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;
          const audio = new Audio(url);
          audio.playbackRate = rate;
          audio.onended = () => {
            if (token !== cancelTokenRef.current) return;
            setStatus('idle');
            const cb = onEndRef.current;
            onEndRef.current = undefined;
            cb?.();
          };
          audioRef.current = audio;
          await audio.play();
          if (token === cancelTokenRef.current) setStatus('playing');
          return;
        }

        // ── MediaSource 스트리밍 재생 ──────────────────────────────
        const ms = new MediaSource();
        const url = URL.createObjectURL(ms);
        objectUrlRef.current = url;

        const audio = new Audio(url);
        audio.playbackRate = rate;
        audioRef.current = audio;

        audio.onended = () => {
          if (token !== cancelTokenRef.current) return;
          setStatus('idle');
          const cb = onEndRef.current;
          onEndRef.current = undefined;
          cb?.();
        };
        audio.onerror = () => {
          if (token === cancelTokenRef.current) setStatus('idle');
        };

        await new Promise<void>((resolve, reject) => {
          ms.addEventListener(
            'sourceopen',
            async () => {
              let sb: SourceBuffer;
              try {
                sb = ms.addSourceBuffer('audio/mpeg');
              } catch (e) {
                reject(e);
                return;
              }

              const reader = res.body!.getReader();
              let playStarted = false;

              // updateend 를 항상 기다리는 헬퍼
              const waitUpdateEnd = () =>
                new Promise<void>((r) =>
                  sb.addEventListener('updateend', () => r(), { once: true })
                );

              try {
                while (true) {
                  const { done, value } = await reader.read();

                  if (token !== cancelTokenRef.current) {
                    reader.cancel();
                    try { ms.endOfStream(); } catch {}
                    resolve();
                    return;
                  }

                  if (done) {
                    if (sb.updating) await waitUpdateEnd();
                    try { ms.endOfStream(); } catch {}
                    resolve();
                    return;
                  }

                  // 이전 append 가 아직 처리 중이면 대기
                  if (sb.updating) await waitUpdateEnd();
                  if (token !== cancelTokenRef.current) { resolve(); return; }

                  sb.appendBuffer(value);

                  // appendBuffer 완료까지 반드시 대기 (경쟁 조건 방지)
                  await waitUpdateEnd();

                  // 첫 청크 append 완료 후 즉시 재생 시작
                  if (!playStarted) {
                    playStarted = true;
                    audio
                      .play()
                      .then(() => {
                        if (token === cancelTokenRef.current) setStatus('playing');
                      })
                      .catch((e) => console.error('[useTTS] play error:', e));
                  }
                }
              } catch (err) {
                reject(err);
              }
            },
            { once: true }
          );
        });
      } catch (err) {
        console.error('[useTTS]', err);
        if (token === cancelTokenRef.current) setStatus('idle');
      }
    },
    [isSupported, rate, cleanup]
  );

  const pause = useCallback(() => {
    if (audioRef.current && status === 'playing') {
      audioRef.current.pause();
      setStatus('paused');
    }
  }, [status]);

  const resume = useCallback(() => {
    if (audioRef.current && status === 'paused') {
      audioRef.current.play().then(() => setStatus('playing')).catch(() => setStatus('idle'));
    }
  }, [status]);

  const setRate = useCallback((r: number) => {
    setRateState(r);
    if (audioRef.current) {
      audioRef.current.playbackRate = r;
    }
  }, []);

  return { isSupported, status, rate, setRate, play, pause, resume, stop };
}
