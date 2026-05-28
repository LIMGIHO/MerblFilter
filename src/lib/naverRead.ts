/**
 * 네이버 블로그 "읽음" 처리
 *
 * 동일 브라우저에서 네이버 로그인되어 있을 때, 클릭한 게시글을
 * 네이버 메인/이웃새글 위젯에서 읽음 처리되도록 트리거.
 *
 * 작동 원리:
 *   - section.blog.naver.com 의 BuddyPostRead API를 호출
 *   - 인증은 .naver.com 도메인의 세션 쿠키(NID_AUT 등)로 처리됨
 *   - credentials: 'include' + Content-Type: form-urlencoded
 *     → CORS preflight 없는 "simple request" → 크로스 오리진 POST 가능
 *   - mode: 'no-cors' → 응답은 못 읽지만 서버는 요청 처리함
 *
 * 한계:
 *   - 사용자가 네이버 미로그인 상태면 서버가 그냥 무시 (부작용 없음)
 *   - 쿠키 SameSite 정책에 따라 차단될 수 있음 (테스트 필요)
 *   - 성공 여부는 코드로 확인 불가 → 네이버 메인에서 육안 확인 필요
 */

const NAVER_BUDDY_READ_URL = 'https://section.blog.naver.com/ajax/BuddyPostRead.naver';

export async function markNaverPostAsRead(
  publisherId: string,  // 글쓴이 blogId (예: 'ranto28')
  postId: string,       // 게시글 logNo
): Promise<void> {
  // 입력 검증 — 빈 값이면 호출 자체 안 함
  if (!publisherId || !postId) return;

  try {
    await fetch(NAVER_BUDDY_READ_URL, {
      method: 'POST',
      credentials: 'include',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        logCode: '0',
        logNo: postId,
        publisherId,
      }).toString(),
    });
    // no-cors 모드라 response.ok 체크 불가 — 성공 여부 불확실
  } catch (e) {
    // 네트워크 오류 시 조용히 실패. 우리 앱 UX에 영향 없음.
    console.debug('[markNaverPostAsRead]', e);
  }
}
