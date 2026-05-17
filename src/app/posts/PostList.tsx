'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useReadPostsStore } from '@/store/readPostsStore';
import dynamic from 'next/dynamic';

const PostAIPanel = dynamic(() => import('@/features/llm/PostAIPanel'), { ssr: false });

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

function getRelativeTime(dateString: string) {
  const now = new Date();
  const date = new Date(dateString);
  const diff = (now.getTime() - date.getTime()) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}일 전`;
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Seoul',
  });
}

export default function PostList({ initialPosts }: PostListProps) {
  const searchParams = useSearchParams();
  const scrollToId = searchParams.get('scrollTo');
  const postsRef = useRef<HTMLUListElement>(null);
  const [posts] = useState<Post[]>(initialPosts);
  const { isRead, markAsRead } = useReadPostsStore();
  const [openAIPostId, setOpenAIPostId] = useState<string | null>(null);

  useEffect(() => {
    if (scrollToId && postsRef.current) {
      const el = document.getElementById(`post-${scrollToId}`);
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scrollToId]);

  return (
    <div className="space-y-4">
      <ul className="space-y-3" ref={postsRef}>
        {posts.map((post, index) => {
          const read = isRead(post.postId);
          const aiOpen = openAIPostId === post.postId;

          return (
            <li
              key={post.postId || `post-${index}`}
              id={`post-${post.postId || index}`}
              className={`rounded-xl border shadow-sm transition-all duration-200
                ${read
                  ? 'opacity-50 bg-gray-100 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                  : 'bg-white dark:bg-gray-800 border-transparent hover:border-blue-200 dark:hover:border-blue-700'
                }
                ${aiOpen ? '!opacity-100 !border-violet-300 dark:!border-violet-700' : ''}`}
            >
              <div className="flex items-start gap-4 p-4 sm:p-5">
                {/* 썸네일 */}
                {post.image && (
                  <div className="flex-shrink-0">
                    <img
                      src={post.image}
                      alt={post.author}
                      className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border-2
                        ${read ? 'grayscale border-gray-300 dark:border-gray-600' : 'border-blue-200 dark:border-blue-700'}`}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}

                {/* 내용 */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                    <a
                      href={`/posts/${post.postId || index}`}
                      onClick={() => {
                        sessionStorage.setItem('fromList', 'true');
                        markAsRead(post.postId);
                      }}
                      className="flex-1 min-w-0"
                    >
                      <h2 className={`text-base sm:text-lg font-bold leading-snug
                        ${read ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                        {post.title}
                      </h2>
                    </a>

                    {/* AI 버튼 */}
                    <button
                      onClick={() => setOpenAIPostId(aiOpen ? null : post.postId)}
                      className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all
                        ${aiOpen
                          ? 'bg-violet-500 text-white shadow-sm'
                          : 'bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/50 border border-violet-200 dark:border-violet-700'
                        }`}
                    >
                      🤖 AI
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400 flex-wrap">
                    <span>{getRelativeTime(post.pubDate)}</span>
                    {read && (
                      <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                        읽음
                      </span>
                    )}
                    {post.category && (
                      <>
                        <span className="text-gray-300 dark:text-gray-600">•</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                          ${read
                            ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                            : 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300'
                          }`}>
                          {post.category}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* AI 패널 */}
              {aiOpen && (
                <PostAIPanel
                  postId={post.postId}
                  blogId="ranto28"
                  postTitle={post.title}
                  onClose={() => setOpenAIPostId(null)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
