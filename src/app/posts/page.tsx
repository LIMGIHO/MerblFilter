import { parse } from 'fast-xml-parser';
import Link from 'next/link';
import Image from 'next/image';

async function fetchPosts() {
  const res = await fetch('https://rss.blog.naver.com/ranto28.xml');
  const xml = await res.text();
  const data = parse(xml, { ignoreAttributes: false });
  const items = data.rss.channel.item as Array<any>;
  return items.map((item) => ({
    title: item.title,
    link: item.link,
    postId: new URL(item.link).searchParams.get('logNo'),
    pubDate: item.pubDate,
  }));
}

function timeAgo(date: string) {
  const d = new Date(date);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export default async function PostsPage() {
  const posts = await fetchPosts();
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-xl font-bold">Posts</h1>
      <ul className="space-y-4">
        {posts.map((post) => (
          <li key={post.postId} className="flex items-start space-x-2">
            <Image src="/globe.svg" alt="blogger icon" width={24} height={24} />
            <div className="flex flex-col">
              <span className="text-sm text-gray-500">ranto28 · {timeAgo(post.pubDate)}</span>
              <Link href={`/posts/${post.postId}`} className="underline text-lg">
                {post.title}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
