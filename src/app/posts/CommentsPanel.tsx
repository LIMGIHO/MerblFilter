'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { BlogComment } from '@/domain/comment/types';
import { isOwnerComment } from '@/domain/filter/filterEngine';
import dynamic from 'next/dynamic';

const LocalLLMPanel = dynamic(() => import('@/features/llm/LocalLLMPanel'), { ssr: false });

type LlmLabel = 'spam' | 'promo' | 'negative' | 'neutral' | 'positive';

interface CommentWithReplies extends BlogComment {
  replies: BlogComment[];
}

interface CommentsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  blogId: string;
  title: string;
  width: number;
  onWidthChange: (w: number) => void;
  minWidth: number;
  maxWidth: number;
}

function ProfileImage({ imageUrl, isOwner, size = 'large' }: { imageUrl?: string | null; isOwner: boolean; size?: 'small' | 'large' }) {
  const [failed, setFailed] = useState(false);
  const defaultImage = 'https://blogimgs.pstatic.net/nblog/comment/login_basic.gif';
  const classes = size === 'large'
    ? 'w-8 h-8 rounded-full object-cover border-2'
    : 'w-6 h-6 rounded-full object-cover border';
  return (
    <img
      src={failed ? defaultImage : (imageUrl || defaultImage)}
      alt="프로필"
      referrerPolicy="no-referrer"
      className={`${classes} ${isOwner ? 'border-amber-300' : 'border-gray-200 dark:border-slate-600'}`}
      onError={() => setFailed(true)}
    />
  );
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function convertUrlsToLinks(text: string) {
  return text.replace(/(https?:\/\/[^\s]+)/g, (url) =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">${url}</a>`
  );
}

export default function CommentsPanel({
  isOpen, onClose, postId, blogId, title,
  width, onWidthChange, minWidth, maxWidth,
}: CommentsPanelProps) {
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [showAllComments, setShowAllComments] = useState(false);
  const [llmLabelMap, setLlmLabelMap] = useState<Record<number, LlmLabel>>({});
  const [hiddenLabels, setHiddenLabels] = useState<Set<LlmLabel>>(new Set());
  const [isResizing, setIsResizing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const prevPostIdRef = useRef<string>('');

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  // ESC 키로 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // 리사이즈 핸들
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

  const loadComments = useCallback(async () => {
    if (!postId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/comments?postId=${postId}&blogId=${blogId}`);
      const data = await res.json();
      if (data.result?.commentList) {
        setComments(data.result.commentList);
        setLastRefreshTime(new Date());
        setLlmLabelMap({});
      }
    } catch (e) {
      console.error('댓글 로딩 실패:', e);
    } finally {
      setIsLoading(false);
    }
  }, [postId, blogId]);

  // 패널 열리거나 게시글 바뀌면 자동 로드
  useEffect(() => {
    if (!isOpen) return;
    if (postId !== prevPostIdRef.current) {
      prevPostIdRef.current = postId;
      setComments([]);
      setShowAllComments(false);
      setLlmLabelMap({});
      setHiddenLabels(new Set());
      loadComments();
    }
  }, [isOpen, postId, loadComments]);

  const parentComments = comments.filter((c) => c.replyLevel === 1);
  const replyComments = comments.filter((c) => c.replyLevel === 2);
  const structuredComments: CommentWithReplies[] = parentComments.map((parent) => ({
    ...parent,
    replies: replyComments
      .filter((r) => r.parentCommentNo === parent.commentNo)
      .sort((a, b) => new Date(a.regTime || a.regTimeGmt || 0).getTime() - new Date(b.regTime || b.regTimeGmt || 0).getTime()),
  }));

  const ownerRelatedComments = structuredComments.filter((c) =>
    isOwnerComment(c) || c.replies.some(isOwnerComment)
  );
  const baseComments = (hiddenLabels.size > 0) ? structuredComments : (showAllComments ? structuredComments : ownerRelatedComments);
  const commentsToShow = baseComments.filter((c) => {
    if (hiddenLabels.size === 0) return true;
    const label = llmLabelMap[c.commentNo];
    return !label || !hiddenLabels.has(label);
  });

  if (!isOpen) return null;

  return (
    <>
      {/* 모바일 백드롭 */}
      <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={onClose} />

      {/* 사이드 패널 */}
      <div
        className="fixed top-0 right-0 h-screen bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-2xl z-50 flex flex-col"
        style={isDesktop ? { width: `${width}px` } : { width: '100%' }}
      >
        {/* 리사이즈 핸들 */}
        {isDesktop && (
          <div
            onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}
            className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize z-10 group"
          >
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-12 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-teal-400 transition-colors" />
          </div>
        )}

        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-blue-500 text-base leading-none">💬</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">댓글</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-56 mt-0.5" title={title}>
                {title}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {/* 새로고침 */}
            <button
              onClick={loadComments}
              disabled={isLoading}
              className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40"
              title="새로고침"
            >
              <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            {/* 닫기 */}
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              ×
            </button>
          </div>
        </div>

        {/* 서브 헤더: 필터 + AI 분류 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowAllComments(false)}
              className={`text-xs px-2.5 py-1 rounded-full transition ${!showAllComments ? 'bg-teal-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              메르님 댓글
              <span className="ml-1 opacity-70">({ownerRelatedComments.length})</span>
            </button>
            <button
              onClick={() => setShowAllComments(true)}
              className={`text-xs px-2.5 py-1 rounded-full transition ${showAllComments ? 'bg-teal-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              전체
              <span className="ml-1 opacity-70">({comments.length})</span>
            </button>
          </div>
          <LocalLLMPanel
            comments={comments}
            onLabelsUpdate={setLlmLabelMap}
            labelMap={llmLabelMap}
            onHideLabelsChange={setHiddenLabels}
          />
        </div>

        {/* 마지막 갱신 시간 */}
        {lastRefreshTime && (
          <div className="px-4 py-1 text-[10px] text-slate-400 dark:text-slate-600 flex-shrink-0">
            {formatDate(lastRefreshTime.toISOString())} 기준
          </div>
        )}

        {/* 댓글 목록 */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-slate-400">
              <span className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : commentsToShow.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-slate-400 dark:text-slate-500">
              {hiddenLabels.size > 0 ? '해당 레이블의 댓글이 없습니다.' : showAllComments ? '댓글이 없습니다.' : '메르님이 참여한 댓글이 없습니다.'}
            </div>
          ) : (
            commentsToShow.map((comment, idx) => (
              <div key={idx} className="space-y-1.5">
                {/* 부모 댓글 */}
                <div className={`flex items-start gap-2 p-2.5 rounded-xl border text-sm
                  ${isOwnerComment(comment) ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                  <ProfileImage imageUrl={comment.userProfileImage} isOwner={isOwnerComment(comment)} size="large" />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1 mb-1">
                      <span className={`font-semibold text-xs ${isOwnerComment(comment) ? 'text-amber-900 dark:text-amber-300' : 'text-slate-800 dark:text-slate-200'}`}>
                        {comment.userName || comment.maskedUserName}
                      </span>
                      {isOwnerComment(comment) && (
                        <span className="text-[9px] bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded">👑 메르님</span>
                      )}
                      {comment.sympathyCount !== undefined && comment.sympathyCount > 0 && (
                        <span className="text-[9px] text-pink-500">👍 {comment.sympathyCount}</span>
                      )}
                      {llmLabelMap[comment.commentNo] && llmLabelMap[comment.commentNo] !== 'neutral' && (
                        <span className="text-[9px] bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded">
                          {llmLabelMap[comment.commentNo] === 'positive' ? '긍정' : llmLabelMap[comment.commentNo] === 'negative' ? '부정' : llmLabelMap[comment.commentNo] === 'spam' ? '스팸' : '홍보'}
                        </span>
                      )}
                      <span className="text-[9px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded ml-auto">
                        {formatDate(comment.regTime || comment.regTimeGmt)}
                      </span>
                    </div>
                    {comment.isSecret ? (
                      <p className="text-xs text-slate-400 italic">🔒 비밀 댓글</p>
                    ) : (
                      <div
                        className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed break-words"
                        dangerouslySetInnerHTML={{ __html: convertUrlsToLinks(comment.contents) }}
                      />
                    )}
                    {comment.replies.length > 0 && (
                      <div className="text-[9px] text-blue-500 mt-1">💬 {comment.replies.length}개의 답글</div>
                    )}
                  </div>
                </div>

                {/* 답글 */}
                {comment.replies.length > 0 && (
                  <div className="ml-6 space-y-1.5">
                    {comment.replies.map((reply, ri) => (
                      <div key={ri} className={`flex items-start gap-2 p-2 rounded-xl border-l-4 text-sm
                        ${isOwnerComment(reply) ? 'bg-amber-50 dark:bg-amber-900/10 border-l-amber-400' : 'bg-slate-50 dark:bg-slate-800/60 border-l-slate-200 dark:border-l-slate-700'}`}>
                        <span className="text-slate-400 font-bold text-sm mt-0.5 flex-shrink-0">ㄴ</span>
                        <ProfileImage imageUrl={reply.userProfileImage} isOwner={isOwnerComment(reply)} size="small" />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1 mb-0.5">
                            <span className={`font-semibold text-xs ${isOwnerComment(reply) ? 'text-amber-900 dark:text-amber-300' : 'text-slate-800 dark:text-slate-200'}`}>
                              {reply.userName || reply.maskedUserName}
                            </span>
                            {isOwnerComment(reply) && (
                              <span className="text-[9px] bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded">👑 메르님</span>
                            )}
                            <span className="text-[9px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded ml-auto">
                              {formatDate(reply.regTime || reply.regTimeGmt)}
                            </span>
                          </div>
                          {reply.isSecret ? (
                            <p className="text-xs text-slate-400 italic">🔒 비밀 댓글</p>
                          ) : (
                            <div
                              className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed break-words"
                              dangerouslySetInnerHTML={{ __html: convertUrlsToLinks(reply.contents) }}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
