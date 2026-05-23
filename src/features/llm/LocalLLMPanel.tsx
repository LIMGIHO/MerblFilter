'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useLlmStore } from '@/store/llmStore';
import { useClassifier, ClassifyResult, QualityLabel, QualityTag } from './useClassifier';
import { BlogComment } from '@/domain/comment/types';

type LlmResult = { label: QualityLabel; score: number; tag: QualityTag };

interface LocalLLMPanelProps {
  comments: BlogComment[];
  onResultsUpdate: (results: ClassifyResult[]) => void;
  resultMap: Record<number, LlmResult>;
  qualityFilterActive: boolean;
  onQualityFilterToggle: (active: boolean) => void;
}

export default function LocalLLMPanel({
  comments,
  onResultsUpdate,
  resultMap,
  qualityFilterActive,
  onQualityFilterToggle,
}: LocalLLMPanelProps) {
  const {
    phase1Enabled,
    phase1Status,
    phase1Progress,
    phase1Error,
    phase1HasDownloaded,
    phase1ScoreThreshold,
    setPhase1Enabled,
    setPhase1ScoreThreshold,
  } = useLlmStore();

  const { loadModel, classify, isReady } = useClassifier();
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 팝업 바깥 클릭 시 닫기
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // 모델이 이미 캐시돼 있으면 패널 열자마자 자동 로드
  useEffect(() => {
    if (phase1Enabled && phase1HasDownloaded && phase1Status === 'idle') {
      loadModel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggle = useCallback((enabled: boolean) => {
    setPhase1Enabled(enabled);
    if (enabled && (phase1Status === 'idle' || phase1Status === 'error')) loadModel();
  }, [phase1Status, loadModel, setPhase1Enabled]);

  const handleClassify = useCallback(() => {
    const visible = comments.filter((c) => c.replyLevel === 1);
    classify(visible, (results: ClassifyResult[]) => {
      onResultsUpdate(results);
      onQualityFilterToggle(true); // 분류 완료 시 필터 자동 ON
    });
  }, [comments, classify, onResultsUpdate, onQualityFilterToggle]);

  const totalClassified = Object.keys(resultMap).length;
  const hiddenCount = Object.values(resultMap).filter(
    (r) => r.label === 'spam' || r.score < phase1ScoreThreshold
  ).length;
  const worthReadingCount = totalClassified - hiddenCount;

  // isReady is available for future use
  void isReady;

  return (
    <div className="relative" ref={wrapperRef}>
      {/* 토글 버튼 */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="text-xs px-2.5 py-1 rounded-full transition flex items-center gap-1.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-teal-400 hover:text-teal-600 dark:hover:text-teal-400"
      >
        <span>✦ AI 필터</span>
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
        {totalClassified > 0 && (
          <span className="bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 px-1.5 rounded-full text-[10px]">
            {worthReadingCount}
          </span>
        )}
      </button>

      {/* 패널 */}
      {isOpen && (
        <div className="absolute right-0 top-9 z-50 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-xs text-slate-700 dark:text-slate-200">✦ AI 댓글 필터</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => handleToggle(!phase1Enabled)}
                className={`relative rounded-full transition-colors ${phase1Enabled ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                style={{ height: '18px', width: '32px' }}
              >
                <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${phase1Enabled ? 'translate-x-3.5' : ''}`} />
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">활성화</span>
            </label>
          </div>

          {/* 모델 정보 */}
          <div className="text-[10px] text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 rounded-lg px-2.5 py-1.5">
            <div className="font-medium text-slate-500 dark:text-slate-400">paraphrase-multilingual-MiniLM-L12</div>
            <div>읽을만한 댓글 필터 (~120MB, IndexedDB 캐시)</div>
          </div>

          {/* 상태 표시 */}
          {phase1Enabled && (
            <div className="space-y-2">
              {phase1Status === 'idle' && !phase1HasDownloaded && (
                <button
                  onClick={loadModel}
                  className="w-full py-1.5 text-xs bg-teal-500 text-white rounded-xl hover:bg-teal-600 transition"
                >
                  모델 다운로드 시작
                </button>
              )}
              {phase1Status === 'idle' && phase1HasDownloaded && (
                <div className="text-center text-xs text-teal-500 animate-pulse">캐시에서 불러오는 중...</div>
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

          {/* 분류 결과 + 필터 토글 */}
          {totalClassified > 0 && (
            <div className="space-y-2">
              {/* 커트라인 슬라이더 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                  <span>최소 점수 (커트라인)</span>
                  <span className="font-semibold text-teal-600 dark:text-teal-400">{phase1ScoreThreshold}점</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={phase1ScoreThreshold}
                  onChange={(e) => setPhase1ScoreThreshold(Number(e.target.value))}
                  className="w-full h-1.5 accent-teal-500 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-slate-400">
                  <span>0</span>
                  <span>50</span>
                  <span>100</span>
                </div>
              </div>

              {/* 분류 통계 + 필터 토글 */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  읽을만한 댓글 <span className="font-semibold text-teal-600">{worthReadingCount}개</span>
                  <span className="text-slate-400 dark:text-slate-500"> / {totalClassified}개</span>
                </div>
                <button
                  onClick={() => onQualityFilterToggle(!qualityFilterActive)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                    qualityFilterActive
                      ? 'bg-teal-500 text-white border-teal-500'
                      : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {qualityFilterActive ? '필터 ON' : '필터 OFF'}
                </button>
              </div>
              {qualityFilterActive && hiddenCount > 0 && (
                <div className="text-[10px] text-slate-400 dark:text-slate-500">
                  {hiddenCount}개 댓글이 필터됨
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 댓글 배지 (CommentsPanel에서 사용)
export function LlmQualityBadge({ label, score, tag }: { label: QualityLabel; score: number; tag: QualityTag }) {
  if (label !== 'worth_reading') return null;
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
      {tag} · {score}점
    </span>
  );
}
