'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

interface Post {
  author: string;
  image: string;
  title: string;
  link: string;
  postId: string;
  pubDate: string;
  isVisited: boolean;
  category: string;
  tag: string;
  thumbnail?: string;
}

export default function PostList({ initialPosts = [] }: { initialPosts?: Post[] }) {
  const { data: session } = useSession();
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchPosts = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/posts');
        const data = await res.json();
        const postsWithIds = (data || []).map((post: Post) => ({
          ...post,
          postId: post.postId || post.link.split('/').pop() || Math.random().toString(36).substring(7),
          category: post.category || '',
          tag: post.tag || ''
        }));
        setPosts(postsWithIds);
      } catch (error) {
        console.error('Failed to fetch posts:', error);
        const initialPostsWithIds = initialPosts.map(post => ({
          ...post,
          postId: post.postId || post.link.split('/').pop() || Math.random().toString(36).substring(7),
          category: post.category || '',
          tag: post.tag || ''
        }));
        setPosts(initialPostsWithIds);
      } finally {
        setIsLoading(false);
      }
    };

    if (session) {
      fetchPosts();
    } else {
      const initialPostsWithIds = initialPosts.map(post => ({
        ...post,
        postId: post.postId || post.link.split('/').pop() || Math.random().toString(36).substring(7),
        category: post.category || '',
        tag: post.tag || ''
      }));
      setPosts(initialPostsWithIds);
    }
  }, [session, initialPosts]);

  const handlePostClick = async (post: Post) => {
    setPosts(prevPosts =>
      prevPosts.map(p =>
        p.postId === post.postId ? { ...p, isVisited: true } : p
      )
    );
  };

  if (isLoading) {
    return <div className="text-center py-4">로딩 중...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-4">
      <div className="space-y-4">
        {(posts || []).map((post, index) => {
          const key = post.postId || `post-${index}`;
          return (
            <div
              key={key}
              className={`block p-4 bg-white rounded-lg border border-gray-200 shadow-md hover:shadow-lg transition-shadow ${
                post.isVisited ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start space-x-3">
                <div className="flex flex-col items-center space-y-1">
                  {post.image && (
                    <Image
                      src={post.image}
                      alt={`${post.author} 프로필`}
                      width={40}
                      height={40}
                      className="rounded-full"
                    />
                  )}
                  <span className="text-xs font-medium text-gray-700">{post.author}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-start gap-3 mb-2">
                    {post.thumbnail && (
                      <Image
                        src={post.thumbnail}
                        alt={post.title}
                        width={100}
                        height={100}
                        className="rounded-md object-cover"
                      />
                    )}
                    <div className="flex-1">
                      <Link
                        href={`/posts/${post.postId}`}
                        onClick={() => handlePostClick(post)}
                        className={`text-lg font-semibold mb-1 hover:text-blue-600 block ${
                          post.isVisited ? 'text-gray-500' : 'text-gray-900'
                        }`}
                      >
                        {post.title}
                      </Link>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-500">
                          {formatDistanceToNow(new Date(post.pubDate), {
                            addSuffix: true,
                            locale: ko,
                          })}
                        </span>
                        {post.category && (
                          <>
                            <span className="text-gray-400">•</span>
                            <span className="text-blue-600">
                              {post.category}
                            </span>
                          </>
                        )}
                        {post.tag && (
                          <>
                            <span className="text-gray-400">•</span>
                            <span className="text-gray-500">
                              {post.tag}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 md:hidden">
                    <a
                      href={post.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handlePostClick(post)}
                      className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      게시글 보기
                    </a>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
} 