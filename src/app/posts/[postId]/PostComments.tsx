'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Comment, CommentWithReplies } from '@/app/types/comments';

// URL을 감지하고 링크로 변환하는 함수
function convertUrlsToLinks(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">${url}</a>`);
}

const ProfileImage = ({ 
  imageUrl, 
  isOwner, 
  size = 'large' 
}: { 
  imageUrl?: string | null; 
  isOwner: boolean; 
  size?: 'small' | 'large';
}) => {
  const defaultImage = 'https://blogimgs.pstatic.net/nblog/comment/login_basic.gif';
  const classes = size === 'large' 
    ? 'w-7 h-7 sm:w-12 sm:h-12 rounded-full object-cover border-2'
    : 'w-5 h-5 sm:w-8 sm:h-8 rounded-full object-cover border';

  const imageSrc = imageUrl || defaultImage;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageSrc}
      alt="프로필"
      className={`${classes} ${isOwner ? 'border-amber-300' : 'border-gray-200'}`}
    />
  );
};

export default function PostComments({ postId }: { postId: string }) {
  const [showFiltered, setShowFiltered] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState<number | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // 모바일 환경 체크
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 모바일에서 직접 URL로 접근하는 경우 처리
  useEffect(() => {
    if (isMobile && !showFiltered) {
      const fromList = sessionStorage.getItem('fromList');
      if (!fromList) {
        window.location.href = `https://blog.naver.com/ranto28/${postId}`;
      }
    }
  }, [isMobile, showFiltered, postId]);

  // 댓글 불러오기 함수
  const loadComments = async () => {
    if (!postId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/comments?postId=${postId}`);
      const data = await res.json();
      console.log('댓글 데이터:', data);
      if (data.result?.commentList) {
        setComments(data.result.commentList);
        setLastRefreshTime(new Date());
      }
    } catch (error) {
      console.error('댓글 로딩 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 자동 새로고침 설정
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(loadComments, autoRefresh * 1000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, postId]);

  // 초기 로딩
  useEffect(() => {
    loadComments();
  }, [postId]);

  useEffect(() => {
    console.log("===12.", comments);
  }, [comments]);

  // 네이버 스타일 날짜 포맷
  function formatDate(dateStr: string | undefined) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  // 댓글 데이터 준비
  const parentComments = comments.filter((comment) => comment.replyLevel === 1);
  const replyComments = comments.filter((comment) => comment.replyLevel === 2);
  
  // 각 원댓글에 대댓글들을 연결
  const structuredComments: CommentWithReplies[] = parentComments.map((parent) => {
    const replies = replyComments.filter((reply) => reply.parentCommentNo === parent.commentNo);
    return {
      ...parent,
      replies: replies.sort((a, b) => {
        const dateA = new Date(a.regTime || a.regTimeGmt || 0);
        const dateB = new Date(b.regTime || b.regTimeGmt || 0);
        return dateA.getTime() - dateB.getTime();
      })
    };
  });

  // 주인장(ranto28)이 참여한 댓글 스레드만 필터링
  const ownerId = 'ranto28';
  const ownerRelatedComments = structuredComments.filter((parent) => {
    const isOwnerParent = parent.profileUserId === ownerId || parent.userName === ownerId;
    const hasOwnerReply = parent.replies?.some((reply) => 
      reply.profileUserId === ownerId || reply.userName === ownerId
    );
    return isOwnerParent || hasOwnerReply;
  });

  // 표시할 댓글 목록 선택
  const commentsToShow = showAllComments ? structuredComments : ownerRelatedComments;

  return (
    <main className="p-1 sm:p-6 h-screen">
      <div className="flex flex-col h-full gap-1 sm:gap-4">
        {/* 버튼 그룹 */}
        <div className="flex flex-wrap gap-1 sm:gap-2 items-center">
          {/* 게시글 보기 버튼 */}
          <button
            className="flex-shrink-0 w-full sm:w-auto px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-base rounded-md sm:rounded-lg border border-green-500 bg-white text-green-700 font-semibold shadow-sm hover:bg-green-50 hover:shadow-md transition-all duration-150 active:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-300"
            onClick={() => window.location.href = `/posts?scrollTo=${postId}`}
          >
            <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2">
              <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              게시글 목록
            </div>
          </button>

          {/* 댓글 보기 버튼 */}
          <button
            className={`flex-shrink-0 w-full sm:w-auto px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-base rounded-md sm:rounded-lg border border-blue-500 bg-white text-blue-700 font-semibold shadow-sm hover:bg-blue-50 hover:shadow-md transition-all duration-150 active:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-300 ${showFiltered ? 'bg-blue-50' : ''} ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
            onClick={() => {
              if (!showFiltered) {
                setShowFiltered(true);
                setShowAllComments(false);
              } else {
                setShowFiltered(false);
              }
            }}
            disabled={isLoading}
          >
            <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2">
              {isLoading && (
                <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-2 border-blue-700 border-t-transparent"></div>
              )}
              {isLoading ? '로딩 중...' : (
                <>
                  <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
                  </svg>
                  {showFiltered ? '댓글 닫기' : '댓글 보기'}
                  <span className="text-[9px] sm:text-xs bg-blue-100 text-blue-800 px-1 sm:px-2 py-0.5 rounded">
                    {ownerRelatedComments.length} / {comments.length}
                  </span>
                </>
              )}
            </div>
          </button>

          {/* 전체 댓글 보기 버튼 */}
          {showFiltered && (
            <button
              className={`flex-shrink-0 w-full sm:w-auto px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-base rounded-md sm:rounded-lg border border-blue-500 bg-white text-blue-700 font-semibold shadow-sm hover:bg-blue-50 hover:shadow-md transition-all duration-150 active:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-300 ${showAllComments ? 'bg-blue-50' : ''} ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
              onClick={() => setShowAllComments((v) => !v)}
              disabled={isLoading}
            >
              <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2">
                <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"></path>
                </svg>
                {showAllComments ? '메르님 댓글만 보기' : '전체 댓글 보기'}
                <span className="text-[9px] sm:text-xs bg-blue-100 text-blue-800 px-1 sm:px-2 py-0.5 rounded">
                  {comments.length}
                </span>
              </div>
            </button>
          )}

          {/* 새로고침 버튼 */}
          <button
            className={`flex-shrink-0 w-full sm:w-auto px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-base rounded-md sm:rounded-lg border border-purple-500 bg-white text-purple-700 font-semibold shadow-sm hover:bg-purple-50 hover:shadow-md transition-all duration-150 active:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-purple-300 ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
            onClick={loadComments}
            disabled={isLoading}
          >
            <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2">
              <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
              새로고침
              {lastRefreshTime && (
                <span className="text-[9px] sm:text-xs bg-purple-100 text-purple-800 px-1 sm:px-2 py-0.5 rounded">
                  {formatDate(lastRefreshTime.toISOString())}
                </span>
              )}
            </div>
          </button>
        </div>

        {/* 컨텐츠 영역 */}
        <div className="flex-1 min-h-0">
          {showFiltered ? (
            <div className="h-full overflow-hidden">
              {!isLoading && (
                <ul className="h-full space-y-2 sm:space-y-6 overflow-y-auto w-full px-0.5 sm:px-2">
                  {commentsToShow.length === 0 ? (
                    <li className="text-xs text-gray-400">
                      {showAllComments ? '아직 댓글이 없습니다.' : '메르님이 참여한 댓글이 없습니다.'}
                    </li>
                  ) : (
                    commentsToShow.map((comment, idx) => (
                      <li key={idx} className="space-y-1.5 sm:space-y-3">
                        {/* 원댓글 */}
                        <div className={`flex items-start gap-1.5 sm:gap-3 p-1.5 sm:p-4 rounded-md sm:rounded-lg border shadow-sm ${
                          comment.profileUserId === ownerId || comment.userName === ownerId
                            ? 'bg-amber-50 border-amber-200' 
                            : 'bg-white border-gray-200'
                        }`}>
                          <ProfileImage
                            imageUrl={comment.userProfileImage}
                            isOwner={comment.profileUserId === ownerId || comment.userName === ownerId}
                            size="large"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-0.5 sm:mb-2">
                              <span className={`font-semibold text-xs sm:text-base ${
                                comment.profileUserId === ownerId || comment.userName === ownerId
                                  ? 'text-amber-900' 
                                  : 'text-gray-900'
                              }`}>
                                {comment.userName || comment.maskedUserName}
                              </span>
                              {(comment.profileUserId === ownerId || comment.userName === ownerId) && (
                                <span className="text-[9px] sm:text-xs bg-amber-200 text-amber-800 px-1 sm:px-2 py-0.5 rounded">
                                  👑 메르님
                                </span>
                              )}
                              <span className="text-[9px] sm:text-xs text-gray-500 bg-gray-100 px-1 sm:px-2 py-0.5 rounded">
                                {formatDate(comment.regTime || comment.regTimeGmt)}
                              </span>
                            </div>
                            <div className="text-gray-800 text-[11px] sm:text-sm leading-relaxed break-words" 
                              dangerouslySetInnerHTML={{ 
                                __html: convertUrlsToLinks(comment.contents) 
                              }} 
                            />
                            {comment.replies && comment.replies.length > 0 && (
                              <div className="text-[9px] sm:text-xs text-blue-600 mt-0.5 sm:mt-2 font-medium">
                                💬 {comment.replies.length}개의 답글
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* 대댓글들 */}
                        {comment.replies && comment.replies.length > 0 && (
                          <div className="ml-5 sm:ml-8 space-y-1.5 sm:space-y-3">
                            {comment.replies.map((reply: any, replyIdx: number) => (
                              <div key={replyIdx} className={`flex items-start gap-1 sm:gap-2 p-1.5 sm:p-3 rounded-md sm:rounded-lg border-l-4 ${
                                reply.profileUserId === ownerId || reply.userName === ownerId
                                  ? 'bg-amber-100 border-l-amber-400'
                                  : 'bg-blue-50 border-l-blue-200'
                              }`}>
                                <span className="text-gray-400 font-bold text-sm sm:text-lg mt-0.5 sm:mt-1">ㄴ</span>
                                <ProfileImage
                                  imageUrl={reply.userProfileImage}
                                  isOwner={reply.profileUserId === ownerId || reply.userName === ownerId}
                                  size="small"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
                                    <span className={`font-semibold text-[11px] sm:text-sm ${
                                      reply.profileUserId === ownerId || reply.userName === ownerId
                                        ? 'text-amber-900'
                                        : 'text-gray-900'
                                    }`}>
                                      {reply.userName || reply.maskedUserName}
                                    </span>
                                    {(reply.profileUserId === ownerId || reply.userName === ownerId) && (
                                      <span className="text-[9px] sm:text-xs bg-amber-200 text-amber-800 px-1 sm:px-2 py-0.5 rounded">
                                        👑 메르님
                                      </span>
                                    )}
                                    <span className="text-[9px] sm:text-xs text-gray-500 bg-gray-100 px-1 sm:px-2 py-0.5 rounded">
                                      {formatDate(reply.regTime || reply.regTimeGmt)}
                                    </span>
                                  </div>
                                  <div className="text-gray-800 text-[11px] sm:text-sm leading-relaxed break-words" 
                                    dangerouslySetInnerHTML={{ 
                                      __html: convertUrlsToLinks(reply.contents) 
                                    }} 
                                  />
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
                    href={`https://blog.naver.com/ranto28/${postId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600 transition-colors duration-200"
                  >
                    게시글 보기
                  </a>
                </div>
              ) : (
                <iframe
                  src={`https://blog.naver.com/ranto28/${postId}`}
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