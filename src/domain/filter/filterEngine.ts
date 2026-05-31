import { BlogComment, BlogCommentWithReplies, FilteredComment } from '@/domain/comment/types';
import { FilterSettings } from './filterSettings';

/**
 * 댓글이 블로그 주인장인지 판별
 *
 * @param c 댓글
 * @param ownerId 블로그 주인 식별자 (Naver 블로그의 경우 blogId — 예: 'ranto28', 'xpfkwh56')
 *
 * 실측 결과 Naver cbox 응답의 isBlogOwner/writerProfileUserRoleCode 플래그는
 * 대부분 비어있어 실효 신호는 profileUserId == blogId 비교가 유일하므로,
 * ownerId(=blogId)를 인자로 받아 동적 비교한다.
 */
export function isOwnerComment(c: BlogComment, ownerId: string): boolean {
  return (
    c.isBlogOwner === true ||
    c.writerProfileUserRoleCode === 'OWNER' ||
    c.profileUserId === ownerId ||
    c.userName === ownerId
  );
}

/** 차단 사용자 매칭 */
function matchesBlockedUser(
  comment: BlogComment,
  blockedUsers: string[],
  partialMatch: boolean
): boolean {
  const name = comment.userName ?? comment.maskedUserName ?? '';
  const id = comment.profileUserId ?? '';
  return blockedUsers.some((blocked) => {
    if (partialMatch) {
      return name.includes(blocked) || id.includes(blocked);
    }
    return name === blocked || id === blocked;
  });
}

/** 즐겨찾기 사용자 매칭 */
function matchesFavoriteUser(comment: BlogComment, favoriteUsers: string[]): boolean {
  const name = comment.userName ?? comment.maskedUserName ?? '';
  const id = comment.profileUserId ?? '';
  return favoriteUsers.some((fav) => name === fav || id === fav);
}

/** 키워드 검색 매칭 */
function matchesSearchKeyword(
  comment: BlogComment,
  keyword: string,
  regexMode: boolean
): boolean {
  if (!keyword) return true;
  const text = comment.contents;
  if (regexMode) {
    try {
      return new RegExp(keyword, 'i').test(text);
    } catch {
      return text.toLowerCase().includes(keyword.toLowerCase());
    }
  }
  return text.toLowerCase().includes(keyword.toLowerCase());
}

/**
 * 단일 댓글에 필터 룰을 적용하고 숨김 여부와 사유를 반환
 */
export function evaluateComment(
  comment: BlogComment,
  settings: FilterSettings
): { hidden: boolean; reason?: string } {
  // ownerOnly: 주인장 또는 주인장 답글이 있는 스레드만 (structuredComment 레벨에서 처리)
  // 여기서는 단일 댓글 레벨 룰만 평가

  // 1. 즐겨찾기 필터 (활성화 시 즐겨찾기만 표시)
  if (settings.enableFavoriteFilter && settings.favoriteUsers.length > 0) {
    if (!matchesFavoriteUser(comment, settings.favoriteUsers)) {
      return { hidden: true, reason: 'not_favorite' };
    }
  }

  // 2. 사용자 차단 필터
  if (settings.enableUserFilter && settings.blockedUsers.length > 0) {
    if (matchesBlockedUser(comment, settings.blockedUsers, settings.blockedUsersPartialMatch)) {
      return { hidden: true, reason: 'blocked_user' };
    }
  }

  // 3. 좋아요 필터
  if (settings.enableLikeFilter) {
    const likes = comment.sympathyCount ?? 0;
    if (likes < settings.minLikes) {
      return { hidden: true, reason: 'min_likes' };
    }
  }

  // 4. 검색 키워드 필터
  if (settings.enableSearchFilter && settings.searchKeyword) {
    if (!matchesSearchKeyword(comment, settings.searchKeyword, settings.searchKeywordRegex)) {
      return { hidden: true, reason: 'keyword_mismatch' };
    }
  }

  return { hidden: false };
}

/**
 * 댓글 배열을 구조화 (원댓글 + 대댓글 트리)
 */
export function structureComments(flat: BlogComment[]): BlogCommentWithReplies[] {
  const parents = flat.filter((c) => c.replyLevel === 1);
  const replies = flat.filter((c) => c.replyLevel === 2);

  return parents.map((parent) => ({
    ...parent,
    replies: replies
      .filter((r) => r.parentCommentNo === parent.commentNo)
      .sort((a, b) => {
        const da = new Date(a.regTime ?? a.regTimeGmt ?? 0).getTime();
        const db = new Date(b.regTime ?? b.regTimeGmt ?? 0).getTime();
        return da - db;
      }),
  }));
}

/**
 * 메인 필터 함수 — 순수 함수
 * structured 댓글 배열 → FilteredComment[] (hidden 플래그 포함)
 */
export function applyFilters(
  flat: BlogComment[],
  settings: FilterSettings,
  ownerId: string,
): FilteredComment[] {
  const structured = structureComments(flat);

  return structured.map((thread): FilteredComment => {
    // ownerOnly: 주인장이 원댓글이거나, 대댓글 중 주인장이 있는 스레드만
    if (settings.ownerOnly) {
      const ownerInParent = isOwnerComment(thread, ownerId);
      const ownerInReplies = thread.replies.some((r) => isOwnerComment(r, ownerId));
      if (!ownerInParent && !ownerInReplies) {
        return { ...thread, _isHidden: true, _hiddenReason: 'owner_only' };
      }
    }

    // 원댓글에 룰 적용
    const result = evaluateComment(thread, settings);
    return {
      ...thread,
      _isHidden: result.hidden,
      _hiddenReason: result.reason,
    };
  });
}

/** 보이는 댓글 수 */
export function countVisible(filtered: FilteredComment[]): number {
  return filtered.filter((c) => !c._isHidden).length;
}
