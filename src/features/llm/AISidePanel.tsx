'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useLlmStore, WEBLLM_MODELS } from '@/store/llmStore';
import { useWebLLM } from './useWebLLM';
import MessageContent from './MessageContent';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;     // 사용자에게 보일 최종 답변
  thinking?: string;   // <think>...</think> 안의 추론 과정 (어시스턴트 전용)
  postTitle: string;
  isError?: boolean;
}

/** 스트리밍 텍스트에서 <think>...</think> 와 본문을 분리 */
function splitThinking(raw: string): { thinking: string; answer: string } {
  const closed = raw.match(/<think>([\s\S]*?)<\/think>([\s\S]*)/);
  if (closed) {
    return { thinking: closed[1].trim(), answer: closed[2].replace(/^\s+/, '') };
  }
  const open = raw.match(/<think>([\s\S]*)/);
  if (open) {
    return { thinking: open[1].trim(), answer: '' };
  }
  return { thinking: '', answer: raw };
}

export interface SelectedPost {
  postId: string;
  blogId: string;
  title: string;
}

interface AISidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPost: SelectedPost | null;
  width: number;
  onWidthChange: (w: number) => void;
  minWidth: number;
  maxWidth: number;
}

const QUICK_PROMPTS = ['3줄 요약', '스팸 댓글 찾기', '댓글 반응 분석', '부정적 댓글'];

