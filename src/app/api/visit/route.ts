import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

/**
 * POST /api/visit
 * 방문자 카운트 증가 후 { total, today } 반환.
 * Redis 키:
 *   visits:total        — 누적 방문자 (만료 없음)
 *   visits:YYYY-MM-DD   — 오늘 방문자 (48시간 만료)
 */

function getTodayKey(): string {
  return `visits:${new Date().toISOString().slice(0, 10)}`;
}

export async function POST() {
  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const todayKey = getTodayKey();

    const [total, today] = await Promise.all([
      redis.incr('visits:total'),
      redis.incr(todayKey),
    ]);

    // 오늘 키는 48시간 후 자동 삭제
    await redis.expire(todayKey, 60 * 60 * 48);

    return NextResponse.json({ total, today });
  } catch (e) {
    console.error('[visit] Redis error:', e);
    return NextResponse.json({ total: 0, today: 0 });
  }
}
