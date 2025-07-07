'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

interface Post {
  author: string;
  image: string;
  title: string;
  link: string;
  postId: string;
  pubDate: string;
  tag?: string;
  category?: string;
}

interface PostListProps {
  initialPosts: Post[];
}

export default function PostList({ initialPosts }: PostListProps) {
  const searchParams = useSearchParams();
  const scrollToId = searchParams.get('scrollTo');
  const postsRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (scrollToId && postsRef.current) {
      const element = document.getElementById(`post-${scrollToId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [scrollToId]);

  return (
    <ul className="space-y-4" ref={postsRef}>
      {initialPosts.map((post) => (
        <li
          key={post.postId}
          id={`post-${post.postId}`}
          className="bg-white rounded-lg shadow hover:shadow-md transition-shadow"
        >
          <Link
            href={`/posts/${post.postId}`}
            onClick={() => sessionStorage.setItem('fromList', 'true')}
            className="block p-6"
          >
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900 mb-2">{post.title}</h2>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>{new Date(post.pubDate).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    timeZone: 'Asia/Seoul'
                  })}</span>
                  {post.category && (
                    <>
                      <span className="text-gray-300">•</span>
                      <span>{post.category}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
} 