'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useReadPostsStore } from '@/store/readPostsStore';
import { useTtsPlaylistStore } from '@/store/ttsPlaylistStore';
import { useUiStore } from '@/store/uiStore';
import { useBlogStore } from '@/store/blogStore';
import dynamic from 'next/dynamic';
import type { SelectedPost } from '@/features/llm/AISidePanel';
import { AISidePanelBoundary } from '@/components/AISidePanelBoundary';
// 네이버 읽음 처리 — SameSite=Lax 쿠키 정책으로 cross-site 호출 불가 (Chrome 80+)
// 코드는 보존 (크롬 확장 개발 시 재활용 예정). 호출은 비활성화.
// import { markNaverPostAsRead } from '@/lib/naverRead';

const AISidePanel = dynamic(() => import('@/features/llm/AISidePanel'), { ssr: false });
const CommentsPanel = dynamic(() => import('./CommentsPanel'), { ssr: false });

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

// 네이버 블로그 URL 또는 ID 에서 blogId 추출
function parseBlogId(input: string): string {
  const trimmed = input.trim();
  // https://blog.naver.com/ranto28 or https://m.blog.naver.com/ranto28/...
  const urlMatch = trimmed.match(/blog\.naver\.com\/([^/?#]+)/);
  if (urlMatch) return urlMatch[1];
  // just the ID itself
  return trimmed.replace(/\/$/, '');
}

// 패널 모드: null = 닫힘, 'ai' = AI 패널, 'comments' = 댓글 패널
type PanelMode = 'ai' | 'comments' | null;

export default function PostList() {
  const searchParams = useSearchParams();
  const scrollToId = searchParams.get('scrollTo');
  const postsRef = useRef<HTMLUListElement>(null);

  // ── 블로그 스토어 ──────────────────────────────────────────
  const { blogs, activeBlogId, addBlog, removeBlog, setActiveBlog } = useBlogStore();
  const activeBlog = blogs.find((b) => b.blogId === activeBlogId);

  // ── 게시글 목록 ────────────────────────────────────────────
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setPostsLoading(true);
    fetch(`/api/posts?blogId=${encodeURIComponent(activeBlogId)}`)
      .then((r) => r.json())
      .then((data: Post[]) => {
        if (!cancelled) {
          setPosts(Array.isArray(data) ? data : []);
          setPostsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) { setPosts([]); setPostsLoading(false); }
      });
    return () => { cancelled = true; };
  }, [activeBlogId]);

  // ── 블로그 추가 ────────────────────────────────────────────
  const [showAddBlog, setShowAddBlog] = useState(false);
  const [newBlogInput, setNewBlogInput] = useState('');
  const [addingBlog, setAddingBlog] = useState(false);
  const [addBlogError, setAddBlogError] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showAddBlog) {
      setTimeout(() => addInputRef.current?.focus(), 50);
    }
  }, [showAddBlog]);

  async function handleAddBlog() {
    const blogId = parseBlogId(newBlogInput);
    if (!blogId) { setAddBlogError('블로그 ID를 입력해주세요.'); return; }
    if (blogs.find((b) => b.blogId === blogId)) {
      setAddBlogError('이미 추가된 블로그입니다.');
      return;
    }
    setAddingBlog(true);
    setAddBlogError('');
    try {
      const res = await fetch(`/api/posts?blogId=${encodeURIComponent(blogId)}`);
      const data: Post[] = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        setAddBlogError('블로그를 찾을 수 없거나 게시글이 없습니다.');
        setAddingBlog(false);
        return;
      }
      const name = data[0]?.author || blogId;
      addBlog({ blogId, name });
      setActiveBlog(blogId);
      setNewBlogInput('');
      setShowAddBlog(false);
    } catch {
      setAddBlogError('블로그 정보를 가져오는 중 오류가 발생했습니다.');
    } finally {
      setAddingBlog(false);
    }
  }

  // ── 기타 상태 ──────────────────────────────────────────────
  const { isRead, markAsRead } = useReadPostsStore();
  const { add: addToPlaylist, remove: removeFromPlaylist, has: isInPlaylist } = useTtsPlaylistStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ── 패널 상태 ──────────────────────────────────────────────
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [selectedPost, setSelectedPost] = useState<SelectedPost | null>(null);
  const [panelWidth, setPanelWidth] = useState<number>(PANEL_DEFAULT);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const w = parseInt(saved, 10);
        if (!Number.isNaN(w) && w >= PANEL_MIN && w <= PANEL_MAX) setPanelWidth(w);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(panelWidth)); } catch {}
  }, [panelWidth]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (scrollToId && postsRef.current) {
      const el = document.getElementById(`post-${scrollToId}`);
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scrollToId]);

  function handleAIClick(post: Post) {
    const sp: SelectedPost = { postId: post.postId, blogId: activeBlogId, title: post.title };
    if (panelMode === 'ai' && selectedPost?.postId === post.postId) {
      setPanelMode(null);
    } else {
      setSelectedPost(sp);
      setPanelMode('ai');
    }
  }

  function handleCommentsClick(post: Post) {
    const sp: SelectedPost = { postId: post.postId, blogId: activeBlogId, title: post.title };
    if (panelMode === 'comments' && selectedPost?.postId === post.postId) {
      setPanelMode(null);
    } else {
      setSelectedPost(sp);
      setPanelMode('comments');
    }
  }

  const panelOpen = panelMode !== null;
  const shiftStyle: React.CSSProperties =
    isDesktop && panelOpen ? { marginRight: `${panelWidth}px` } : {};

  const setContentPanelOffset = useUiStore((s) => s.setContentPanelOffset);
  useEffect(() => {
    setContentPanelOffset(isDesktop && panelOpen ? panelWidth : 0);
  }, [isDesktop, panelOpen, panelWidth, setContentPanelOffset]);

  return (
    <>
      <div style={shiftStyle}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-6">

          {/* ── 헤더 ── */}
          <header className="mb-8 pb-5 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              {/* 블로그 아이콘 */}
              <div className="w-11 h-11 rounded-xl bg-teal-600 dark:bg-teal-500 flex items-center justify-center text-white font-bold text-xl tracking-tight flex-shrink-0 select-none">
                {activeBlog?.name?.[0]?.toUpperCase() ?? 'B'}
              </div>

              <div className="flex-1 min-w-0">
                {/* 블로그 선택기 행 */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {blogs.length === 1 ? (
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                      {activeBlog?.name ?? activeBlogId}
                    </h1>
                  ) : (
                    <select
                      value={activeBlogId}
                      onChange={(e) => setActiveBlog(e.target.value)}
                      className="text-lg font-semibold text-slate-900 dark:text-slate-100 leading-tight bg-transparent border-none outline-none cursor-pointer pr-1"
                    >
                      {blogs.map((b) => (
                        <option key={b.blogId} value={b.blogId}>{b.name}</option>
                      ))}
                    </select>
                  )}

                  {/* 블로그 추가 버튼 */}
                  <button
                    onClick={() => { setShowAddBlog((v) => !v); setAddBlogError(''); }}
                    title="블로그 추가"
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition
                      ${showAddBlog
                        ? 'bg-teal-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:text-teal-600'
                      }`}
                  >
                    +
                  </button>

                  {/* 현재 블로그 삭제 (2개 이상일 때만) */}
                  {blogs.length > 1 && (
                    <button
                      onClick={() => removeBlog(activeBlogId)}
                      title="현재 블로그 삭제"
                      className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 transition"
                    >
                      ×
                    </button>
                  )}
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mt-0.5">
                  {activeBlogId}.blog.naver.com
                </p>
              </div>
            </div>

            {/* 블로그 추가 폼 */}
            {showAddBlog && (
              <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">블로그 추가</p>
                <div className="flex gap-2">
                  <input
                    ref={addInputRef}
                    type="text"
                    placeholder="블로그 ID 또는 URL (예: ranto28, https://blog.naver.com/...)"
                    value={newBlogInput}
                    onChange={(e) => { setNewBlogInput(e.target.value); setAddBlogError(''); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddBlog();
                      if (e.key === 'Escape') { setShowAddBlog(false); setNewBlogInput(''); }
                    }}
                    className="flex-1 text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600 outline-none focus:border-teal-400"
                  />
                  <button
                    onClick={handleAddBlog}
                    disabled={addingBlog || !newBlogInput.trim()}
                    className="text-xs px-3 py-1.5 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition disabled:opacity-40"
                  >
                    {addingBlog ? '확인 중…' : '추가'}
                  </button>
                  <button
                    onClick={() => { setShowAddBlog(false); setNewBlogInput(''); setAddBlogError(''); }}
                    className="text-xs px-2 py-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                  >
                    취소
                  </button>
                </div>
                {addBlogError && (
                  <p className="text-[11px] text-red-500 mt-1.5">{addBlogError}</p>
                )}
                <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-1.5">
                  블로그 ID, 블로그 URL, 게시글 URL 모두 지원합니다
                </p>
              </div>
            )}
          </header>

          {/* ── 게시글 목록 ── */}
          {postsLoading ? (
            <div className="text-center py-16 text-slate-400 dark:text-slate-600 text-sm">로딩 중…</div>
          ) : posts.length === 0 ? (
            <div className="text-center py-16 text-slate-400 dark:text-slate-600 text-sm">게시글이 없습니다.</div>
          ) : (
            <ul className="space-y-3" ref={postsRef}>
              {posts.map((post, index) => {
                const read = mounted && isRead(post.postId);
                const isActive = panelOpen && selectedPost?.postId === post.postId;
                const isAIActive = panelMode === 'ai' && selectedPost?.postId === post.postId;
                const isCommentsActive = panelMode === 'comments' && selectedPost?.postId === post.postId;

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
                          {/* 제목 → Naver 블로그 새 탭으로 직접 이동 */}
                          <a
                            href={`https://blog.naver.com/${activeBlogId}/${post.postId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => markAsRead(post.postId)}
                            className="flex-1 min-w-0"
                          >
                            <h2 className={`text-base sm:text-lg font-semibold leading-snug tracking-tight
                              ${read ? 'text-slate-400 dark:text-slate-600 line-through' : 'text-slate-900 dark:text-slate-100 hover:text-teal-600 dark:hover:text-teal-400'}`}>
                              {post.title}
                            </h2>
                          </a>

                          <div className="flex items-center gap-1 flex-shrink-0">
                            {/* 댓글 버튼 */}
                            <button
                              onClick={() => handleCommentsClick(post)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                                ${isCommentsActive
                                  ? 'bg-blue-500 text-white'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                              aria-label="댓글 보기"
                              title="댓글 보기"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                              </svg>
                            </button>

                            {/* AI 버튼 */}
                            <button
                              onClick={() => handleAIClick(post)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                                ${isAIActive
                                  ? 'bg-teal-600 dark:bg-teal-500 text-white'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                              aria-label="AI 어시스턴트 열기"
                            >
                              <span className="text-sm leading-none">✦</span>
                              <span>AI</span>
                            </button>

                            {/* TTS 재생목록 버튼 */}
                            <button
                              onClick={() => {
                                if (isInPlaylist(post.postId)) {
                                  removeFromPlaylist(post.postId);
                                } else {
                                  addToPlaylist({ postId: post.postId, blogId: activeBlogId, title: post.title });
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
                              <span className="text-slate-600 dark:text-slate-400">{post.category}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* AI 사이드 패널 — 모바일 디버그용 에러 바운더리 래핑 */}
      <AISidePanelBoundary onClose={() => setPanelMode(null)}>
        <AISidePanel
          isOpen={panelMode === 'ai'}
          onClose={() => setPanelMode(null)}
          selectedPost={selectedPost}
          width={panelWidth}
          onWidthChange={setPanelWidth}
          minWidth={PANEL_MIN}
          maxWidth={PANEL_MAX}
        />
      </AISidePanelBoundary>

      {/* 댓글 사이드 패널 */}
      {selectedPost && (
        <CommentsPanel
          isOpen={panelMode === 'comments'}
          onClose={() => setPanelMode(null)}
          postId={selectedPost.postId}
          blogId={selectedPost.blogId}
          title={selectedPost.title}
          width={panelWidth}
          onWidthChange={setPanelWidth}
          minWidth={PANEL_MIN}
          maxWidth={PANEL_MAX}
        />
      )}
    </>
  );
}
