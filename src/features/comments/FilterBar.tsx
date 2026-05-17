'use client';

import { useState } from 'react';
import { useFilterStore } from '@/store/filterStore';

interface FilterBarProps {
  totalCount: number;
  visibleCount: number;
}

export default function FilterBar({ totalCount, visibleCount }: FilterBarProps) {
  const { settings, setSettings, addBlockedUser, addFavoriteUser } = useFilterStore();
  const [isOpen, setIsOpen] = useState(false);
  const [blockInput, setBlockInput] = useState('');
  const [favInput, setFavInput] = useState('');

  const activeFilters = [
    settings.ownerOnly,
    settings.enableLikeFilter,
    settings.enableUserFilter,
    settings.enableFavoriteFilter,
    settings.enableSearchFilter,
  ].filter(Boolean).length;

  return (
    <div className="relative">
      {/* 필터 토글 버튼 */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all
          ${activeFilters > 0
            ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
            : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
          }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
        </svg>
        필터
        {activeFilters > 0 && (
          <span className="bg-indigo-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {activeFilters}
          </span>
        )}
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {visibleCount}/{totalCount}
        </span>
      </button>

      {/* 드롭다운 패널 */}
      {isOpen && (
        <div className="absolute right-0 top-10 z-50 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4 space-y-4">
          <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-100">댓글 필터 설정</h3>

          {/* ownerOnly */}
          <Toggle
            label="👑 메르님 참여 댓글만"
            checked={settings.ownerOnly}
            onChange={(v) => setSettings({ ownerOnly: v })}
          />

          {/* minLikes */}
          <div className="space-y-1">
            <Toggle
              label={`👍 좋아요 ${settings.minLikes}개 이상만`}
              checked={settings.enableLikeFilter}
              onChange={(v) => setSettings({ enableLikeFilter: v })}
            />
            {settings.enableLikeFilter && (
              <input
                type="range" min={1} max={100} value={settings.minLikes}
                onChange={(e) => setSettings({ minLikes: Number(e.target.value) })}
                className="w-full accent-indigo-500"
              />
            )}
          </div>

          {/* 키워드 검색 */}
          <div className="space-y-1">
            <Toggle
              label="🔍 키워드 필터"
              checked={settings.enableSearchFilter}
              onChange={(v) => setSettings({ enableSearchFilter: v })}
            />
            {settings.enableSearchFilter && (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="키워드 입력"
                  value={settings.searchKeyword}
                  onChange={(e) => setSettings({ searchKeyword: e.target.value })}
                  className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 dark:text-gray-100"
                />
                <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={settings.searchKeywordRegex}
                    onChange={(e) => setSettings({ searchKeywordRegex: e.target.checked })}
                    className="accent-indigo-500"
                  />
                  정규식
                </label>
              </div>
            )}
          </div>

          {/* 차단 사용자 */}
          <div className="space-y-1">
            <Toggle
              label="🚫 차단 사용자 필터"
              checked={settings.enableUserFilter}
              onChange={(v) => setSettings({ enableUserFilter: v })}
            />
            {settings.enableUserFilter && (
              <>
                <div className="flex gap-1">
                  <input
                    type="text"
                    placeholder="차단할 아이디/닉네임"
                    value={blockInput}
                    onChange={(e) => setBlockInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && blockInput.trim()) {
                        addBlockedUser(blockInput.trim());
                        setBlockInput('');
                      }
                    }}
                    className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 dark:text-gray-100"
                  />
                  <button
                    onClick={() => { addBlockedUser(blockInput.trim()); setBlockInput(''); }}
                    className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                  >추가</button>
                </div>
                <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={settings.blockedUsersPartialMatch}
                    onChange={(e) => setSettings({ blockedUsersPartialMatch: e.target.checked })}
                    className="accent-indigo-500"
                  />
                  부분일치
                </label>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {settings.blockedUsers.map((u) => (
                    <UserChip key={u} name={u} color="red" onRemove={() => {
                      useFilterStore.getState().removeBlockedUser(u);
                    }} />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 즐겨찾기 사용자 */}
          <div className="space-y-1">
            <Toggle
              label="⭐ 즐겨찾기만 보기"
              checked={settings.enableFavoriteFilter}
              onChange={(v) => setSettings({ enableFavoriteFilter: v })}
            />
            {settings.enableFavoriteFilter && (
              <>
                <div className="flex gap-1">
                  <input
                    type="text"
                    placeholder="즐겨찾기 아이디/닉네임"
                    value={favInput}
                    onChange={(e) => setFavInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && favInput.trim()) {
                        addFavoriteUser(favInput.trim());
                        setFavInput('');
                      }
                    }}
                    className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 dark:text-gray-100"
                  />
                  <button
                    onClick={() => { addFavoriteUser(favInput.trim()); setFavInput(''); }}
                    className="text-xs px-2 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                  >추가</button>
                </div>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {settings.favoriteUsers.map((u) => (
                    <UserChip key={u} name={u} color="yellow" onRemove={() => {
                      useFilterStore.getState().removeFavoriteUser(u);
                    }} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </div>
      <span className="text-sm text-gray-700 dark:text-gray-200">{label}</span>
    </label>
  );
}

function UserChip({ name, color, onRemove }: { name: string; color: 'red' | 'yellow'; onRemove: () => void }) {
  const colors = color === 'red'
    ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
  return (
    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${colors}`}>
      {name}
      <button onClick={onRemove} className="hover:opacity-70">×</button>
    </span>
  );
}
