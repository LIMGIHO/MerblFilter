// v2: next-auth 비활성화 — 네이버 cbox API는 로그인 없이도 동작
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ message: 'auth disabled in v2' }, { status: 404 });
}
export async function POST() {
  return NextResponse.json({ message: 'auth disabled in v2' }, { status: 404 });
}
