import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // 네이버에 요청을 보내서 쿠키 확인
    const response = await fetch('https://section.blog.naver.com', {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const cookies = response.headers.get('set-cookie');
    console.log("cookies", cookies);
    
    return NextResponse.json({
      success: true,
      cookies: cookies,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries())
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 