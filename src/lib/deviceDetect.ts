/**
 * 모바일/저사양 GPU 디바이스 감지
 *
 * 용도: WebLLM 컨텍스트 윈도우·본문 크기 제한 등 GPU 메모리 한계 대응.
 * "진짜 모바일이냐"를 알고 싶은 게 아니라 "GPU 메모리가 제한적이냐"를
 * 근사로 판단. 가로 모드, 아이패드 등 viewport만으론 판단 어려운 경우 포함.
 *
 * 우선순위:
 *   1) navigator.userAgent — 가장 신뢰. iOS Safari/Android Chrome 정확히 잡힘
 *   2) pointer: coarse — 터치 디바이스 (보조)
 *   3) 화면 너비 — 마지막 fallback (데스크탑에서 창 좁히면 false-positive)
 */

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;

  // 1) UA 검사 — Android, iPhone, iPad, iPod 모두 캐치
  const ua = navigator.userAgent || '';
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return true;

  // 2) 터치 우선 디바이스 — 마우스 없는 환경 (가로 모드 태블릿 등)
  try {
    if (window.matchMedia('(pointer: coarse)').matches) return true;
  } catch {
    // matchMedia 미지원 환경
  }

  // 3) Viewport 폭 — Tailwind md 브레이크포인트와 동일 (마지막 fallback)
  return window.innerWidth < 768;
}
