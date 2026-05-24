import { Suspense } from 'react';
import PostList from './PostList';

export default function PostsPage() {
  return (
    <main className="min-h-screen">
      <Suspense fallback={<div className="text-center py-8 text-gray-400">로딩 중...</div>}>
        <PostList />
      </Suspense>
    </main>
  );
}
