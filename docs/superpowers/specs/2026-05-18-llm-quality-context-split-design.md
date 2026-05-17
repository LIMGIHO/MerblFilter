# LLM 품질 개선 + 본문/댓글 컨텍스트 분리 설계

**날짜**: 2026-05-18  
**버전**: v1.4.0

---

## 목표

1. 댓글 HTML 태그(`<br>` 등)가 LLM 응답에 그대로 출력되는 버그 수정
2. 본문/댓글 컨텍스트를 분리하여 LLM이 맥락에 맞는 답변을 하도록 개선
3. 퀵 프롬프트를 컨텍스트별로 분리하여 UX 개선

---

## 아키텍처

변경 범위는 `AISidePanel.tsx` 단일 파일. 새 파일 생성 없음.

---

## 기능 상세

### 1. HTML Strip 버그 수정

**문제**: 댓글 `contents` 필드에 `<br>`, `<b>` 등 HTML 태그가 포함됨. 현재 코드는 이를 strip하지 않고 LLM 프롬프트에 전달 → LLM이 `<br>` 텍스트를 그대로 출력.

**수정**: `AISidePanel.tsx` 내 댓글 처리 시 인라인 strip 함수 적용:

```ts
function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
```

적용 위치: `handleSubmit` 내 댓글 목록 처리부:
```ts
const trimmed = stripHtmlTags(c.contents).slice(0, 150) + (c.contents.length > 150 ? '…' : '');
```

---

### 2. 컨텍스트 토글 상태

**새 상태**:
```ts
type ContextMode = 'auto' | 'post' | 'comments' | 'all';
const [contextMode, setContextMode] = useState<ContextMode>('auto');
```

**자동 감지 로직** (`detectContext` 함수):
```ts
function detectContext(prompt: string): 'post' | 'comments' | 'all' {
  const postKeywords = /요약|정리|핵심|분석|내용|설명|포인트|의미|배경|원인/;
  const commentKeywords = /댓글|반응|사람들|독자|스팸|부정|긍정|여론/;
  const hasPost = postKeywords.test(prompt);
  const hasComment = commentKeywords.test(prompt);
  if (hasPost && !hasComment) return 'post';
  if (hasComment && !hasPost) return 'comments';
  return 'all';
}
```

**handleSubmit 내 컨텍스트 결정**:
```ts
const resolved = contextMode === 'auto' ? detectContext(finalPrompt) : contextMode;
// resolved 값에 따라 userPrompt 구성 분기
```

---

### 3. 컨텍스트별 userPrompt 구성

```ts
// post only
const userPrompt = `[게시글 제목]\n${title}\n\n[본문]\n${postBody}\n\n[한줄 코멘트]\n${oneLiner}\n\n[요청]\n${finalPrompt}`;

// comments only
const userPrompt = `[게시글 제목]\n${title}\n\n[댓글 ${count}개]\n${commentsText}\n\n[요청]\n${finalPrompt}`;

// all
const userPrompt = `[게시글 제목]\n${title}\n\n[본문]\n${postBody}\n\n[한줄 코멘트]\n${oneLiner}\n\n[댓글 ${count}개]\n${commentsText}\n\n[요청]\n${finalPrompt}`;
```

---

### 4. 컨텍스트별 시스템 프롬프트

**본문 전용**:
```
당신은 아래 제공된 [본문]만을 근거로 답하는 블로그 분석 어시스턴트입니다.
절대 규칙:
- [본문]에 있는 내용만 사용하세요. 일반 상식이나 외부 지식으로 답하지 마세요.
- 본문에 없는 내용을 묻는 경우 "이 게시글에서는 해당 내용을 다루지 않습니다."라고 답하세요.
- 마크다운(**굵게**, - 목록) 적극 활용.
- 한국어, "~입니다/~합니다" 어미 일관 사용.
- 요약 요청 시 응답 마지막에 **[메르의 한줄 코멘트]** 섹션을 추가하고 원문 그대로 인용.
```

**댓글 전용**:
```
당신은 아래 제공된 [댓글]만을 분석하는 어시스턴트입니다.
절대 규칙:
- [댓글]에 있는 내용만 사용하세요.
- 댓글에 없는 내용은 추론하지 마세요.
- 마크다운(**굵게**, - 목록) 적극 활용.
- 한국어, "~입니다/~합니다" 어미 일관 사용.
```

**전체**:
```
(기존 강화된 시스템 프롬프트 유지 — 본문 + 댓글 모두 참조)
```

---

### 5. UI — 컨텍스트 토글 (퀵 프롬프트 위)

```
컨텍스트: [📄 본문]  [💬 댓글]  [전체]    ← 자동감지 (contextMode === 'auto' 일 때)
```

- `contextMode === 'auto'` 시: 각 버튼 비활성 스타일 + "← 자동감지" 텍스트 표시
- 버튼 클릭 시: 해당 모드로 고정 (자동감지 해제), 다시 클릭하면 'auto'로 복귀
- 이미 선택된 버튼 다시 클릭 → 'auto'로 복귀

---

### 6. 컨텍스트별 퀵 프롬프트

```ts
const QUICK_PROMPTS: Record<'post' | 'comments' | 'all', string[]> = {
  post:     ['3줄 요약', '핵심 포인트', '한줄 코멘트'],
  comments: ['댓글 반응 분석', '스팸 찾기', '부정적 댓글'],
  all:      ['종합 요약', '댓글 반응', '스팸 찾기'],
};
```

`contextMode === 'auto'` 일 때는 `all` 프롬프트 표시.

---

## 영향 범위

| 파일 | 변경 유형 |
|------|-----------|
| `src/features/llm/AISidePanel.tsx` | 수정 (전체 기능 포함) |

새 파일, 새 API 없음.

---

## 테스트 시나리오

1. "3줄 요약" 클릭 → 본문만 컨텍스트로 사용, 댓글 내용 없는 프롬프트 전달 확인
2. "댓글 반응 분석" 클릭 → 댓글만 컨텍스트로 사용 확인
3. 토글에서 "💬 댓글" 선택 → 퀵 프롬프트가 댓글용으로 변경 확인
4. 댓글에 `<br>` 포함된 게시글 → LLM 응답에 `<br>` 미출력 확인
5. "💬 댓글" 다시 클릭 → 'auto'로 복귀 확인
