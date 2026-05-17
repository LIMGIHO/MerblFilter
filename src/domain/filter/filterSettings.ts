const normalizeList = (list?: unknown[]): string[] =>
  Array.from(
    new Set(
      (Array.isArray(list) ? list : [])
        .map((name) => (typeof name === 'string' ? name.trim() : ''))
        .filter(Boolean)
    )
  );

export type FilterSettings = {
  minLikes: number;
  enableLikeFilter: boolean;
  enableUserFilter: boolean;
  blockedUsers: string[];
  /** 부분일치 허용 여부 (기본 true) */
  blockedUsersPartialMatch: boolean;
  ownerOnly: boolean;
  enableSearchFilter: boolean;
  searchKeyword: string;
  /** 정규식 모드 (웹 추가) */
  searchKeywordRegex: boolean;
  enablePostSearchFilter: boolean;
  postSearchKeyword: string;
  enablePostSearchDeepScan: boolean;
  enableFavoriteFilter: boolean;
  favoriteUsers: string[];
};

export const FILTER_SETTINGS_KEY = '@filter_settings';

export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
  minLikes: 20,
  enableLikeFilter: false,
  enableUserFilter: false,
  blockedUsers: [],
  blockedUsersPartialMatch: true,
  ownerOnly: false,
  enableSearchFilter: false,
  searchKeyword: '',
  searchKeywordRegex: false,
  enablePostSearchFilter: false,
  postSearchKeyword: '',
  enablePostSearchDeepScan: false,
  enableFavoriteFilter: false,
  favoriteUsers: [],
};

export const normalizeFilterSettings = (
  input?: Partial<FilterSettings>
): FilterSettings => {
  const base = { ...DEFAULT_FILTER_SETTINGS, ...(input ?? {}) };
  const minLikes = parseInt(String(base.minLikes ?? DEFAULT_FILTER_SETTINGS.minLikes), 10);

  return {
    ...base,
    minLikes:
      Number.isFinite(minLikes) && minLikes >= 0
        ? minLikes
        : DEFAULT_FILTER_SETTINGS.minLikes,
    blockedUsers: normalizeList(base.blockedUsers),
    favoriteUsers: normalizeList(base.favoriteUsers),
    searchKeyword:
      typeof base.searchKeyword === 'string' ? base.searchKeyword.trim() : '',
    postSearchKeyword:
      typeof base.postSearchKeyword === 'string' ? base.postSearchKeyword.trim() : '',
    enablePostSearchDeepScan: !!base.enablePostSearchDeepScan,
    searchKeywordRegex: !!base.searchKeywordRegex,
    blockedUsersPartialMatch: base.blockedUsersPartialMatch !== false,
  };
};
