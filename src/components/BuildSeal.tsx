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
        className="font-mono text-center leading-tight px-3 py-1.5 rounded-md
                   border border-gray-300/70 dark:border-gray-700/70
                   bg-white/50 dark:bg-gray-900/40 backdrop-blur-sm
                   shadow-sm"
        title={`Build ${APP_VERSION} · ${APP_BUILD_DATE}`}
      >
        <div className="text-[11px] font-bold tracking-wide text-violet-600 dark:text-violet-400">
          {APP_AUTHOR}
        </div>
        <div className="text-[8px] tracking-[0.2em] text-gray-400 dark:text-gray-500 mt-0.5">
          BUILD SEAL
        </div>
        <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 font-semibold">
          #{APP_VERSION}
        </div>
      </div>
    </div>
  );
}
