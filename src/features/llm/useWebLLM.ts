'use client';

import { useCallback } from 'react';
import { useLlmStore } from '@/store/llmStore';

// 모듈 레벨 싱글톤 — 컴포넌트 마운트/언마운트에도 유지됨
let _engine: unknown = null;

export function useWebLLM() {
  const {
    phase2ModelId,
    phase2Status,
    setPhase2Status,
    setPhase2Progress,
    setPhase2Error,
    setPhase2ProgressMessage,
    markPhase2ModelDownloaded,
  } = useLlmStore();

  const loadModel = useCallback(async () => {
    if (phase2Status === 'ready') return;
    setPhase2Status('downloading');
    setPhase2Progress(0);
    setPhase2Error(null);

    try {
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
      const engine = await CreateMLCEngine(
        phase2ModelId,
        {
          initProgressCallback: (report: { progress: number; text: string }) => {
            setPhase2Progress(Math.round(report.progress * 100));
            setPhase2ProgressMessage(report.text);
          },
        },
        {
          // Qwen 2.5는 native 32K 지원. 댓글 전체 + 본문까지 수용
          context_window_size: 32768,
        },
      );
      _engine = engine;
      setPhase2Status('ready');
      setPhase2Progress(100);
      markPhase2ModelDownloaded(phase2ModelId);
    } catch (err) {
      setPhase2Status('error');
      setPhase2Error(String(err));
    }
  }, [phase2ModelId, phase2Status, setPhase2Status, setPhase2Progress, setPhase2Error, setPhase2ProgressMessage, markPhase2ModelDownloaded]);

  const generate = useCallback(async (
    systemPrompt: string,
    userPrompt: string,
    onChunk?: (chunk: string) => void,
    opts?: { temperature?: number; maxTokens?: number },
  ): Promise<string> => {
    if (!_engine || phase2Status !== 'ready') {
      throw new Error('모델이 로드되지 않았습니다');
    }

    setPhase2Status('running');
    try {
      const engine = _engine as {
        chat: {
          completions: {
            create: (params: unknown) => Promise<unknown>;
          };
        };
      };

      const temperature = opts?.temperature ?? 0.7;
      const max_tokens = opts?.maxTokens ?? 1536;

      if (onChunk) {
        const stream = await engine.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream: true,
          temperature,
          max_tokens,
          frequency_penalty: 0.6,
          presence_penalty: 0.4,
        }) as AsyncIterable<{ choices: Array<{ delta: { content?: string } }> }>;

        let full = '';
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? '';
          full += delta;
          onChunk(delta);
        }
        setPhase2Status('ready');
        return full;
      } else {
        const res = await engine.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_tokens,
          frequency_penalty: 0.6,
          presence_penalty: 0.4,
        }) as { choices: Array<{ message: { content: string } }> };
        setPhase2Status('ready');
        return res.choices[0].message.content;
      }
    } catch (err) {
      // WebGPU 컨텍스트 손실(모바일 백그라운드, 메모리 부족 등) 시 엔진 리셋
      _engine = null;
      const msg = String(err);
      const isGpuError = msg.toLowerCase().includes('gpu') || msg.toLowerCase().includes('webgpu');
      setPhase2Status('error');
      setPhase2Error(
        isGpuError
          ? 'GPU 오류가 발생했습니다. 다시 로드 버튼을 눌러주세요.'
          : msg
      );
      throw err;
    }
  }, [phase2Status, setPhase2Status]);

  const resetEngine = useCallback(() => {
    _engine = null;
    setPhase2Status('idle');
    setPhase2Progress(0);
    setPhase2Error(null);
  }, [setPhase2Status, setPhase2Progress, setPhase2Error]);

  return {
    loadModel,
    generate,
    resetEngine,
    isReady: phase2Status === 'ready',
    // 메모리에 로드된 상태: 생성중이어도 '로드됨'으로 취급
    isModelLoaded: phase2Status === 'ready' || phase2Status === 'running',
  };
}
