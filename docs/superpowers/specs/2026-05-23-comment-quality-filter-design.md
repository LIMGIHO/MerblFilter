# 댓글 품질 필터 설계 (v2)

## 목표

기존 감성 분류(긍정/중립/부정)를 폐기하고, **"읽을만한 댓글"만 보여주는 품질 필터**로 재설계한다.

- 읽을만한 댓글: 독자 본인 경험 공유, 의견/반론이 있는 댓글
- 읽을 필요 없는 댓글: 단순 반응("놀랐어요", "ㅎㅎ"), 스팸
- 결과에 **점수(0~100) + 태그** 표시 → 왜 보이는지 사용자가 납득 가능

---

## 아키텍처

### 전체 흐름

```
댓글 입력
    │
    ▼
[1단계: 전처리 필터]
    │
    ├─ 명백한 HIDE → score 0, tag: 'noise' | 'spam'
    │
    └─ 나머지 ──▶ [2단계: 임베딩 유사도]
                        │
                        ├─ SHOW 예시들과 코사인 유사도 계산
                        ├─ HIDE 예시들과 코사인 유사도 계산
                        │
                        └─ { score, tag, visible } 반환
```

### 1단계: 전처리 필터 (명백한 케이스만)

규칙은 최소화. 오탐 위험이 있는 규칙(URL, 인칭 대명사 등)은 사용하지 않는다.

| 조건 | 결과 | 태그 |
|------|------|------|
| 15자 미만 | HIDE, score=5 | `noise` |
| ㅎㅎ / ㅋㅋ / ㅠㅠ 만으로 구성 | HIDE, score=5 | `noise` |
| 구독 / 방문해주세요 / 놀러오세요 포함 | HIDE, score=0 | `spam` |

→ 이 세 조건에 걸리면 임베딩 단계 건너뜀 (비용 절감)

### 2단계: 임베딩 유사도 (메인 판단)

**모델:** `Xenova/paraphrase-multilingual-MiniLM-L12-v2`
- 크기: ~120MB (기존 BERT 170MB보다 작음)
- 학습 목적: 문장 간 의미 유사도 측정 (NLI + sentence similarity)
- 기존 @xenova/transformers Worker 인프라 재사용

**동작 방식:**
1. 댓글 텍스트 → 384차원 임베딩 벡터 생성
2. 사전 내장된 SHOW 예시들과 코사인 유사도 계산 → `showScore`
3. 사전 내장된 HIDE 예시들과 코사인 유사도 계산 → `hideScore`
4. `finalScore = showScore - hideScore` 로 0~100 정규화
5. 태그는 가장 가까운 SHOW 예시의 카테고리에서 결정

**임계값:**
- `finalScore >= 50` → SHOW
- `finalScore < 50` → HIDE
- 유사도 max < 0.4 (어느 예시와도 멀 때) → 기본값 SHOW (안전 처리)

---

## 사전 내장 예시 세트

코드에 하드코딩. 잘못 분류 발견 시 텍스트 한 줄 추가로 즉시 반영 (재학습 불필요).

### SHOW 예시 — `경험공유` 태그

```
"저도 지방에서 올라와서 처음엔 정말 막막했는데 공감이 많이 됩니다"
"저 역시 비슷한 상황을 겪었는데 그때 이 글을 읽었더라면 좋았을 것 같아요"
"15년 전 일인데 아직도 그때 기억이 생생하네요"
"우리 아이도 작년에 비슷한 일이 있었는데 정말 힘들었거든요"
"저도 예전에 이런 선택의 기로에서 고민했는데"
"제가 겪어보니 생각보다 훨씬 어렵더라고요"
"저는 다른 방향을 선택했는데 지금 돌아보면..."
"저도 한때 이 문제로 정말 많이 고민했었어요"
```

### SHOW 예시 — `의견있음` 태그

```
"개인적으로 이 부분은 조금 다르게 생각해요"
"제 생각엔 이것보다 저 방법이 더 나을 것 같기도 한데요"
"좋은 글인데 한 가지 아쉬운 점은 구체적인 사례가 없다는 거예요"
"동의하는 부분도 있지만 현실적으로 쉽지 않은 측면도 있죠"
"이런 시각도 있구나 싶었어요. 저는 반대로 생각하고 있었거든요"
"항상 좋은 글 감사한데 이번엔 살짝 아쉬웠어요"
"말씀하신 방법 외에 다른 방법도 있을 것 같아서요"
```

### HIDE 예시 — `noise` 태그

```
"놀랐어요!"
"감사합니다 잘 봤어요"
"철렁했습니다"
"ㅎㅎ 좋은 글이네요"
"깜짝 놀랐어요^^"
"잘 봤습니다~"
"오늘도 좋은 글 감사해요"
"응원합니다!"
"화이팅이요"
"헉 저도 몰랐어요"
```

---

## 데이터 타입 변경

### `BlogComment._llmLabel` (기존 → 변경)

```typescript
// 기존
_llmLabel?: 'spam' | 'promo' | 'negative' | 'neutral' | 'positive';

// 변경
_llmLabel?: 'worth_reading' | 'noise' | 'spam';
_llmScore?: number;        // 0~100
_llmTag?: '경험공유' | '의견있음' | 'noise' | 'spam';
```

