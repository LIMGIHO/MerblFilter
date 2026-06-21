'use client';

/**
 * 네이버 읽음처리 유저스크립트 설치/버전 감지 배너
 *
 * 감지 전략 (가계부앱과 동일):
 *  1차 — dataset 플래그: 유저스크립트가 로드되며 document.documentElement.dataset.naverRead
 *        에 자기 버전을 박아둔다. 이걸 동기적으로 읽으면 즉시 판정 가능 (가장 확실).
 *  2차 — postMessage 핸드셰이크: 혹시 dataset 주입 타이밍이 늦을 때를 대비해 PING→READY
 *        로 한 번 더 확인하고, 짧게 폴링한다.
 *
 * 상태(status)에 따라 문구가 달라진다:
 *  - 'checking'  : 감지 중 (아무것도 안 보여줌)
 *  - 'installed' : 최신 버전 설치됨 → 작은 "켜짐" 칩
 *  - 'outdated'  : 구버전 설치됨 → 업데이트 안내
 *  - 'missing'   : 미설치 → 설치 유도 배너
 */

import { useEffect, useState } from 'react';
import {
  getReaderId,
  setReaderId,
  getInstalledVersion,
  isOutdated,
  LATEST_VERSION,
  INSTALL_URL,
  TAMPERMONKEY_URL,
  TAMPERMONKEY_SETTINGS_URL,
} from '@/lib/naverReadBridge';

const DETECT_TIMEOUT = 2500;
const POLL_INTERVAL = 300;
const DISMISS_KEY = '@naver_read_banner_dismissed';

type Status = 'checking' | 'installed' | 'outdated' | 'missing';

export default function NaverReadBanner() {
  const [status, setStatus] = useState<Status>('checking');
  const [version, setVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [readerId, setReaderIdState] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setReaderIdState(getReaderId());
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      /* ignore */
    }

    let settled = false;

    // dataset 버전을 읽어 상태를 확정한다.
    const resolveFromVersion = (v: string | null): boolean => {
      if (!v) return false;
      settled = true;
      setVersion(v);
      setStatus(isOutdated(v) ? 'outdated' : 'installed');
      return true;
    };

    // 1차: 즉시 dataset 확인
    if (resolveFromVersion(getInstalledVersion())) return;

    // 2차: postMessage 핸드셰이크
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (d && d.source === 'naver-read-userscript' && d.type === 'READY') {
        resolveFromVersion(d.version ?? getInstalledVersion() ?? LATEST_VERSION);
      }
    };
    window.addEventListener('message', onMessage);
    window.postMessage(
      { source: 'merblfilter', type: 'PING' },
      window.location.origin,
    );

    // 폴링 (dataset 주입이 늦는 경우)
    const poll = setInterval(() => {
      if (settled) return;
      if (resolveFromVersion(getInstalledVersion())) clearInterval(poll);
    }, POLL_INTERVAL);

    const t = setTimeout(() => {
      if (!settled) setStatus('missing');
    }, DETECT_TIMEOUT);

    return () => {
      window.removeEventListener('message', onMessage);
      clearInterval(poll);
      clearTimeout(t);
    };
  }, []);

  function startEdit() {
    setDraft(readerId);
    setEditing(true);
  }
  function saveEdit() {
    const next = draft.trim();
    if (next) {
      setReaderId(next);
      setReaderIdState(next);
    }
    setEditing(false);
  }
  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  if (status === 'checking') return null;

  // 독자 ID 편집 UI (모든 상태 공용)
  const idEditor = editing ? (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') saveEdit();
          if (e.key === 'Escape') setEditing(false);
        }}
        placeholder="내 네이버 ID"
        className="w-28 text-xs px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:border-teal-400"
      />
      <button
        onClick={saveEdit}
        className="text-xs px-2 py-0.5 rounded bg-teal-500 text-white hover:bg-teal-600"
      >
        저장
      </button>
    </span>
  ) : (
    <button
      onClick={startEdit}
      className="underline decoration-dotted underline-offset-2 hover:text-teal-600 dark:hover:text-teal-400"
      title="내 네이버 ID 변경"
    >
      내 ID: {readerId}
    </button>
  );

  // ── 설치됨 (최신): 작은 인디케이터만 ──────────────────────────
  if (status === 'installed') {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 mt-3">
        <div className="flex items-center gap-2 text-[11px] text-teal-700 dark:text-teal-400">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500" />
          <span>네이버 읽음처리 켜짐 (v{version})</span>
          <span className="text-slate-400 dark:text-slate-600">·</span>
          {idEditor}
        </div>
      </div>
    );
  }

  // ── 구버전 설치됨: 업데이트 안내 ──────────────────────────────
  if (status === 'outdated') {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 mt-3">
        <div className="rounded-xl border border-sky-300 dark:border-sky-700/60 bg-sky-50 dark:bg-sky-900/20 p-3.5">
          <div className="flex items-start gap-3">
            <span className="text-lg leading-none mt-0.5">🔄</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-sky-900 dark:text-sky-200">
                네이버 읽음처리 스크립트 업데이트가 있습니다. (설치됨 v{version} → 최신 v{LATEST_VERSION})
              </p>
              <p className="text-xs text-sky-800/80 dark:text-sky-300/70 mt-1 leading-relaxed">
                아래 버튼을 누르면 Tampermonkey 설치 화면이 뜹니다. [재설치]로 최신 버전을 적용하세요.
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-2.5 text-xs">
                <a
                  href={INSTALL_URL}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-medium transition"
                >
                  업데이트
                </a>
                <span className="text-sky-800/70 dark:text-sky-300/60">{idEditor}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 미설치: 설치 유도 배너 ────────────────────────────────────
  if (dismissed) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 mt-3">
      <div className="rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 p-3.5">
        <div className="flex items-start gap-3">
          <span className="text-lg leading-none mt-0.5">📖</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              네이버 읽음처리 스크립트를 설치하면, 여기서 클릭한 글이 네이버에서도 읽음으로 표시됩니다.
            </p>
            <div className="text-xs text-amber-800/80 dark:text-amber-300/70 mt-1.5 leading-relaxed space-y-1">
              <p>
                ① <a href={TAMPERMONKEY_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-900 dark:hover:text-amber-100">Tampermonkey</a> 확장 설치
              </p>
              <p>
                ② 확장 세부정보 → &quot;사용자 스크립트 허용&quot; 토글 ON
                <code className="ml-1 px-1 rounded bg-amber-100 dark:bg-amber-800/40">{TAMPERMONKEY_SETTINGS_URL}</code>
              </p>
              <p>③ 아래 [설치하기] 클릭</p>
              <p className="text-amber-700/70 dark:text-amber-400/60 pt-1">
                설치 후 1~2분 지나면 자동으로 인식됩니다.
                <br />
                같은 브라우저에서 네이버에 로그인되어 있어야 동작합니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-2.5 text-xs">
              <a
                href={INSTALL_URL}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium transition"
              >
                설치하기
              </a>
              <span className="text-amber-800/70 dark:text-amber-300/60">{idEditor}</span>
              <button
                onClick={dismiss}
                className="text-amber-700/60 dark:text-amber-400/50 hover:text-amber-900 dark:hover:text-amber-200"
              >
                나중에
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
