'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useReadPostsStore } from '@/store/readPostsStore';
import { useTtsPlaylistStore } from '@/store/ttsPlaylistStore';
import dynamic from 'next/dynamic';
import type { SelectedPost } from '@/features/llm/AISidePanel';

const AISidePanel = dynamic(() => import('@/features/llm/AISidePanel'), { ssr: false });
const TTSPlayer = dynamic(() => import('@/features/tts/TTSPlayer'), { ssr: false });

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

const PANEL_DEFAULT = 420;
const PANEL_MIN = 320;
const PANEL_MAX = 800;
const STORAGE_KEY = '@ai_panel_width';

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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // TTS 플레이리스트
  const { add: addToPlaylist, remove: removeFromPlaylist, has: isInPlaylist } = useTtsPlaylistStore();

  // AI 사이드 패널 상태
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<SelectedPost | null>(null);
  const [panelWidth, setPanelWidth] = useState<number>(PANEL_DEFAULT);
  const [isDesktop, setIsDesktop] = useState(false);

  // 저장된 너비 hydration
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const w = parseInt(saved, 10);
        if (!Number.isNaN(w) && w >= PANEL_MIN && w <= PANEL_MAX) setPanelWidth(w);
      }
    } catch {}
  }, []);

  // 너비 변경 시 저장
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(panelWidth)); } catch {}
  }, [panelWidth]);

  // 데스크탑 여부 감지
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // scrollTo 처리
  useEffect(() => {
    if (scrollToId && postsRef.current) {
      const el = document.getElementById(`post-${scrollToId}`);
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scrollToId]);

  function handleAIClick(post: Post) {
    const sp: SelectedPost = { postId: post.postId, blogId: 'ranto28', title: post.title };
    if (panelOpen && selectedPost?.postId === post.postId) {
      setPanelOpen(false);
    } else {
      setSelectedPost(sp);
      setPanelOpen(true);
    }
  }

  // 데스크탑에서만 마진 적용
  const shiftStyle: React.CSSProperties =
    isDesktop && panelOpen ? { marginRight: `${panelWidth}px` } : {};

  return (
    <>
      <div style={shiftStyle}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
          {/* 헤더 */}
          <header className="flex items-center gap-3 mb-8 pb-5 border-b border-slate-200 dark:border-slate-800">
            <div className="w-11 h-11 rounded-xl bg-teal-600 dark:bg-teal-500 flex items-center justify-center text-white font-bold text-xl tracking-tight">
              M
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 leading-tight">메르님 블로그</h1>
              <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mt-0.5">ranto28.blog.naver.com</p>
            </div>
          </header>

          {/* 게시글 목록 */}
          <ul className="space-y-3" ref={postsRef}>
            {posts.map((post, index) => {
              const read = mounted && isRead(post.postId);
              const isActive = panelOpen && selectedPost?.postId === post.postId;

              return (
                <li
                  key={post.postId || `post-${index}`}
                  id={`post-${post.postId || index}`}
                  className={`rounded-lg border transition-colors duration-150
                    ${read
                      ? 'opacity-50 bg-slate-100/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }
                    ${isActive ? '!opacity-100 !border-teal-500 dark:!border-teal-500 ring-1 ring-teal-500/30 dark:ring-teal-500/30' : ''}`}
                >
                  <div className="flex items-start gap-4 p-4 sm:p-5">
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
                          <h2 className={`text-base sm:text-lg font-semibold leading-snug tracking-tight
                            ${read ? 'text-slate-400 dark:text-slate-600 line-through' : 'text-slate-900 dark:text-slate-100'}`}>
                            {post.title}
                          </h2>
                        </a>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleAIClick(post)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                              ${isActive
                                ? 'bg-teal-600 dark:bg-teal-500 text-white'
                                : 'text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            aria-label="AI 어시스턴트 열기"
                          >
                            <span className="text-sm leading-none">✦</span>
                            <span>AI</span>
                          </button>
                          <button
                            onClick={() => {
                              const inList = isInPlaylist(post.postId);
                              if (inList) {
                                removeFromPlaylist(post.postId);
                              } else {
                                addToPlaylist({ postId: post.postId, blogId: 'ranto28', title: post.title });
                              }
                            }}
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-sm font-bold transition-colors
                              ${isInPlaylist(post.postId)
                                ? 'bg-teal-500 text-white'
                                : 'text-slate-400 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            aria-label="재생 목록에 추가"
                            title={isInPlaylist(post.postId) ? '목록에서 제거' : '재생 목록에 추가'}
                          >
                            {isInPlaylist(post.postId) ? '♪' : '+'}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-500 flex-wrap mt-1.5">
                        <span>{getRelativeTime(post.pubDate)}</span>
                        {read && (
                          <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-600">
                            읽음
                          </span>
                        )}
                        {post.category && (
                          <>
                            <span className="text-slate-300 dark:text-slate-700">·</span>
                            <span className="text-slate-600 dark:text-slate-400">
                              {post.category}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* AI 사이드 패널 */}
      <AISidePanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        selectedPost={selectedPost}
        width={panelWidth}
        onWidthChange={setPanelWidth}
        minWidth={PANEL_MIN}
        maxWidth={PANEL_MAX}
      />

      {/* TTS 플로팅 플레이어 */}
      <TTSPlayer />
    </>
  );
}
