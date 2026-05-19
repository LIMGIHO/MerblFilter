'use client';

import dynamic from 'next/dynamic';

// layout.tsx(서버 컴포넌트)에서 TTSPlayer를 포함하기 위한 클라이언트 래퍼.
// dynamic + ssr:false 는 클라이언트 컴포넌트 안에서만 사용 가능.
const TTSPlayer = dynamic(() => import('@/features/tts/TTSPlayer'), { ssr: false });

export default function TTSPlayerWrapper() {
  return <TTSPlayer />;
}
