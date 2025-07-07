import { Suspense } from 'react';
import PostCommentsWrapper from './PostCommentsWrapper';

interface PageProps {
  params: Promise<{ postId: string }>;
}

export default async function PostPage({ params }: PageProps) {
  const resolvedParams = await params;
  
  return (
    <Suspense fallback={<div>로딩 중...</div>}>
      <PostCommentsWrapper postId={resolvedParams.postId} />
    </Suspense>
  );
}