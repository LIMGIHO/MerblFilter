export interface Comment {
  commentNo: number;
  parentCommentNo?: number;
  replyLevel: number;
  userName?: string;
  maskedUserName?: string;
  profileUserId?: string;
  userProfileImage?: string;
  contents: string;
  regTime?: string;
  regTimeGmt?: string;
}

export interface CommentWithReplies extends Comment {
  replies?: Comment[];
}

export interface BlogComment {
  success: boolean;
  message?: string;
  result: {
    commentList: Comment[];
    pageModel?: {
      page: number;
      totalPages: number;
    };
  };
} 