### `ClassifyResult` (useClassifier.ts)

```typescript
// 기존
interface ClassifyResult {
  commentNo: number;
  label: LlmLabel;
  score: number;
}

// 변경
interface ClassifyResult {
  commentNo: number;
  label: 'worth_reading' | 'noise' | 'spam';
  score: number;       // 0~100
  tag: '경험공유' | '의견있음' | 'noise' | 'spam';
}
```

---

## Worker 변경 (`llm.worker.ts`)

### 모델 교체

```typescript
// 기존
pipeline('sentiment-analysis', 'Xenova/bert-base-multilingual-uncased-sentiment')

// 변경
pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2')
```

### 분류 로직 변경

```typescript
// 기존: topk=5 star scores → computeLabel()
// 변경: 임베딩 → 코사인 유사도 → score/tag 결정

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return dot / (normA * normB);
}

function classifyByEmbedding(
  commentEmbedding: number[],
  showEmbeddings: Array<{ vec: number[]; tag: string }>,
  hideEmbeddings: number[][]
): ClassifyResult {
  const showScores = showEmbeddings.map(e => ({
    score: cosineSimilarity(commentEmbedding, e.vec),
    tag: e.tag,
  }));
  const hideScores = hideEmbeddings.map(e => cosineSimilarity(commentEmbedding, e));

  const bestShow = showScores.reduce((a, b) => a.score > b.score ? a : b);
  const bestHide = Math.max(...hideScores);

  // 0~100 정규화
  const raw = (bestShow.score - bestHide + 1) / 2; // -1~1 → 0~1
  const score = Math.round(raw * 100);

  // 어느 예시와도 유사도가 낮으면 기본값 SHOW
  if (bestShow.score < 0.4 && bestHide < 0.4) {
    return { label: 'worth_reading', score: 50, tag: '경험공유' };
  }

  return {
    label: score >= 50 ? 'worth_reading' : 'noise',
    score,
    tag: score >= 50 ? bestShow.tag as '경험공유' | '의견있음' : 'noise',
  };
}
```

### 초기화 시점에 예시 임베딩 사전 계산

모델 로드 완료 후 예시 세트를 한 번 임베딩해 메모리에 보관.  
댓글 분류 시 매번 예시를 임베딩하지 않아도 됨 → 속도 개선.

```typescript
let showEmbeddings: Array<{ vec: number[]; tag: string }> | null = null;
let hideEmbeddings: number[][] | null = null;

// type: 'load' 완료 시
showEmbeddings = await Promise.all(
  SHOW_EXAMPLES.map(async e => ({
    vec: await embed(e.text),
    tag: e.tag,
  }))
);
hideEmbeddings = await Promise.all(HIDE_EXAMPLES.map(e => embed(e)));
```

---

## UI 변경 (`LocalLLMPanel.tsx`)

### 레이블 배지 변경

```typescript
// 기존 5종 레이블
const LABEL_CONFIG = { spam, promo, negative, neutral, positive }

// 변경: 점수 + 태그
// worth_reading 댓글: 점수 + 태그 배지 표시
// noise/spam: 숨김 처리, 배지 없음
```

### 점수 표시 예시

```
┌─────────────────────────────────────┐
│ 허브    [경험공유 · 78점]  2026.05.23│
│ 저도 지방에서 경기도로 올라와...     │
└─────────────────────────────────────┘
```

### 숨긴 댓글 수 표시

필터 ON 상태에서 하단에 "37개 댓글이 필터됨" 표시.  
클릭 시 필터 해제 (전체 보기).

---

## 제거 항목

기존 코드에서 삭제:

- `computeLabel()` 함수 (star-rating 가중 평균)
- `SKIP_PATTERNS` (단순 인사 패턴 — 전처리 필터로 대체)
- `LlmLabel` 타입 (`spam | promo | negative | neutral | positive`)
- `topk: 5` 분류 로직
- `llmStore`의 `phase1ModelId` (모델 ID 하드코딩으로 변경)

---

## 파일 변경 목록

| 파일 | 변경 내용 |
|------|-----------|
| `src/features/llm/llm.worker.ts` | 모델 교체, 임베딩 로직, 예시 세트 내장 |
| `src/features/llm/useClassifier.ts` | `ClassifyResult` 타입 변경 |
| `src/features/llm/LocalLLMPanel.tsx` | UI — 점수+태그 표시, 필터 카운트 |
| `src/domain/comment/types.ts` | `_llmLabel`, `_llmScore`, `_llmTag` 타입 변경 |
| `src/store/llmStore.ts` | `phase1ModelId` 제거 또는 고정 |
| `public/llm-worker.js` | `pnpm build:worker` 재빌드 |

---

## 성능 고려사항

- 예시 임베딩은 모델 로드 시 1회만 계산 (캐시)
- 댓글 100개 기준 예상 처리 시간: 5~15초 (CPU 단일 스레드)
- IndexedDB 모델 캐시 유지 (기존과 동일)
- 짧은 댓글(1단계 필터)은 임베딩 계산 생략 → 속도 개선

---

## 향후 확장 가능성

- 사용자가 잘못 분류된 댓글을 직접 예시에 추가 (localStorage 저장)
- 예시 세트를 블로그별로 커스터마이즈
- 임계값(50점) 사용자 조정 슬라이더
