import { XMLParser } from 'fast-xml-parser';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const blogId = searchParams.get('blogId') ?? 'ranto28';

  try {
    const res = await fetch(`https://rss.blog.naver.com/${blogId}.xml`, {
      cache: 'no-store',
    });
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const data = parser.parse(xml);
    const items = Array.isArray(data.rss.channel.item)
      ? data.rss.channel.item
      : [data.rss.channel.item];
    const image = data.rss.channel.image?.url ?? '';
    const author = String(data.rss.channel.title ?? '').replace('의 블로그', '');

    const posts = items.map((item: Record<string, unknown>) => ({
      author,
      image,
      title: item.title,
      link: item.link,
      postId: String(item.link).split('/').pop()?.split('?')[0] ?? '',
      pubDate: item.pubDate,
      tag: item.tag ?? '',
      category: item.category ?? '',
    }));

    return NextResponse.json(posts);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
