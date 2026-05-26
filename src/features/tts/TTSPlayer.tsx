'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTtsPlaylistStore } from '@/store/ttsPlaylistStore';
import { useTTS, TTS_VOICES } from '@/features/llm/useTTS';
import { ttsAudioManager } from './ttsAudioManager';
import { useUiStore } from '@/store/uiStore';

// ── HTML → 텍스트 ─────────────────────────────────────────────────────────────
function stripHtml(html: string): string {
  return html
    .replace(/<figcaption[^>]*>[\s\S]*?<\/figcaption>/gi, '')
    .replace(/(<img[^>]*>)\s*(<[a-z][^>]*>[^<]{0,150}<\/[a-z]+>)/gi, (_, img, next) => {
      if (/©|출처|ⓒ|source/i.test(next)) return img;
      return img + next;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// ── TTS 품질 향상 후처리 ──────────────────────────────────────────────────────
function cleanTextForTTS(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/www\.\S+/g, '')
    // © / ⓒ 로 시작하는 줄 제거 (이미지 캡션)
    .replace(/^[ \t]*[©ⓒ]\s*.*/gmi, '')
    .replace(/^[ \t]*(사진\s*)?출처\s*[:：]?.*/gmi, '')
    .replace(/^[ \t]*(이미지|그림|자료|사진|참고|참조)\s*[:：].*/gmi, '')
    .replace(/^[ \t]*[※◎☞▶▷►→•·]\s*.*(출처|링크|참고|원문|클릭).*/gmi, '')
    .replace(/([^\n\s\d])(\s*)(\d{1,2}[.)]) /g, '$1. $3 ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * 텍스트를 문장 단위로 ~300자 청크로 분리.
 */
function splitIntoChunks(text: string, maxChars = 150): string[] {
  if (!text) return [];
  const re = /[.!?…。？！]\s+/g;
  const parts: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    parts.push(text.slice(last, m.index + 1));
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));

  const chunks: string[] = [];
  let cur = '';
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    if (cur && cur.length + t.length + 1 > maxChars) { chunks.push(cur); cur = t; }
    else { cur = cur ? `${cur} ${t}` : t; }
  }
  if (cur) chunks.push(cur);

  const result: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxChars * 2) { result.push(chunk); continue; }
    let rem = chunk;
    while (rem.length > maxChars) {
      const cut = rem.slice(0, maxChars);
      const sp = cut.lastIndexOf(' ');
      const at = sp > maxChars * 0.5 ? sp : maxChars;
      result.push(rem.slice(0, at));
      rem = rem.slice(at).trim();
    }
    if (rem) result.push(rem);
  }
  return result.filter((c) => c.length > 0);
}

