'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useLlmStore, WEBLLM_MODELS } from '@/store/llmStore';
import { useWebLLM } from './useWebLLM';
import MessageContent from './MessageContent';
import { useTtsPlaylistStore } from '@/store/ttsPlaylistStore';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;     // 사용자에게 보일 최종 답변
  thinking?: string;   // <think>...</think> 안의 추론 과정 (어시스턴트 전용)
  postTitle: string;
  isError?: boolean;
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
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

type ContextMode = 'post' | 'comments' | 'all';


const QUICK_PROMPTS_BY_CONTEXT: Record<'post' | 'comments' | 'all', string[]> = {
  post:     ['3줄 요약', '핵심 포인트', '한줄 코멘트'],
  comments: ['댓글 반응 분석', '스팸 찾기', '부정적 댓글'],
  all:      ['종합 요약', '댓글 반응', '스팸 찾기'],
};

export default function AISidePanel({ isOpen, onClose, selectedPost, width, onWidthChange, minWidth, maxWidth }: AISidePanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStage, setGeneratingStage] = useState<'analyzing' | 'answering' | null>(null);
  const [contextMode, setContextMode] = useState<ContextMode>('all');
  const [isFetching, setIsFetching] = useState(false);
  const [oneLiner, setOneLiner] = useState<string>('');
  const [isFetchingOneLiner, setIsFetchingOneLiner] = useState(false);
  const [gpuLabel, setGpuLabel] = useState<string | null>(null);
  const [isWebGpuSupported, setIsWebGpuSupported] = useState(true);
  const [showGpuInfo, setShowGpuInfo] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { add: addToPlaylist, remove: removeFromPlaylist, has: isInPlaylist } = useTtsPlaylistStore();
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

  // WebGPU 지원 여부 감지
  useEffect(() => {
    const supported = typeof navigator !== 'undefined' && 'gpu' in navigator;
    setIsWebGpuSupported(supported);
    setGpuLabel(supported ? '⚡ GPU · 내 기기' : '💻 CPU · 내 기기');
  }, []);

  // ESC 키로 패널 닫기 / GPU 팝업 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowGpuInfo(false); onClose(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // GPU 팝업 외부 클릭 시 닫기
  useEffect(() => {
    if (!showGpuInfo) return;
    const handler = () => setShowGpuInfo(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showGpuInfo]);

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

  // 패널 열림 + 다운로드 완료 + idle 상태 → 자동 로드 (WebGPU 지원 기기만)
  useEffect(() => {
    if (isOpen && isCurrentModelDownloaded && phase2Status === 'idle' && isWebGpuSupported) {
      loadModel();
    }
  }, [isOpen, isCurrentModelDownloaded, phase2Status, loadModel, isWebGpuSupported]);

  // 패널 열리거나 게시글 바뀔 때 한줄 코멘트 fetch
  useEffect(() => {
    if (!isOpen || !selectedPost) { setOneLiner(''); return; }
    let cancelled = false;
    setIsFetchingOneLiner(true);
    fetch(`/api/post-content?postId=${selectedPost.postId}&blogId=${selectedPost.blogId}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setOneLiner(String(d.oneLiner ?? '')); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsFetchingOneLiner(false); });
    return () => { cancelled = true; };
  }, [isOpen, selectedPost]);

  // 새 메시지 생길 때 맨 아래로 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCopy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {});
  }, []);

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
    let commentCount = 0;
    const resolved = contextMode;
    try {
      const needsPost = resolved === 'post' || resolved === 'all';
      const needsComments = resolved === 'comments' || resolved === 'all';

      const [bodyRes, cmtRes] = await Promise.all([
        needsPost
          ? fetch(`/api/post-content?postId=${selectedPost.postId}&blogId=${selectedPost.blogId}`)
          : Promise.resolve(null),
        needsComments
          ? fetch(`/api/comments?postId=${selectedPost.postId}&blogId=${selectedPost.blogId}`)
          : Promise.resolve(null),
      ]);

      if (bodyRes) {
        const bodyJson = await bodyRes.json();
        postBody = String(bodyJson.content ?? '').slice(0, 6000); // 본문 최대 6000자
      }

      if (cmtRes) {
        const cmtJson = await cmtRes.json();
        const list = cmtJson.result?.commentList ?? [];
        const commentLines = list
          .filter((c: { replyLevel: number }) => c.replyLevel === 1)
          .map((c: { userName?: string; contents: string }) => {
            const rawContent = stripHtmlTags(c.contents);
            const trimmed = rawContent.length > 150 ? rawContent.slice(0, 150) + '…' : rawContent;
            return `- ${c.userName ?? '익명'}: ${trimmed}`;
          });
        commentsText = commentLines.join('\n');
        commentCount = commentLines.length;
      }
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
    const temperature = isSummary ? 0.2 : 0.4;

    setIsGenerating(true);
    try {
      // 공통 금지 규칙 (모든 모드)
      const COMMON_RULES = `
- URL·링크·참조 출처를 절대 생성하지 마세요. 본문에 없는 링크는 존재하지 않습니다.
- "메르님은 ...을 바탕으로 답변합니다" 같은 메타 설명 텍스트 금지. 바로 내용만 작성.
- 같은 내용을 반복하지 마세요. 각 정보는 한 번만 언급.
- 한국어, "~입니다/~합니다" 어미 일관 사용.`;

      let systemPrompt: string;
      if (resolved === 'post') {
        systemPrompt = `당신은 아래 제공된 [본문]만을 근거로 답하는 블로그 분석 어시스턴트입니다.

절대 규칙:
- [본문]에 있는 내용만 사용하세요. 일반 상식이나 외부 지식으로 답하지 마세요.
- 본문에 없는 내용을 묻는 경우 "이 게시글에서는 해당 내용을 다루지 않습니다."라고만 답하세요.
- 마크다운(**굵게**, - 목록, 1. 번호) 적극 활용해 가독성 확보.
- 요약을 요청받으면 응답 마지막에 **[메르의 코멘트]** 섹션을 추가하고 원문을 그대로 인용하세요.${COMMON_RULES}`;
      } else if (resolved === 'comments') {
        systemPrompt = `당신은 아래 제공된 [독자 댓글]만을 분석하는 어시스턴트입니다.

절대 규칙:
- [독자 댓글]에 있는 내용만 사용하세요. 추론하거나 외부 지식을 사용하지 마세요.
- 댓글에 없는 내용을 묻는 경우 "댓글에서는 해당 내용을 찾을 수 없습니다."라고만 답하세요.
- 마크다운(**굵게**, - 목록, 1. 번호) 적극 활용해 가독성 확보.${COMMON_RULES}`;
      } else {
        systemPrompt = `당신은 아래 제공된 [본문]과 [독자 댓글]을 근거로 답하는 블로그 분석 어시스턴트입니다.

절대 규칙:
- 반드시 [본문] 또는 [독자 댓글]에 있는 내용만 사용하세요. 외부 지식이나 추론 금지.
- [메르의 코멘트]는 게시글 작성자의 후기입니다. [독자 댓글]과 혼동하지 마세요.
- 답변은 반드시 아래 두 섹션으로만 구성하세요 (다른 섹션 추가 금지):
  ### 📄 본문 기반
  [본문]과 [메르의 코멘트]에서 찾은 내용만 작성.
  ### 💬 댓글 반응
  [독자 댓글]에서 찾은 내용만 작성. 관련 댓글이 없으면 "관련 댓글 없음" 한 줄로 끝내세요.
- 각 섹션은 해당 소스에만 근거하세요. 두 섹션 사이 내용 중복 절대 금지.
- 요약 요청 시 [📄 본문 기반] 위주로 작성하고, [💬 댓글 반응]은 2~3줄로 간결하게.
- 요약 요청 시 [📄 본문 기반] 마지막에 **[메르의 코멘트]** 원문을 그대로 인용.
- 마크다운(### 섹션 헤더, **굵게**, - 목록) 적극 활용.${COMMON_RULES}`;
      }

      let userPrompt: string;
      if (resolved === 'post') {
        userPrompt = `[게시글 제목]\n${selectedPost.title}\n\n[본문]\n${postBody || '(본문을 가져오지 못했습니다)'}\n\n[메르의 코멘트 (작성자 후기)]\n${oneLiner || '(없음)'}\n\n[요청]\n${finalPrompt}`;
      } else if (resolved === 'comments') {
        userPrompt = `[게시글 제목]\n${selectedPost.title}\n\n[독자 댓글 ${commentCount}개]\n${commentsText || '(댓글 없음)'}\n\n[요청]\n${finalPrompt}`;
      } else {
        userPrompt = `[게시글 제목]\n${selectedPost.title}\n\n[본문]\n${postBody || '(본문을 가져오지 못했습니다)'}\n\n[메르의 코멘트 (작성자 후기, 독자 댓글 아님)]\n${oneLiner || '(없음)'}\n\n[독자 댓글 ${commentCount}개]\n${commentsText || '(댓글 없음)'}\n\n[요청]\n${finalPrompt}`;
      }

      // 2-stage only for post context
      let finalUserPrompt = userPrompt;
      if ((resolved === 'post' || resolved === 'all') && postBody) {
        // Stage 1: extract relevant passages
        setGeneratingStage('analyzing');
        const stage1System = `주어진 [본문]에서 [질문]에 직접 답할 수 있는 문장을 2~3개 그대로 인용하세요. 인용문만 출력하고 설명은 쓰지 마세요. 관련 내용이 없으면 "없음"이라고만 쓰세요.`;
        const stage1Prompt = `[본문]\n${postBody}\n\n[메르의 코멘트 (본문의 일부로 취급)]\n${oneLiner || ''}\n\n[질문]\n${finalPrompt}`;
        let relevantPassages = '';
        await generate(stage1System, stage1Prompt, (chunk) => {
          relevantPassages += chunk;
        }, { temperature: 0.1, maxTokens: 200 });

        // Use extracted passages if valid, else fallback to full postBody
        const extracted = relevantPassages.trim();
        const isValid = extracted.length > 15 && !extracted.startsWith('없음') && !extracted.startsWith('관련');
        if (isValid) {
          if (resolved === 'post') {
            finalUserPrompt = `[게시글 제목]\n${selectedPost.title}\n\n[본문 (관련 구절)]\n${extracted}\n\n[메르의 코멘트 (작성자 후기)]\n${oneLiner || '(없음)'}\n\n[요청]\n${finalPrompt}`;
          } else {
            finalUserPrompt = `[게시글 제목]\n${selectedPost.title}\n\n[본문 (관련 구절)]\n${extracted}\n\n[메르의 코멘트 (작성자 후기, 독자 댓글 아님)]\n${oneLiner || '(없음)'}\n\n[독자 댓글 ${commentCount}개]\n${commentsText || '(댓글 없음)'}\n\n[요청]\n${finalPrompt}`;
          }
        }
        setGeneratingStage('answering');
      } else {
        setGeneratingStage('answering');
      }

      // Stage 2: actual answer
      const maxTokens = resolved === 'all'
        ? (isSummary ? 1536 : 2048)   // all 모드: 두 섹션 필요 → 더 많은 토큰
        : (isSummary ? 1024 : 1536);
      await generate(systemPrompt, finalUserPrompt, (chunk) => {
        answerRef.current += chunk;
        const { thinking, answer } = splitThinking(answerRef.current);
        setMessages(prev => prev.map(m =>
          m.id === msgId ? { ...m, thinking: thinking || undefined, content: answer } : m
        ));
      }, { temperature, maxTokens });
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
      setGeneratingStage(null);
    }
  }, [selectedPost, input, isGenerating, generate, oneLiner, contextMode]);

  const displayedQuickPrompts = QUICK_PROMPTS_BY_CONTEXT[contextMode];

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
        className="fixed top-0 right-0 h-screen bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-2xl z-50 flex flex-col animate-slide-in-right"
        style={isDesktop ? { width: `${width}px` } : { width: '100%' }}
      >
        {/* 리사이즈 핸들 (데스크탑) */}
        {isDesktop && (
          <div
            onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}
            className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize z-10 group"
            title="드래그해서 너비 조절"
          >
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-12 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-teal-400 dark:group-hover:bg-teal-500 transition-colors" />
          </div>
        )}

        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-teal-600 dark:text-teal-400 text-base leading-none">✦</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">AI 어시스턴트</div>
                <button
                  onClick={() => setShowModelSelect(v => !v)}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-400 hover:bg-teal-200 dark:hover:bg-teal-800 transition flex items-center gap-0.5"
                  title="모델 선택"
                >
                  <span>{selectedModel.label}</span>
                  <span className="opacity-60">({selectedModel.size})</span>
                  <span className={`transition-transform ${showModelSelect ? 'rotate-180' : ''}`}>▾</span>
                </button>
                {gpuLabel && (
                  <div className="relative">
                    <button
                      onClick={() => setShowGpuInfo(v => !v)}
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                    >
                      {gpuLabel}
                    </button>
                    {showGpuInfo && (
                      <div className="absolute top-full left-0 mt-1.5 z-50 w-56 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg p-3 text-left">
                        <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 mb-2">
                          {gpuLabel}
                        </div>
                        <ul className="space-y-1">
                          {[
                            '대화 내용 서버 전송 없음',
                            '프롬프트 저장 없음',
                            '인터넷 연결 불필요 (로드 후)',
                            '100% 브라우저 내 처리',
                          ].map(item => (
                            <li key={item} className="flex items-start gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                              <span className="text-teal-500 mt-px flex-shrink-0">✓</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {selectedPost && (
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-56 mt-0.5" title={selectedPost.title}>
                  {selectedPost.title}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 ml-2 w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            ×
          </button>
        </div>

        {/* 모델 선택 드롭다운 */}
        {showModelSelect && (
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 space-y-1.5 flex-shrink-0 bg-slate-50 dark:bg-slate-800/50">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
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
                      ? 'bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 font-medium ring-1 ring-teal-300 dark:ring-teal-700'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {m.label} {downloaded && <span className="text-xs text-emerald-500 ml-1">●</span>}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{m.description}</div>
                  </div>
                  <span className="text-xs text-slate-400 ml-2 flex-shrink-0">{m.size}</span>
                </button>
              );
            })}
            <div className="text-[10px] text-slate-400 dark:text-slate-500 pt-1 flex items-center gap-1">
              <span className="text-emerald-500">●</span>
              <span>다운로드 완료된 모델 (재로드 시 캐시 사용 — 빠름)</span>
            </div>
          </div>
        )}

        {/* WebGPU 미지원 안내 (모바일 등) */}
        {!isWebGpuSupported && (
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
            <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-xl p-3 flex gap-2">
              <span className="flex-shrink-0">💻</span>
              <div>
                <div className="font-medium text-slate-600 dark:text-slate-300 mb-0.5">PC 전용 기능</div>
                <div>AI 어시스턴트는 WebGPU가 필요합니다. 데스크탑 Chrome 또는 Edge에서 이용해 주세요.</div>
              </div>
            </div>
          </div>
        )}

        {/* 모델 로드 / 다운로드 상태 */}
        {isWebGpuSupported && phase2Status === 'idle' && (
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
            <button
              onClick={loadModel}
              className="w-full py-2.5 text-sm bg-teal-500 text-white rounded-xl hover:bg-teal-600 transition"
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

        {isWebGpuSupported && phase2Status === 'downloading' && (
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 space-y-1.5 flex-shrink-0">
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">{phase2ProgressMessage || '다운로드 중...'}</span>
              <span className="ml-2 flex-shrink-0">{phase2Progress}%</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
              <div className="bg-teal-500 h-1.5 rounded-full transition-all" style={{ width: `${phase2Progress}%` }} />
            </div>
            <div className="text-xs text-teal-600 dark:text-teal-400 font-medium">⚡ 처음 1회만 다운로드됩니다</div>
          </div>
        )}

        {isWebGpuSupported && phase2Status === 'error' && (
          <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-2">
              ❌ {phase2Error}
              <button onClick={loadModel} className="block mt-1 underline">재시도</button>
            </div>
          </div>
        )}

        {/* 대화 목록 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {/* 한줄 코멘트 고정 카드 */}
          {(oneLiner || isFetchingOneLiner) && (
            <div className="mb-3 px-3 py-2.5 rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 flex-shrink-0">
              <div className="text-[10px] font-semibold tracking-wide text-teal-600 dark:text-teal-400 mb-1 uppercase">
                메르의 한줄 코멘트
              </div>
              {isFetchingOneLiner ? (
                <div className="text-xs text-slate-400 dark:text-slate-500 animate-pulse">불러오는 중...</div>
              ) : (
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{oneLiner}</p>
              )}
            </div>
          )}
          {/* 재생 목록 추가 버튼 */}
          {selectedPost && (
            <div className="mb-3 flex-shrink-0">
              <button
                onClick={() => {
                  if (isInPlaylist(selectedPost.postId)) {
                    removeFromPlaylist(selectedPost.postId);
                  } else {
                    addToPlaylist({ postId: selectedPost.postId, blogId: selectedPost.blogId, title: selectedPost.title });
                  }
                }}
                className={`w-full py-1.5 rounded-xl text-xs font-medium transition flex items-center justify-center gap-1.5
                  ${isInPlaylist(selectedPost.postId)
                    ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-700'
                    : 'bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-teal-300 hover:text-teal-600 dark:hover:text-teal-400'
                  }`}
              >
                {isInPlaylist(selectedPost.postId) ? '♪ 재생 목록에 있음' : '+ 재생 목록에 추가'}
              </button>
            </div>
          )}

          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center select-none">
              <span className="text-3xl text-teal-400/40 dark:text-teal-500/30 font-light">✦</span>
              <p className="text-sm text-slate-500 dark:text-slate-500 leading-relaxed">
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
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                    <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-44 px-1">{msg.postTitle}</span>
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                  </div>
                )}
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`${msg.role === 'user' ? 'max-w-[85%]' : 'max-w-full w-full'} rounded-2xl px-3.5 py-2.5 text-sm
                    ${msg.role === 'user'
                      ? 'bg-teal-500 text-white rounded-br-sm whitespace-pre-wrap leading-relaxed'
                      : msg.isError
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-bl-sm whitespace-pre-wrap leading-relaxed'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-sm'
                    }`}
                  >
                    {/* 추론 과정 (어시스턴트 + 에러 아닌 경우만) */}
                    {msg.role === 'assistant' && !msg.isError && msg.thinking && (
                      <details
                        className="mb-2 text-xs text-slate-400 dark:text-slate-500 group"
                        open={isGenerating && msg.id === currentMsgIdRef.current && !msg.content}
                      >
                        <summary className="cursor-pointer flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-300 select-none list-none">
                          <span className="inline-block transition-transform group-open:rotate-90">▶</span>
                          <span>💭 추론 과정</span>
                          {isGenerating && msg.id === currentMsgIdRef.current && !msg.content && (
                            <span className="inline-block w-2 h-2 ml-1 border border-teal-400 border-t-transparent rounded-full animate-spin" />
                          )}
                        </summary>
                        <div className="mt-1.5 pl-3 border-l-2 border-teal-200 dark:border-teal-800 italic whitespace-pre-wrap leading-relaxed">
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
                            <span className="inline-block w-0.5 h-4 bg-teal-400 animate-pulse ml-0.5 align-middle" />
                          )}
                          {msg.role === 'assistant' && !msg.isError && msg.content && !isGenerating && (
                            <div className="flex justify-end mt-1.5">
                              <button
                                onClick={() => handleCopy(msg.content, msg.id)}
                                className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition px-1.5 py-0.5 rounded"
                                title="복사"
                              >
                                {copiedId === msg.id ? '✓ 복사됨' : '복사'}
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {msg.content}
                          {msg.role === 'assistant' && isGenerating && msg.id === currentMsgIdRef.current && (
                            <span className="inline-block w-0.5 h-4 bg-teal-400 animate-pulse ml-0.5 align-middle" />
                          )}
                        </>
                      )
                    ) : (
                      msg.role === 'assistant' && !msg.thinking && (
                        <span className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                          <span className="inline-block w-3 h-3 border-2 border-teal-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                          {generatingStage === 'analyzing' ? '📄 본문 분석 중...' : '💬 답변 생성 중...'}
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
        <div className="border-t border-slate-100 dark:border-slate-800 p-3 space-y-2 flex-shrink-0">
          {isModelLoaded ? (
            <>
              {/* 컨텍스트 토글 */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-slate-400 dark:text-slate-500">컨텍스트:</span>
                {(['post', 'comments', 'all'] as const).map((mode) => {
                  const labels: Record<typeof mode, string> = { post: '📄 본문', comments: '💬 댓글', all: '전체' };
                  const isActive = contextMode === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => setContextMode(prev => (prev === mode && mode !== 'all') ? 'all' : mode)}
                      className={`text-[10px] px-2 py-0.5 rounded-full transition
                        ${isActive
                          ? 'bg-teal-500 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                    >
                      {labels[mode]}
                    </button>
                  );
                })}
              </div>

              {/* 퀵 프롬프트 */}
              <div className="flex flex-wrap gap-1.5">
                {displayedQuickPrompts.map(q => (
                  <button
                    key={q}
                    onClick={() => handleSubmit(q)}
                    disabled={isGenerating || isFetching || !selectedPost}
                    className="text-xs px-2.5 py-1 rounded-full border border-teal-200 dark:border-teal-700 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 transition disabled:opacity-40"
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
                  className="flex-1 text-sm px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-teal-400 disabled:opacity-50"
                />
                <button
                  onClick={() => handleSubmit()}
                  disabled={!input.trim() || isGenerating || isFetching || !selectedPost}
                  className="px-3 py-2 bg-teal-500 text-white rounded-xl hover:bg-teal-600 transition disabled:opacity-40 flex-shrink-0"
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
                  className="text-xs text-slate-400 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 transition"
                >
                  대화 기록 지우기
                </button>
              )}
            </>
          ) : (
            <p className="text-xs text-center text-slate-400 dark:text-slate-500 py-1">
              모델을 먼저 로드하세요
            </p>
          )}
        </div>
      </div>
    </>
  );
}
