# AI 배지 · SEO · 한줄 코멘트 · 추가 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 패널에 로컬 실행 배지 표시, SEO 완전 세팅, 메르의 한줄 코멘트 자동 추출·표시, 복사 버튼·ESC 단축키 추가, v1.2.0 릴리즈.

**Architecture:** post-content API에서 한줄 코멘트를 별도 필드로 추출. AISidePanel은 패널 열릴 때 자동으로 한줄 코멘트를 fetch해서 채팅 상단에 고정 카드로 표시. SEO는 Next.js App Router의 Metadata API + sitemap.ts + robots.ts로 정적/동적 처리.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Zustand, navigator.gpu (WebGPU 감지)

---

## File Map

| 파일 | 역할 |
|------|------|
| `src/app/api/post-content/route.ts` | `extractOneLiner()` 추가, 응답에 `oneLiner` 필드 반환 |
| `src/features/llm/AISidePanel.tsx` | GPU 배지, 한줄 코멘트 카드, 복사 버튼, ESC 단축키, 퀵 프롬프트 업데이트 |
| `src/app/layout.tsx` | SEO 기본 메타데이터 (title template, og, twitter) |
| `src/app/opengraph-image.tsx` | OG 이미지 동적 생성 (Next.js ImageResponse) |
| `src/app/sitemap.ts` | 동적 sitemap 생성 |
| `src/app/robots.ts` | robots.txt 생성 |
| `src/app/posts/[postId]/page.tsx` | generateMetadata, JSON-LD BlogPosting |
| `src/lib/version.ts` | v1.2.0 bump |

---

## Task 1: post-content API — 한줄 코멘트 추출

**Files:**
- Modify: `src/app/api/post-content/route.ts`

- [ ] **Step 1: `extractOneLiner()` 함수 추가**

`stripHtml()` 함수 바로 아래에 다음 함수를 추가:

```ts
/**
 * 본문 텍스트에서 "한줄 코멘트" 이후 텍스트를 추출
 * 예: "한줄 코멘트.. 금리는 내려도 집값은 안 내린다" → "금리는 내려도 집값은 안 내린다"
 */
function extractOneLiner(text: string): string {
  const match = text.match(/한\s*줄\s*코멘트\s*[.．·:：\s]*(.+?)(\n|$)/i);
  return match ? match[1].trim() : '';
}
```

- [ ] **Step 2: GET 핸들러 반환값에 `oneLiner` 추가**

기존:
```ts
return NextResponse.json({ content, length: content.length });
```

변경:
```ts
const oneLiner = extractOneLiner(content);
return NextResponse.json({ content, oneLiner, length: content.length });
```

- [ ] **Step 3: 빌드 확인**

