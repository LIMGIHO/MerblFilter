import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* 배경 장식 */}
        <div style={{
          position: 'absolute', top: 60, left: 80,
          width: 300, height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(20,184,166,0.15) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', bottom: 60, right: 80,
          width: 200, height: 200,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(20,184,166,0.10) 0%, transparent 70%)',
        }} />

        {/* 아이콘 */}
        <div style={{
          fontSize: 56,
          color: '#14b8a6',
          marginBottom: 24,
          lineHeight: 1,
        }}>✦</div>

        {/* 타이틀 */}
        <div style={{
          fontSize: 80,
          fontWeight: 900,
          color: '#f1f5f9',
          letterSpacing: '-2px',
          marginBottom: 16,
        }}>댓글필터</div>

        {/* 서브타이틀 */}
        <div style={{
          fontSize: 28,
          color: '#94a3b8',
          marginBottom: 40,
          letterSpacing: '1px',
        }}>네이버 블로그 댓글 분석 & AI 뷰어</div>

        {/* 태그 배지들 */}
        <div style={{ display: 'flex', gap: 16 }}>
          {['댓글 필터', 'AI 요약', '멀티 블로그', '로컬 LLM'].map((tag) => (
            <div key={tag} style={{
              padding: '8px 20px',
              borderRadius: 24,
              background: 'rgba(20,184,166,0.15)',
              border: '1px solid rgba(20,184,166,0.4)',
              color: '#5eead4',
              fontSize: 20,
              fontWeight: 600,
            }}>{tag}</div>
          ))}
        </div>

        {/* 도메인 */}
        <div style={{
          position: 'absolute',
          bottom: 36,
          color: '#475569',
          fontSize: 18,
        }}>merbl-filter.vercel.app</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
