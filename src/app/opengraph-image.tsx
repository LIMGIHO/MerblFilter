import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = '댓글필터 — 네이버 블로그 댓글 필터 & AI 뷰어';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          background: 'linear-gradient(135deg, #0f172a 0%, #134e4a 100%)',
          padding: '80px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
          <div
            style={{
              width: '64px', height: '64px', borderRadius: '16px',
              background: '#0d9488', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '32px', color: 'white',
              fontWeight: 'bold', marginRight: '16px',
            }}
          >
            댓
          </div>
          <span style={{ color: '#5eead4', fontSize: '20px', fontWeight: '600' }}>
            merbl-filter.vercel.app
          </span>
        </div>
        <div style={{ color: 'white', fontSize: '60px', fontWeight: '700', lineHeight: '1.2', marginBottom: '24px' }}>
          댓글필터
        </div>
        <div style={{ color: '#94a3b8', fontSize: '28px', lineHeight: '1.5' }}>
          네이버 블로그 댓글 분석 & AI 뷰어
        </div>
        <div style={{
          marginTop: '48px', color: '#64748b', fontSize: '18px',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <span>✦ AI 요약</span>
          <span>·</span>
          <span>댓글 필터</span>
          <span>·</span>
          <span>멀티 블로그</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
