/**
 * merblFilter ↔ 네이버 읽음처리 유저스크립트 브리지
 *
 * 페이지(merblFilter)와 유저스크립트(naver-read.user.js)는 window.postMessage 로
 * 통신한다. 이 파일은 페이지 쪽 송신 헬퍼와 "독자 네이버 ID" 설정값을 담당.
 *
 * - 독자 ID(blogId): 로그인한 본인의 네이버 ID. 네이버가 "누가 읽었는지" 판단하는 값.
 *   비밀번호가 아니라 공개 ID이며, localStorage 에만 저장한다.
 * - publisherId: 글쓴이 블로그 ID (현재 보고 있는 블로그)
 * - logNo: 게시글 번호
 */

const APP = 'merblfilter';
const READER_ID_KEY = '@naver_reader_id';
const DEFAULT_READER_ID = 'lasid84';

/** 현재 배포된 유저스크립트 버전. naver-read.user.js 의 @version 과 일치해야 함. */
export const LATEST_VERSION = '1.0.0';

/** 유저스크립트 설치 안내용 상수 */
export const INSTALL_URL = '/naver-read.user.js';
export const TAMPERMONKEY_URL =
  'https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo';
export const TAMPERMONKEY_SETTINGS_URL =
  'chrome://extensions/?id=dhdgffkkebhmkfjojejmpbldmpobfkfo';

/**
 * 유저스크립트가 설치돼 있으면, 로드 시 document.documentElement.dataset.naverRead 에
 * 자신의 버전을 박아둔다. 페이지는 이 값을 동기적으로 읽어 설치 여부/버전을 즉시 판정한다.
 * (postMessage 핸드셰이크보다 빠르고 확실한 1차 감지 수단)
 */
export function getInstalledVersion(): string | null {
  if (typeof document === 'undefined') return null;
  return document.documentElement.dataset.naverRead ?? null;
}

export function detectInstalled(): boolean {
  return !!getInstalledVersion();
}

/** 설치된 버전이 LATEST_VERSION 보다 낮으면 true (업데이트 필요) */
export function isOutdated(installed: string | null): boolean {
  if (!installed) return false;
  const a = installed.split('.').map((n) => parseInt(n, 10) || 0);
  const b = LATEST_VERSION.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x < y) return true;
    if (x > y) return false;
  }
  return false;
}

export function getReaderId(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_READER_ID;
  try {
    return localStorage.getItem(READER_ID_KEY)?.trim() || DEFAULT_READER_ID;
  } catch {
    return DEFAULT_READER_ID;
  }
}

export function setReaderId(id: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(READER_ID_KEY, id.trim());
  } catch {
    /* ignore */
  }
}

/**
 * 글 클릭 시 호출 — 유저스크립트에 읽음처리를 요청한다.
 * 유저스크립트가 설치돼 있지 않으면 아무 일도 일어나지 않는다 (부작용 없음).
 */
export function sendMarkRead(publisherId: string, logNo: string): void {
  if (typeof window === 'undefined') return;
  const blogId = getReaderId();
  if (!blogId || !publisherId || !logNo) return;

  window.postMessage(
    { source: APP, type: 'NAVER_MARK_READ', blogId, publisherId, logNo },
    window.location.origin,
  );
}
