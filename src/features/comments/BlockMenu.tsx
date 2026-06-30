'use client';

import { useEffect, useRef } from 'react';
import { useFilterStore } from '@/store/filterStore';

interface BlockMenuProps {
  userId: string;
  userName: string;
  x: number;
  y: number;
  onClose: () => void;
}

export default function BlockMenu({ userId, userName, x, y, onClose }: BlockMenuProps) {
  const { addBlockedUser, addFavoriteUser, settings } = useFilterStore();
  const ref = useRef<HTMLDivElement>(null);
  const displayName = userName || userId;
  const isBlocked = settings.blockedUsers.includes(displayName) || settings.blockedUsers.includes(userId);
  const isFavorite = settings.favoriteUsers.includes(displayName) || settings.favoriteUsers.includes(userId);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ top: y, left: x }}
      className="fixed z-[100] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 min-w-40"
    >
      <div className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800 font-medium">
        {displayName}
      </div>
      {userId && (
        <a
          href={`https://blog.naver.com/${userId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full text-left px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2"
          onClick={onClose}
        >
          <span>🔗</span> 블로그 보기
        </a>
      )}
      {!isBlocked ? (
        <button
          className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
          onClick={() => { addBlockedUser(displayName || userId); onClose(); }}
        >
          <span>🚫</span> 차단하기
        </button>
      ) : (
        <button
          className="w-full text-left px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
          onClick={() => { useFilterStore.getState().removeBlockedUser(displayName || userId); onClose(); }}
        >
          <span>✅</span> 차단 해제
        </button>
      )}
      {!isFavorite ? (
        <button
          className="w-full text-left px-3 py-2 text-sm text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 flex items-center gap-2"
          onClick={() => { addFavoriteUser(displayName || userId); onClose(); }}
        >
          <span>⭐</span> 즐겨찾기 추가
        </button>
      ) : (
        <button
          className="w-full text-left px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
          onClick={() => { useFilterStore.getState().removeFavoriteUser(displayName || userId); onClose(); }}
        >
          <span>⭐</span> 즐겨찾기 해제
        </button>
      )}
    </div>
  );
}
