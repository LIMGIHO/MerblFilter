# merblFilter v2 — AGENTS.md

## 프로젝트 개요
네이버 블로그(기본: ranto28) 댓글 필터 웹앱.  
Android 앱(`/MonoRepoApp/apps/comment-filter`)의 웹 포팅 + 로컬 LLM 분류.

## 기술 스택
- **Next.js 15** (App Router, Edge Runtime 일부)
- **TypeScript 5 + Tailwind CSS 3** (다크모드: `prefers-color-scheme`)
- **Zustand 5** + localStorage persist
- **@tanstack/react-virtual** — 댓글 가상 스크롤
- **@xenova/transformers** — 브라우저 내 LLM (Phase 1, IndexedDB 캐시)
- **Vitest 2** — 단위 테스트

## 폴더 구조
```
src/
├── app/               # Next.js App Router (페이지, API routes)
│   ├── api/comments/  # cbox 스크래핑 (blogId 동적)
│   ├── api/posts/     # RSS 피드
│   └── posts/[postId] # 댓글 상세 페이지
├── domain/
│   ├── comment/types.ts      # BlogComment (cbox 실측 필드)
│   └── filter/
│       ├── filterSettings.ts  # FilterSettings 타입 + 기본값
│       └── filterEngine.ts    # 순수함수: applyFilters()
├── features/
│   ├── comments/      # FilterBar, CommentItem, CommentList, BlockMenu
│   ├── llm/           # LocalLLMPanel, useClassifier, llm.worker.ts
│   └── settings/      # ExportImportPreset
└── store/
    ├── filterStore.ts   # Zustand (blockedUsers, favoriteUsers, filterSettings)
    ├── readPostsStore.ts # 읽은 글 Set<string>
    └── llmStore.ts      # LLM 상태 (phase1Status, progress)
```

## 개발 명령어
```bash
pnpm dev          # 개발 서버 (http://localhost:3000)
pnpm build        # 프로덕션 빌드
pnpm test         # Vitest 단위 테스트
pnpm exec tsc --noEmit  # TypeScript 체크
```

## 핵심 아키텍처 결정

### Filter Engine (순수 함수)
- `applyFilters(flat: BlogComment[], settings: FilterSettings): FilteredComment[]`
- MutationObserver 불필요 — 렌더 시마다 순수 함수로 재계산
- 필터 우선순위: favoriteFilter → userFilter → likeFilter → searchFilter → ownerOnly

### cbox API 필드 매핑
| 필드 | 설명 |
|---|---|
| `isBlogOwner` | 주인장 여부 (실측 확인 필요) |
| `writerProfileUserRoleCode` | `'OWNER'`면 주인장 |
| `sympathyCount` | 좋아요 수 |
| `replyLevel` | 1=원댓글, 2=대댓글 |

### COOP/COEP 헤더 (필수)
`Cross-Origin-Opener-Policy: same-origin`  
`Cross-Origin-Embedder-Policy: require-corp`  
→ SharedArrayBuffer / WASM threads 활성화 (Transformers.js & WebLLM)

### Local LLM 아키텍처
```
LocalLLMPanel (UI)
  → useClassifier hook
    → llm.worker.ts (Web Worker)
      Phase 1: @xenova/transformers (bert-base-multilingual, ~170MB)
      Phase 2: @mlc-ai/web-llm (Qwen2.5-1.5B, ~900MB) [TODO]
  → IndexedDB 캐시 (첫 다운로드 후 재사용)
```

## 마일스톤 현황
- [x] M0 — Bootstrap (폴더 fork, pnpm, 빌드)
- [x] M1 — Filter Engine (순수함수, Vitest 19개, Zustand store)
- [x] M2 — UX (다크모드, 가상스크롤, export/import, 검색하이라이트)
- [x] M3 — Local LLM Phase 1 (Transformers.js Worker, 진행률 UI)
- [ ] M4 — Local LLM Phase 2 (WebLLM Qwen2.5-1.5B, 요약)
- [ ] M5 — Multi-blog 지원
- [ ] M6 — Vercel 배포 + COOP/COEP 검증

## 위험 사항
- **R1**: cbox 비공식 API 차단 위험 — referer 위조로 현재 동작
- **R3**: iOS Safari COOP/COEP → Vercel Preview에서 실측 필요
- **R6**: Vercel Hobby 10초 타임아웃 → 댓글 페이지 병렬 fetch로 대응 완료
