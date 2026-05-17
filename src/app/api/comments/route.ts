import { NextRequest, NextResponse } from 'next/server';
import { BlogComment } from '@/domain/comment/types';

// blogId별 groupId 매핑 (ranto28 고정값 — 다른 블로그는 동적 추출 필요)
const BLOG_CONFIG: Record<string, { groupId: string }> = {
  ranto28: { groupId: '35863879' },
};

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

  const config = BLOG_CONFIG[blogId];
  const groupId = config?.groupId ?? '35863879';
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
