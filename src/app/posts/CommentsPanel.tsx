'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { BlogComment } from '@/domain/comment/types';
import { isOwnerComment } from '@/domain/filter/filterEngine';
import { useFilterStore } from '@/store/filterStore';
import dynamic from 'next/dynamic';
import type { QualityLabel, QualityTag, ClassifyResult } from '@/features/llm/useClassifier';
import { useLlmStore } from '@/store/llmStore';

const LocalLLMPanel = dynamic(() => import('@/features/llm/LocalLLMPanel'), { ssr: false });

type LlmResult = { label: QualityLabel; score: number; tag: QualityTag };

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
  const [llmResultMap, setLlmResultMap] = useState<Record<number, LlmResult>>({});
  const [qualityFilterActive, setQualityFilterActive] = useState(false);

  // AI 필터 ON → 전체 탭, OFF → 메르님댓글 탭
  useEffect(() => {
    setShowAllComments(qualityFilterActive);
  }, [qualityFilterActive]);
  const [isResizing, setIsResizing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showBlockedList, setShowBlockedList] = useState(false);
  const prevPostIdRef = useRef<string>('');

  const { settings, addBlockedUser, removeBlockedUser } = useFilterStore();
  const { phase1ScoreThreshold } = useLlmStore();

  function handleBlock(comment: BlogComment) {
    const target = comment.profileUserId || comment.userName;
    if (!target || isOwnerComment(comment)) return;
    addBlockedUser(target);
    setToastMsg(`"${target}" 차단됨`);
    setTimeout(() => setToastMsg(null), 2500);
  }

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
        setLlmResultMap({});
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
      setLlmResultMap({});
      setQualityFilterActive(false);
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
  const baseComments = (qualityFilterActive && Object.keys(llmResultMap).length > 0)
    ? structuredComments
    : (showAllComments ? structuredComments : ownerRelatedComments);

  // 차단 사용자 필터 (주인장은 차단 불가)
  function isBlockedUser(c: BlogComment): boolean {
    if (isOwnerComment(c) || settings.blockedUsers.length === 0) return false;
    const name = c.userName ?? c.maskedUserName ?? '';
    const id = c.profileUserId ?? '';
    return settings.blockedUsers.some((blocked) =>
      settings.blockedUsersPartialMatch
        ? name.includes(blocked) || id.includes(blocked)
        : name === blocked || id === blocked
    );
  }

  const commentsToShow = baseComments.filter((c) => {
    if (isBlockedUser(c)) return false;
    if (!qualityFilterActive || Object.keys(llmResultMap).length === 0) return true;
    const result = llmResultMap[c.commentNo];
    if (!result) return true;
    if (result.label === 'spam') return false;
    return result.score >= phase1ScoreThreshold;
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
            {/* 차단 목록 토글 */}
            {settings.blockedUsers.length > 0 && (
              <button
                onClick={() => setShowBlockedList(v => !v)}
                className={`text-xs px-2 py-1 rounded-full transition ${showBlockedList ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500'}`}
                title="차단 목록 관리"
              >
                🚫 {settings.blockedUsers.length}
              </button>
            )}
          </div>
          <LocalLLMPanel
            comments={comments}
            onResultsUpdate={(results: ClassifyResult[]) => {
              const map: Record<number, LlmResult> = {};
              results.forEach((r) => { map[r.commentNo] = { label: r.label, score: r.score, tag: r.tag }; });
              setLlmResultMap(map);
            }}
            resultMap={llmResultMap}
            qualityFilterActive={qualityFilterActive}
            onQualityFilterToggle={setQualityFilterActive}
          />
        </div>

        {/* 차단 목록 관리 패널 */}
        {showBlockedList && settings.blockedUsers.length > 0 && (
          <div className="px-4 py-2 border-b border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10 flex-shrink-0">
            <div className="text-[10px] text-red-500 dark:text-red-400 font-semibold mb-1.5">차단된 사용자</div>
            <div className="flex flex-wrap gap-1">
              {settings.blockedUsers.map((user) => (
                <span key={user} className="inline-flex items-center gap-1 text-[10px] bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
                  {user}
                  <button
                    onClick={() => removeBlockedUser(user)}
                    className="ml-0.5 text-red-400 hover:text-red-600 dark:hover:text-red-300 leading-none"
                    title="차단 해제"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 마지막 갱신 시간 */}
        {lastRefreshTime && (
          <div className="px-4 py-1 text-[10px] text-slate-400 dark:text-slate-600 flex-shrink-0">
            {formatDate(lastRefreshTime.toISOString())} 기준
          </div>
        )}

        {/* 차단 토스트 */}
        {toastMsg && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-slate-800 dark:bg-slate-700 text-white text-xs px-3 py-1.5 rounded-full shadow-lg pointer-events-none">
            {toastMsg}
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
              {qualityFilterActive ? '읽을만한 댓글이 없습니다.' : showAllComments ? '댓글이 없습니다.' : '메르님이 참여한 댓글이 없습니다.'}
            </div>
          ) : (
            commentsToShow.map((comment, idx) => (
              <div key={idx} className="space-y-1.5">
                {/* 부모 댓글 */}
                <div className={`group flex items-start gap-2 p-2.5 rounded-xl border text-sm
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
                      {/* 차단 버튼 (hover 시 노출, 주인장 제외) */}
                      {!isOwnerComment(comment) && (
                        <button
                          onClick={() => handleBlock(comment)}
                          className="opacity-0 group-hover:opacity-100 text-[9px] text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-1.5 py-0.5 rounded transition-all"
                          title="이 사용자 차단"
                        >
                          차단
                        </button>
                      )}
                      {comment.sympathyCount !== undefined && comment.sympathyCount > 0 && (
                        <span className="text-[9px] text-pink-500">👍 {comment.sympathyCount}</span>
                      )}
                      {(() => {
                        const r = llmResultMap[comment.commentNo];
                        if (!r || r.label !== 'worth_reading') return null;
                        return (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                            {r.tag} · {r.score}점
                          </span>
                        );
                      })()}
                      <span className="text-[9px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded ml-auto">
                        {formatDate(comment.regTime || comment.regTimeGmt)}
                      </span>
                    </div>
                    {comment.isSecret ? (
                      <div className="flex items-center gap-2 mt-1 px-2.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-700/50 border border-dashed border-slate-300 dark:border-slate-600">
                        <span className="text-base">🔒</span>
                        <div>
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">비밀 댓글입니다</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">작성자와 블로그 주인만 볼 수 있어요</p>
                        </div>
                      </div>
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
                            <div className="flex items-center gap-1.5 mt-0.5 px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700/50 border border-dashed border-slate-300 dark:border-slate-600">
                              <span className="text-sm">🔒</span>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500">비밀 댓글 · 작성자와 블로그 주인만 볼 수 있어요</p>
                            </div>
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