/** Blob에서 오디오 duration을 측정 (임시 Audio 엘리먼트 사용) */
function probeDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    const cleanup = () => { try { URL.revokeObjectURL(url); } catch {} };
    const done = (dur: number) => { cleanup(); resolve(dur); };
    audio.addEventListener('loadedmetadata', () => {
      done(isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0);
    }, { once: true });
    audio.addEventListener('error', () => done(0), { once: true });
    setTimeout(() => done(0), 6000); // 타임아웃 fallback
  });
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
  const {
    isSupported, status, rate, volume, voice,
    setRate, setVolume, setVoice,
    pause, resume, stop,
    currentTime, duration, seek,
  } = useTTS();
  const contentPanelOffset = useUiStore((s) => s.contentPanelOffset);

  // ── 캐시 ────────────────────────────────────────────────────────────────────
  const bodyCache   = useRef<Map<string, string>>(new Map());
  const chunksCache = useRef<Map<string, string[]>>(new Map());
  // 키: `${postId}::${voiceId}::${chunkIdx}`
  const blobCache   = useRef<Map<string, Blob>>(new Map());
  // 중복 요청 방지
  const pendingMap  = useRef<Map<string, Promise<Blob | null>>>(new Map());

  const [loadingBody, setLoadingBody] = useState(false);

  // ── 청크 재생 상태 ────────────────────────────────────────────────────────────
  const chunkSessionRef     = useRef(0);
  const chunkStateRef       = useRef<{ sessionId: number; postId: string; voiceId: string } | null>(null);
  const chunkAccumRef       = useRef(0);         // 완료된 청크 누적 재생시간
  const chunkDurationsRef   = useRef<number[]>([]); // 청크별 알려진 duration
  const currentChunkIdxRef  = useRef(0);         // 현재 재생 중인 청크 인덱스
  // handleSeek 에서 호출할 수 있도록 playChunk를 ref로 노출
  const playChunkRef        = useRef<((idx: number, seekOffset?: number) => void) | null>(null);

  // duration이 알려진 청크들의 합 → seek bar max
  const [totalDuration, setTotalDuration] = useState(0);
  // 전체 청크 수 vs 알려진 수 → 백그라운드 처리 중 여부 표시
  const [totalChunks,   setTotalChunks]   = useState(0);
  const [knownChunks,   setKnownChunks]   = useState(0);

  const currentItem = items[currentIndex] ?? null;

  // ── body 텍스트 가져오기 ─────────────────────────────────────────────────────
  const fetchBody = useCallback(async (postId: string, blogId: string): Promise<string> => {
    const hit = bodyCache.current.get(postId);
    if (hit !== undefined) return hit;
    try {
      const res  = await fetch(`/api/post-content?postId=${postId}&blogId=${blogId}`);
      const json = await res.json();
      const text = cleanTextForTTS(stripHtml(String(json.content ?? '')));
      bodyCache.current.set(postId, text);
      return text;
    } catch { return ''; }
  }, []);

  // ── 청크 배열 가져오기 ──────────────────────────────────────────────────────
  const getChunks = useCallback(async (postId: string, blogId: string): Promise<string[]> => {
    const hit = chunksCache.current.get(postId);
    if (hit) return hit;
    const body   = await fetchBody(postId, blogId);
    const chunks = splitIntoChunks(body);
    chunksCache.current.set(postId, chunks);
    return chunks;
  }, [fetchBody]);

  // ── 단일 청크 Blob 가져오기 (캐시 + 중복 방지) ──────────────────────────────
  const getChunkBlob = useCallback(async (
    postId: string, voiceId: string, chunkIdx: number, chunkText: string,
  ): Promise<Blob | null> => {
    const key    = `${postId}::${voiceId}::${chunkIdx}`;
    const cached = blobCache.current.get(key);
    if (cached) return cached;
    const pending = pendingMap.current.get(key);
    if (pending) return pending;

    const promise = (async (): Promise<Blob | null> => {
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: chunkText, voice: voiceId }),
        });
        if (!res.ok) return null;
        const blob = await res.blob();
        blobCache.current.set(key, blob);
        // blobCache 크기 제한 — FIFO 60개 초과 시 가장 오래된 항목 제거
        if (blobCache.current.size > 60) {
          const firstKey = blobCache.current.keys().next().value!;
          blobCache.current.delete(firstKey);
        }
        return blob;
      } catch { return null; }
      finally   { pendingMap.current.delete(key); }
    })();

    pendingMap.current.set(key, promise);
    return promise;
  }, []);

  // ── totalDuration + 알려진 청크 수 갱신 헬퍼 ────────────────────────────────
  const updateTotalDuration = useCallback(() => {
    const known = chunkDurationsRef.current.filter((d) => d > 0).length;
    const total = chunkDurationsRef.current.reduce((s, d) => s + (d || 0), 0);
    setKnownChunks(known);
    setTotalDuration(total);
  }, []);

  // ── refs ─────────────────────────────────────────────────────────────────────
  const itemsRef        = useRef(items);
  const currentIndexRef = useRef(currentIndex);
  const voiceRef        = useRef(voice);
  useEffect(() => { itemsRef.current = items; },               [items]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { voiceRef.current = voice; },               [voice]);

  const advanceToNext = useCallback(() => {
    const next = currentIndexRef.current + 1;
    if (next < itemsRef.current.length) setCurrentIndex(next);
  }, [setCurrentIndex]);

  // ── 청크 단위 스트리밍 재생 ──────────────────────────────────────────────────
  const playChunkedPost = useCallback(async (item: NonNullable<typeof currentItem>) => {
    ttsAudioManager.stop();
    setLoadingBody(true);

    const { postId, blogId } = item;
    const chunks = await getChunks(postId, blogId);
    if (!chunks.length) { setLoadingBody(false); return; }

    // 새 트랙 시작 — 상태 초기화
    chunkAccumRef.current      = 0;
    currentChunkIdxRef.current = 0;
    chunkDurationsRef.current  = new Array(chunks.length).fill(0);
    setTotalDuration(0);
    setTotalChunks(chunks.length);
    setKnownChunks(0);

    // 새 세션 발급
    chunkSessionRef.current++;
    const sessionId = chunkSessionRef.current;
    chunkStateRef.current = { sessionId, postId, voiceId: voiceRef.current };

    // 청크 0 준비 (빠른 시작)
    const blob0 = await getChunkBlob(postId, voiceRef.current, 0, chunks[0]);
    setLoadingBody(false);
    if (!blob0 || chunkStateRef.current?.sessionId !== sessionId) return;

    // blob0 duration 측정
    probeDuration(blob0).then((dur) => {
      if (dur > 0 && chunkStateRef.current?.sessionId === sessionId) {
        chunkDurationsRef.current[0] = dur;
        updateTotalDuration();
      }
    });

    // ── 연쇄 재생 (seekOffset: 이 청크에서 시작할 시간(초)) ──
    function playChunk(idx: number, seekOffset = 0) {
      if (chunkStateRef.current?.sessionId !== sessionId) return;
      currentChunkIdxRef.current = idx;

      const key  = `${postId}::${voiceRef.current}::${idx}`;
      const blob = blobCache.current.get(key);

      if (!blob) {
        // 아직 준비 안 됨 — fetch 완료 후 재시도
        getChunkBlob(postId, voiceRef.current, idx, chunks[idx]).then((b) => {
          if (chunkStateRef.current?.sessionId !== sessionId) return;
          if (b) {
            playChunk(idx, seekOffset);
          } else {
            // fetch 실패 — 다음 청크로 건너뛰거나 재생 종료
            if (idx < chunks.length - 1) {
              playChunk(idx + 1, 0);
            } else {
              chunkStateRef.current = null;
              setTotalChunks(0);
              setKnownChunks(0);
              advanceToNext();
            }
          }
        });
        return;
      }

      const isLast = idx === chunks.length - 1;

      ttsAudioManager.playFromBlob(blob, () => {
        if (chunkStateRef.current?.sessionId !== sessionId) return;
        // 정확한 duration 기록
        const finishedDur = ttsAudioManager.getState().duration;
        if (finishedDur > 0) {
          chunkAccumRef.current += finishedDur;
          chunkDurationsRef.current[idx] = finishedDur;
          updateTotalDuration();
        }
        if (isLast) {
          chunkStateRef.current    = null;
          chunkAccumRef.current    = 0;
          setTotalDuration(0);
          setTotalChunks(0);
          setKnownChunks(0);
          advanceToNext();
        } else {
          playChunk(idx + 1);
        }
      }, seekOffset);

      // 다음 5청크 백그라운드 프리패치 + duration 측정
      for (let i = idx + 1; i <= Math.min(idx + 5, chunks.length - 1); i++) {
        const ki = `${postId}::${voiceRef.current}::${i}`;
        if (!blobCache.current.has(ki) && !pendingMap.current.has(ki)) {
          const capturedI = i;
          getChunkBlob(postId, voiceRef.current, capturedI, chunks[capturedI]).then((b) => {
            if (!b || chunkStateRef.current?.sessionId !== sessionId) return;
            if (!chunkDurationsRef.current[capturedI]) {
              probeDuration(b).then((dur) => {
                if (dur > 0 && chunkStateRef.current?.sessionId === sessionId) {
                  chunkDurationsRef.current[capturedI] = dur;
                  updateTotalDuration();
                }
              });
            }
          });
        }
      }
    }

    // playChunk를 ref에 노출 (handleSeek에서 호출)
    playChunkRef.current = playChunk;
    playChunk(0);
  }, [getChunks, getChunkBlob, advanceToNext, updateTotalDuration]);

  // ── 재생목록 항목별 청크 0 프리패치 ─────────────────────────────────────────
  const prefetchRemaining = useCallback((fromIndex: number, currentVoice: string) => {
    const allItems = itemsRef.current;
    for (let i = fromIndex; i < allItems.length; i++) {
      const itm = allItems[i];
      getChunks(itm.postId, itm.blogId).then((chunks) => {
        if (!chunks.length) return;
        const k0 = `${itm.postId}::${currentVoice}::0`;
        if (!blobCache.current.has(k0) && !pendingMap.current.has(k0)) {
          getChunkBlob(itm.postId, currentVoice, 0, chunks[0]);
        }
      });
    }
  }, [getChunks, getChunkBlob]);

  // ── currentIndex 변경 → 재생 ─────────────────────────────────────────────────
  const lastPlayedIndex = useRef<number>(-1);
  useEffect(() => {
    if (currentIndex !== -1 && currentIndex !== lastPlayedIndex.current && status !== 'paused') {
      const item = items[currentIndex];
      if (item) {
        lastPlayedIndex.current = currentIndex;
        playChunkedPost(item);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // ── 재생목록 변경 → 청크 0 프리패치 ─────────────────────────────────────────
  useEffect(() => {
    if (items.length === 0) return;
    prefetchRemaining(0, voiceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // ── 목소리 변경 → 재시작 ────────────────────────────────────────────────────
  const prevVoiceRef = useRef(voice);
  useEffect(() => {
    if (prevVoiceRef.current === voice) return;
    const oldVoice = prevVoiceRef.current;
    prevVoiceRef.current = voice;
    // 이전 목소리 Blob 캐시 정리 (메모리 확보)
    for (const key of Array.from(blobCache.current.keys())) {
      if (key.includes(`::${oldVoice}::`)) blobCache.current.delete(key);
    }
    prefetchRemaining(0, voice);
    if ((status === 'playing' || status === 'paused') && currentItem) {
      lastPlayedIndex.current = -1;
      playChunkedPost(currentItem);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice]);

  if (!isSupported || items.length === 0) return null;

  const hasPrev   = currentIndex > 0;
  const hasNext   = currentIndex < items.length - 1;
  const isLoading = loadingBody || status === 'loading';

  // 현재 전체 위치 (누적 + 현재 청크 경과)
  const totalCurrentTime = chunkAccumRef.current + currentTime;
  // seek bar max: 측정된 전체 duration, 없으면 현재 청크 duration
  const seekMax = totalDuration > 0 ? totalDuration : duration;

  function handlePlayPause() {
    if (status === 'playing') pause();
    else if (status === 'paused') resume();
    else if (currentItem) playChunkedPost(currentItem);
  }

  function handleStop() {
    stop();
    chunkStateRef.current   = null;
    chunkAccumRef.current   = 0;
    playChunkRef.current    = null;
    setTotalDuration(0);
    setTotalChunks(0);
    setKnownChunks(0);
    lastPlayedIndex.current = -1;
  }

  function handlePrev() { if (hasPrev) setCurrentIndex(currentIndex - 1); }
  function handleNext() { if (hasNext) setCurrentIndex(currentIndex + 1); }

  function handleSelectItem(idx: number) {
    lastPlayedIndex.current = -1;
    setCurrentIndex(idx);
  }

  function handleRemove(postId: string) {
    const item = items.find((i) => i.postId === postId);
    if (item?.postId === currentItem?.postId) handleStop();
    remove(postId);
  }

  // ── 크로스 청크 seek ─────────────────────────────────────────────────────────
  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const targetTime = Number(e.target.value);
    const durations  = chunkDurationsRef.current;
    const curChunk   = currentChunkIdxRef.current;

    // targetTime이 속하는 청크와 오프셋 계산
    let accum = 0;
    for (let i = 0; i < durations.length; i++) {
      const dur = durations[i] || 0;
      if (!dur) break; // duration 미측정 → 여기까지만
      if (accum + dur >= targetTime) {
        const offset = Math.max(0, targetTime - accum);
        if (i === curChunk) {
          // 같은 청크 내 seek
          seek(offset);
        } else {
          // 다른 청크로 점프
          let newAccum = 0;
          for (let j = 0; j < i; j++) newAccum += durations[j] || 0;
          chunkAccumRef.current = newAccum;
          playChunkRef.current?.(i, offset);
        }
        return;
      }
      accum += dur;
    }
    // 마지막 알려진 청크 끝으로 이동
    seek(Math.max(0, duration - 0.1));
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[49] flex flex-col pointer-events-none transition-[padding-right] duration-300"
      style={{ paddingRight: `${contentPanelOffset}px` }}
    >
      {/* ── 플레이리스트 드로어 ── */}
      {drawerOpen && (
        <div className="pointer-events-auto w-full max-w-3xl mx-auto px-4 sm:px-6 mb-1">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                🎵 재생 목록 ({items.length}개)
              </span>
              <button onClick={clear} className="text-[10px] text-slate-400 hover:text-red-500 transition px-2 py-0.5 rounded">
                전체 삭제
              </button>
            </div>
            <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item, idx) => {
                const isActive = idx === currentIndex;
                return (
                  <li key={item.postId}
                    className={`flex items-center gap-3 px-4 py-2.5 transition
                      ${isActive ? 'bg-teal-50 dark:bg-teal-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
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
                      onClick={() => handleSelectItem(idx)}>
                      {item.title}
                    </button>
                    <button onClick={() => handleRemove(item.postId)}
                      className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-slate-300 hover:text-red-400 transition rounded-full hover:bg-red-50 dark:hover:bg-red-900/20">
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* ── 플레이어 바 ── */}
      <div className="pointer-events-auto w-full max-w-3xl mx-auto px-3 sm:px-6 mb-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl px-3 sm:px-4 pt-2.5 pb-2 flex flex-col gap-1.5">

          {/* ── 1행: 트랙 정보 + 재생 컨트롤 + (데스크톱) 볼륨·목소리·속도 ── */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* 트랙 정보 */}
            <button onClick={toggleDrawer} className="flex-1 min-w-0 flex items-center gap-2 text-left">
              <span className={`flex-shrink-0 text-base ${status === 'playing' ? 'animate-pulse text-teal-500' : 'text-slate-400'}`}>
                🎵
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate leading-tight">
                  {isLoading ? '음성 준비 중…' : (currentItem?.title ?? '—')}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {currentIndex + 1} / {items.length}
                  {drawerOpen ? '  ▲' : '  ▼'}
                </p>
              </div>
            </button>

            {/* 재생 컨트롤 */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={handlePrev} disabled={!hasPrev}
                className="w-7 h-7 flex items-center justify-center rounded-full text-slate-500 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-30">
                ⏮
              </button>
              <button onClick={handlePlayPause} disabled={isLoading}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-teal-500 text-white hover:bg-teal-600 transition disabled:opacity-50">
                {isLoading
                  ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : status === 'playing' ? '⏸' : '▶'}
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

            {/* 볼륨 — 데스크톱만 */}
            <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
              <span className="text-slate-400 text-xs select-none">
                {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
              </span>
              <input type="range" min={0} max={1} step={0.05} value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-16 h-1 accent-teal-500 cursor-pointer" />
            </div>

            {/* 목소리 — 데스크톱만 */}
            <select value={voice} onChange={(e) => setVoice(e.target.value as typeof voice)}
              className="hidden sm:block text-[10px] px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer flex-shrink-0">
              {TTS_VOICES.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>

            {/* 속도 — 데스크톱만 */}
            <select value={rate} onChange={(e) => setRate(Number(e.target.value))}
              className="hidden sm:block text-[10px] px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer flex-shrink-0">
              {RATES.map((r) => (
                <option key={r} value={r}>{r}x</option>
              ))}
            </select>
          </div>

          {/* ── 모바일 전용 2행: 볼륨 + 목소리 + 속도 ── */}
          <div className="flex sm:hidden items-center gap-2">
            <span className="text-slate-400 text-xs select-none flex-shrink-0">
              {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
            </span>
            <input type="range" min={0} max={1} step={0.05} value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 h-1 accent-teal-500 cursor-pointer" />
            <select value={voice} onChange={(e) => setVoice(e.target.value as typeof voice)}
              className="text-[10px] px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer flex-shrink-0">
              {TTS_VOICES.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
            <select value={rate} onChange={(e) => setRate(Number(e.target.value))}
              className="text-[10px] px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer flex-shrink-0">
              {RATES.map((r) => (
                <option key={r} value={r}>{r}x</option>
              ))}
            </select>
          </div>

          {/* ── seek bar ── */}
          {(status === 'playing' || status === 'paused') && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 w-8 text-right flex-shrink-0">
                {formatTime(totalCurrentTime)}
              </span>
              {seekMax > 0 ? (
                <>
                  <input
                    type="range"
                    min={0}
                    max={seekMax}
                    step={0.5}
                    value={totalCurrentTime}
                    onChange={handleSeek}
                    className="flex-1 h-1.5 accent-teal-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0 flex items-center gap-1">
                    {knownChunks < totalChunks && totalChunks > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" title="음성 처리 중" />
                    )}
                    <span className="w-8">{formatTime(seekMax)}</span>
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
