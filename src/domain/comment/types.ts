/**
 * Naver cbox API 응답 댓글 타입 (실측 필드 기준)
 * Phase 0: /api/comments 응답의 실제 키를 반영
 */
export interface BlogComment {
  commentNo: number;
  parentCommentNo?: number;
  replyLevel: number;

  // 작성자 정보
  userName?: string;
  maskedUserName?: string;
  profileUserId?: string;
  userProfileImage?: string;

  // 블로그 주인장 식별 (cbox 필드)
  /** cbox API: writerProfileUserRoleCode === 'OWNER' 또는 isBlogOwner */
  isBlogOwner?: boolean;
  writerProfileUserRoleCode?: string;

  // 좋아요
  sympathyCount?: number;

  // 비밀 댓글
  isSecret?: boolean;

  // 내용 및 시간
  contents: string;
  regTime?: string;
  regTimeGmt?: string;

  // 필터 엔진이 추가하는 메타 필드 (런타임 전용)
  _isHidden?: boolean;
  _hiddenReason?: string;
  _llmLabel?: 'worth_reading' | 'noise' | 'spam';
  _llmScore?: number;   // 0~100
  _llmTag?: '경험공유' | '의견있음' | 'noise' | 'spam';
}

export interface BlogCommentWithReplies extends BlogComment {
  replies: BlogComment[];
}

/** 필터 엔진 출력 */
export interface FilteredComment extends BlogCommentWithReplies {
  _isHidden: boolean;
  _hiddenReason?: string;
}
