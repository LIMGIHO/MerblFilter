import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { Session } from 'next-auth';

interface ExtendedSession extends Session {
  accessToken?: string;
}

export async function POST(request: Request) {
  try {
    const session = (await getServerSession()) as ExtendedSession;
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { postId } = await request.json();
    
    if (!postId) {
      return NextResponse.json({ error: 'Post ID is required' }, { status: 400 });
    }

    // 여기에서 읽은 게시물 정보를 저장하는 로직을 구현합니다.
    // 예: 데이터베이스에 저장하거나 파일에 기록
    // 현재는 메모리에만 저장하는 임시 구현입니다.
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking post as read:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 