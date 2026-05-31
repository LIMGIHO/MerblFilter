'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FilteredComment } from '@/domain/comment/types';
import CommentItem from './CommentItem';

interface CommentListProps {
  comments: FilteredComment[];
  searchKeyword?: string;
  regexMode?: boolean;
  showHidden?: boolean;
  ownerId: string;
}

export default function CommentList({ comments, searchKeyword, regexMode, showHidden, ownerId }: CommentListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // 가상 스크롤: 표시할 항목만 렌더
  const rowVirtualizer = useVirtualizer({
    count: comments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

  if (comments.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400 dark:text-gray-500">
        표시할 댓글이 없습니다.
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      <ul
        style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const comment = comments[virtualItem.index];
          return (
            <li
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <div className="px-1 sm:px-2 py-1">
                <CommentItem ownerId={ownerId}
                  comment={comment}
                  searchKeyword={searchKeyword}
                  regexMode={regexMode}
                  showHidden={showHidden}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
