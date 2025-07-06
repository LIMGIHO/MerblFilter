'use client';
import { useEffect, useState } from 'react';
import { use } from 'react';

interface Comment {
  contents: string;
  userId: string;
  replyAll?: Comment[];
}

async function fetchComments(postId: string): Promise<Comment[]> {
  const res = await fetch(`/api/comments?postId=${postId}`);

  if (!res.ok) return [];
  const json = await res.json();
  return json.result?.commentList ?? [];
}

export default function PostComments({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = use(params);
  const [showFiltered, setShowFiltered] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!postId) return;

    setIsLoading(true);
    fetchComments(postId).then((commentList: any[]) => {
      // 댓글을 날짜순으로 정렬 (최신순)
      const sortedComments = commentList.sort((a: any, b: any) => {
        const dateA = new Date(a.regTime || a.regTimeGmt || 0);
        const dateB = new Date(b.regTime || b.regTimeGmt || 0);
        return dateB.getTime() - dateA.getTime(); // 최신순
      });
      setComments(sortedComments);
    }).finally(() => {
      setIsLoading(false);
    });
  }, [postId]);

  useEffect(() => {
    console.log("===12.", comments);
  }, [comments]);

  // 네이버 스타일 날짜 포맷
  function formatDate(dateStr: string) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  // 댓글을 원댓글과 대댓글로 구조화
  const parentComments = comments.filter((comment) => comment.replyLevel === 1);
  const replyComments = comments.filter((comment) => comment.replyLevel === 2);
  
  // 각 원댓글에 대댓글들을 연결
  const structuredComments = parentComments.map((parent) => {
    const replies = replyComments.filter((reply) => reply.parentCommentNo === parent.commentNo);
    return {
      ...parent,
      replies: replies.sort((a, b) => {
        // 대댓글은 오래된 순으로 정렬
        const dateA = new Date(a.regTime || a.regTimeGmt || 0);
        const dateB = new Date(b.regTime || b.regTimeGmt || 0);
        return dateA.getTime() - dateB.getTime();
      })
    };
  });

  // 주인장(ranto28)이 참여한 댓글 스레드만 필터링
  const ownerId = 'ranto28';
  const ownerRelatedComments = structuredComments.filter((parent) => {
    // 1. 원댓글이 주인장 댓글인 경우
    const isOwnerParent = parent.profileUserId === ownerId || parent.userName === ownerId;
    
    // 2. 대댓글 중에 주인장 댓글이 있는 경우
    const hasOwnerReply = parent.replies && parent.replies.some((reply: any) => 
      reply.profileUserId === ownerId || reply.userName === ownerId
    );
    
    return isOwnerParent || hasOwnerReply;
  });

  return (
    <main className="p-6 h-screen">
      <div className="flex flex-col h-full gap-4">
        {/* 댓글 버튼 */}
        <button
          className={`px-4 py-2 rounded-lg border border-blue-500 bg-white text-blue-700 font-semibold shadow-sm hover:bg-blue-50 hover:shadow-md transition-all duration-150 active:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-300 ${showFiltered ? 'bg-blue-50' : ''} ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
          onClick={() => setShowFiltered((v) => !v)}
          disabled={isLoading}
        >
          <div className="flex items-center gap-2">
            {isLoading && (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-700 border-t-transparent"></div>
            )}
            {isLoading ? '댓글 로딩 중...' : showFiltered ? '주인장 댓글 닫기' : '주인장 댓글 보기'}
          </div>
        </button>
        
        {/* 댓글 보기 상태일 때 댓글만 전체 화면 */}
        {showFiltered ? (
          <div className="flex-1 overflow-hidden">
            {!isLoading && (
              <ul className="h-full space-y-6 overflow-y-auto w-full px-2">
                {ownerRelatedComments.length === 0 ? (
                  <li className="text-xs text-gray-400">주인장이 참여한 댓글이 없습니다.</li>
                ) : (
                  ownerRelatedComments.map((comment, idx) => (
                                          <li key={idx} className="space-y-3">
                        {/* 원댓글 */}
                        <div className={`flex items-start gap-3 p-4 rounded-lg border shadow-sm ${
                          comment.profileUserId === ownerId || comment.userName === ownerId
                            ? 'bg-amber-50 border-amber-200' 
                            : 'bg-white border-gray-200'
                        }`}>
                          <img
                            src={comment.userProfileImage || 'https://blogimgs.pstatic.net/nblog/comment/login_basic.gif'}
                            alt="프로필"
                            className={`w-12 h-12 rounded-full object-cover border-2 ${
                              comment.profileUserId === ownerId || comment.userName === ownerId
                                ? 'border-amber-300' 
                                : 'border-gray-100'
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`font-semibold text-base ${
                                comment.profileUserId === ownerId || comment.userName === ownerId
                                  ? 'text-amber-900' 
                                  : 'text-gray-900'
                              }`}>
                                {comment.userName || comment.maskedUserName}
                              </span>
                              {(comment.profileUserId === ownerId || comment.userName === ownerId) && (
                                <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                                  👑 주인장
                                </span>
                              )}
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{formatDate(comment.regTime || comment.regTimeGmt)}</span>
                            </div>
                            <div className="text-gray-800 text-sm leading-relaxed break-words" dangerouslySetInnerHTML={{ __html: comment.contents }} />
                            {comment.replies && comment.replies.length > 0 && (
                              <div className="text-xs text-blue-600 mt-2 font-medium">
                                💬 {comment.replies.length}개의 답글
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* 대댓글들 */}
                        {comment.replies && comment.replies.length > 0 && (
                          <div className="ml-8 space-y-3">
                            {comment.replies.map((reply: any, replyIdx: number) => (
                              <div key={replyIdx} className={`flex items-start gap-2 p-3 rounded-lg border-l-4 ${
                                reply.profileUserId === ownerId || reply.userName === ownerId
                                  ? 'bg-amber-100 border-l-amber-400'
                                  : 'bg-blue-50 border-l-blue-200'
                              }`}>
                                <span className="text-gray-400 font-bold text-lg mt-1">ㄴ</span>
                                <img
                                  src={reply.userProfileImage || 'https://blogimgs.pstatic.net/nblog/comment/login_basic.gif'}
                                  alt="프로필"
                                  className={`w-8 h-8 rounded-full object-cover border ${
                                    reply.profileUserId === ownerId || reply.userName === ownerId
                                      ? 'border-amber-300'
                                      : 'border-gray-200'
                                  }`}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`font-semibold text-sm ${
                                      reply.profileUserId === ownerId || reply.userName === ownerId
                                        ? 'text-amber-900'
                                        : 'text-blue-800'
                                    }`}>
                                      {reply.userName || reply.maskedUserName}
                                    </span>
                                    {(reply.profileUserId === ownerId || reply.userName === ownerId) && (
                                      <span className="text-xs bg-amber-300 text-amber-900 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                        👑 주인장
                                      </span>
                                    )}
                                    <span className="text-xs text-gray-500">
                                      {formatDate(reply.regTime || reply.regTimeGmt)}
                                    </span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded text-[10px] ${
                                      reply.profileUserId === ownerId || reply.userName === ownerId
                                        ? 'bg-amber-200 text-amber-800'
                                        : 'bg-blue-200 text-blue-700'
                                    }`}>
                                      답글
                                    </span>
                                  </div>
                                  <div className={`text-sm break-words leading-relaxed ${
                                    reply.profileUserId === ownerId || reply.userName === ownerId
                                      ? 'text-amber-900'
                                      : 'text-blue-900'
                                  }`} dangerouslySetInnerHTML={{ __html: reply.contents }} />
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
          /* 댓글 닫힌 상태일 때 게시글 전체 */
          <div className="flex-1 basis-0 min-h-0">
            <iframe
              src={`https://blog.naver.com/ranto28/${postId}`}
              className="w-full h-full border rounded-xl"
            />
          </div>
        )}
      </div>
    </main>
  );
}
