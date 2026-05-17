import { NextRequest, NextResponse } from 'next/server';

/**
 * 네이버 블로그 게시글 본문 텍스트 추출
 * 모바일 페이지(m.blog.naver.com)에서 본문을 가져와 HTML 태그 제거 후 plain text 반환.
 */

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x[0-9a-f]+;/gi, '')
    .replace(/&#\d+;/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractBody(html: string): string {
  // 우선순위: SmartEditor3 → 구형 postViewArea → 전체 폴백
  const patterns = [
    /<div[^>]*class="[^"]*se-main-container[^"]*"[^>]*>([\s\S]*?)<div[^>]*class="post_btn_area/,
    /<div[^>]*class="[^"]*se-main-container[^"]*"[^>]*>([\s\S]*?)<\/section>/,
    /<div[^>]*id=["']postViewArea["'][^>]*>([\s\S]*?)<div[^>]*class="post_btn_area/,
    /<div[^>]*id=["']postViewArea["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return stripHtml(m[1]);
  }
  return '';
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const postId = searchParams.get('postId');
  const blogId = searchParams.get('blogId') ?? 'ranto28';

  if (!postId) {
    return NextResponse.json({ content: '', error: 'postId required' }, { status: 400 });
  }

  try {
    const url = `https://m.blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${postId}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ content: '', error: `HTTP ${res.status}` }, { status: 200 });
    }

    const html = await res.text();
    const content = extractBody(html);

    return NextResponse.json({ content, length: content.length });
  } catch (e) {
    return NextResponse.json({ content: '', error: String(e) }, { status: 200 });
  }
}
