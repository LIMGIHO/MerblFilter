# 설계 문서: AI 배지 · SEO · 한줄 코멘트 · 추가 개선

**날짜**: 2026-05-18  
**버전**: v1.2.0  
**상태**: 승인됨

---

## 1. AI 로컬 자원 배지

### 목적
WebLLM이 서버 없이 사용자 기기(GPU/CPU)에서 직접 실행됨을 명시 — 개인정보 보호 신뢰 확보.

### 구현
- **위치**: `AISidePanel.tsx` 헤더, 모델 선택 버튼 옆
- **감지**: `navigator.gpu` 존재 여부 → `useEffect`에서 한 번만 체크
- **WebGPU 지원**: `⚡ GPU · 내 기기` (teal 배지)
- **WebGPU 미지원**: `💻 CPU · 내 기기` (slate 배지)
- **툴팁**: "서버 없이 내 기기에서 직접 실행됩니다. 대화 내용은 외부로 전송되지 않아요."

---

## 2. SEO

### 목표 키워드
메르, mer, 메르의블로그, ranto28, 경제분석, 부동산, 시사

### 배포 URL
`https://merbl-filter.vercel.app`

### 구현 항목

#### 2-1. layout.tsx — 기본 메타데이터
```ts
title: { default: "메르의 블로그 — 경제·시사 분석 뷰어", template: "%s | 메르의 블로그" }
description: "메르(ranto28) 네이버 블로그를 AI 요약·댓글 필터와 함께 보는 뷰어. 경제, 부동산, 시사 분석."
keywords: ["메르", "mer", "메르의블로그", "ranto28", "경제분석", "부동산", "시사", "네이버블로그"]
og:type: website
og:url: https://merbl-filter.vercel.app
og:image: /og-image.png (1200×630, 텍스트 기반 정적 이미지로 public/에 추가)
twitter:card: summary_large_image
```

#### 2-2. /posts/[postId]/page.tsx — 동적 메타
- `generateMetadata()` 로 RSS에서 포스트 제목·날짜 fetch
- title: `{포스트 제목} | 메르의 블로그`
- description: 포스트 제목 기반 자동 생성

#### 2-3. app/sitemap.ts
- `/`, `/posts`, `/posts/[각 postId]` 포함
- RSS API 호출로 최신 포스트 목록 동적 생성

#### 2-4. app/robots.ts
```
User-agent: *
Allow: /
Sitemap: https://merbl-filter.vercel.app/sitemap.xml
```

#### 2-5. JSON-LD 구조화 데이터
- `layout.tsx`: `WebSite` 스키마
- `/posts/[postId]/page.tsx`: `BlogPosting` 스키마

---

## 3. 메르의 한줄 코멘트

### 패턴
블로그 포스트 본문 하단에 `한줄 코멘트` 텍스트로 시작하는 마무리 문장.

### 구현

#### 3-1. post-content/route.ts
`extractBody()` 결과에서 `한줄 코멘트` 이후 텍스트를 별도 추출:
```ts
// API 응답
{ content: string, oneLiner: string, length: number }
```

#### 3-2. AISidePanel.tsx — 패널 열릴 때 자동 표시
- 본문 fetch 완료 시 `oneLiner`가 있으면 채팅 영역 상단에 고정 카드로 표시
- 프롬프트 입력 전에도 항상 보임

#### 3-3. 시스템 프롬프트 수정
요약 요청 시: `"응답 마지막에 반드시 [메르의 한줄 코멘트] 섹션을 넣고 원문을 그대로 인용하세요"`

#### 3-4. 퀵 프롬프트 추가
`QUICK_PROMPTS`에 `'한줄 코멘트'` 추가

---

## 4. 추가 개선

| # | 기능 | 파일 | 설명 |
|---|------|------|------|
| 4-1 | AI 응답 복사 버튼 | AISidePanel.tsx | 메시지 우측 하단 클립보드 복사 + "복사됨 ✓" |
| 4-2 | 읽기 예상 시간 | PostList.tsx | RSS에 본문 길이 없음 → 고정 추정치 불가. **다음 버전으로 이동** |
| 4-3 | ESC 키 패널 닫기 | AISidePanel.tsx | keydown 이벤트로 패널 닫기 |
| 4-4 | v1.2.0 bump | version.ts | APP_VERSION, APP_BUILD_DATE 업데이트 |

---

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `src/features/llm/AISidePanel.tsx` | GPU 배지, 한줄 코멘트 UI, 복사 버튼, ESC 단축키 |
| `src/app/layout.tsx` | SEO 메타데이터, JSON-LD WebSite |
| `src/app/sitemap.ts` | 동적 sitemap 생성 (신규) |
| `src/app/robots.ts` | robots 설정 (신규) |
| `src/app/posts/[postId]/page.tsx` | 동적 메타, JSON-LD BlogPosting |
| `src/app/api/post-content/route.ts` | oneLiner 추출 추가 |
| `src/app/posts/PostList.tsx` | 읽기 시간 표시 |
| `src/lib/version.ts` | v1.2.0 bump |
