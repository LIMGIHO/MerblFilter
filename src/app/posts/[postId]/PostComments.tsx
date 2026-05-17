'use client';

import { useEffect, useState, useCallback } from 'react';
import { applyFilters, countVisible } from '@/domain/filter/filterEngine';
import { BlogComment } from '@/domain/comment/types';
import { useFilterStore } from '@/store/filterStore';
import FilterBar from '@/features/comments/FilterBar';
import CommentList from '@/features/comments/CommentList';
import LocalLLMPanel from '@/features/llm/LocalLLMPanel';

type LlmLabel = 'spam' | 'promo' | 'negative' | 'neutral' | 'positive';

interface PostCommentsProps {
  postId: string;
  blogId?: string;
}

function formatDate(d?: Date | null) {
  if (!d) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function PostComments({ postId, blogId = 'ranto28' }: PostCommentsProps) {
  const [rawComments, setRawComments] = useState<BlogComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [llmLabelMap, setLlmLabelMap] = useState<Record<number, LlmLabel>>({});

  const { settings } = useFilterStore();

  const filtered = applyFilters(
    rawComments.map((c) => ({ ...c, _llmLabel: llmLabelMap[c.commentNo] })),
    settings
  );
  const visibleCount = countVisible(filtered);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const loadComments = useCallback(async () => {
    if (!postId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/comments?postId=${postId}&blogId=${blogId}`);
      const data = await res.json();
      if (data.result?.commentList) {
        setRawComments(data.result.commentList);
        setLastRefresh(new Date());
        setLlmLabelMap({});
      }
    } catch (e) {
      console.error('댓글 로딩 실패:', e);
    } finally {
      setIsLoading(false);
    }
  }, [postId, blogId]);

  useEffect(() => { loadComments(); }, [loadComments]);

  return (
    <main className="p-1 sm:p-4 h-screen flex flex-col gap-2 bg-gray-50 dark:bg-gray-950">
      {/* 버튼 바 */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 flex-shrink-0">
        <button
          onClick={() => (window.location.href = `/posts?scrollTo=${postId}`)}
          className="btn btn-green"
        >
          📄 게시글 목록
        </button>

        <button
          onClick={() => setShowComments((v) => !v)}
          disabled={isLoading}
          className={`btn ${showComments ? 'btn-blue-active' : 'btn-blue'} ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          {isLoading ? (
            <><span className="spinner" /> 로딩 중...</>
          ) : (
            <>💬 {showComments ? '댓글 닫기' : '댓글 보기'}
              <span className="badge-blue">{visibleCount}/{rawComments.length}</span>
            </>
          )}
        </button>

        <button onClick={loadComments} disabled={isLoading} className="btn btn-purple">
          🔄 새로고침
          {lastRefresh && <span className="badge-purple">{formatDate(lastRefresh)}</span>}
        </button>

        {showComments && filtered.some((c) => c._isHidden) && (
          <button onClick={() => setShowHidden((v) => !v)} className="btn btn-gray text-xs">
            {showHidden ? '숨김 댓글 접기' : `숨김 ${filtered.filter((c) => c._isHidden).length}개 보기`}
          </button>
        )}

        {showComments && (
          <div className="ml-auto flex items-center gap-2">
            <LocalLLMPanel
              comments={rawComments}
              onLabelsUpdate={setLlmLabelMap}
              labelMap={llmLabelMap}
            />
            <FilterBar totalCount={rawComments.length} visibleCount={visibleCount} />
          </div>
        )}
      </div>

      {/* 컨텐츠 */}
      <div className="flex-1 min-h-0">
        {showComments ? (
          <CommentList
            comments={filtered}
            searchKeyword={settings.enableSearchFilter ? settings.searchKeyword : ''}
            regexMode={settings.searchKeywordRegex}
            showHidden={showHidden}
          />
        ) : isMobile ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 p-4 text-center text-gray-600 dark:text-gray-400">
            <p>모바일에서는 네이버 블로그를 직접 표시할 수 없습니다.</p>
            <a
              href={`https://blog.naver.com/${blogId}/${postId}`}
              target="_blank" rel="noopener noreferrer"
              className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
            >
              게시글 보기
            </a>
          </div>
        ) : (
          <iframe
            src={`https://blog.naver.com/${blogId}/${postId}`}
            className="w-full h-full border rounded-xl dark:border-gray-700"
          />
        )}
      </div>
    </main>
  );
}
