import { Suspense } from 'react';
import PostList from './PostList';
import NaverReadBanner from '@/features/naverRead/NaverReadBanner';

export default function PostsPage() {
  return (
    <main className="min-h-screen">
      <NaverReadBanner />
      <Suspense fallback={<div className="text-center py-8 text-gray-400">로딩 중...</div>}>
        <PostList />
      </Suspense>
    </main>
  );
}