export default function AISidePanel({ isOpen, onClose, selectedPost, width, onWidthChange, minWidth, maxWidth }: AISidePanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef('');
  const currentMsgIdRef = useRef('');

  const {
    phase2Status, phase2Progress, phase2ProgressMessage,
    phase2ModelId, phase2Error, phase2DownloadedModels,
    setPhase2ModelId,
  } = useLlmStore();
  const isCurrentModelDownloaded = phase2DownloadedModels.includes(phase2ModelId);
  const [showModelSelect, setShowModelSelect] = useState(false);
  const { loadModel, generate, isModelLoaded } = useWebLLM();
  const selectedModel = WEBLLM_MODELS.find(m => m.id === phase2ModelId) ?? WEBLLM_MODELS[1];

  // 리사이즈 / 데스크탑 상태
  const [isResizing, setIsResizing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  // 드래그 중 글로벌 mouse 이벤트
  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      const target = window.innerWidth - e.clientX;
      const max = Math.min(maxWidth, window.innerWidth - 320);
      onWidthChange(Math.min(max, Math.max(minWidth, target)));
    };
    const onUp = () => setIsResizing(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, minWidth, maxWidth, onWidthChange]);

  // 패널 열림 + 다운로드 완료 + idle 상태 → 자동 로드
  useEffect(() => {
    if (isOpen && isCurrentModelDownloaded && phase2Status === 'idle') {
      loadModel();
    }
  }, [isOpen, isCurrentModelDownloaded, phase2Status, loadModel]);

  // 새 메시지 생길 때 맨 아래로 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = useCallback(async (customPrompt?: string) => {
    if (!selectedPost) return;
    const finalPrompt = customPrompt ?? input;
    if (!finalPrompt.trim() || isGenerating) return;
    setInput('');

    // 유저 메시지 추가
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: finalPrompt,
      postTitle: selectedPost.title,
    };
    setMessages(prev => [...prev, userMsg]);

    // 본문 + 댓글 병렬 fetch
    setIsFetching(true);
    let postBody = '';
    let commentsText = '';
    try {
      const [bodyRes, cmtRes] = await Promise.all([
        fetch(`/api/post-content?postId=${selectedPost.postId}&blogId=${selectedPost.blogId}`),
        fetch(`/api/comments?postId=${selectedPost.postId}&blogId=${selectedPost.blogId}`),
      ]);
      const bodyJson = await bodyRes.json();
      postBody = String(bodyJson.content ?? '').slice(0, 6000); // 본문 최대 6000자

      const cmtJson = await cmtRes.json();
      const list = cmtJson.result?.commentList ?? [];
      commentsText = list
        .filter((c: { replyLevel: number }) => c.replyLevel === 1)
        .map((c: { userName?: string; contents: string }) => {
          const trimmed = c.contents.length > 150
            ? c.contents.slice(0, 150) + '…'
            : c.contents;
          return `- ${c.userName ?? '익명'}: ${trimmed}`;
        })
        .join('\n');
    } catch {
      commentsText = '(데이터 로딩 실패)';
    }
    setIsFetching(false);

    // 어시스턴트 응답 자리 확보 (스트리밍)
    const msgId = (Date.now() + 1).toString();
    currentMsgIdRef.current = msgId;
    answerRef.current = '';
    setMessages(prev => [...prev, { id: msgId, role: 'assistant', content: '', postTitle: selectedPost.title }]);

    // 작업 유형 분류 → temperature 조절
    const isSummary = /요약|정리|핵심|3줄/.test(finalPrompt);
    const temperature = isSummary ? 0.3 : 0.7;

    setIsGenerating(true);
    try {
      const systemPrompt = `당신은 네이버 블로그 글과 댓글을 분석하는 한국어 AI 어시스턴트입니다.

[규칙]
- 반드시 제공된 [본문]과 [댓글] 자료에 기반하여 답하세요. 추측이나 외부 지식 추가 금지.
- 답변은 한국어, 간결하고 구체적으로. 형식적인 미사여구 금지.
- 정보가 부족하면 "본문에 명확한 언급 없음"이라고 솔직히 말하세요.
- 마크다운(**굵게**, - 목록, 1. 번호) 적절히 사용해 가독성 확보.

[응답 형식]
<think>
1~2줄로 어떻게 답할지 짧게 계획
</think>
[실제 답변 — 사용자에게 바로 보일 내용]`;

      const userPrompt = `[게시글 제목]
${selectedPost.title}

[본문]
${postBody || '(본문을 가져오지 못했습니다 — 제목과 댓글만 참고하세요)'}

[댓글 ${commentsText ? commentsText.split('\n').length : 0}개]
${commentsText || '(댓글 없음)'}

[요청]
${finalPrompt}`;

      await generate(systemPrompt, userPrompt, (chunk) => {
        answerRef.current += chunk;
        const { thinking, answer } = splitThinking(answerRef.current);
        setMessages(prev => prev.map(m =>
          m.id === msgId ? { ...m, thinking: thinking || undefined, content: answer } : m
        ));
      }, { temperature, maxTokens: isSummary ? 1024 : 1536 });
    } catch (e) {
      const raw = String(e);
      const friendly = raw.includes('ContextWindowSize') || raw.includes('context window')
        ? '⚠️ 댓글이 너무 많아 컨텍스트 한도를 초과했어요. 댓글 수가 적은 다른 게시글로 시도해주세요.'
        : `오류: ${raw}`;
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, content: friendly, isError: true } : m
      ));
    } finally {
      setIsGenerating(false);
    }
  }, [selectedPost, input, isGenerating, generate]);

  if (!isOpen) return null;

  return (
    <>
      {/* 모바일 백드롭 */}
      <div
        className="fixed inset-0 bg-black/30 z-40 md:hidden"
        onClick={onClose}
      />

      {/* 사이드 패널 */}
      <div
        className="fixed top-0 right-0 h-screen bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl z-50 flex flex-col animate-slide-in-right"
        style={isDesktop ? { width: `${width}px` } : { width: '100%' }}
      >
        {/* 리사이즈 핸들 (데스크탑) */}
        {isDesktop && (
          <div
            onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}
            className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize z-10 group"
            title="드래그해서 너비 조절"
          >
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-12 rounded-full bg-gray-300 dark:bg-gray-600 group-hover:bg-violet-400 dark:group-hover:bg-violet-500 transition-colors" />
          </div>
        )}

        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-violet-50 dark:bg-violet-900/20 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">🤖</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">AI 어시스턴트</div>
                <button
                  onClick={() => setShowModelSelect(v => !v)}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-800 transition flex items-center gap-0.5"
                  title="모델 선택"
                >
                  <span>{selectedModel.label}</span>
                  <span className="opacity-60">({selectedModel.size})</span>
                  <span className={`transition-transform ${showModelSelect ? 'rotate-180' : ''}`}>▾</span>
                </button>
              </div>
              {selectedPost && (
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-56 mt-0.5" title={selectedPost.title}>
                  {selectedPost.title}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 ml-2 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            ×
          </button>
        </div>

        {/* 모델 선택 드롭다운 */}
        {showModelSelect && (
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 space-y-1.5 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              모델 선택 (변경 시 새 모델 로드 필요)
            </div>
            {WEBLLM_MODELS.map(m => {
              const downloaded = phase2DownloadedModels.includes(m.id);
              const isCurrent = m.id === phase2ModelId;
              return (
                <button
                  key={m.id}
                  onClick={() => { setPhase2ModelId(m.id); setShowModelSelect(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition text-left
                    ${isCurrent
                      ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 font-medium ring-1 ring-violet-300 dark:ring-violet-700'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {m.label} {downloaded && <span className="text-xs text-emerald-500 ml-1">●</span>}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{m.description}</div>
                  </div>
                  <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{m.size}</span>
                </button>
              );
            })}
            <div className="text-[10px] text-gray-400 dark:text-gray-500 pt-1 flex items-center gap-1">
              <span className="text-emerald-500">●</span>
              <span>다운로드 완료된 모델 (재로드 시 캐시 사용 — 빠름)</span>
            </div>
          </div>
        )}

        {/* 모델 로드 / 다운로드 상태 */}
        {phase2Status === 'idle' && (
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <button
              onClick={loadModel}
              className="w-full py-2.5 text-sm bg-violet-500 text-white rounded-xl hover:bg-violet-600 transition"
            >
              {isCurrentModelDownloaded ? (
                <>
                  <div>모델 로드</div>
                  <div className="text-xs opacity-70 mt-0.5">✅ 이미 다운로드됨 — 캐시에서 빠르게 로드</div>
                </>
              ) : (
                <>
                  <div>모델 로드 ({selectedModel.size} 다운로드)</div>
                  <div className="text-xs opacity-70 mt-0.5">⚡ 처음 1회만 다운로드 · 이후 즉시 로드</div>
                </>
              )}
            </button>
          </div>
        )}

        {phase2Status === 'downloading' && (
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 space-y-1.5 flex-shrink-0">
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span className="truncate">{phase2ProgressMessage || '다운로드 중...'}</span>
              <span className="ml-2 flex-shrink-0">{phase2Progress}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div className="bg-violet-500 h-1.5 rounded-full transition-all" style={{ width: `${phase2Progress}%` }} />
            </div>
            <div className="text-xs text-violet-600 dark:text-violet-400 font-medium">⚡ 처음 1회만 다운로드됩니다</div>
          </div>
        )}

        {phase2Status === 'error' && (
          <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-2">
              ❌ {phase2Error}
              <button onClick={loadModel} className="block mt-1 underline">재시도</button>
            </div>
          </div>
        )}

        {/* 대화 목록 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center select-none">
              <span className="text-5xl opacity-30">🤖</span>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {selectedPost
                  ? <>게시글에 대해 자유롭게<br />질문해보세요</>
                  : '목록에서 게시글을 선택하세요'}
              </p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={msg.id}>
                {/* 포스트 컨텍스트 구분선 (다른 게시글로 전환 시) */}
                {i > 0 && messages[i - 1].postTitle !== msg.postTitle && (
                  <div className="flex items-center gap-2 my-4">
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                    <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-44 px-1">{msg.postTitle}</span>
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                  </div>
                )}
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`${msg.role === 'user' ? 'max-w-[85%]' : 'max-w-full w-full'} rounded-2xl px-3.5 py-2.5 text-sm
                    ${msg.role === 'user'
                      ? 'bg-violet-500 text-white rounded-br-sm whitespace-pre-wrap leading-relaxed'
                      : msg.isError
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-bl-sm whitespace-pre-wrap leading-relaxed'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm'
                    }`}
                  >
                    {/* 추론 과정 (어시스턴트 + 에러 아닌 경우만) */}
                    {msg.role === 'assistant' && !msg.isError && msg.thinking && (
                      <details
                        className="mb-2 text-xs text-gray-400 dark:text-gray-500 group"
                        open={isGenerating && msg.id === currentMsgIdRef.current && !msg.content}
                      >
                        <summary className="cursor-pointer flex items-center gap-1 hover:text-gray-600 dark:hover:text-gray-300 select-none list-none">
                          <span className="inline-block transition-transform group-open:rotate-90">▶</span>
                          <span>💭 추론 과정</span>
                          {isGenerating && msg.id === currentMsgIdRef.current && !msg.content && (
                            <span className="inline-block w-2 h-2 ml-1 border border-violet-400 border-t-transparent rounded-full animate-spin" />
                          )}
                        </summary>
                        <div className="mt-1.5 pl-3 border-l-2 border-violet-200 dark:border-violet-800 italic whitespace-pre-wrap leading-relaxed">
                          {msg.thinking}
                        </div>
                      </details>
                    )}

                    {/* 본문 / 로딩 표시 */}
                    {msg.content ? (
                      msg.role === 'assistant' && !msg.isError ? (
                        <>
                          <MessageContent content={msg.content} />
                          {isGenerating && msg.id === currentMsgIdRef.current && (
                            <span className="inline-block w-0.5 h-4 bg-violet-400 animate-pulse ml-0.5 align-middle" />
                          )}
                        </>
                      ) : (
                        <>
                          {msg.content}
                          {msg.role === 'assistant' && isGenerating && msg.id === currentMsgIdRef.current && (
                            <span className="inline-block w-0.5 h-4 bg-violet-400 animate-pulse ml-0.5 align-middle" />
                          )}
                        </>
                      )
                    ) : (
                      msg.role === 'assistant' && !msg.thinking && (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:0ms]" />
                          <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:150ms]" />
                          <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:300ms]" />
                        </span>
                      )
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 입력 영역 */}
        <div className="border-t border-gray-100 dark:border-gray-800 p-3 space-y-2 flex-shrink-0">
          {isModelLoaded ? (
            <>
              {/* 퀵 프롬프트 */}
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map(q => (
                  <button
                    key={q}
                    onClick={() => handleSubmit(q)}
                    disabled={isGenerating || isFetching || !selectedPost}
                    className="text-xs px-2.5 py-1 rounded-full border border-violet-200 dark:border-violet-700 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition disabled:opacity-40"
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* 텍스트 입력 */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
                  placeholder={selectedPost ? '질문 입력...' : '게시글을 먼저 선택하세요'}
                  disabled={isGenerating || isFetching || !selectedPost}
                  className="flex-1 text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:border-violet-400 disabled:opacity-50"
                />
                <button
                  onClick={() => handleSubmit()}
                  disabled={!input.trim() || isGenerating || isFetching || !selectedPost}
                  className="px-3 py-2 bg-violet-500 text-white rounded-xl hover:bg-violet-600 transition disabled:opacity-40 flex-shrink-0"
                >
                  {isFetching ? (
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </div>

              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="text-xs text-gray-400 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition"
                >
                  대화 기록 지우기
                </button>
              )}
            </>
          ) : (
            <p className="text-xs text-center text-gray-400 dark:text-gray-500 py-1">
              모델을 먼저 로드하세요
            </p>
          )}
        </div>
      </div>
    </>
  );
}
