// v2: 읽음 상태는 클라이언트 Zustand + localStorage로 관리
import { NextResponse } from 'next/server';
export async function POST() {
  return NextResponse.json({ ok: true });
}
