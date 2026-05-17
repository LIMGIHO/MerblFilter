'use client';

import { useRef, useCallback } from 'react';
import { useLlmStore } from '@/store/llmStore';

export function useWebLLM() {
  const engineRef = useRef<unknown>(null);
  const {
    phase2ModelId,
    phase2Status,
    setPhase2Status,
    setPhase2Progress,
    setPhase2Error,
    setPhase2ProgressMessage,
  } = useLlmStore();

  const loadModel = useCallback(async () => {
    if (phase2Status === 'ready') return;
    setPhase2Status('downloading');
    setPhase2Progress(0);
    setPhase2Error(null);

    try {
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
      const engine = await CreateMLCEngine(phase2ModelId, {
        initProgressCallback: (report: { progress: number; text: string }) => {
          setPhase2Progress(Math.round(report.progress * 100));
          setPhase2ProgressMessage(report.text);
        },
      });
      engineRef.current = engine;
      setPhase2Status('ready');
      setPhase2Progress(100);
    } catch (err) {
      setPhase2Status('error');
      setPhase2Error(String(err));
    }
  }, [phase2ModelId, phase2Status, setPhase2Status, setPhase2Progress, setPhase2Error, setPhase2ProgressMessage]);

  const generate = useCallback(async (
    systemPrompt: string,
    userPrompt: string,
    onChunk?: (chunk: string) => void,
  ): Promise<string> => {
    if (!engineRef.current || phase2Status !== 'ready') {
      throw new Error('모델이 로드되지 않았습니다');
    }

    setPhase2Status('running');
    try {
      const engine = engineRef.current as {
        chat: {
          completions: {
            create: (params: unknown) => Promise<unknown>;
          };
        };
      };

      if (onChunk) {
        const stream = await engine.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream: true,
          temperature: 0.7,
          max_tokens: 1024,
        }) as AsyncIterable<{ choices: Array<{ delta: { content?: string } }> }>;

        let full = '';
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? '';
          full += delta;
          onChunk(delta);
        }
        return full;
      } else {
        const res = await engine.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 1024,
        }) as { choices: Array<{ message: { content: string } }> };
        return res.choices[0].message.content;
      }
    } finally {
      setPhase2Status('ready');
    }
  }, [phase2Status, setPhase2Status]);

  const resetEngine = useCallback(() => {
    engineRef.current = null;
    setPhase2Status('idle');
    setPhase2Progress(0);
    setPhase2Error(null);
  }, [setPhase2Status, setPhase2Progress, setPhase2Error]);

  return {
    loadModel,
    generate,
    resetEngine,
    isReady: phase2Status === 'ready',
  };
}
