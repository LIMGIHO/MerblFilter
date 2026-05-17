import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// 네이버 쿠키
let PM_CK_loc: string | null = null;

export async function GET(request: NextRequest) {
  try {
    // 네이버에서 쿠키 가져오기
    const response = await fetch('https://www.naver.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });


    PM_CK_loc = response.headers.get('set-cookie');
    console.log("PM_CK_loc", PM_CK_loc);

    /**
     * PM_CK_loc=894ff9760d84b674ec1d3db3b4f0ccbdd6c6957ae396ff69ec1b5517bc35d3d3; 
     * Expires=Sat, 02 Aug 2025 13:27:13 GMT; Path=/; HttpOnly
     * 
     * nnb
     */

    // 2. 네이버 로깅 API에 POST 요청 보내기 (참고 코드와 유사) - NNB 쿠키
    const logData = {
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        url: 'https://www.naver.com',
        logLevel: 'info',
        projectName: 'naver-main',
        projectVersion: '1.0.0',
        nnb: PM_CK_loc?.match(/nnb=([^;]+)/)?.[1] || '-'
      };
  
      const logResponse = await fetch('https://nelo2-col.navercorp.com/_store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': PM_CK_loc || '',
        },
        body: JSON.stringify(logData),
      });
  
      // 3. 로깅 API에서 받은 set-cookie 값들
      const logCookies = logResponse.headers.get('set-cookie');
      console.log("logCookies", logCookies);
    
    return NextResponse.json({
      success: true,
      cookies: PM_CK_loc,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch naver' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
    // 저장된 쿠키 반환
    return NextResponse.json({
      success: true,
      cookies: PM_CK_loc,
    });
  }