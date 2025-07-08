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
}

export default function PostListCompact({ initialPosts = [] }: { initialPosts?: Post[] }) {
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
    <ul className="space-y-2">
      {(posts || []).map((post, index) => {
        const key = post.postId || `post-${index}`;
        return (
          <li 
            key={key}
            className={`border rounded-lg p-3 hover:bg-gray-50 transition-all ${
              post.isVisited ? 'opacity-60' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              {/* 프로필 이미지 */}
              {post.image && (
                <Image
                  src={post.image}
                  alt={`${post.author} 프로필`}
                  width={24}
                  height={24}
                  className="rounded-full flex-shrink-0"
                />
              )}
              
              {/* 작성자 */}
              <span className="font-medium text-sm text-gray-700 whitespace-nowrap">{post.author}</span>
              
              {/* 카테고리 */}
              {post.category && (
                <span className="text-xs bg-blue-50 text-blue-600 rounded-full px-2 py-0.5 whitespace-nowrap">
                  {post.category}
                </span>
              )}
              
              {/* 제목 */}
              <a
                href={post.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handlePostClick(post)}
                className="text-sm font-medium hover:text-blue-600 flex-grow truncate"
              >
                {post.title}
              </a>
              
              {/* 태그 */}
              {post.tag && (
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {post.tag}
                </span>
              )}
              
              {/* 작성 시간 */}
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {formatDistanceToNow(new Date(post.pubDate), { addSuffix: true, locale: ko })}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
} 