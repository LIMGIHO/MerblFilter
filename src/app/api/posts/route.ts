import { XMLParser } from 'fast-xml-parser';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 게시글 목록 API — RSS + PostTitleListAsync 병합
 *
 * 문제: 네이버 RSS feed가 일부 게시글을 누락하는 사례가 있음
 *  (RSS 인덱싱 지연, 블로거의 RSS 제외 설정 등)
 *
 * 해결: PostTitleListAsync.naver API를 함께 호출해 누락 게시글 보충
 *   - PostTitleListAsync: 완전한 게시글 목록 (제목, logNo, 카테고리, addDate)
 *   - RSS: 정확한 pubDate (ISO), 본문 발췌, author, 블로그 이미지
 *
 * 병합 전략:
 *   - PostTitleListAsync를 기본 source (완전성)
 *   - RSS의 항목과 매칭(logNo 기준) → pubDate·description 보강
 *   - PostTitleListAsync만 있는 항목(=RSS 누락)은 addDate에서 pubDate 추정
 *   - 정렬: pubDate 내림차순
 *
 * Fallback:
 *   - PostTitleListAsync 실패 → RSS만 사용 (기존 동작과 동일)
 *   - RSS 실패 → PostTitleListAsync만 사용 (author/image 빈값)
 *   - 둘 다 실패 → 빈 배열
 */

interface RssPost {
  title: string;
  link: string;
  postId: string;
  pubDate: string;
  category: string;
  tag: string;
}

interface PostListItem {
  logNo: string;
  title: string;
  categoryNo: string;
  addDate: string;
}

interface MergedPost {
  author: string;
  image: string;
  title: string;
  link: string;
  postId: string;
  pubDate: string;
  tag: string;
  category: string;
}

/** RSS feed 가져오기 */
async function fetchRss(blogId: string): Promise<{
  posts: RssPost[];
  author: string;
  image: string;
} | null> {
  try {
    const res = await fetch(`https://rss.blog.naver.com/${blogId}.xml`, { cache: 'no-store' });
    if (!res.ok) return null;
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const data = parser.parse(xml);
    if (!data?.rss?.channel) return null;
    const items = Array.isArray(data.rss.channel.item)
      ? data.rss.channel.item
      : data.rss.channel.item
        ? [data.rss.channel.item]
        : [];
    const image = data.rss.channel.image?.url ?? '';
    const author = String(data.rss.channel.title ?? '').replace('의 블로그', '');
    const posts: RssPost[] = items.map((item: Record<string, unknown>) => ({
      title: String(item.title ?? ''),
      link: String(item.link ?? ''),
      postId: String(item.link).split('/').pop()?.split('?')[0] ?? '',
      pubDate: String(item.pubDate ?? ''),
      tag: String(item.tag ?? ''),
      category: String(item.category ?? ''),
    }));
    return { posts, author, image };
  } catch {
    return null;
  }
}

/**
 * PostTitleListAsync 가져오기
 *
 * 응답: JSON-like 텍스트(일부 escape가 표준이 아니라 JSON.parse 실패 가능)
 *   → regex로 안전하게 logNo + title + addDate 추출
 */
