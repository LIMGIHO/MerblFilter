// v2: domain/comment/types.ts 로 통합됨
export * from '@/domain/comment/types';

// 하위 호환성을 위해 Comment 타입 유지
export type Comment = import('@/domain/comment/types').BlogComment;
export type CommentWithReplies = import('@/domain/comment/types').BlogCommentWithReplies;
