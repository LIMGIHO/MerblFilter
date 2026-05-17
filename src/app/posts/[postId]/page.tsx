import { Suspense } from 'react';
import PostCommentsWrapper from './PostCommentsWrapper';

interface PageProps {
  params: Promise<{ postId: string }>;
  searchParams?: Promise<{ blogId?: string }>;
}

export default async function PostPage({ params, searchParams }: PageProps) {
  const { postId } = await params;
  const sp = await searchParams;
  const blogId = sp?.blogId ?? 'ranto28';

  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400">로딩 중...</div>}>
      <PostCommentsWrapper postId={postId} blogId={blogId} />
    </Suspense>
  );
}
