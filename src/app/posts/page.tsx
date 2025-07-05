import { parse } from 'fast-xml-parser';
import Link from 'next/link';

async function fetchPosts() {
  const res = await fetch('https://rss.blog.naver.com/ranto28.xml');
  const xml = await res.text();
  const data = parse(xml, { ignoreAttributes: false });
  const items = data.rss.channel.item as Array<any>;
  return items.map((item) => ({
    title: item.title,
    link: item.link,
    postId: new URL(item.link).searchParams.get('logNo'),
  }));
}

export default async function PostsPage() {
  const posts = await fetchPosts();
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-xl font-bold">Posts</h1>
      <ul className="space-y-2 list-disc pl-6">
        {posts.map((post) => (
          <li key={post.postId}>
            <Link href={`/posts/${post.postId}`} className="underline">
              {post.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
