'use client';

import { useEffect, useState } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';

export default function NaverLoginButton() {
  const { data: session } = useSession();
  const [isClient, setIsClient] = useState(false);
  const [naverCookies, setNaverCookies] = useState<Record<string, string>>({});

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleNaverAccess = () => {
    // 팝업 윈도우 열기
    const popup = window.open(
    //   'https://www.naver.com',
        'https://section.blog.naver.com',
      'naverPopup',
      'width=800,height=600,scrollbars=yes,resizable=yes'
    );

    if (!popup) {
      alert('팝업이 차단되었습니다. 팝업 차단을 해제해주세요.');
      return;
    }

    // 팝업에서 메시지 수신
    const handleMessage = (event: MessageEvent) => {
        console.log("event", event)
      if (event.origin !== 'https://section.blog.naver.com') return;
      
      if (event.data.type === 'COOKIES_READY') {
        const cookies = event.data.cookies;
        setNaverCookies(cookies);
        console.log("cookies", cookies)
        popup.close();
        window.removeEventListener('message', handleMessage);
      }
    };

    window.addEventListener('message', handleMessage);

    // 팝업이 닫혔는지 확인
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handleMessage);
      }
    }, 1000);
  };

  if (!isClient) return null;

  if (session) {
    return (
      <div>
        <button
          onClick={() => signOut()}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 text-sm mb-4"
        >
          <img
            src={session.user?.image || '/naver.svg'}
            alt="프로필"
            className="w-5 h-5 rounded-full"
          />
          로그아웃
        </button>
        
        <button
          onClick={handleNaverAccess}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm mb-4"
        >
          네이버 쿠키 수집 (팝업)
        </button>
        
        {Object.keys(naverCookies).length > 0 && (
          <div className="mt-4 p-4 bg-gray-100 rounded-lg">
            <h3 className="font-bold mb-2">수집된 쿠키:</h3>
            <pre className="text-xs">{JSON.stringify(naverCookies, null, 2)}</pre>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={async () => {
        await signIn('naver');
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