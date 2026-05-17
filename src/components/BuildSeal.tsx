import { APP_VERSION, APP_AUTHOR, APP_BUILD_DATE } from '@/lib/version';

/**
 * 빌드 시그니처 — 화면 좌측 하단 고정
 * ┌──────────────┐
 * │  Giho        │
 * │  BUILD SEAL  │
 * │   #1.0.0     │
 * └──────────────┘
 */
export default function BuildSeal() {
  return (
    <div
      className="fixed bottom-3 left-3 z-30 pointer-events-none select-none"
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
      </div>
    </div>
  );
}
