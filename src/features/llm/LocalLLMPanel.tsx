'use client';

import { useState, useCallback } from 'react';
import { useLlmStore } from '@/store/llmStore';
import { useClassifier, ClassifyResult } from './useClassifier';
import { BlogComment } from '@/domain/comment/types';

type LlmLabel = 'spam' | 'promo' | 'negative' | 'neutral' | 'positive';

const LABEL_CONFIG: Record<LlmLabel, { text: string; color: string }> = {
  spam:     { text: '스팸',   color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  promo:    { text: '홍보',   color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  negative: { text: '부정',   color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  neutral:  { text: '중립',   color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
  positive: { text: '긍정',   color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
};

interface LocalLLMPanelProps {
  comments: BlogComment[];
  onLabelsUpdate: (labels: Record<number, LlmLabel>) => void;
  labelMap: Record<number, LlmLabel>;
  onHideLabelsChange?: (hidden: Set<LlmLabel>) => void;
}

export default function LocalLLMPanel({ comments, onLabelsUpdate, labelMap, onHideLabelsChange }: LocalLLMPanelProps) {
  const {
    phase1Enabled,
    phase1Status,
    phase1Progress,
    phase1Error,
    setPhase1Enabled,
  } = useLlmStore();

  const { loadModel, classify, isReady } = useClassifier();
  const [isOpen, setIsOpen] = useState(false);
  const [hideLabels, setHideLabels] = useState<Set<LlmLabel>>(new Set());

  const handleToggle = useCallback((enabled: boolean) => {
    setPhase1Enabled(enabled);
    if (enabled && (phase1Status === 'idle' || phase1Status === 'error')) loadModel();
  }, [phase1Status, loadModel, setPhase1Enabled]);

  const handleClassify = useCallback(() => {
    const visible = comments.filter((c) => c.replyLevel === 1);
    classify(visible, (results: ClassifyResult[]) => {
      const map: Record<number, LlmLabel> = { ...labelMap };
      results.forEach((r) => { map[r.commentNo] = r.label; });
      onLabelsUpdate(map);
    });
  }, [comments, classify, labelMap, onLabelsUpdate]);

  // 숨길 레이블 통계
  const labelCounts = Object.values(labelMap).reduce((acc, l) => {
    acc[l] = (acc[l] ?? 0) + 1;
    return acc;
  }, {} as Record<LlmLabel, number>);

  return (
    <div className="relative">
      {/* 토글 버튼 */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="text-xs px-2.5 py-1 rounded-full transition flex items-center gap-1.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-teal-400 hover:text-teal-600 dark:hover:text-teal-400"
      >
        <span>✦ AI 분류</span>
        {phase1Status === 'downloading' && (
          <span className="text-teal-500 animate-pulse">{phase1Progress}%</span>
        )}
        {phase1Status === 'running' && (
          <span className="inline-block w-3 h-3 border border-teal-400 border-t-transparent rounded-full animate-spin" />
        )}
        {phase1Status === 'error' && (
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
        )}
        {phase1Status === 'ready' && (
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 inline-block" />
        )}
        {Object.keys(labelMap).length > 0 && (
          <span className="bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 px-1.5 rounded-full text-[10px]">
            {Object.keys(labelMap).length}
          </span>
        )}
      </button>

      {/* 패널 */}
      {isOpen && (
        <div className="absolute right-0 top-9 z-50 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-xs text-slate-700 dark:text-slate-200">✦ AI 댓글 분류</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => handleToggle(!phase1Enabled)}
                className={`relative w-8 h-4.5 rounded-full transition-colors ${phase1Enabled ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                style={{ height: '18px', width: '32px' }}
              >
                <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${phase1Enabled ? 'translate-x-3.5' : ''}`} />
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">활성화</span>
            </label>
          </div>

          {/* 모델 정보 */}
          <div className="text-[10px] text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 rounded-lg px-2.5 py-1.5">
            <div className="font-medium text-slate-500 dark:text-slate-400">bert-base-multilingual-uncased</div>
            <div>다국어 감성 분석 (~170MB, IndexedDB 캐시)</div>
          </div>

          {/* 상태 표시 */}
          {phase1Enabled && (
            <div className="space-y-2">
              {phase1Status === 'idle' && (
                <button
                  onClick={loadModel}
                  className="w-full py-1.5 text-xs bg-teal-500 text-white rounded-xl hover:bg-teal-600 transition"
                >
                  모델 다운로드 시작
                </button>
              )}

              {phase1Status === 'downloading' && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
                    <span>다운로드 중...</span>
                    <span>{phase1Progress}%</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                    <div className="bg-teal-500 h-1.5 rounded-full transition-all" style={{ width: `${phase1Progress}%` }} />
                  </div>
                  <div className="text-[10px] text-teal-600 dark:text-teal-400">⚡ 처음 1회만 다운로드됩니다</div>
                </div>
              )}

              {phase1Status === 'ready' && (
                <button
                  onClick={handleClassify}
                  className="w-full py-1.5 text-xs bg-teal-500 text-white rounded-xl hover:bg-teal-600 transition flex items-center justify-center gap-1.5"
                >
                  <span>⚡ 댓글 분류 실행</span>
                  <span className="opacity-80">({comments.filter(c => c.replyLevel === 1).length}개)</span>
                </button>
              )}

              {phase1Status === 'running' && (
                <div className="text-center text-xs text-teal-600 dark:text-teal-400 flex items-center justify-center gap-2">
                  <span className="inline-block w-3 h-3 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                  분류 중...
                </div>
              )}

              {phase1Status === 'error' && (
                <div className="text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl p-2.5">
                  ❌ {phase1Error}
                  <button onClick={loadModel} className="block mt-1.5 text-red-500 hover:text-red-700 underline">재시도</button>
                </div>
              )}
            </div>
          )}

          {/* 레이블 통계 + 숨김 옵션 */}
          {Object.keys(labelMap).length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300">분류 결과 (클릭하면 해당 레이블 숨김)</div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(LABEL_CONFIG) as LlmLabel[]).map((label) => {
                  const count = labelCounts[label] ?? 0;
                  if (!count) return null;
                  const isHidden = hideLabels.has(label);
                  return (
                    <button
                      key={label}
                      onClick={() => {
                        const next = new Set(hideLabels);
                        if (isHidden) next.delete(label); else next.add(label);
                        setHideLabels(next);
                        onHideLabelsChange?.(next);
                      }}
                      className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition
                        ${LABEL_CONFIG[label].color}
                        ${isHidden ? 'opacity-40 line-through' : ''}`}
                    >
                      {LABEL_CONFIG[label].text} {count}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// 레이블 배지 (CommentItem에서 사용)
export function LlmLabelBadge({ label }: { label: LlmLabel }) {
  const cfg = LABEL_CONFIG[label];
  if (!cfg || label === 'neutral') return null;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${cfg.color}`}>
      {cfg.text}
    </span>
  );
}
