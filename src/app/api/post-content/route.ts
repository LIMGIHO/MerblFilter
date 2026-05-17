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

/**
 * div depth tracking으로 본문 컨테이너의 진짜 끝을 찾아냄
 * (Naver 모바일 페이지는 `post_btn_area` 같은 마커가 없어서 regex로는 한계)
 */
function extractByDepth(html: string, openTagRegex: RegExp): string {
  const startMatch = html.match(openTagRegex);
  if (!startMatch || startMatch.index === undefined) return '';

  const contentStart = startMatch.index + startMatch[0].length;
  let depth = 1;
  let i = contentStart;

  while (i < html.length && depth > 0) {
    const openIdx = html.indexOf('<div', i);
    const closeIdx = html.indexOf('</div>', i);
    if (closeIdx === -1) break;
    if (openIdx !== -1 && openIdx < closeIdx) {
      depth += 1;
      i = openIdx + 4;
    } else {
      depth -= 1;
      if (depth === 0) return html.slice(contentStart, closeIdx);
      i = closeIdx + 6;
    }
  }
  return '';
}

function extractBody(html: string): string {
  // SmartEditor3 (최신 네이버 블로그)
  let raw = extractByDepth(html, /<div[^>]*class="[^"]*se-main-container[^"]*"[^>]*>/);
  if (!raw) {
    // 구형 SmartEditor2
    raw = extractByDepth(html, /<div[^>]*id=["']postViewArea["'][^>]*>/);
  }
  if (!raw) {
    // 더 구형
    raw = extractByDepth(html, /<div[^>]*class="[^"]*post_ct[^"]*"[^>]*>/);
  }
  return raw ? stripHtml(raw) : '';
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
