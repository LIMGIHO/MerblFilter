import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Edge TTS는 한 번에 매우 긴 텍스트를 처리하기 어려우므로 안전한 길이로 제한
const MAX_TEXT_LENGTH = 6000;

// 한국어 기본 음성 (가장 자연스러운 SunHi 사용)
const DEFAULT_VOICE = 'ko-KR-SunHiNeural';

// SSML은 XML이므로 특수문자를 이스케이프해야 함
// &amp; 등이 없으면 Microsoft 서버가 XML 파싱 에러로 연결을 끊음
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[​-‍﻿ ]/g, ' ') // 제로폭 공백 제거
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text: string = String(body.text ?? '').trim();
    const voice: string = String(body.voice ?? DEFAULT_VOICE);

    if (!text) {
      return new Response(JSON.stringify({ error: 'empty text' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const trimmed = escapeXml(text.slice(0, MAX_TEXT_LENGTH));
    console.log('[TTS] text length:', trimmed.length, 'voice:', voice);

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(trimmed);

    // Node.js Readable → Web ReadableStream 으로 변환해 즉시 스트리밍
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        audioStream.on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        audioStream.on('end', () => {
          tts.close();
          controller.close();
        });
        audioStream.on('error', (err: Error) => {
          console.error('[TTS] stream error:', err);
          tts.close();
          controller.error(err);
        });
      },
      cancel() {
        // 클라이언트가 연결 끊으면 WebSocket도 정리
        tts.close();
        audioStream.destroy();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no', // nginx 등 프록시 버퍼링 비활성화
      },
    });
  } catch (err) {
    console.error('[TTS] error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'tts failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
