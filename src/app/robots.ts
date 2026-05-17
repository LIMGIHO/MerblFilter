import { MetadataRoute } from 'next';

const BASE_URL = 'https://merbl-filter.vercel.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // 일반 크롤러 + 구글봇
        userAgent: ['*', 'Googlebot', 'Googlebot-Image'],
        allow: '/',
        disallow: ['/api/', '/_next/'],
      },
      {
        // 네이버 검색봇 (Yeti) — 명시적 허용
        userAgent: 'Yeti',
        allow: '/',
        disallow: ['/api/', '/_next/'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
