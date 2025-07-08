'use client';

import { signIn, signOut, useSession } from 'next-auth/react';
import Image from 'next/image';

export default function NaverLoginButton() {
  const { data: session } = useSession();

  if (session) {
    return (
      <button
        onClick={() => signOut()}
        className="flex items-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
      >
        <Image src="/globe.svg" alt="Naver" width={20} height={20} />
        <span>로그아웃</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => signIn('naver')}
      className="flex items-center space-x-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
    >
      <Image src="/globe.svg" alt="Naver" width={20} height={20} />
      <span>네이버 로그인</span>
    </button>
  );
} 