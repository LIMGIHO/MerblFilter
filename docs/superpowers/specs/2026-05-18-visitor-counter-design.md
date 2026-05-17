# 설계 문서: 방문자 카운터

**날짜**: 2026-05-18  
**버전**: v1.3.0  
**상태**: 승인됨

---

## 목적

Upstash Redis를 사용해 앱 방문자를 카운팅하고 BuildSeal(좌측 하단 배지)에 누적/오늘 방문자 수를 표시.

---

## 아키텍처

### API: `POST /api/visit`

방문 시 호출. 두 Redis 키를 동시 INCR 후 현재값 반환.

**Redis 키 구조:**
```
visits:total           → 누적 방문자 수 (만료 없음)
visits:YYYY-MM-DD      → 오늘 방문자 수 (EXPIRE 48시간)
```

**요청/응답:**
```ts
// POST /api/visit
// Response:
{ total: number, today: number }
```

**중복 방지:**
- `sessionStorage.getItem('merbl_visited')` 존재 시 API 미호출
- 호출 성공 시 `sessionStorage.setItem('merbl_visited', '1')` 저장
- 새 탭/새 세션에서만 카운팅 (새로고침은 카운팅 안 함)

**환경변수 (Vercel 설정 필요):**
```
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

**에러 처리:**
- Upstash 연결 실패 → `{ total: 0, today: 0 }` 반환 (앱 크래시 없음)
- 환경변수 미설정 → 동일하게 0 반환

---

## 패키지

```bash
npm install @upstash/redis
```

---

## UI: BuildSeal.tsx 변경

`'use client'` 컴포넌트로 전환. `useEffect`에서 `POST /api/visit` 호출 후 상태 업데이트.

**표시 형태:**
```
┌──────────────┐
│  Giho        │
│  BUILD SEAL  │
│   #1.2.0     │
│  👁 1,234    │  ← 누적 방문자 (천 단위 콤마)
│  오늘 23     │  ← 오늘 방문자
└──────────────┘
```

**상태별 처리:**
- 로딩 중: `👁 —` 표시
- 에러/실패: 카운터 섹션 미표시 (조용히 숨김)
- 성공: 천 단위 콤마 포맷 (`1234` → `1,234`)

---

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `src/app/api/visit/route.ts` | 신규 — Redis INCR + 응답 |
| `src/components/BuildSeal.tsx` | `use client` 추가, 방문자 카운터 fetch + 표시 |
| `package.json` | `@upstash/redis` 패키지 추가 |

---

## 셀프 리뷰

- **Placeholder**: 없음 ✓
- **일관성**: sessionStorage 키 `merbl_visited` 단일 사용 ✓
- **범위**: API + UI 두 파일로 명확히 분리 ✓
- **모호성**: 중복 방지 기준 = 세션 단위 (탭 닫으면 재카운팅) ✓