async function fetchPostList(blogId: string, countPerPage = 30): Promise<PostListItem[] | null> {
  try {
    const url = `https://blog.naver.com/PostTitleListAsync.naver?blogId=${encodeURIComponent(blogId)}&currentPage=1&countPerPage=${countPerPage}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'application/json, text/plain, */*',
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const raw = await res.text();
    const items: PostListItem[] = [];
    // 각 게시글 객체 단위로 매칭 (escape 이슈 우회)
    const re = /"logNo":"(\d+)"[^{}]*?"title":"([^"]*)"[^{}]*?"categoryNo":"(\d+)"[^{}]*?"addDate":"([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
      items.push({
        logNo: m[1],
        title: m[2],
        categoryNo: m[3],
        addDate: m[4],
      });
    }
    return items;
  } catch {
    return null;
  }
}

/**
 * URL-encoded + "+" → 공백 + HTML entity 복원
 */
function decodePostListTitle(s: string): string {
  let t = s.replace(/\+/g, ' ');
  try {
    t = decodeURIComponent(t);
  } catch {
    // 일부 인코딩 깨짐은 그대로 둠
  }
  return t
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

/**
 * addDate → ISO-like pubDate 추정
 *   - "12시간 전" / "30분 전" / "어제" → 현재 시각 기준 상대 계산
 *   - "2026. 5. 27." → 그 날짜의 00:00:00 (정렬 안정성)
 *   - 인식 불가 → 빈 문자열
 */
function addDateToPubDate(addDate: string, now: Date = new Date()): string {
  const trimmed = addDate.trim();
  // 상대 시간
  const minMatch = trimmed.match(/^(\d+)\s*분\s*전$/);
  if (minMatch) {
    const d = new Date(now.getTime() - parseInt(minMatch[1], 10) * 60_000);
    return d.toUTCString();
  }
  const hourMatch = trimmed.match(/^(\d+)\s*시간\s*전$/);
  if (hourMatch) {
    const d = new Date(now.getTime() - parseInt(hourMatch[1], 10) * 3600_000);
    return d.toUTCString();
  }
  if (trimmed === '어제' || trimmed === '1일 전') {
    const d = new Date(now.getTime() - 24 * 3600_000);
    return d.toUTCString();
  }
  const dayMatch = trimmed.match(/^(\d+)\s*일\s*전$/);
  if (dayMatch) {
    const d = new Date(now.getTime() - parseInt(dayMatch[1], 10) * 24 * 3600_000);
    return d.toUTCString();
  }
  // 절대 날짜 "2026. 5. 27." (KST)
  const absMatch = trimmed.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?$/);
  if (absMatch) {
    const [, y, mo, d] = absMatch;
    // KST 00:00 → UTC 전날 15:00. 단순화: Date.UTC 사용해 정렬용으로만.
    const ts = Date.UTC(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10), 0, 0, 0);
    return new Date(ts - 9 * 3600_000).toUTCString();
  }
  return '';
}

/** pubDate 문자열을 정렬용 timestamp로 (실패 시 0) */
function parseTs(pubDate: string): number {
  if (!pubDate) return 0;
  const t = Date.parse(pubDate);
  return Number.isFinite(t) ? t : 0;
}

/**
 * RSS + PostList 병합
 */
function mergeFeed(
  rss: { posts: RssPost[]; author: string; image: string } | null,
  postList: PostListItem[] | null,
): MergedPost[] {
  const author = rss?.author ?? '';
  const image = rss?.image ?? '';

  // RSS만 있으면 기존 동작
  if (!postList || postList.length === 0) {
    if (!rss) return [];
    return rss.posts.map((p) => ({ author, image, ...p }));
  }

  // RSS 인덱싱 (logNo → RssPost)
  const rssIndex = new Map<string, RssPost>();
  if (rss) {
    for (const p of rss.posts) {
      if (p.postId) rssIndex.set(p.postId, p);
    }
  }

  const now = new Date();
  const merged: MergedPost[] = postList.map((p) => {
    const rssMatch = rssIndex.get(p.logNo);
    const title = decodePostListTitle(p.title);
    const link = `https://blog.naver.com/${rss?.posts[0]?.link.split('/')[3] ?? ''}/${p.logNo}`; // fallback link
    if (rssMatch) {
      return {
        author,
        image,
        title: rssMatch.title || title,
        link: rssMatch.link || link,
        postId: rssMatch.postId || p.logNo,
        pubDate: rssMatch.pubDate || addDateToPubDate(p.addDate, now),
        tag: rssMatch.tag,
        category: rssMatch.category,
      };
    }
    // RSS 누락 → PostList만으로 구성
    return {
      author,
      image,
      title,
      link,
      postId: p.logNo,
      pubDate: addDateToPubDate(p.addDate, now),
      tag: '',
      category: '', // categoryNo만 있고 이름 모름
    };
  });

  // pubDate 내림차순 정렬 (최신 먼저)
  merged.sort((a, b) => parseTs(b.pubDate) - parseTs(a.pubDate));
  return merged;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const blogId = searchParams.get('blogId') ?? 'ranto28';

  try {
    // 병렬 호출 — 한쪽 실패해도 다른 쪽 사용
    const [rss, postList] = await Promise.all([
      fetchRss(blogId),
      fetchPostList(blogId, 30),
    ]);

    const merged = mergeFeed(rss, postList);

    // link fallback 보강 — postList만 있는 항목의 link가 blogId 없을 때
    for (const p of merged) {
      if (!p.link || p.link.includes('//')) {
        p.link = `https://blog.naver.com/${blogId}/${p.postId}`;
      }
    }

    return NextResponse.json(merged);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
