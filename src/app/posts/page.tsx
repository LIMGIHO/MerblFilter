import { XMLParser } from 'fast-xml-parser';
import PostList from './PostList';
import './posts.css';
import SessionManager from './SessionManager';
import NaverLoginButton from './NaverLoginButton';

async function fetchPosts() {
  const res = await fetch('https://rss.blog.naver.com/ranto28.xml', { cache: 'no-store' });
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

export default async function PostsPage() {
  const posts = await fetchPosts();

  return (
    <main className="p-6 space-y-4">
      <SessionManager />
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">Posts</h1>
        <NaverLoginButton />
      </div>
      <PostList initialPosts={posts} />
    </main>
  );
}
