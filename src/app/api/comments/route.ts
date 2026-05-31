import { NextRequest, NextResponse } from 'next/server';
import { BlogComment } from '@/domain/comment/types';

/**
 * blogId → blogNo (= cbox groupId) 메모리 캐시
 *
 * Naver cbox 댓글 API는 objectId가 "{blogNo}_201_{logNo}" 형식이라
 * blogNo가 필수. blogNo는 블로그별로 다르고 모바일 게시글 페이지 HTML에
 * "blogNo = '...';" 형태로 노출됨.
 *
 * 캐시: 블로그당 한 번만 추출. 서버리스 콜드 스타트 시 캐시 손실은
 * 첫 호출 1회만 추가 fetch로 흡수 (성능 영향 최소).
 *
 * 알려진 매핑(검증된 값) — 첫 호출 latency 절감용 시드:
 *   - ranto28 (메르) → 35863879
 */
const blogNoCache = new Map<string, string>([['ranto28', '35863879']]);

/**
 * 게시글 모바일 페이지에서 blogNo 추출
 * - 성공 시 캐시 저장
 * - 실패 시 null 반환
 */
async function fetchBlogNo(blogId: string, logNo: string): Promise<string | null> {
  const cached = blogNoCache.get(blogId);
  if (cached) return cached;
  try {
    const res = await fetch(
      `https://m.blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}&logNo=${encodeURIComponent(logNo)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
          Accept: 'text/html',
        },
        cache: 'no-store',
      },
    );
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/blogNo\s*=\s*['"](\d+)['"]/);
    if (!m) return null;
    const blogNo = m[1];
    blogNoCache.set(blogId, blogNo);
    return blogNo;
  } catch {
    return null;
  }
}

function normalizeComment(raw: Record<string, unknown>): BlogComment {
  return {
    commentNo: Number(raw.commentNo ?? raw.commentNo ?? 0),
    parentCommentNo: raw.parentCommentNo ? Number(raw.parentCommentNo) : undefined,
    replyLevel: Number(raw.replyLevel ?? 1),
    userName: (raw.userName as string) || undefined,
    maskedUserName: (raw.maskedUserName as string) || undefined,
    profileUserId: (raw.profileUserId as string) || undefined,
    userProfileImage: (raw.userProfileImage as string) || undefined,
    // 블로그 주인장 식별 (cbox 응답 필드 실측)
    isBlogOwner:
      raw.isBlogOwner === true ||
      raw.writerProfileUserRoleCode === 'OWNER' ||
      raw.userRoleInfo === 'OWNER',
    writerProfileUserRoleCode: (raw.writerProfileUserRoleCode as string) || undefined,
    // 좋아요
    sympathyCount: raw.sympathyCount !== undefined ? Number(raw.sympathyCount) : 0,
    // 비밀 댓글
    isSecret: raw.secret === true || raw.isSecret === true || (raw.contents as string) === '',
    // 내용
    contents: (raw.contents as string) ?? '',
    regTime: (raw.regTime as string) || undefined,
    regTimeGmt: (raw.regTimeGmt as string) || undefined,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const postId = searchParams.get('postId');
  const blogId = searchParams.get('blogId') || 'ranto28';

  if (!postId) {
    return NextResponse.json({ error: 'postId is required' }, { status: 400 });
  }

  // blogNo (= cbox groupId) 동적 추출
  const groupId = await fetchBlogNo(blogId, postId);
  if (!groupId) {
    return NextResponse.json(
      { success: false, message: 'Failed to resolve blogNo', result: { commentList: [] } },
      { status: 200 },
    );
  }
  const objectId = `${groupId}_201_${postId}`;

  try {
    const allComments = await fetchAllNaverComments({
      blogId,
      logNo: postId,
      groupId,
      objectId,
    });
    return NextResponse.json({
      success: true,
      result: { commentList: allComments },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Failed to fetch comments', result: { commentList: [] } },
      { status: 500 }
    );
  }
}

async function fetchAllNaverComments({
  blogId,
  logNo,
  groupId,
  objectId,
}: {
  blogId: string;
  logNo: string;
  groupId: string;
  objectId: string;
}): Promise<BlogComment[]> {
  let allComments: BlogComment[] = [];

  const baseParams = {
    ticket: 'blog',
    templateId: 'default',
    pool: 'blogid',
    _cv: '20250625161346',
    lang: 'ko',
    country: '',
    objectId,
    categoryId: '',
    pageSize: '50',
    indexSize: '10',
    groupId,
    listType: 'OBJECT',
    pageType: 'default',
    followSize: '5',
    userType: '',
    useAltSort: 'true',
    replyPageSize: '10',
    showReply: 'true',
  };

  const headers = {
    accept: '*/*',
    'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    referer: `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`,
  };

  // 첫 페이지 요청
  const initParams = new URLSearchParams({
    ...baseParams,
    _callback: `jQuery_${Date.now()}`,
    page: '1',
    initialize: 'true',
    _: Date.now().toString(),
  });

  const initRes = await fetch(
    `https://apis.naver.com/commentBox/cbox/web_naver_list_jsonp.json?${initParams}`,
    { headers }
  );
  const initText = await initRes.text();
  const initJson = JSON.parse(initText.replace(/^[^(]*\(|\);?$/g, ''));

  if (!initJson.success) return [];

  const totalPages: number = initJson?.result?.pageModel?.totalPages ?? 1;
  const currentPage: number = initJson?.result?.pageModel?.page ?? 1;
  const initRaw: Record<string, unknown>[] = initJson?.result?.commentList ?? [];
  allComments = initRaw.map(normalizeComment);

  // 나머지 페이지 병렬 요청 (Vercel Hobby 타임아웃 대응)
  const otherPages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p !== currentPage
  );

  const pageResults = await Promise.allSettled(
    otherPages.map(async (page) => {
      const params = new URLSearchParams({
        ...baseParams,
        _callback: `jQuery_${Date.now()}`,
        page: page.toString(),
        currentPage: currentPage.toString(),
        refresh: 'false',
        sort: 'REVERSE_NEW',
        _: Date.now().toString(),
      });
      const res = await fetch(
        `https://apis.naver.com/commentBox/cbox/web_naver_list_jsonp.json?${params}`,
        { headers }
      );
      const text = await res.text();
      const json = JSON.parse(text.replace(/^[^(]*\(|\);?$/g, ''));
      if (!json.success) return [] as BlogComment[];
      return ((json?.result?.commentList ?? []) as Record<string, unknown>[]).map(normalizeComment);
    })
  );

  for (const result of pageResults) {
    if (result.status === 'fulfilled') {
      allComments = allComments.concat(result.value);
    }
  }

  return allComments;
}
