import { describe, it, expect } from 'vitest';
import { applyFilters, evaluateComment, isOwnerComment } from '../src/domain/filter/filterEngine';
import { DEFAULT_FILTER_SETTINGS, FilterSettings } from '../src/domain/filter/filterSettings';
import { BlogComment } from '../src/domain/comment/types';

// ── 헬퍼 ──────────────────────────────────────────────────────────────
function makeComment(overrides: Partial<BlogComment> = {}): BlogComment {
  return {
    commentNo: 1,
    replyLevel: 1,
    contents: '테스트 댓글',
    sympathyCount: 0,
    ...overrides,
  };
}

const settings = (overrides: Partial<FilterSettings> = {}): FilterSettings => ({
  ...DEFAULT_FILTER_SETTINGS,
  ...overrides,
});

// ── isOwnerComment ────────────────────────────────────────────────────
describe('isOwnerComment', () => {
  it('isBlogOwner=true → owner', () => {
    expect(isOwnerComment(makeComment({ isBlogOwner: true }), 'ranto28')).toBe(true);
  });
  it('writerProfileUserRoleCode=OWNER → owner', () => {
    expect(isOwnerComment(makeComment({ writerProfileUserRoleCode: 'OWNER' }), 'ranto28')).toBe(true);
  });
  it('profileUserId=ranto28 → owner', () => {
    expect(isOwnerComment(makeComment({ profileUserId: 'ranto28' }), 'ranto28')).toBe(true);
  });
  it('일반 댓글 → not owner', () => {
    expect(isOwnerComment(makeComment({ userName: '홍길동', profileUserId: 'hong123' }), 'ranto28')).toBe(false);
  });
});

// ── ownerOnly 필터 ────────────────────────────────────────────────────
describe('ownerOnly 필터', () => {
  const s = settings({ ownerOnly: true });

  it('주인장 원댓글 → 표시', () => {
    const result = applyFilters([makeComment({ isBlogOwner: true })], s, 'ranto28');
    expect(result[0]._isHidden).toBe(false);
  });

  it('일반 댓글 (대댓글 없음) → 숨김', () => {
    const result = applyFilters([makeComment({ commentNo: 10 })], s, 'ranto28');
    expect(result[0]._isHidden).toBe(true);
    expect(result[0]._hiddenReason).toBe('owner_only');
  });

  it('일반 원댓글이지만 주인장 대댓글 있음 → 표시', () => {
    const flat: BlogComment[] = [
      makeComment({ commentNo: 1, replyLevel: 1, profileUserId: 'user1' }),
      makeComment({ commentNo: 2, replyLevel: 2, parentCommentNo: 1, isBlogOwner: true }),
    ];
    const result = applyFilters(flat, s, 'ranto28');
    expect(result[0]._isHidden).toBe(false);
  });
});

// ── 좋아요 필터 ────────────────────────────────────────────────────────
describe('minLikes 필터', () => {
  const s = settings({ enableLikeFilter: true, minLikes: 10 });

  it('좋아요 >= minLikes → 표시', () => {
    const result = applyFilters([makeComment({ sympathyCount: 15 })], s, 'ranto28');
    expect(result[0]._isHidden).toBe(false);
  });

  it('좋아요 < minLikes → 숨김', () => {
    const result = applyFilters([makeComment({ sympathyCount: 5 })], s, 'ranto28');
    expect(result[0]._isHidden).toBe(true);
    expect(result[0]._hiddenReason).toBe('min_likes');
  });

  it('sympathyCount 없으면 0으로 처리', () => {
    const result = applyFilters([makeComment({ sympathyCount: undefined })], s, 'ranto28');
    expect(result[0]._isHidden).toBe(true);
  });
});

// ── 차단 사용자 필터 ──────────────────────────────────────────────────
describe('blockedUsers 필터', () => {
  const s = settings({ enableUserFilter: true, blockedUsers: ['스팸왕'], blockedUsersPartialMatch: false });

  it('완전일치 차단 → 숨김', () => {
    const result = applyFilters([makeComment({ userName: '스팸왕' })], s, 'ranto28');
    expect(result[0]._isHidden).toBe(true);
    expect(result[0]._hiddenReason).toBe('blocked_user');
  });

  it('완전일치 아님 → 표시', () => {
    const result = applyFilters([makeComment({ userName: '스팸왕123' })], s, 'ranto28');
    expect(result[0]._isHidden).toBe(false);
  });

  it('부분일치 모드 → 포함되면 숨김', () => {
    const sp = settings({ enableUserFilter: true, blockedUsers: ['스팸'], blockedUsersPartialMatch: true });
    const result = applyFilters([makeComment({ userName: '스팸왕123' })], sp, 'ranto28');
    expect(result[0]._isHidden).toBe(true);
  });
});

// ── 즐겨찾기 필터 ────────────────────────────────────────────────────
describe('favoriteUsers 필터', () => {
  const s = settings({ enableFavoriteFilter: true, favoriteUsers: ['VIP유저'] });

  it('즐겨찾기 유저 → 표시', () => {
    const result = applyFilters([makeComment({ userName: 'VIP유저' })], s, 'ranto28');
    expect(result[0]._isHidden).toBe(false);
  });

  it('즐겨찾기 아닌 유저 → 숨김', () => {
    const result = applyFilters([makeComment({ userName: '일반인' })], s, 'ranto28');
    expect(result[0]._isHidden).toBe(true);
    expect(result[0]._hiddenReason).toBe('not_favorite');
  });
});

// ── 키워드 검색 필터 ──────────────────────────────────────────────────
describe('searchKeyword 필터', () => {
  const s = settings({ enableSearchFilter: true, searchKeyword: '부동산' });

  it('키워드 포함 → 표시', () => {
    const result = applyFilters([makeComment({ contents: '부동산 시장 어떰?' })], s, 'ranto28');
    expect(result[0]._isHidden).toBe(false);
  });

  it('키워드 미포함 → 숨김', () => {
    const result = applyFilters([makeComment({ contents: '오늘 날씨 좋네요' })], s, 'ranto28');
    expect(result[0]._isHidden).toBe(true);
    expect(result[0]._hiddenReason).toBe('keyword_mismatch');
  });

  it('정규식 모드', () => {
    const sr = settings({ enableSearchFilter: true, searchKeyword: '부동산|주식', searchKeywordRegex: true });
    expect(applyFilters([makeComment({ contents: '주식 얘기' })], sr, 'ranto28')[0]._isHidden).toBe(false);
    expect(applyFilters([makeComment({ contents: '날씨 좋다' })], sr, 'ranto28')[0]._isHidden).toBe(true);
  });
});

// ── 필터 없음 ─────────────────────────────────────────────────────────
describe('기본 필터 설정 (모두 비활성)', () => {
  it('모든 댓글 표시', () => {
    const comments = [
      makeComment({ commentNo: 1, contents: '댓글1' }),
      makeComment({ commentNo: 2, contents: '댓글2' }),
    ];
    const result = applyFilters(comments, DEFAULT_FILTER_SETTINGS, 'ranto28');
    expect(result.every((c) => !c._isHidden)).toBe(true);
  });
});
