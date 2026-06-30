'use client';

import { useEffect, useState, useCallback } from 'react';
import { BlogComment } from '@/domain/comment/types';
import { isOwnerComment } from '@/domain/filter/filterEngine';
import LocalLLMPanel from '@/features/llm/LocalLLMPanel';
import type { QualityLabel, QualityTag, ClassifyResult } from '@/features/llm/useClassifier';
import { useLlmStore } from '@/store/llmStore';

type LlmResult = { label: QualityLabel; score: number; tag: QualityTag };

interface CommentWithReplies extends BlogComment {
  replies: BlogComment[];
}

function convertUrlsToLinks(text: string) {
  // [^\s<>"'] — URL을 HTML 태그 시작(<)·따옴표에서도 끊어 <br> 등을 먹지 않게
  const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
  return text.replace(urlRegex, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">${url}</a>`);
}

function ProfileImage({ imageUrl, isOwner, size = 'large' }: { imageUrl?: string | null; isOwner: boolean; size?: 'small' | 'large' }) {
  const [failed, setFailed] = useState(false);
  const defaultImage = 'https://blogimgs.pstatic.net/nblog/comment/login_basic.gif';
  const classes = size === 'large'
    ? 'w-7 h-7 sm:w-12 sm:h-12 rounded-full object-cover border-2'
    : 'w-5 h-5 sm:w-8 sm:h-8 rounded-full object-cover border';
  return (
    <img
      src={failed ? defaultImage : (imageUrl || defaultImage)}
      alt="프로필"
      referrerPolicy="no-referrer"
      className={`${classes} ${isOwner ? 'border-amber-300' : 'border-gray-200'}`}
      onError={() => setFailed(true)}
    />
  );
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// filterEngine의 isOwnerComment를 import해서 사용 (profileUserId, userName fallback 포함)

export default function PostComments({ postId, blogId = 'ranto28' }: { postId: string; blogId?: string }) {
  const { phase1ScoreThreshold } = useLlmStore();
  const [showFiltered, setShowFiltered] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [llmResultMap, setLlmResultMap] = useState<Record<number, LlmResult>>({});
  const [qualityFilterActive, setQualityFilterActive] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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

  useEffect(() => { loadComments(); }, [loadComments]);

  const parentComments = comments.filter((c) => c.replyLevel === 1);
  const replyComments = comments.filter((c) => c.replyLevel === 2);
  const structuredComments: CommentWithReplies[] = parentComments.map((parent) => ({
    ...parent,
    replies: replyComments
      .filter((r) => r.parentCommentNo === parent.commentNo)
      .sort((a, b) => new Date(a.regTime || a.regTimeGmt || 0).getTime() - new Date(b.regTime || b.regTimeGmt || 0).getTime()),
  }));

  const ownerRelatedComments = structuredComments.filter((c) =>
    isOwnerComment(c, blogId) || c.replies.some((r) => isOwnerComment(r, blogId))
  );
  // AI 품질 필터가 활성화된 경우 전체 댓글 기준으로 필터링 (주인장 뷰에서도 전체 분류 결과 반영)
  const baseComments = (qualityFilterActive && Object.keys(llmResultMap).length > 0)
    ? structuredComments
    : (showAllComments ? structuredComments : ownerRelatedComments);
  const commentsToShow = baseComments
    .filter((c) => {
      if (!qualityFilterActive || Object.keys(llmResultMap).length === 0) return true;
      const result = llmResultMap[c.commentNo];
      if (!result) return true;
      if (result.label === 'spam') return false;
      return result.score >= phase1ScoreThreshold;
    });

  return (
    <main className="p-1 sm:p-6 h-screen">
      <div className="flex flex-col h-full gap-1 sm:gap-4">
        {/* 버튼 그룹 */}
        <div className="flex flex-wrap gap-1 sm:gap-2 items-center">
          <button
            className="flex-shrink-0 w-full sm:w-auto px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-base rounded-md sm:rounded-lg border border-green-500 bg-white text-green-700 font-semibold shadow-sm hover:bg-green-50 hover:shadow-md transition-all"
            onClick={() => window.location.href = `/posts?scrollTo=${postId}`}
          >
            <span className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2">
              <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              게시글 목록
            </span>
          </button>

          <button
            className={`flex-shrink-0 w-full sm:w-auto px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-base rounded-md sm:rounded-lg border border-blue-500 bg-white text-blue-700 font-semibold shadow-sm hover:bg-blue-50 hover:shadow-md transition-all ${showFiltered ? 'bg-blue-50' : ''} ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
            onClick={() => { setShowFiltered((v) => !v); setShowAllComments(false); }}
            disabled={isLoading}
          >
            <span className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2">
              {isLoading && <span className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-2 border-blue-700 border-t-transparent" />}
              {isLoading ? '로딩 중...' : (
                <>
                  <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
                  {showFiltered ? '댓글 닫기' : '댓글 보기'}
                  <span className="text-[9px] sm:text-xs bg-blue-100 text-blue-800 px-1 sm:px-2 py-0.5 rounded">
                    {ownerRelatedComments.length} / {comments.length}
                  </span>
                </>
              )}
            </span>
          </button>

          {showFiltered && (
            <button
              className={`flex-shrink-0 w-full sm:w-auto px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-base rounded-md sm:rounded-lg border border-blue-500 bg-white text-blue-700 font-semibold shadow-sm hover:bg-blue-50 hover:shadow-md transition-all ${showAllComments ? 'bg-blue-50' : ''}`}
              onClick={() => setShowAllComments((v) => !v)}
            >
              <span className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2">
                <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"/></svg>
                {showAllComments ? '주인장 댓글만 보기' : '전체 댓글 보기'}
                <span className="text-[9px] sm:text-xs bg-blue-100 text-blue-800 px-1 sm:px-2 py-0.5 rounded">
                  {comments.length}
                </span>
              </span>
            </button>
          )}

          <button
            className={`flex-shrink-0 w-full sm:w-auto px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-base rounded-md sm:rounded-lg border border-purple-500 bg-white text-purple-700 font-semibold shadow-sm hover:bg-purple-50 hover:shadow-md transition-all ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
            onClick={loadComments}
            disabled={isLoading}
          >
            <span className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2">
              <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              새로고침
              {lastRefreshTime && (
                <span className="text-[9px] sm:text-xs bg-purple-100 text-purple-800 px-1 sm:px-2 py-0.5 rounded">
                  {formatDate(lastRefreshTime.toISOString())}
                </span>
              )}
            </span>
          </button>

          {showFiltered && (
            <div className="ml-auto">
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
          )}
        </div>

        {/* 컨텐츠 */}
        <div className="flex-1 min-h-0">
          {showFiltered ? (
            <div className="h-full overflow-hidden">
              {!isLoading && (
                <ul className="h-full space-y-2 sm:space-y-6 overflow-y-auto w-full px-0.5 sm:px-2">
                  {commentsToShow.length === 0 ? (
                    <li className="text-xs text-gray-400">
                      {qualityFilterActive ? '읽을만한 댓글이 없습니다.' : showAllComments ? '아직 댓글이 없습니다.' : '주인장이 참여한 댓글이 없습니다.'}
                    </li>
                  ) : (
                    commentsToShow.map((comment, idx) => (
                      <li key={idx} className="space-y-1.5 sm:space-y-3">
                        <div className={`flex items-start gap-1.5 sm:gap-3 p-1.5 sm:p-4 rounded-md sm:rounded-lg border shadow-sm ${isOwnerComment(comment, blogId) ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
                          <ProfileImage imageUrl={comment.userProfileImage} isOwner={isOwnerComment(comment, blogId)} size="large" />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-0.5 sm:mb-2">
                              <span className={`font-semibold text-xs sm:text-base ${isOwnerComment(comment, blogId) ? 'text-amber-900' : 'text-gray-900'}`}>
                                {comment.userName || comment.maskedUserName}
                              </span>
                              {isOwnerComment(comment, blogId) && (
                                <span className="text-[9px] sm:text-xs bg-amber-200 text-amber-800 px-1 sm:px-2 py-0.5 rounded">👑 주인장</span>
                              )}
                              {comment.sympathyCount !== undefined && comment.sympathyCount > 0 && (
                                <span className="text-[9px] sm:text-xs text-pink-500">👍 {comment.sympathyCount}</span>
                              )}
                              {(() => {
                                const r = llmResultMap[comment.commentNo];
                                if (!r || r.label !== 'worth_reading') return null;
                                return (
                                  <span className="text-[9px] sm:text-xs px-1 py-0.5 rounded bg-teal-100 text-teal-700">
                                    {r.tag} · {r.score}점
                                  </span>
                                );
                              })()}
                              <span className="text-[9px] sm:text-xs text-gray-500 bg-gray-100 px-1 sm:px-2 py-0.5 rounded">
                                {formatDate(comment.regTime || comment.regTimeGmt)}
                              </span>
                            </div>
                            {comment.isSecret ? (
                              <p className="text-[11px] sm:text-sm text-gray-400 italic">🔒 비밀 댓글입니다</p>
                            ) : (
                              <div className="text-gray-800 text-[11px] sm:text-sm leading-relaxed break-words"
                                dangerouslySetInnerHTML={{ __html: convertUrlsToLinks(comment.contents) }} />
                            )}
                            {comment.replies.length > 0 && (
                              <div className="text-[9px] sm:text-xs text-blue-600 mt-0.5 sm:mt-2">
                                💬 {comment.replies.length}개의 답글
                              </div>
                            )}
                          </div>
                        </div>

                        {comment.replies.length > 0 && (
                          <div className="ml-5 sm:ml-8 space-y-1.5 sm:space-y-3">
                            {comment.replies.map((reply, ri) => (
                              <div key={ri} className={`flex items-start gap-1 sm:gap-2 p-1.5 sm:p-3 rounded-md sm:rounded-lg border-l-4 ${isOwnerComment(reply, blogId) ? 'bg-amber-100 border-l-amber-400' : 'bg-blue-50 border-l-blue-200'}`}>
                                <span className="text-gray-400 font-bold text-sm sm:text-lg mt-0.5 sm:mt-1">ㄴ</span>
                                <ProfileImage imageUrl={reply.userProfileImage} isOwner={isOwnerComment(reply, blogId)} size="small" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
                                    <span className={`font-semibold text-[11px] sm:text-sm ${isOwnerComment(reply, blogId) ? 'text-amber-900' : 'text-gray-900'}`}>
                                      {reply.userName || reply.maskedUserName}
                                    </span>
                                    {isOwnerComment(reply, blogId) && (
                                      <span className="text-[9px] sm:text-xs bg-amber-200 text-amber-800 px-1 sm:px-2 py-0.5 rounded">👑 주인장</span>
                                    )}
                                    <span className="text-[9px] sm:text-xs text-gray-500 bg-gray-100 px-1 sm:px-2 py-0.5 rounded">
                                      {formatDate(reply.regTime || reply.regTimeGmt)}
                                    </span>
                                  </div>
                                  {reply.isSecret ? (
                                    <p className="text-[11px] sm:text-sm text-gray-400 italic">🔒 비밀 댓글입니다</p>
                                  ) : (
                                    <div className="text-gray-800 text-[11px] sm:text-sm leading-relaxed break-words"
                                      dangerouslySetInnerHTML={{ __html: convertUrlsToLinks(reply.contents) }} />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          ) : (
            <div className="h-full">
              {isMobile ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 p-4 text-center">
                  <p className="text-gray-600">
                    모바일 환경에서는 네이버 블로그를 직접 보여줄 수 없습니다.
                    아래 버튼을 눌러 게시글을 확인해주세요.
                  </p>
                  <a
                    href={`https://blog.naver.com/${blogId}/${postId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600 transition-colors"
                  >
                    게시글 보기
                  </a>
                </div>
              ) : (
                <iframe
                  src={`https://blog.naver.com/${blogId}/${postId}`}
                  className="w-full h-full border rounded-xl"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
