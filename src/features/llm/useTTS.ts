'use client';

import { useState, useEffect } from 'react';
import { ttsAudioManager } from '@/features/tts/ttsAudioManager';
import type { TTSStatus } from '@/features/tts/ttsAudioManager';

export type { TTSStatus };

export interface UseTTSReturn {
  isSupported: boolean;
  status: TTSStatus;
  rate: number;
  currentTime: number;
  duration: number;
  setRate: (r: number) => void;
  play: (text: string, onEnd?: () => void) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (time: number) => void;
}

/**
 * ttsAudioManager 싱글톤을 React 상태로 브리징하는 훅.
 * 오디오 인스턴스는 모듈 레벨에 유지되므로 페이지 이동 후에도 재생이 지속됨.
 */
export function useTTS(): UseTTSReturn {
  const isSupported = typeof window !== 'undefined' && typeof Audio !== 'undefined';

  const [state, setState] = useState(() => ttsAudioManager.getState());

  useEffect(() => {
    // 싱글톤 상태 변경 구독 — 언마운트 시 자동 해제
    const unsubscribe = ttsAudioManager.subscribe(() => {
      setState({ ...ttsAudioManager.getState() });
    });
    return unsubscribe;
  }, []);

  return {
    isSupported,
    status: state.status,
    rate: state.rate,
    currentTime: state.currentTime,
    duration: state.duration,
    setRate: (r) => ttsAudioManager.setRate(r),
    play: (text, onEnd) => ttsAudioManager.play(text, onEnd),
    pause: () => ttsAudioManager.pause(),
    resume: () => ttsAudioManager.resume(),
    stop: () => ttsAudioManager.stop(),
    seek: (time) => ttsAudioManager.seek(time),
  };
}
