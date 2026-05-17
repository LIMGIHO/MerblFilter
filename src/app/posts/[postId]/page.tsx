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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      )}
      <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400">로딩 중...</div>}>
        <PostCommentsWrapper postId={postId} blogId={blogId} />
      </Suspense>
    </>
  );
}
