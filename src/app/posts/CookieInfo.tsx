'use client';

import { useState } from 'react';

export default function CookieInfo() {
  const [cookieData, setCookieData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const checkCookies = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/check-cookies');
      const data = await response.json();
      setCookieData(data);
    } catch (error) {
      console.error('쿠키 확인 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 p-4 border rounded-lg">
      <button 
        onClick={checkCookies}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? '확인 중...' : '네이버 쿠키 확인'}
      </button>
      
      {cookieData && (
        <div className="mt-4">
          <h3 className="font-bold mb-2">네이버 쿠키 정보:</h3>
          <div className="bg-gray-100 p-3 rounded text-sm">
            <p><strong>상태:</strong> {cookieData.success ? '성공' : '실패'}</p>
            <p><strong>HTTP 상태:</strong> {cookieData.status}</p>
            <p><strong>Set-Cookie:</strong></p>
            <pre className="whitespace-pre-wrap text-xs bg-white p-2 rounded border">
              {cookieData.cookies || '쿠키 없음'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
} 