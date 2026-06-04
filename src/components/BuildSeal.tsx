'use client';

import { useEffect, useState } from 'react';
import { APP_VERSION, APP_AUTHOR, APP_BUILD_DATE } from '@/lib/version';

/**
 * BuildSeal — 좌측 하단 고정 배지
 *
 * 기본: 작은 배지 (이니셜 아바타 + 버전)
 * hover: 전체 패널 (저자 / BUILD SEAL / 버전 / 빌드날짜 / 방문자)
 */

interface VisitCount {
  total: number;
  today: number;
}

export default function BuildSeal() {
  const [visits, setVisits] = useState<VisitCount | null>(null);
  const [hovered, setHovered] = useState(false);

  const initial = APP_AUTHOR.charAt(0).toUpperCase();

  useEffect(() => {
    const todayKey = `merbl_visited_${new Date().toISOString().slice(0, 10)}`;
    const cached = localStorage.getItem(todayKey);
    if (cached) {
      try { setVisits(JSON.parse(cached)); } catch { /* ignore */ }
      return;
    }
    fetch('/api/visit', { method: 'POST' })
      .then(r => r.json())
      .then((data: VisitCount) => {
        setVisits(data);
        localStorage.setItem(todayKey, JSON.stringify(data));
      })
      .catch(() => { /* 실패 시 미표시 */ });
  }, []);

  return (
    <div
      aria-hidden
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="hidden sm:block fixed bottom-3 left-3 z-50 select-none cursor-default"
      title={`Build ${APP_VERSION} · ${APP_BUILD_DATE}`}
    >
      {/* ── 확장 패널 (hover 시) ── */}
      {hovered && (
        <div className="absolute bottom-[calc(100%+6px)] left-0 font-mono text-center leading-snug
                        px-3 py-2 rounded-xl whitespace-nowrap pointer-events-none
                        border border-slate-300/40 dark:border-slate-600/40
                        bg-white/90 dark:bg-slate-900/90 backdrop-blur-md
                        shadow-lg
                        animate-[bs-fadeIn_0.15s_ease]">
          <style>{`
            @keyframes bs-fadeIn {
              from { opacity: 0; transform: translateY(4px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          <div className="text-[12px] font-bold tracking-wide text-teal-700 dark:text-teal-400">
            {APP_AUTHOR}
          </div>
          <div className="text-[8px] tracking-[0.25em] text-slate-400 dark:text-slate-500 mt-0.5">
            BUILD SEAL
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            #{APP_VERSION}
          </div>
          <div className="text-[9px] text-slate-300 dark:text-slate-600 mt-0.5">
            {APP_BUILD_DATE}
          </div>
          {visits && (
            <div className="mt-1.5 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/40 space-y-0.5">
              <div className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                👁 {visits.total.toLocaleString('ko-KR')}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                오늘 {visits.today.toLocaleString('ko-KR')}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 항상 보이는 컴팩트 배지 ── */}
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full
                       border transition-all duration-200
                       ${hovered
                         ? 'border-slate-300/60 dark:border-slate-600/60 bg-white/85 dark:bg-slate-900/85 shadow-md'
                         : 'border-slate-300/30 dark:border-slate-700/30 bg-white/55 dark:bg-slate-950/55'}
                       backdrop-blur-sm`}>
        {/* 이니셜 아바타 */}
        <div className="w-[18px] h-[18px] rounded-full bg-teal-700 dark:bg-teal-600
                        flex items-center justify-center flex-shrink-0
                        text-[10px] font-bold text-white font-mono">
          {initial}
        </div>
        {/* 버전 */}
        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
          {APP_VERSION}
        </span>
      </div>
    </div>
  );
}
