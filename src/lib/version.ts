/**
 * 앱 버전 관리
 * 배포할 때마다 PATCH를 올리고, 의미있는 기능 추가는 MINOR, 큰 변경은 MAJOR.
 *
 * 형식: MAJOR.MINOR.PATCH
 *   MAJOR: 호환되지 않는 큰 변경 (사이드 패널 도입 등)
 *   MINOR: 기능 추가 (마크다운 렌더링, 추론 표시 등)
 *   PATCH: 버그 수정, 작은 개선
 */

export const APP_VERSION = '1.4.2';
export const APP_AUTHOR = 'Giho';
export const APP_BUILD_DATE = '2026-06-30';
