'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTtsPlaylistStore } from '@/store/ttsPlaylistStore';
import { useTTS } from '@/features/llm/useTTS';
import { useUiStore } from '@/store/uiStore';

// HTML 태그 제거
function stripHtml(html: string): string {
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

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const RATES = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export default function TTSPlayer() {
  const { items, currentIndex, drawerOpen, remove, setCurrentIndex, clear, toggleDrawer } =
    useTtsPlaylistStore();
  const { isSupported, status, rate, setRate, play, pause, resume, stop, currentTime, duration, seek } = useTTS();
  const contentPanelOffset = useUiStore((s) => s.contentPanelOffset);

  const bodyCache = useRef<Map<string, string>>(new Map());
  const [loadingBody, setLoadingBody] = useState(false);

  const currentItem = items[currentIndex] ?? null;

  const fetchBody = useCallback(async (postId: string, blogId: string): Promise<string> => {
    const cached = bodyCache.current.get(postId);
    if (cached) return cached;
    try {
      const res = await fetch(`/api/post-content?postId=${postId}&blogId=${blogId}`);
      const json = await res.json();
      const text = stripHtml(String(json.content ?? ''));
      bodyCache.current.set(postId, text);
      return text;
    } catch {
      return '';
    }
  }, []);

  const itemsRef = useRef(items);
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  const advanceToNext = useCallback(() => {
    const next = currentIndexRef.current + 1;
    if (next < itemsRef.current.length) {
      setCurrentIndex(next);
    }
  }, [setCurrentIndex]);

  const playCurrentItem = useCallback(async (item: typeof currentItem) => {
    if (!item) return;
    stop();
    setLoadingBody(true);
    const body = await fetchBody(item.postId, item.blogId);
    setLoadingBody(false);
    if (body) {
      play(body, advanceToNext);
    }
  }, [fetchBody, play, stop, advanceToNext]);

  const lastPlayedIndex = useRef<number>(-1);
  useEffect(() => {
    if (currentIndex !== -1 && currentIndex !== lastPlayedIndex.current && status !== 'paused') {
      const item = items[currentIndex];
      if (item) {
        lastPlayedIndex.current = currentIndex;
        playCurrentItem(item);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  if (!isSupported || items.length === 0) return null;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;
  const isLoading = loadingBody || status === 'loading';
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  function handlePlayPause() {
    if (status === 'playing') pause();
    else if (status === 'paused') resume();
    else playCurrentItem(currentItem);
  }

  function handleStop() {
    stop();
    lastPlayedIndex.current = -1;
  }

  function handlePrev() {
    if (hasPrev) setCurrentIndex(currentIndex - 1);
  }

  function handleNext() {
    if (hasNext) setCurrentIndex(currentIndex + 1);
  }

  function handleSelectItem(idx: number) {
    lastPlayedIndex.current = -1;
    setCurrentIndex(idx);
  }

  function handleRemove(postId: string) {
    const item = items.find((i) => i.postId === postId);
    if (item?.postId === currentItem?.postId) stop();
    remove(postId);
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    seek(Number(e.target.value));
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[49] flex flex-col pointer-events-none transition-[padding-right] duration-300"
      style={{ paddingRight: `${contentPanelOffset}px` }}
    >
      {/* 플레이리스트 드로어 */}
      {drawerOpen && (
        <div className="pointer-events-auto w-full max-w-3xl mx-auto px-4 sm:px-6 mb-1">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                🎵 재생 목록 ({items.length}개)
              </span>
              <button
                onClick={clear}
                className="text-[10px] text-slate-400 hover:text-red-500 transition px-2 py-0.5 rounded"
              >
                전체 삭제
              </button>
            </div>
            <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item, idx) => {
                const isActive = idx === currentIndex;
                return (
                  <li
                    key={item.postId}
                    className={`flex items-center gap-3 px-4 py-2.5 transition
                      ${isActive ? 'bg-teal-50 dark:bg-teal-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                  >
                    <span className="w-4 flex-shrink-0 text-center text-xs">
                      {isActive && isLoading ? (
                        <span className="inline-block w-2.5 h-2.5 border border-teal-400 border-t-transparent rounded-full animate-spin" />
                      ) : isActive && status === 'playing' ? (
                        <span className="text-teal-500 animate-pulse">▶</span>
                      ) : isActive && status === 'paused' ? (
                        <span className="text-amber-400">⏸</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">{idx + 1}</span>
                      )}
                    </span>
                    <button
                      className={`flex-1 text-sm text-left truncate transition
                        ${isActive ? 'text-teal-600 dark:text-teal-400 font-medium' : 'text-slate-700 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400'}`}
                      onClick={() => handleSelectItem(idx)}
                    >
                      {item.title}
                    </button>
                    <button
                      onClick={() => handleRemove(item.postId)}
                      className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-slate-300 hover:text-red-400 transition rounded-full hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* 플레이어 바 */}
      <div className="pointer-events-auto w-full max-w-3xl mx-auto px-4 sm:px-6 mb-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl px-4 pt-2.5 pb-2 flex flex-col gap-1.5">
          {/* 상단: 트랙 정보 + 컨트롤 + 속도 */}
          <div className="flex items-center gap-3">
            {/* 트랙 정보 */}
            <button onClick={toggleDrawer} className="flex-1 min-w-0 flex items-center gap-2 text-left">
              <span className={`flex-shrink-0 text-base ${status === 'playing' ? 'animate-pulse text-teal-500' : 'text-slate-400'}`}>
                🎵
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate leading-tight">
                  {isLoading ? '음성 준비 중...' : (currentItem?.title ?? '—')}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {currentIndex + 1} / {items.length}
                  {drawerOpen ? '  ▲' : '  ▼'}
                </p>
              </div>
            </button>

            {/* 컨트롤 */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={handlePrev} disabled={!hasPrev}
                className="w-7 h-7 flex items-center justify-center rounded-full text-slate-500 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-30">
                ⏮
              </button>
              <button onClick={handlePlayPause} disabled={isLoading}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-teal-500 text-white hover:bg-teal-600 transition disabled:opacity-50">
                {isLoading ? (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : status === 'playing' ? '⏸' : '▶'}
              </button>
              <button onClick={handleNext} disabled={!hasNext}
                className="w-7 h-7 flex items-center justify-center rounded-full text-slate-500 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-30">
                ⏭
              </button>
              <button onClick={handleStop}
                className="w-7 h-7 flex items-center justify-center rounded-full text-slate-500 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                ⏹
              </button>
            </div>

            {/* 속도 */}
            <select
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="text-[10px] px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer flex-shrink-0"
            >
              {RATES.map((r) => (
                <option key={r} value={r}>{r}x</option>
              ))}
            </select>
          </div>

          {/* 하단: 재생바 */}
          {(status === 'playing' || status === 'paused') && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 w-8 text-right flex-shrink-0">
                {formatTime(currentTime)}
              </span>
              {duration > 0 ? (
                <>
                  <input
                    type="range"
                    min={0}
                    max={duration}
                    step={0.5}
                    value={currentTime}
                    onChange={handleSeek}
                    className="flex-1 h-1.5 accent-teal-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 w-8 flex-shrink-0">
                    {formatTime(duration)}
                  </span>
                </>
              ) : (
                <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full w-full bg-teal-300 dark:bg-teal-700 rounded-full animate-pulse" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
