import type { Metadata } from 'next';
import './globals.css';
import BuildSeal from '@/components/BuildSeal';
import TTSPlayerWrapper from '@/components/TTSPlayerWrapper';

const BASE_URL = 'https://merbl-filter.vercel.app';
const OG_IMAGE = `${BASE_URL}/og`;

const DESCRIPTION =
  '네이버 블로그 전용 댓글 필터 & AI 뷰어. 댓글을 자동 필터·감성 분류하고, 게시글을 AI가 요약합니다. 멀티 블로그 지원, 로컬 LLM으로 완전 무료·무서버 처리.';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: '댓글필터 — 네이버 블로그 댓글 분석기',
    template: '%s | 댓글필터',
  },
  description: DESCRIPTION,
  keywords: [
    '댓글필터', '댓글분석', '댓글분류', '네이버댓글필터', '블로그댓글필터',
    '메르', '메르블로그', '메르의블로그', '메르경제', 'ranto28',
    '네이버블로그뷰어', '블로그AI', 'AI요약', '감성분류',
    '로컬LLM', 'WebLLM', '스팸댓글', '댓글품질',
  ],
  authors: [{ name: '댓글필터' }],
  alternates: {
    canonical: BASE_URL,
  },

  // ── Open Graph (카카오·라인·슬랙 등 공유 + 네이버 검색 썸네일) ──
  openGraph: {
    type: 'website',
    url: BASE_URL,
    title: '댓글필터 — 네이버 블로그 댓글 분석기',
    description: DESCRIPTION,
    siteName: '댓글필터',
    locale: 'ko_KR',
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: '댓글필터 — 네이버 블로그 댓글 필터 & AI 뷰어',
      },
    ],
  },

  // ── Twitter/X 카드 ──
  twitter: {
    card: 'summary_large_image',
    title: '댓글필터 — 네이버 블로그 댓글 분석기',
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },

  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },

  // ── 검색엔진 인덱싱 허용 ──
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large' },
  },

  // ── 네이버·구글 인증코드 ──
  verification: {
    google: '6FDyz0MyKHqeMg0rgbUTT6Xd2ceTybyWt9TPfYLsqbU',
    other: {
      'naver-site-verification': '6df1375559dd8bc23e9e8e90da6f94a97fab1025',
    },
  },
};

// JSON-LD structured data (Google rich results + 네이버 구조화 데이터)
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${BASE_URL}/#website`,
      url: BASE_URL,
      name: '댓글필터',
      description: DESCRIPTION,
      inLanguage: 'ko-KR',
      publisher: { '@id': `${BASE_URL}/#organization` },
    },
    {
      '@type': 'Organization',
      '@id': `${BASE_URL}/#organization`,
      name: '댓글필터',
      url: BASE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${BASE_URL}/favicon.png`,
      },
    },
    {
      '@type': 'WebApplication',
      '@id': `${BASE_URL}/#webapp`,
      name: '댓글필터',
      url: BASE_URL,
      description: DESCRIPTION,
      applicationCategory: 'NewsApplication',
      operatingSystem: 'Web Browser',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
      featureList: [
        '댓글 자동 필터 & 감성 분류',
        'AI 게시글 요약 (로컬 LLM)',
        '멀티 블로그 지원',
        '완전 무료·무서버',
      ],
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-screen">
        {children}
        <BuildSeal />
        <TTSPlayerWrapper />
      </body>
    </html>
  );
}
