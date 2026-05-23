'use client';

import { useEffect, useState } from 'react';
import { APP_VERSION, APP_AUTHOR, APP_BUILD_DATE } from '@/lib/version';

/**
 * 빌드 시그니처 — 화면 좌측 하단 고정
 * ┌──────────────┐
 * │  Giho        │
 * │  BUILD SEAL  │
 * │   #1.2.0     │
 * │  👁 1,234    │
 * │  오늘 23     │
 * └──────────────┘
 */

interface VisitCount {
  total: number;
  today: number;
}

export default function BuildSeal() {
  const [visits, setVisits] = useState<VisitCount | null>(null);

  useEffect(() => {
    const todayKey = `merbl_visited_${new Date().toISOString().slice(0, 10)}`;
    const cached = localStorage.getItem(todayKey);

    if (cached) {
      // 오늘 이미 방문 — 캐시된 값 표시, 카운트 증가 안 함
      try {
        setVisits(JSON.parse(cached));
      } catch {
        // 파싱 실패 시 무시
      }
      return;
    }

    fetch('/api/visit', { method: 'POST' })
      .then(r => r.json())
      .then((data: VisitCount) => {
        setVisits(data);
        localStorage.setItem(todayKey, JSON.stringify(data));
      })
      .catch(() => {
        // 실패 시 카운터 미표시
      });
  }, []);

  return (
    <div
      className="fixed bottom-3 left-3 z-50 pointer-events-none select-none"
      aria-hidden
    >
      <div
        className="font-mono text-center leading-tight px-2.5 py-1.5 rounded
                   border border-slate-300/60 dark:border-slate-700/60
                   bg-white/40 dark:bg-slate-950/40 backdrop-blur-sm"
        title={`Build ${APP_VERSION} · ${APP_BUILD_DATE}`}
      >
        <div className="text-[11px] font-semibold tracking-wide text-teal-700 dark:text-teal-400">
          {APP_AUTHOR}
        </div>
        <div className="text-[8px] tracking-[0.25em] text-slate-400 dark:text-slate-600 mt-0.5">
          BUILD SEAL
        </div>
        <div className="text-[10px] text-slate-500 dark:text-slate-500 mt-0.5 tabular-nums">
          #{APP_VERSION}
        </div>
        {visits && (
          <>
            <div className="text-[9px] text-slate-400 dark:text-slate-600 mt-1 border-t border-slate-200/60 dark:border-slate-700/40 pt-1 tabular-nums">
              👁 {visits.total.toLocaleString('ko-KR')}
            </div>
            <div className="text-[9px] text-slate-400 dark:text-slate-600 tabular-nums">
              오늘 {visits.today.toLocaleString('ko-KR')}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
