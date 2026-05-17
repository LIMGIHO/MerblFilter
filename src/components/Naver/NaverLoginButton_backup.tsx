'use client';

import { useEffect, useState } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';

export default function NaverLoginButton() {
  const { data: session } = useSession();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) return null;

  if (session) {
    return (
      <button
        onClick={() => signOut()}
        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 text-sm"
      >
        <img
          src={session.user?.image || '/naver.svg'}
          alt="프로필"
          className="w-5 h-5 rounded-full"
        />
        로그아웃
      </button>
    );
  }

  return (
    <button
      onClick={async () => {
        await signIn('naver');

        // 서버를 통해 네이버 쿠키 받아오기
        try {
          const response = await fetch('/api/naver-proxy');
          const data = await response.json();
          
          if (data.success) {
            console.log('네이버 쿠키 정보:', data.cookies);
          } else {
            console.error('네이버 쿠키 수신 실패:', data.error);
          }
        } catch (error) {
          console.error('네이버 쿠키 수신 오류:', error);
        }
      }}
      className="px-4 py-2 bg-[#03C75A] text-white rounded-lg hover:bg-[#02b350] transition-colors flex items-center gap-2 text-sm"
    >
      <img
        src="/naver.svg"
        alt="네이버 로고"
        className="w-5 h-5"
      />
      네이버 로그인
    </button>
  );
} 