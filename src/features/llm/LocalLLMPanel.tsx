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
    if (enabled && phase1Status === 'idle') loadModel();
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
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all
          ${phase1Enabled
            ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
            : 'border-gray-300 bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600'
          }`}
      >
        🤖 AI 분류
        {phase1Status === 'downloading' && (
          <span className="text-xs animate-pulse">({phase1Progress}%)</span>
        )}
        {phase1Status === 'running' && (
          <span className="spinner" />
        )}
        {Object.keys(labelMap).length > 0 && (
          <span className="text-xs bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 px-1.5 py-0.5 rounded">
            {Object.keys(labelMap).length}
          </span>
        )}
      </button>

      {/* 패널 */}
      {isOpen && (
        <div className="absolute right-0 top-10 z-50 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-100">🤖 AI 댓글 분류</h3>
            {/* Phase 1 토글 */}
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => handleToggle(!phase1Enabled)}
                className={`relative w-9 h-5 rounded-full transition-colors ${phase1Enabled ? 'bg-violet-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${phase1Enabled ? 'translate-x-4' : ''}`} />
              </div>
              <span className="text-xs text-gray-600 dark:text-gray-400">활성화</span>
            </label>
          </div>

          {/* 모델 정보 */}
          <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
            <div className="font-medium">bert-base-multilingual-uncased</div>
            <div>다국어 감성 분석 (~170MB, IndexedDB 캐시)</div>
          </div>

          {/* 상태 표시 */}
          {phase1Enabled && (
            <div className="space-y-2">
              {phase1Status === 'idle' && (
                <button
                  onClick={loadModel}
                  className="w-full py-1.5 text-sm bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition"
                >
                  모델 다운로드 시작
                </button>
              )}

              {phase1Status === 'downloading' && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                    <span>다운로드 중...</span>
                    <span>{phase1Progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-violet-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${phase1Progress}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-400">첫 다운로드 후 IndexedDB에 캐시됩니다</div>
                </div>
              )}

              {phase1Status === 'ready' && (
                <button
                  onClick={handleClassify}
                  className="w-full py-1.5 text-sm bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition flex items-center justify-center gap-2"
                >
                  <span>⚡ 댓글 분류 실행</span>
                  <span className="text-xs opacity-80">({comments.filter(c => c.replyLevel === 1).length}개)</span>
                </button>
              )}

              {phase1Status === 'running' && (
                <div className="text-center text-sm text-violet-600 dark:text-violet-400 flex items-center justify-center gap-2">
                  <span className="spinner" /> 분류 중...
                </div>
              )}

              {phase1Status === 'error' && (
                <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-2">
                  ❌ {phase1Error}
                  <button onClick={loadModel} className="block mt-1 underline">재시도</button>
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

          {/* Phase 2 예고 */}
          <div className="text-xs text-gray-400 dark:text-gray-600 border-t border-gray-100 dark:border-gray-800 pt-2">
            💡 Phase 2 (Qwen 1.5B 요약) — 설정에서 고급 LLM 활성화
          </div>
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
