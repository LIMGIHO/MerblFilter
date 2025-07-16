'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';

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
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const scrollToId = searchParams.get('scrollTo');
  const postsRef = useRef<HTMLUListElement>(null);
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [isLoading, setIsLoading] = useState(false);

  // API에서 포스트 데이터 가져오기
  useEffect(() => {
    const fetchPosts = async () => {
      setIsLoading(true);
      try {
        console.log('API 호출 시작');
        const res = await fetch('/api/posts');
        const data = await res.json();
        console.log('API 응답:', data);
        setPosts(data || initialPosts);
      } catch (error) {
        console.error('Failed to fetch posts:', error);
        setPosts(initialPosts);
      } finally {
        setIsLoading(false);
      }
    };

    // 세션이 있으면 API 호출, 없으면 initialPosts 사용
    if (session) {
      fetchPosts();
    } else {
      setPosts(initialPosts);
    }
  }, [session, initialPosts]);

  useEffect(() => {
    if (scrollToId && postsRef.current) {
      const element = document.getElementById(`post-${scrollToId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [scrollToId]);

  if (isLoading) {
    return <div className="text-center py-4">로딩 중...</div>;
  }

  return (
    <ul className="space-y-4" ref={postsRef}>
      {posts.map((post, index) => (
        <li
          key={post.postId || `post-${index}`}
          id={`post-${post.postId || index}`}
          className={`bg-white rounded-lg shadow hover:shadow-md transition-all duration-200 ${
            post.isVisited 
              ? 'opacity-50 bg-gray-50 border-l-4 border-gray-300' 
              : 'opacity-100 border-l-4 border-transparent'
          }`}
        >
          <Link
            href={`/posts/${post.postId || index}`}
            onClick={() => sessionStorage.setItem('fromList', 'true')}
            className="block p-6"
          >
            <div className="flex items-start gap-4">
              {post.image && (
                <div className="flex-shrink-0 text-center">
                  <img
                    src={post.image}
                    alt={`${post.author}의 프로필 이미지`}
                    className={`w-12 h-12 rounded-full object-cover mb-1 ${
                      post.isVisited ? 'grayscale' : ''
                    }`}
                    onError={(e) => {
                      // 이미지 로드 실패시 기본 이미지로 대체
                      e.currentTarget.src = '/default-avatar.png';
                    }}
                  />
                  <div className={`text-xs ${post.isVisited ? 'text-gray-400' : 'text-gray-500'}`}>
                    {post.author}
                  </div>
                </div>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className={`text-xl font-bold ${
                    post.isVisited ? 'text-gray-400 line-through' : 'text-gray-900'
                  }`}>
                    {post.title}
                  </h2>
                  {post.isVisited && (
                    <span className="text-xs bg-gray-200 text-gray-500 px-2 py-1 rounded-full">
                      읽음
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span className={post.isVisited ? 'text-gray-400' : 'text-gray-500'}>
                    {getRelativeTime(post.pubDate)}
                  </span>
                  {post.category && (
                    <>
                      <span className="text-gray-300">•</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        post.isVisited 
                          ? 'bg-gray-200 text-gray-500' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {post.category}
                      </span>
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