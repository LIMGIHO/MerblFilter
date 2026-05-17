import type { Metadata } from 'next';
import './globals.css';
import BuildSeal from '@/components/BuildSeal';

const BASE_URL = 'https://merbl-filter.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: '메르의 블로그 — 경제·시사 분석 뷰어',
    template: '%s | 메르의 블로그',
  },
  description:
    '메르(ranto28) 네이버 블로그를 AI 요약·댓글 필터와 함께 보는 뷰어. 경제, 부동산, 시사 분석.',
  keywords: ['메르', 'mer', '메르의블로그', 'ranto28', '경제분석', '부동산', '시사', '네이버블로그', '메르블로그'],
  authors: [{ name: '메르 (ranto28)' }],
  openGraph: {
    type: 'website',
    url: BASE_URL,
    title: '메르의 블로그 — 경제·시사 분석 뷰어',
    description:
      '메르(ranto28) 네이버 블로그를 AI 요약·댓글 필터와 함께 보는 뷰어. 경제, 부동산, 시사 분석.',
    siteName: '메르의 블로그 뷰어',
    locale: 'ko_KR',
  },
  twitter: {
    card: 'summary_large_image',
    title: '메르의 블로그 — 경제·시사 분석 뷰어',
    description: '메르(ranto28) 네이버 블로그를 AI 요약·댓글 필터와 함께 보는 뷰어.',
  },
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
  other: {
    'naver-site-verification': '',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-screen">
        {children}
        <BuildSeal />
      </body>
    </html>
  );
}
