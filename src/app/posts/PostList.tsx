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
  isVisited?: boolean;
}

interface PostListProps {
  initialPosts: Post[];
}

function getRelativeTime(dateString: string) {
  const now = new Date();
  const date = new Date(dateString);
  const diff = (now.getTime() - date.getTime()) / 1000; // 초 단위

  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}일 전`;

  // 한 달 이상은 날짜로 표시
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Seoul'
  });
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
          className={`bg-white rounded-lg shadow hover:shadow-md transition-shadow ${
            post.isVisited ? 'opacity-60' : ''
          }`}
        >
          <Link
            href={`/posts/${post.postId}`}
            onClick={() => sessionStorage.setItem('fromList', 'true')}
            className="block p-6"
          >
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h2 className={`text-xl font-bold mb-2 ${
                  post.isVisited ? 'text-gray-500' : 'text-gray-900'
                }`}>{post.title}</h2>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>{getRelativeTime(post.pubDate)}</span>
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