```bash
cd /Users/limgiho/Desktop/Source/MeblFilter/MerblFilter_Backup/merblFilter
./node_modules/.bin/next build 2>&1 | tail -5
```
Expected: `✓ Compiled successfully` or `Route (app)` 성공 출력

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/post-content/route.ts
git commit -m "feat: extract 메르의 한줄 코멘트 from post body"
```

---

## Task 2: AISidePanel — 한줄 코멘트 카드 + 퀵 프롬프트

**Files:**
- Modify: `src/features/llm/AISidePanel.tsx`

- [ ] **Step 1: 상태 및 fetch 로직 추가**

컴포넌트 상단 state 선언부 (`const [isGenerating...]` 아래)에 추가:

```ts
const [oneLiner, setOneLiner] = useState<string>('');
const [isFetchingOneLiner, setIsFetchingOneLiner] = useState(false);
```

- [ ] **Step 2: 패널 열릴 때 한줄 코멘트 자동 fetch**

기존 autoload useEffect (`isOpen && isCurrentModelDownloaded...`) 아래에 추가:

```ts
// 패널 열리거나 게시글 바뀔 때 한줄 코멘트 fetch
useEffect(() => {
  if (!isOpen || !selectedPost) { setOneLiner(''); return; }
  let cancelled = false;
  setIsFetchingOneLiner(true);
  fetch(`/api/post-content?postId=${selectedPost.postId}&blogId=${selectedPost.blogId}`)
    .then(r => r.json())
    .then(d => { if (!cancelled) setOneLiner(String(d.oneLiner ?? '')); })
    .catch(() => {})
    .finally(() => { if (!cancelled) setIsFetchingOneLiner(false); });
  return () => { cancelled = true; };
}, [isOpen, selectedPost]);
```

- [ ] **Step 3: QUICK_PROMPTS에 한줄 코멘트 추가**

기존:
```ts
const QUICK_PROMPTS = ['3줄 요약', '스팸 댓글 찾기', '댓글 반응 분석', '부정적 댓글'];
```

변경:
```ts
const QUICK_PROMPTS = ['3줄 요약', '한줄 코멘트', '스팸 댓글 찾기', '댓글 반응 분석', '부정적 댓글'];
```

- [ ] **Step 4: 시스템 프롬프트 업데이트**

기존 systemPrompt 내 규칙 목록 마지막에 추가:
```ts
const systemPrompt = `당신은 한국어 블로그 글을 깊이 있게 읽고 분석하는 어시스턴트입니다.

규칙:
- 제공된 [본문]을 꼼꼼히 읽고, 본문의 핵심 내용을 자기 언어로 풀어서 답하세요.
- 추측은 하지 말되, 본문에 있는 내용은 충분히 살려서 답하세요.
- 마크다운(**굵게**, - 목록, 1. 번호) 적극 활용해 가독성 확보.
- 한국어로 자연스럽게, 단정한 톤으로 답하세요. "~입니다", "~합니다" 어미 일관 사용.
- 본문이 비어있을 때만 한정해서 댓글 위주로 분석하세요.
- 요약을 요청받으면 응답 마지막에 반드시 **[메르의 한줄 코멘트]** 섹션을 추가하고, [한줄 코멘트]에 제공된 원문을 그대로 인용하세요.`;
```

- [ ] **Step 5: userPrompt에 한줄 코멘트 컨텍스트 추가**

기존 `userPrompt` 변수에서 `[요청]` 섹션 바로 위에 추가:
```ts
const userPrompt = `[게시글 제목]
${selectedPost.title}

[본문]
${postBody || '(본문을 가져오지 못했습니다 — 제목과 댓글만 참고하세요)'}

[한줄 코멘트]
${oneLiner || '(없음)'}

[댓글 ${commentsText ? commentsText.split('\n').length : 0}개]
${commentsText || '(댓글 없음)'}

[요청]
${finalPrompt}`;
```

- [ ] **Step 6: 한줄 코멘트 카드 UI 추가**

대화 목록 div (`<div className="flex-1 overflow-y-auto...">`) 바로 안쪽 상단, `messages.length === 0` 분기 위에 삽입:

```tsx
{/* 한줄 코멘트 고정 카드 */}
{(oneLiner || isFetchingOneLiner) && (
  <div className="mb-3 px-3 py-2.5 rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 flex-shrink-0">
    <div className="text-[10px] font-semibold tracking-wide text-teal-600 dark:text-teal-400 mb-1 uppercase">
      메르의 한줄 코멘트
    </div>
    {isFetchingOneLiner ? (
      <div className="text-xs text-slate-400 dark:text-slate-500 animate-pulse">불러오는 중...</div>
    ) : (
      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{oneLiner}</p>
    )}
  </div>
)}
```

- [ ] **Step 7: 빌드 확인 + 커밋**

```bash
cd /Users/limgiho/Desktop/Source/MeblFilter/MerblFilter_Backup/merblFilter
./node_modules/.bin/next build 2>&1 | tail -5
git add src/features/llm/AISidePanel.tsx
git commit -m "feat: 한줄 코멘트 카드 자동 표시 + 퀵 프롬프트 추가"
```

---

## Task 3: AISidePanel — GPU 배지 + 복사 버튼 + ESC 단축키

**Files:**
- Modify: `src/features/llm/AISidePanel.tsx`

- [ ] **Step 1: GPU 감지 상태 추가**

컴포넌트 상단 state 선언부에 추가:

```ts
const [gpuLabel, setGpuLabel] = useState<string | null>(null);
const [copiedId, setCopiedId] = useState<string | null>(null);
```

- [ ] **Step 2: WebGPU 감지 useEffect 추가**

isDesktop useEffect 바로 아래에 추가:

```ts
// WebGPU 지원 여부 감지
useEffect(() => {
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    setGpuLabel('⚡ GPU · 내 기기');
  } else {
    setGpuLabel('💻 CPU · 내 기기');
  }
}, []);
```

- [ ] **Step 3: ESC 단축키 useEffect 추가**

WebGPU useEffect 바로 아래에 추가:

```ts
// ESC 키로 패널 닫기
useEffect(() => {
  if (!isOpen) return;
  const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, [isOpen, onClose]);
```

- [ ] **Step 4: 복사 함수 추가**

`handleSubmit` 함수 위에 추가:

```ts
const handleCopy = useCallback((text: string, id: string) => {
  navigator.clipboard.writeText(text).then(() => {
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }).catch(() => {});
}, []);
```

- [ ] **Step 5: 헤더에 GPU 배지 추가**

헤더 내 `<button onClick={() => setShowModelSelect(...)}` (모델 선택 버튼) 옆에 배지 추가:

```tsx
<div className="flex items-center gap-2">
  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">AI 어시스턴트</div>
  <button
    onClick={() => setShowModelSelect(v => !v)}
    className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-400 hover:bg-teal-200 dark:hover:bg-teal-800 transition flex items-center gap-0.5"
    title="모델 선택"
  >
    <span>{selectedModel.label}</span>
    <span className="opacity-60">({selectedModel.size})</span>
    <span className={`transition-transform ${showModelSelect ? 'rotate-180' : ''}`}>▾</span>
  </button>
  {gpuLabel && (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-default"
      title="서버 없이 내 기기에서 직접 실행됩니다. 대화 내용은 외부로 전송되지 않아요."
    >
      {gpuLabel}
    </span>
  )}
</div>
```

- [ ] **Step 6: 어시스턴트 메시지에 복사 버튼 추가**

어시스턴트 메시지 버블 (`bg-slate-100 dark:bg-slate-800 ...`) 안쪽, `MessageContent` 아래에 추가:

```tsx
{msg.role === 'assistant' && !msg.isError && msg.content && !isGenerating && (
  <div className="flex justify-end mt-1.5">
    <button
      onClick={() => handleCopy(msg.content, msg.id)}
      className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition px-1.5 py-0.5 rounded"
      title="복사"
    >
      {copiedId === msg.id ? '✓ 복사됨' : '복사'}
    </button>
  </div>
)}
```

- [ ] **Step 7: 빌드 확인 + 커밋**

```bash
cd /Users/limgiho/Desktop/Source/MeblFilter/MerblFilter_Backup/merblFilter
./node_modules/.bin/next build 2>&1 | tail -5
git add src/features/llm/AISidePanel.tsx
git commit -m "feat: GPU/CPU 배지, 복사 버튼, ESC 단축키"
```

---

## Task 4: SEO — layout.tsx 기본 메타데이터

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: layout.tsx 전체 교체**

```tsx
import type { Metadata } from 'next';
import './globals.css';
import BuildSeal from '@/components/BuildSeal';

const BASE_URL = 'https://merbl-filter.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: '메르의 블로그 — 경제·시사 분석 뷰어',
    template: '%s | 메르의 블로그',
  },
  description:
    '메르(ranto28) 네이버 블로그를 AI 요약·댓글 필터와 함께 보는 뷰어. 경제, 부동산, 시사 분석.',
  keywords: ['메르', 'mer', '메르의블로그', 'ranto28', '경제분석', '부동산', '시사', '네이버블로그', '메르블로그'],
  authors: [{ name: '메르 (ranto28)' }],
  openGraph: {
    type: 'website',
    url: BASE_URL,
    title: '메르의 블로그 — 경제·시사 분석 뷰어',
    description:
      '메르(ranto28) 네이버 블로그를 AI 요약·댓글 필터와 함께 보는 뷰어. 경제, 부동산, 시사 분석.',
    siteName: '메르의 블로그 뷰어',
    locale: 'ko_KR',
  },
  twitter: {
    card: 'summary_large_image',
    title: '메르의 블로그 — 경제·시사 분석 뷰어',
    description: '메르(ranto28) 네이버 블로그를 AI 요약·댓글 필터와 함께 보는 뷰어.',
  },
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
  other: {
    'naver-site-verification': '', // 네이버 서치어드바이저 인증 코드 추가 시 채울 것
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-screen">
        {children}
        <BuildSeal />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: 빌드 확인 + 커밋**

```bash
cd /Users/limgiho/Desktop/Source/MeblFilter/MerblFilter_Backup/merblFilter
./node_modules/.bin/next build 2>&1 | tail -5
git add src/app/layout.tsx
git commit -m "feat: SEO 기본 메타데이터 (og, twitter, keywords)"
```

---

## Task 5: OG 이미지 생성 (opengraph-image.tsx)

**Files:**
- Create: `src/app/opengraph-image.tsx`

- [ ] **Step 1: opengraph-image.tsx 생성**

```tsx
import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = '메르의 블로그 — 경제·시사 분석 뷰어';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          background: 'linear-gradient(135deg, #0f172a 0%, #134e4a 100%)',
          padding: '80px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
          <div
            style={{
              width: '64px', height: '64px', borderRadius: '16px',
              background: '#0d9488', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '32px', color: 'white',
              fontWeight: 'bold', marginRight: '16px',
            }}
          >
            M
          </div>
          <span style={{ color: '#5eead4', fontSize: '20px', fontWeight: '600' }}>
            ranto28.blog.naver.com
          </span>
        </div>
        <div style={{ color: 'white', fontSize: '60px', fontWeight: '700', lineHeight: '1.2', marginBottom: '24px' }}>
          메르의 블로그
        </div>
        <div style={{ color: '#94a3b8', fontSize: '28px', lineHeight: '1.5' }}>
          경제 · 부동산 · 시사 분석
        </div>
        <div style={{
          marginTop: '48px', color: '#64748b', fontSize: '18px',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <span>✦ AI 요약</span>
          <span>·</span>
          <span>댓글 필터</span>
          <span>·</span>
          <span>내 기기에서 실행</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
```

- [ ] **Step 2: 빌드 확인 + 커밋**

```bash
cd /Users/limgiho/Desktop/Source/MeblFilter/MerblFilter_Backup/merblFilter
./node_modules/.bin/next build 2>&1 | tail -5
git add src/app/opengraph-image.tsx
git commit -m "feat: OG 이미지 동적 생성 (ImageResponse)"
```

---

## Task 6: sitemap.ts + robots.ts

**Files:**
- Create: `src/app/sitemap.ts`
- Create: `src/app/robots.ts`

- [ ] **Step 1: sitemap.ts 생성**

```ts
import { MetadataRoute } from 'next';

const BASE_URL = 'https://merbl-filter.vercel.app';

interface RssPost {
  postId: string;
  pubDate: string;
}

async function getPosts(): Promise<RssPost[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/posts?blogId=ranto28`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPosts();

  const postEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${BASE_URL}/posts/${post.postId}`,
    lastModified: post.pubDate ? new Date(post.pubDate) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/posts`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    ...postEntries,
  ];
}
```

- [ ] **Step 2: robots.ts 생성**

```ts
import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: 'https://merbl-filter.vercel.app/sitemap.xml',
  };
}
```

- [ ] **Step 3: 빌드 확인 + 커밋**

```bash
cd /Users/limgiho/Desktop/Source/MeblFilter/MerblFilter_Backup/merblFilter
./node_modules/.bin/next build 2>&1 | tail -5
git add src/app/sitemap.ts src/app/robots.ts
git commit -m "feat: sitemap.xml + robots.txt SEO 세팅"
```

---

## Task 7: 포스트 동적 메타 + JSON-LD

**Files:**
- Modify: `src/app/posts/[postId]/page.tsx`

- [ ] **Step 1: generateMetadata + JSON-LD 추가**

```tsx
import { Suspense } from 'react';
import { Metadata } from 'next';
import PostCommentsWrapper from './PostCommentsWrapper';

