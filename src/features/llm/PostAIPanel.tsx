'use client';

import { useState, useCallback, useRef } from 'react';
import { useLlmStore, WEBLLM_MODELS } from '@/store/llmStore';
import { useWebLLM } from './useWebLLM';

interface PostAIPanelProps {
  postId: string;
  blogId: string;
  postTitle: string;
  onClose: () => void;
}

const QUICK_PROMPTS = [
  '이 게시글을 3줄로 요약해줘',
  '스팸 또는 광고성 댓글을 찾아줘',
  '주요 댓글 반응을 분석해줘',
  '부정적인 댓글을 찾아줘',
];

export default function PostAIPanel({ postId, blogId, postTitle, onClose }: PostAIPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [showModelSelect, setShowModelSelect] = useState(false);
  const answerRef = useRef('');

  const {
    phase2Status,
    phase2Progress,
    phase2ProgressMessage,
    phase2ModelId,
    phase2Error,
    setPhase2ModelId,
  } = useLlmStore();

  const { loadModel, generate, isReady } = useWebLLM();

  const handleSubmit = useCallback(async (customPrompt?: string) => {
    const finalPrompt = customPrompt ?? prompt;
    if (!finalPrompt.trim() || isGenerating) return;

    setIsFetching(true);
    setAnswer('');
    answerRef.current = '';

    // 댓글 fetch
    let commentsText = '';
    try {
      const res = await fetch(`/api/comments?postId=${postId}&blogId=${blogId}`);
      const data = await res.json();
      const list = data.result?.commentList ?? [];
      commentsText = list
        .filter((c: { replyLevel: number }) => c.replyLevel === 1)
        .slice(0, 50)
        .map((c: { userName?: string; contents: string }) => `- ${c.userName ?? '익명'}: ${c.contents}`)
        .join('\n');
    } catch {
      commentsText = '(댓글 로딩 실패)';
    }
    setIsFetching(false);

    const systemPrompt = `당신은 네이버 블로그 게시글과 댓글을 분석하는 AI입니다. 한국어로 간결하게 답변하세요.`;
    const userPrompt = `[게시글 제목]\n${postTitle}\n\n[댓글 목록]\n${commentsText || '(댓글 없음)'}\n\n[요청]\n${finalPrompt}`;

    setIsGenerating(true);
    try {
      await generate(systemPrompt, userPrompt, (chunk) => {
        answerRef.current += chunk;
        setAnswer(answerRef.current);
      });
    } catch (e) {
      setAnswer(`오류: ${String(e)}`);
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, postId, blogId, postTitle, generate, isGenerating]);

  const selectedModel = WEBLLM_MODELS.find(m => m.id === phase2ModelId) ?? WEBLLM_MODELS[1];

  return (
    <div className="mt-2 mx-1 rounded-xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-gray-900 shadow-lg overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-violet-50 dark:bg-violet-900/30 border-b border-violet-100 dark:border-violet-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-violet-700 dark:text-violet-300">🤖 AI 요청</span>
          <button
            onClick={() => setShowModelSelect(v => !v)}
            className="text-xs px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-800 transition"
          >
            {selectedModel.label} ({selectedModel.size})
          </button>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none">×</button>
      </div>

      {/* 모델 선택 */}
      {showModelSelect && (
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 space-y-2">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">모델 선택 (변경 시 재다운로드)</div>
          {WEBLLM_MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => { setPhase2ModelId(m.id); setShowModelSelect(false); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition
                ${m.id === phase2ModelId
                  ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 font-medium'
                  : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
            >
              <span>{m.label} — {m.description}</span>
              <span className="text-xs text-gray-400">{m.size}</span>
            </button>
          ))}
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* 모델 로드 상태 */}
        {phase2Status === 'idle' && (
          <button
            onClick={loadModel}
            className="w-full py-2 text-sm bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition"
          >
            모델 로드 ({selectedModel.size} 다운로드)
          </button>
        )}

        {phase2Status === 'downloading' && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span className="truncate">{phase2ProgressMessage || '다운로드 중...'}</span>
              <span className="ml-2 flex-shrink-0">{phase2Progress}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div className="bg-violet-500 h-1.5 rounded-full transition-all" style={{ width: `${phase2Progress}%` }} />
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500">첫 다운로드 후 IndexedDB에 캐시됩니다</div>
          </div>
        )}

        {phase2Status === 'error' && (
          <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-2">
            ❌ {phase2Error}
            <button onClick={loadModel} className="block mt-1 underline">재시도</button>
          </div>
        )}

        {isReady && (
          <>
            {/* 빠른 프롬프트 */}
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map(q => (
                <button
                  key={q}
                  onClick={() => handleSubmit(q)}
                  disabled={isGenerating || isFetching}
                  className="text-xs px-2.5 py-1 rounded-full border border-violet-200 dark:border-violet-700 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition disabled:opacity-40"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* 프롬프트 입력 */}
            <div className="flex gap-2">
              <input
                type="text"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
                placeholder="직접 질문 입력..."
                disabled={isGenerating || isFetching}
                className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:border-violet-400 disabled:opacity-50"
              />
              <button
                onClick={() => handleSubmit()}
                disabled={!prompt.trim() || isGenerating || isFetching}
                className="px-4 py-2 text-sm bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition disabled:opacity-40"
              >
                {isFetching ? '댓글 로딩...' : isGenerating ? '생성 중...' : '전송'}
              </button>
            </div>
          </>
        )}

        {/* 답변 */}
        {answer && (
          <div className="text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
            {answer}
            {isGenerating && <span className="inline-block w-1.5 h-4 bg-violet-500 animate-pulse ml-0.5 align-middle" />}
          </div>
        )}
      </div>
    </div>
  );
}
