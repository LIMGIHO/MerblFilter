'use client';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function SessionManager() {
  const searchParams = useSearchParams();
  const scrollToId = searchParams.get('scrollTo');

  useEffect(() => {
    // 게시글 목록 페이지에서 왔다는 표시 설정
    sessionStorage.setItem('fromList', 'true');
    
    // URL에 scrollTo 파라미터가 있으면 해당 위치로 스크롤
    if (scrollToId) {
      const element = document.getElementById(`post-${scrollToId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [scrollToId]);

  return null;
} 