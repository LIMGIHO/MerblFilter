/**
 * 네이버 블로그 "읽음" 처리
 *
 * 동일 브라우저에서 네이버 로그인되어 있을 때, 클릭한 게시글을
 * 네이버 메인/이웃새글 위젯에서 읽음 처리되도록 시도.
 *
 * 두 가지 방식 제공:
 *   1) fetch() with no-cors  — 가장 깔끔하지만 SameSite=Lax 차단 거의 확실
 *   2) hidden <form> POST    — 일부 케이스에서 쿠키 정책이 다르게 동작 가능
 *
 * 한계:
 *   - 네이버 세션 쿠키가 SameSite=Lax/Strict 라면 어떤 방식도 못 함
 *   - 성공 여부는 코드로 확인 불가 → 네이버 메인에서 육안 확인
 *   - 부작용 없음: 실패해도 우리 앱 UX에 영향 안 줌
 */

const NAVER_BUDDY_READ_URL = 'https://section.blog.naver.com/ajax/BuddyPostRead.naver';

/* ─────────────────────────────────────────────────────────
 * 방식 1: fetch with no-cors + credentials: include
 * ────────────────────────────────────────────────────── */
export async function markNaverPostAsReadFetch(
  publisherId: string,
  postId: string,
): Promise<void> {
  if (!publisherId || !postId) return;

  try {
    await fetch(NAVER_BUDDY_READ_URL, {
      method: 'POST',
      credentials: 'include',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        logCode: '0',
        logNo: postId,
        publisherId,
      }).toString(),
    });
  } catch (e) {
    console.debug('[markNaverPostAsRead/fetch]', e);
  }
}

/* ─────────────────────────────────────────────────────────
 * 방식 2: hidden iframe + form POST
 * ────────────────────────────────────────────────────── */
const IFRAME_ID = 'naver-read-hidden-iframe';

function ensureHiddenIframe(): HTMLIFrameElement {
  let iframe = document.getElementById(IFRAME_ID) as HTMLIFrameElement | null;
  if (iframe) return iframe;
  iframe = document.createElement('iframe');
  iframe.id = IFRAME_ID;
  iframe.name = IFRAME_ID;
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  iframe.style.position = 'fixed';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);
  return iframe;
}

export function markNaverPostAsReadForm(
  publisherId: string,
  postId: string,
): void {
  if (!publisherId || !postId) return;
  if (typeof document === 'undefined') return;

  try {
    ensureHiddenIframe();

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = NAVER_BUDDY_READ_URL;
    form.target = IFRAME_ID;
    form.enctype = 'application/x-www-form-urlencoded';
    form.style.display = 'none';

    const fields: Record<string, string> = {
      logCode: '0',
      logNo: postId,
      publisherId,
    };
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  } catch (e) {
    console.debug('[markNaverPostAsRead/form]', e);
  }
}

/* ─────────────────────────────────────────────────────────
 * 기본 export — 두 방식 모두 시도
 * ────────────────────────────────────────────────────── */
export function markNaverPostAsRead(
  publisherId: string,
  postId: string,
): void {
  // 두 가지 모두 시도 — 어느 한쪽이라도 통과하면 됨
  void markNaverPostAsReadFetch(publisherId, postId);
  markNaverPostAsReadForm(publisherId, postId);
}
