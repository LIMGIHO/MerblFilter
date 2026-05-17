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
    <main className="max-w-2xl mx-auto p-4 sm:p-6 min-h-screen">
      <header className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-800">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow">
          M
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">메르님 블로그</h1>
          <p className="text-xs text-gray-400">ranto28.blog.naver.com</p>
        </div>
      </header>
      <Suspense fallback={<div className="text-center py-8 text-gray-400">로딩 중...</div>}>
        <PostList initialPosts={posts} />
      </Suspense>
    </main>
  );
}