const BASE_URL = 'https://merbl-filter.vercel.app';

interface PageProps {
  params: Promise<{ postId: string }>;
  searchParams?: Promise<{ blogId?: string }>;
}

interface RssPost {
  title: string;
  pubDate: string;
  category?: string;
}

async function getPost(postId: string, blogId: string): Promise<RssPost | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/posts?blogId=${blogId}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const posts: (RssPost & { postId: string })[] = await res.json();
    return posts.find(p => p.postId === postId) ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { postId } = await params;
  const sp = await searchParams;
  const blogId = sp?.blogId ?? 'ranto28';
  const post = await getPost(postId, blogId);
  const title = post?.title ?? '메르의 블로그';
  return {
    title,
    description: `${title} — 메르(ranto28) 블로그 경제·시사 분석`,
    openGraph: {
      title,
      description: `${title} — 메르(ranto28) 블로그 경제·시사 분석`,
      url: `${BASE_URL}/posts/${postId}`,
      type: 'article',
      publishedTime: post?.pubDate,
    },
  };
}

export default async function PostPage({ params, searchParams }: PageProps) {
  const { postId } = await params;
  const sp = await searchParams;
  const blogId = sp?.blogId ?? 'ranto28';
  const post = await getPost(postId, blogId);

  const jsonLd = post ? {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    datePublished: post.pubDate,
    author: { '@type': 'Person', name: '메르', url: 'https://blog.naver.com/ranto28' },
    publisher: { '@type': 'Organization', name: '메르의 블로그 뷰어', url: BASE_URL },
    url: `${BASE_URL}/posts/${postId}`,
  } : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400">로딩 중...</div>}>
        <PostCommentsWrapper postId={postId} blogId={blogId} />
      </Suspense>
    </>
  );
}
```

- [ ] **Step 2: 빌드 확인 + 커밋**

```bash
cd /Users/limgiho/Desktop/Source/MeblFilter/MerblFilter_Backup/merblFilter
./node_modules/.bin/next build 2>&1 | tail -5
git add src/app/posts/\[postId\]/page.tsx
git commit -m "feat: 포스트 동적 메타데이터 + JSON-LD BlogPosting"
```

---

## Task 8: v1.2.0 bump + 최종 빌드 + 배포

**Files:**
- Modify: `src/lib/version.ts`

- [ ] **Step 1: version.ts 업데이트**

```ts
export const APP_VERSION = '1.2.0';
export const APP_AUTHOR = 'Giho';
export const APP_BUILD_DATE = '2026-05-18';
```

- [ ] **Step 2: 최종 빌드 확인**

```bash
cd /Users/limgiho/Desktop/Source/MeblFilter/MerblFilter_Backup/merblFilter
./node_modules/.bin/next build 2>&1 | tail -10
```

Expected: `✓ Compiled successfully`, 에러 없음

- [ ] **Step 3: 최종 커밋**

```bash
git add src/lib/version.ts
git commit -m "chore: bump version to v1.2.0"
```

- [ ] **Step 4: 푸시 (사용자 승인 후)**

```bash
git push origin main
```

---

## 자기 검토 결과

- **Spec coverage**: 모든 항목(배지, SEO, 한줄코멘트, 복사, ESC, v1.2.0) Task에 매핑됨 ✓
- **읽기 예상 시간**: 스펙에서 다음 버전으로 이동 결정 — Task에서 제외 ✓
- **Placeholder**: 없음. 모든 단계에 실제 코드 포함 ✓
- **타입 일관성**: `oneLiner: string` 필드가 Task 1 → Task 2에서 일관되게 사용 ✓
- **og image**: `opengraph-image.tsx` 파일명은 Next.js App Router 규약 (`opengraph-image.tsx`) — `layout.tsx`의 `og:image` 필드 없어도 자동 연결 ✓
