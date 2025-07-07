'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

function timeAgo(date: string) {
  const d = new Date(date);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

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

export default function PostList({ initialPosts }: { initialPosts: Post[] }) {
  const searchParams = useSearchParams();
  const scrollToId = searchParams.get('scrollTo');
  const postsRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (scrollToId && postsRef.current) {
      const element = document.getElementById(`post-${scrollToId}`);
      if (element) {
        // 부드러운 스크롤 효과로 해당 위치로 이동
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 시각적 피드백을 위한 깜빡임 효과
        element.classList.add('highlight-post');
        setTimeout(() => {
          element.classList.remove('highlight-post');
        }, 2000);
      }
    }
  }, [scrollToId]);

  return (
    <ul className="space-y-4" ref={postsRef}>
      {initialPosts.map((post) => (
        <Link
          key={post.postId}
          href={`/posts/${post.postId}`}
          className="block group"
        >
          <li
            id={`post-${post.postId}`}
            className="bg-white rounded-xl shadow-md transition-all p-5 flex items-start space-x-4 border border-gray-100 cursor-pointer
            group-hover:shadow-2xl group-hover:bg-blue-50 group-hover:border-blue-500 group-hover:text-blue-900 group-hover:scale-[1.02]"
          >
            <Image src={post.image} alt="blogger icon" width={40} height={40} className="mt-1" />
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-xs text-gray-400 mb-1">{post.author} · {timeAgo(post.pubDate)}</span>
              <span className="font-semibold text-lg text-gray-900 truncate">
                {post.title}
              </span>
              {(post.tag || post.category) && (
                <div className="mt-1 flex flex-wrap gap-2">
                  {post.category && (
                    <span className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5">{post.category}</span>
                  )}
                  {post.tag && (
                    <span className="text-xs bg-blue-100 text-blue-600 rounded px-2 py-0.5">#{post.tag}</span>
                  )}
                </div>
              )}
            </div>
          </li>
        </Link>
      ))}
    </ul>
  );
} 