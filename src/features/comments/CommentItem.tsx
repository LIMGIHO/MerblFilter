'use client';

import { useState, useCallback } from 'react';
import { BlogComment, FilteredComment } from '@/domain/comment/types';
import { isOwnerComment } from '@/domain/filter/filterEngine';
import BlockMenu from './BlockMenu';

interface CommentItemProps {
  comment: FilteredComment;
  searchKeyword?: string;
  regexMode?: boolean;
  showHidden?: boolean;
}

function highlightText(text: string, keyword: string, regexMode: boolean): React.ReactNode {
  if (!keyword) return text;
  try {
    const regex = regexMode
      ? new RegExp(`(${keyword})`, 'gi')
      : new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/50 rounded px-0.5">{part}</mark>
      ) : part
    );
  } catch {
    return text;
  }
}

function convertUrlsToLinks(text: string): string {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(
    urlRegex,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 dark:text-blue-400 underline">${url}</a>`
  );
}

function ProfileImage({ imageUrl, isOwner, name, size = 'large' }: { imageUrl?: string | null; isOwner: boolean; name?: string; size?: 'small' | 'large' }) {
  const sizeClass = size === 'large' ? 'w-8 h-8 sm:w-10 sm:h-10' : 'w-6 h-6 sm:w-8 sm:h-8';
  const borderClass = isOwner ? 'border-amber-400' : 'border-gray-200 dark:border-gray-600';
  const initial = (name || '?')[0].toUpperCase();
  const colors = ['bg-blue-400', 'bg-green-400', 'bg-purple-400', 'bg-pink-400', 'bg-orange-400', 'bg-teal-400'];
  const colorClass = colors[(initial.charCodeAt(0) ?? 0) % colors.length];

  const [failed, setFailed] = useState(false);

  if (!imageUrl || failed) {
    return (
      <div className={`${sizeClass} rounded-full border-2 ${borderClass} ${colorClass} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
        {initial}
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt="프로필"
      className={`${sizeClass} rounded-full object-cover border-2 ${borderClass} flex-shrink-0`}
      onError={() => setFailed(true)}
    />
  );
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function AuthorButton({ comment, onClick }: { comment: BlogComment; onClick: (e: React.MouseEvent) => void }) {
  const isOwner = isOwnerComment(comment);
  return (
    <button
      onClick={onClick}
      className={`font-semibold text-xs sm:text-sm hover:underline ${isOwner ? 'text-amber-700 dark:text-amber-400' : 'text-gray-800 dark:text-gray-200'}`}
    >
      {comment.userName || comment.maskedUserName || '익명'}
    </button>
  );
}

export default function CommentItem({ comment, searchKeyword = '', regexMode = false, showHidden = false }: CommentItemProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [activeReplyComment, setActiveReplyComment] = useState<BlogComment | null>(null);

  const handleAuthorClick = useCallback((e: React.MouseEvent, c: BlogComment) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveReplyComment(c);
    setMenu({ x: Math.min(e.clientX, window.innerWidth - 160), y: e.clientY + 8 });
  }, []);

  const isOwner = isOwnerComment(comment);

  if (comment._isHidden && !showHidden) return null;

  return (
    <li className={`space-y-2 ${comment._isHidden ? 'opacity-40' : ''}`}>
      {/* 원댓글 */}
      <div className={`flex items-start gap-2 sm:gap-3 p-2 sm:p-4 rounded-lg border shadow-sm
        ${isOwner
          ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'
          : 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700'
        }`}
      >
        <ProfileImage imageUrl={comment.userProfileImage} isOwner={isOwner} name={comment.userName || comment.maskedUserName} size="large" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <AuthorButton comment={comment} onClick={(e) => handleAuthorClick(e, comment)} />
            {isOwner && (
              <span className="text-xs bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100 px-1.5 py-0.5 rounded">
                👑 메르님
              </span>
            )}
            {comment.sympathyCount !== undefined && comment.sympathyCount > 0 && (
              <span className="text-xs bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300 px-1.5 py-0.5 rounded">
                👍 {comment.sympathyCount}
              </span>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatDate(comment.regTime || comment.regTimeGmt)}
            </span>
            {comment._llmLabel && comment._llmLabel !== 'neutral' && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                    {comment._llmLabel === 'positive' ? '긍정' : comment._llmLabel === 'negative' ? '부정' : comment._llmLabel === 'spam' ? '스팸' : comment._llmLabel === 'promo' ? '홍보' : ''}
                  </span>
                )}
                {comment._isHidden && (
              <span className="text-xs bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400 px-1.5 py-0.5 rounded">
                숨김
              </span>
            )}
          </div>
          {comment.isSecret ? (
            <div className="text-xs sm:text-sm text-gray-400 dark:text-gray-500 italic flex items-center gap-1">
              🔒 비밀 댓글입니다
            </div>
          ) : (
            <div
              className="text-gray-800 dark:text-gray-200 text-xs sm:text-sm leading-relaxed break-words"
              dangerouslySetInnerHTML={{ __html: convertUrlsToLinks(comment.contents) }}
            />
          )}
          {searchKeyword && (
            <div className="mt-1 text-xs sm:text-sm text-gray-700 dark:text-gray-300">
              {highlightText(comment.contents, searchKeyword, regexMode)}
            </div>
          )}
          {comment.replies.length > 0 && (
            <div className="text-xs text-blue-500 dark:text-blue-400 mt-1">
              💬 {comment.replies.length}개 답글
            </div>
          )}
        </div>
      </div>

      {/* 대댓글 */}
      {comment.replies.length > 0 && (
        <div className="ml-6 sm:ml-10 space-y-1.5">
          {comment.replies.map((reply, i) => {
            const replyIsOwner = isOwnerComment(reply);
            return (
              <div key={i} className={`flex items-start gap-1.5 sm:gap-2 p-1.5 sm:p-3 rounded-lg border-l-4
                ${replyIsOwner
                  ? 'bg-amber-100 border-l-amber-400 dark:bg-amber-950/30 dark:border-l-amber-600'
                  : 'bg-gray-50 border-l-gray-300 dark:bg-gray-800/60 dark:border-l-gray-600'
                }`}
              >
                <span className="text-gray-400 font-bold text-sm mt-0.5">ㄴ</span>
                <ProfileImage imageUrl={reply.userProfileImage} isOwner={replyIsOwner} name={reply.userName || reply.maskedUserName} size="small" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1 mb-0.5">
                    <AuthorButton comment={reply} onClick={(e) => handleAuthorClick(e, reply)} />
                    {replyIsOwner && (
                      <span className="text-xs bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100 px-1 py-0.5 rounded">
                        👑
                      </span>
                    )}
                    {reply.sympathyCount !== undefined && reply.sympathyCount > 0 && (
                      <span className="text-xs text-pink-500 dark:text-pink-400">👍 {reply.sympathyCount}</span>
                    )}
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {formatDate(reply.regTime || reply.regTimeGmt)}
                    </span>
                  </div>
                  <div
                    className="text-gray-800 dark:text-gray-200 text-xs sm:text-sm leading-relaxed break-words"
                    dangerouslySetInnerHTML={{ __html: convertUrlsToLinks(reply.contents) }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 우클릭/클릭 메뉴 */}
      {menu && activeReplyComment && (
        <BlockMenu
          userId={activeReplyComment.profileUserId ?? ''}
          userName={activeReplyComment.userName ?? activeReplyComment.maskedUserName ?? ''}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      )}
    </li>
  );
}
