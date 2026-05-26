/**
 * TTS 오디오 싱글톤 매니저
 *
 * React 컴포넌트 외부(모듈 레벨)에 오디오 상태를 보관합니다.
 * TTSPlayer/useTTS 컴포넌트가 언마운트(페이지 이동)되어도
 * 오디오 재생이 계속되며, 재마운트 시 기존 상태에 재연결됩니다.
 */

export type TTSStatus = 'idle' | 'loading' | 'playing' | 'paused';

type Listener = () => void;

export const TTS_VOICES = [
  { id: 'ko-KR-SunHiNeural',              label: '선희 (여성)' },
  { id: 'ko-KR-InJoonNeural',             label: '인준 (남성)' },
  { id: 'ko-KR-HyunsuMultilingualNeural', label: '현수 (남성)' },
] as const;

export type TTSVoiceId = typeof TTS_VOICES[number]['id'];

interface AudioState {
  status: TTSStatus;
  currentTime: number;
  duration: number;
  rate: number;
  volume: number;
  voice: TTSVoiceId;
}

class TTSAudioManager {
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private onEndCallback: (() => void) | undefined = undefined;
  private listeners = new Set<Listener>();
  private _status: TTSStatus = 'idle';
  private _rate = 1.0;
  private _volume = 1.0;
  private _voice: TTSVoiceId = (() => {
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('@tts_voice') : null;
      const valid = TTS_VOICES.map((v) => v.id) as string[];
      return (saved && valid.includes(saved) ? saved : 'ko-KR-SunHiNeural') as TTSVoiceId;
    } catch { return 'ko-KR-SunHiNeural'; }
  })();
  private _currentTime = 0;
  private _duration = 0;
  private cancelToken = 0;

  // ── 구독 ────────────────────────────────────────────────
  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  // ── 상태 읽기 ────────────────────────────────────────────
  getState(): AudioState {
    return {
      status: this._status,
      currentTime: this._currentTime,
      duration: this._duration,
      rate: this._rate,
      volume: this._volume,
      voice: this._voice,
    };
  }

  // ── 내부 상태 변경 ───────────────────────────────────────
  private setStatus(s: TTSStatus) {
    this._status = s;
    this.notify();
  }

  // ── 오디오 정리 ──────────────────────────────────────────
  private cleanupAudio() {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this._currentTime = 0;
    this._duration = 0;
    this.notify();
  }

  // ── 캐시된 Blob으로 재생 (네트워크 요청 없음) ────────────
  async playFromBlob(blob: Blob, onEnd?: () => void, startFrom = 0): Promise<void> {
    this.cancelToken++;
    const token = this.cancelToken;
    this.cleanupAudio();
    this.onEndCallback = onEnd;
    this.setStatus('loading');
    try {
      if (token !== this.cancelToken) return;
      this.objectUrl = URL.createObjectURL(blob);
      this.audio = new Audio(this.objectUrl);
      this.audio.playbackRate = this._rate;
      this.audio.volume = this._volume;
      // startFrom > 0 이면 메타데이터 로드 후 seek
      if (startFrom > 0) {
        this.audio.addEventListener('loadedmetadata', () => {
          if (this.audio && isFinite(this.audio.duration) && startFrom < this.audio.duration) {
            this.audio.currentTime = startFrom;
            this._currentTime = startFrom;
            this.notify();
          }
        }, { once: true });
      }
      this._attachListeners(this.audio, token);
      await this.audio.play();
      if (token === this.cancelToken) this.setStatus('playing');
    } catch (err) {
      console.error('[TTS]', err);
      if (token === this.cancelToken) {
        this.setStatus('idle');
        const cb = this.onEndCallback;
        this.onEndCallback = undefined;
        cb?.();
      }
    }
  }

  // ── API 호출로 재생 ───────────────────────────────────────
  async play(text: string, onEnd?: () => void): Promise<void> {
    this.cancelToken++;
    const token = this.cancelToken;
    this.cleanupAudio();
    this.onEndCallback = onEnd;
    this.setStatus('loading');

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: this._voice }),
      });

      if (token !== this.cancelToken) return;
      if (!res.ok) throw new Error(`TTS 요청 실패: ${res.status}`);

      // MediaSource 스트리밍은 duration=Infinity → seek bar 불가
      // 항상 blob 방식 사용 (duration 즉시 확정 → 처음부터 seek 가능)
      if (true) {
        const blob = await res.blob();
        if (token !== this.cancelToken) return;
        this.objectUrl = URL.createObjectURL(blob);
        this.audio = new Audio(this.objectUrl);
        this.audio.playbackRate = this._rate;
        this.audio.volume = this._volume;
        this._attachListeners(this.audio, token);
        await this.audio.play();
        if (token === this.cancelToken) this.setStatus('playing');
        return;
      }

      // MediaSource 스트리밍
      const ms = new MediaSource();
      this.objectUrl = URL.createObjectURL(ms);
      const audio = new Audio(this.objectUrl ?? '');
      audio.playbackRate = this._rate;
      this.audio = audio;
      this._attachListeners(audio, token);

      await new Promise<void>((resolve, reject) => {
        ms.addEventListener('sourceopen', async () => {
          let sb: SourceBuffer;
          try { sb = ms.addSourceBuffer('audio/mpeg'); } catch (e) { reject(e); return; }

          const reader = res.body!.getReader();
          let playStarted = false;
          const waitEnd = () => new Promise<void>((r) =>
            sb.addEventListener('updateend', () => r(), { once: true })
          );

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (token !== this.cancelToken) { reader.cancel(); try { ms.endOfStream(); } catch {} resolve(); return; }
              if (done) { if (sb.updating) await waitEnd(); try { ms.endOfStream(); } catch {} resolve(); return; }
              if (sb.updating) await waitEnd();
              if (token !== this.cancelToken) { resolve(); return; }
              sb.appendBuffer(value);
              await waitEnd();
              if (!playStarted) {
                playStarted = true;
                audio.play()
                  .then(() => { if (token === this.cancelToken) this.setStatus('playing'); })
                  .catch((e) => console.error('[TTS] play error:', e));
              }
            }
          } catch (err) { reject(err); }
        }, { once: true });
      });
    } catch (err) {
      console.error('[TTS]', err);
      if (token === this.cancelToken) this.setStatus('idle');
    }
  }

  private _attachListeners(audio: HTMLAudioElement, token: number) {
    audio.addEventListener('timeupdate', () => {
      if (token !== this.cancelToken) return;
      this._currentTime = audio.currentTime;
      this.notify();
    });
    audio.addEventListener('durationchange', () => {
      // MediaSource 스트리밍 중엔 Infinity → 스킵. endOfStream() 후엔 유한값으로 업데이트됨
      if (isFinite(audio.duration) && audio.duration > 0) {
        this._duration = audio.duration;
        this.notify();
      }
    });
    audio.onended = () => {
      if (token !== this.cancelToken) return;
      this.setStatus('idle');
      this._currentTime = 0;
      const cb = this.onEndCallback;
      this.onEndCallback = undefined;
      cb?.();
    };
    audio.onerror = () => {
      if (token !== this.cancelToken) return;
      this.setStatus('idle');
      const cb = this.onEndCallback;
      this.onEndCallback = undefined;
      cb?.();
    };
  }

  // ── 컨트롤 ───────────────────────────────────────────────
  pause() {
    if (this.audio && this._status === 'playing') {
      this.audio.pause();
      this.setStatus('paused');
    }
  }

  resume() {
    if (this.audio && this._status === 'paused') {
      this.audio.play()
        .then(() => this.setStatus('playing'))
        .catch(() => this.setStatus('idle'));
    }
  }

  stop() {
    this.cancelToken++;
    this.cleanupAudio();
    this.onEndCallback = undefined;
    this.setStatus('idle');
  }

  seek(time: number) {
    if (this.audio && isFinite(this.audio.duration)) {
      const t = Math.max(0, Math.min(time, this.audio.duration));
      this.audio.currentTime = t;
      this._currentTime = t;   // 즉시 상태 업데이트 → controlled input 스냅백 방지
      this.notify();
    }
  }

  setRate(r: number) {
    this._rate = r;
    if (this.audio) this.audio.playbackRate = r;
    this.notify();
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.audio) this.audio.volume = this._volume;
    this.notify();
  }

  setVoice(v: TTSVoiceId) {
    this._voice = v;
    try { localStorage.setItem('@tts_voice', v); } catch {}
    this.notify();
  }
}

// 모듈 레벨 싱글톤 — 페이지 이동해도 유지됨
export const ttsAudioManager = new TTSAudioManager();
