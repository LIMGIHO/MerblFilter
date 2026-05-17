import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'merblFilter v2',
  description: '메르님 블로그 댓글 필터 — 웹 버전',
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
