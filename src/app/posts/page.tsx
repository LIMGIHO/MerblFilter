import { XMLParser } from 'fast-xml-parser';
import Link from 'next/link';
import Image from 'next/image';

async function fetchPosts() {
  const res = await fetch('https://rss.blog.naver.com/ranto28.xml');
  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const data = parser.parse(xml);
  const items = data.rss.channel.item as Array<any>;
  const image = data.rss.channel.image.url;
  const author = data.rss.channel.title.replace('의 블로그', '');

  return items.map((item) => ({
    author: author,
    image: image,
    title: item.title,
    link: item.link,
    postId: item.link.split('/').pop().split('?')[0],
    pubDate: item.pubDate,
    tag: item.tag || '',
    category: item.category || '',
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
  // console.log("===", posts);
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-xl font-bold">Posts</h1>
      <ul className="space-y-4">
        {posts.map((post) => (
          <Link
            key={post.postId}
            href={`/posts/${post.postId}`}
            className="block group"
          >
            <li
              className="bg-white rounded-xl shadow-md transition-all p-5 flex items-start space-x-4 border border-gray-100 cursor-pointer
              group-hover:shadow-2xl group-hover:bg-blue-50 group-hover:border-blue-500 group-hover:text-blue-900 group-hover:scale-[1.02]"
            >
              <Image src={post.image} alt="blogger icon" width={40} height={40} className="mt-1" />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-xs text-gray-400 mb-1">{post.author} · {timeAgo(post.pubDate)}</span>
                <span className="font-semibold text-lg text-gray-900 truncate">
                  {post.title}
                </span>
                {(post.tag || post.category) && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {post.category && (
                      <span className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5">{post.category}</span>
                    )}
                    {post.tag && (
                      <span className="text-xs bg-blue-100 text-blue-600 rounded px-2 py-0.5">#{post.tag}</span>
                    )}
                  </div>
                )}
              </div>
            </li>
          </Link>
        ))}
      </ul>
    </main>
  );
}
