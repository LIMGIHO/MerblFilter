import { XMLParser } from 'fast-xml-parser';
import { Suspense } from 'react';
import PostList from './PostList';

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  tag?: string;
  category?: string;
}

async function fetchPosts() {
  try {
    const res = await fetch('https://rss.blog.naver.com/ranto28.xml', {
      cache: 'no-store',
      next: { revalidate: 0 },
    });
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const data = parser.parse(xml);
    const items = (Array.isArray(data.rss.channel.item)
      ? data.rss.channel.item
      : [data.rss.channel.item]) as RssItem[];
    const image = data.rss.channel.image?.url ?? '';
    const author = (data.rss.channel.title as string).replace('의 블로그', '');

    return items.map((item) => ({
      author,
      image,
      title: item.title,
      link: item.link,
      postId: String(item.link).split('/').pop()?.split('?')[0] ?? '',
      pubDate: item.pubDate,
      tag: item.tag ?? '',
      category: item.category ?? '',
    }));
  } catch {
    return [];
  }
}

export default async function PostsPage() {
  const posts = await fetchPosts();

  return (
    <main className="min-h-screen">
      <Suspense fallback={<div className="text-center py-8 text-gray-400">로딩 중...</div>}>
        <PostList initialPosts={posts} />
      </Suspense>
    </main>
  );
}
