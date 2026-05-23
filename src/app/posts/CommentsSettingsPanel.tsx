'use client';

import { useRef, useState, useEffect } from 'react';
import { useFilterStore } from '@/store/filterStore';

export default function CommentsSettingsPanel() {
  const {
    settings,
    setSettings,
    addBlockedUser,
    removeBlockedUser,
    addFavoriteUser,
    removeFavoriteUser,
  } = useFilterStore();

  const [isOpen, setIsOpen] = useState(false);
  const [blockedInput, setBlockedInput] = useState('');
  const [favoriteInput, setFavoriteInput] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const activeCount = [
    settings.enableLikeFilter,
    settings.enableFavoriteFilter,
    settings.blockedUsers.length > 0,
  ].filter(Boolean).length;

  return (
    <div className="relative" ref={wrapperRef}>
      {/* 설정 버튼 */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={`text-xs px-2.5 py-1 rounded-full transition flex items-center gap-1.5 border
          ${isOpen
            ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-800 dark:border-slate-200'
            : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        title="댓글 필터 설정"
      >
        <span>⚙</span>
        {activeCount > 0 && (
          <span className="bg-teal-500 text-white px-1.5 rounded-full text-[10px]">{activeCount}</span>
        )}
      </button>

      {/* 팝업 패널 */}
      {isOpen && (
        <div className="absolute right-0 top-9 z-50 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-4 space-y-4">
          <h3 className="font-semibold text-xs text-slate-700 dark:text-slate-200">⚙ 댓글 필터 설정</h3>

          {/* ── 좋아요 필터 ── */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">👍 좋아요 필터</span>
              <button
                onClick={() => setSettings({ enableLikeFilter: !settings.enableLikeFilter })}
                className={`relative rounded-full transition-colors flex-shrink-0`}
                style={{ height: '18px', width: '32px', background: settings.enableLikeFilter ? '#14b8a6' : '#cbd5e1' }}
              >
                <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${settings.enableLikeFilter ? 'translate-x-3.5' : ''}`} />
              </button>
            </div>
            {settings.enableLikeFilter && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">최소</span>
                <input
                  type="number"
                  min={0}
                  value={settings.minLikes}
                  onChange={(e) => setSettings({ minLikes: Math.max(0, Number(e.target.value)) })}
                  className="w-16 text-xs text-center border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                />
                <span className="text-[11px] text-slate-500 dark:text-slate-400">개 이상</span>
              </div>
            )}
          </section>

          <hr className="border-slate-100 dark:border-slate-800" />

          {/* ── 선호 유저 ── */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">⭐ 선호 유저 필터</span>
              <button
                onClick={() => setSettings({ enableFavoriteFilter: !settings.enableFavoriteFilter })}
                className="relative rounded-full transition-colors flex-shrink-0"
                style={{ height: '18px', width: '32px', background: settings.enableFavoriteFilter ? '#14b8a6' : '#cbd5e1' }}
              >
                <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${settings.enableFavoriteFilter ? 'translate-x-3.5' : ''}`} />
              </button>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">ON 시 선호 유저 댓글만 표시</p>
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="유저명 추가"
                value={favoriteInput}
                onChange={(e) => setFavoriteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && favoriteInput.trim()) {
                    addFavoriteUser(favoriteInput.trim());
                    setFavoriteInput('');
                  }
                }}
                className="flex-1 text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600"
              />
              <button
                onClick={() => { if (favoriteInput.trim()) { addFavoriteUser(favoriteInput.trim()); setFavoriteInput(''); } }}
                className="text-xs px-2 py-1 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition"
              >
                +
              </button>
            </div>
            {settings.favoriteUsers.length > 0 && (
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {settings.favoriteUsers.map((user) => (
                  <span key={user} className="inline-flex items-center gap-1 text-[10px] bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-400 px-2 py-0.5 rounded-full">
                    {user}
                    <button onClick={() => removeFavoriteUser(user)} className="text-teal-400 hover:text-teal-600 leading-none">×</button>
                  </span>
                ))}
              </div>
            )}
          </section>

          <hr className="border-slate-100 dark:border-slate-800" />

          {/* ── 차단 유저 ── */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">🚫 차단 유저</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">항상 적용</span>
            </div>
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="유저명 차단"
                value={blockedInput}
                onChange={(e) => setBlockedInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && blockedInput.trim()) {
                    addBlockedUser(blockedInput.trim());
                    setBlockedInput('');
                  }
                }}
                className="flex-1 text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600"
              />
              <button
                onClick={() => { if (blockedInput.trim()) { addBlockedUser(blockedInput.trim()); setBlockedInput(''); } }}
                className="text-xs px-2 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
              >
                +
              </button>
            </div>
            {settings.blockedUsers.length > 0 ? (
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {settings.blockedUsers.map((user) => (
                  <span key={user} className="inline-flex items-center gap-1 text-[10px] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
                    {user}
                    <button onClick={() => removeBlockedUser(user)} className="text-red-400 hover:text-red-600 leading-none">×</button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-slate-300 dark:text-slate-600">차단된 유저 없음</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
