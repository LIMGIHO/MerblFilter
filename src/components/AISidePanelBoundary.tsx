'use client';

import { Component, ReactNode } from 'react';

/**
 * AISidePanel 전용 에러 바운더리
 *
 * Next.js production은 client-side 에러를 generic 메시지로 가립니다.
 * 모바일에서 실제 에러를 확인하기 위해 화면에 메시지/스택을 직접 노출.
 */

interface Props {
  children: ReactNode;
  onClose?: () => void;
}

interface State {
  error: Error | null;
  info: { componentStack?: string | null } | null;
}

export class AISidePanelBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // 콘솔에도 출력 (Remote Debugger에서 잡기 위함)
    console.error('[AISidePanel error]', error);
    console.error('[AISidePanel componentStack]', info.componentStack);
    this.setState({ info });
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    if (!this.state.error) return this.props.children;

    const { error, info } = this.state;
    return (
      <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 bg-black/40 overflow-y-auto">
        <div className="w-full max-w-md mt-12 bg-white dark:bg-slate-900 rounded-2xl border border-red-300 dark:border-red-800 shadow-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-red-600 dark:text-red-400">
              ⚠️ AI 패널 오류
            </div>
            <button
              onClick={() => { this.reset(); this.props.onClose?.(); }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none"
            >
              ×
            </button>
          </div>

          <div className="text-xs text-slate-700 dark:text-slate-300 break-words">
            <div className="font-semibold mb-1">메시지</div>
            <pre className="whitespace-pre-wrap text-[11px] bg-slate-100 dark:bg-slate-800 rounded p-2 max-h-32 overflow-auto">
              {error.message || String(error)}
            </pre>
          </div>

          {error.stack && (
            <details className="text-[11px] text-slate-500 dark:text-slate-400">
              <summary className="cursor-pointer">스택 트레이스</summary>
              <pre className="whitespace-pre-wrap mt-1 bg-slate-100 dark:bg-slate-800 rounded p-2 max-h-48 overflow-auto">
                {error.stack}
              </pre>
            </details>
          )}

          {info?.componentStack && (
            <details className="text-[11px] text-slate-500 dark:text-slate-400">
              <summary className="cursor-pointer">컴포넌트 스택</summary>
              <pre className="whitespace-pre-wrap mt-1 bg-slate-100 dark:bg-slate-800 rounded p-2 max-h-32 overflow-auto">
                {info.componentStack}
              </pre>
            </details>
          )}

          <button
            onClick={this.reset}
            className="w-full py-2 text-sm bg-teal-500 text-white rounded-xl hover:bg-teal-600 transition"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }
}
