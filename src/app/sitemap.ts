import { MetadataRoute } from 'next';

const BASE_URL = 'https://merbl-filter.vercel.app';

interface RssPost {
  postId: string;
  pubDate: string;
}

async function getPosts(): Promise<RssPost[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/posts?blogId=ranto28`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPosts();

  const postEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${BASE_URL}/posts/${post.postId}`,
    lastModified: post.pubDate ? new Date(post.pubDate) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/posts`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    ...postEntries,
  ];
}
