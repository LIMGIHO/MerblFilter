'use client';

import React from 'react';

/**
 * 간단한 마크다운 렌더러 — LLM 응답 표시용
 * 지원: **굵게**, *기울임*, `코드`, 순서 있는/없는 목록, 줄바꿈
 * dangerouslySetInnerHTML 사용 안 함 (XSS 방지)
 */

function renderInline(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  // 우선순위: 코드 > 굵게 > 기울임
  // (`...`, **...**, *...*)
  const pattern = /(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/;

  while (remaining.length > 0) {
    const match = remaining.match(pattern);
    if (!match || match.index === undefined) {
      tokens.push(remaining);
      break;
    }
    if (match.index > 0) tokens.push(remaining.slice(0, match.index));

    if (match[1]) {
      // 코드
      tokens.push(
        <code
          key={key++}
          className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700/60 text-xs font-mono text-teal-700 dark:text-teal-300"
        >
          {match[2]}
        </code>
      );
    } else if (match[3]) {
      // 굵게
      tokens.push(
        <strong key={key++} className="font-semibold">
          {match[4]}
        </strong>
      );
    } else if (match[5]) {
      // 기울임
      tokens.push(
        <em key={key++} className="italic">
          {match[6]}
        </em>
      );
    }

    remaining = remaining.slice(match.index + match[0].length);
  }

  return tokens;
}

type Block =
  | { type: 'h1' | 'h2' | 'h3' | 'h4'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'hr' }
  | { type: 'br' };

function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let currentList: Block | null = null;
  let currentTable: { type: 'table'; headers: string[]; rows: string[][] } | null = null;

  const flushList = () => { if (currentList) { blocks.push(currentList); currentList = null; } };
  const flushTable = () => { if (currentTable) { blocks.push(currentTable); currentTable = null; } };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // 테이블 행 (|...|)
    if (/^\|.+\|$/.test(line.trim())) {
      // 구분선 |---|---| 은 스킵
      if (/^\|[-| :]+\|$/.test(line.trim())) continue;
      flushList();
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (!currentTable) {
        currentTable = { type: 'table', headers: cells, rows: [] };
      } else {
        currentTable.rows.push(cells);
      }
      continue;
    }
    // 테이블 아닌 줄이 나오면 플러시
    flushTable();

    // 빈 줄 → 단락 구분 (리스트 중간 빈 줄은 리스트 유지)
    if (!line.trim()) {
      if (!currentList) {
        blocks.push({ type: 'br' });
      }
      continue;
    }

    // 구분선 (---, ***)
    if (/^[-*]{3,}$/.test(line.trim())) {
      flushList();
      blocks.push({ type: 'hr' });
      continue;
    }

    // 헤딩: #### 이상은 h4로 통합
    const h4Match = line.match(/^#{4,}\s+(.+)/);
    if (h4Match) {
      flushList();
      blocks.push({ type: 'h4', text: h4Match[1] });
      continue;
    }
    const h3Match = line.match(/^###\s+(.+)/);
    if (h3Match) {
      flushList();
      blocks.push({ type: 'h3', text: h3Match[1] });
      continue;
    }
    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) {
      flushList();
      blocks.push({ type: 'h2', text: h2Match[1] });
      continue;
    }
    const h1Match = line.match(/^#\s+(.+)/);
    if (h1Match) {
      flushList();
      blocks.push({ type: 'h1', text: h1Match[1] });
      continue;
    }

    // 무순서 목록 (- 또는 *)
    const ulMatch = line.match(/^\s*[-*]\s+(.+)/);
    if (ulMatch) {
      if (currentList?.type === 'ul') {
        currentList.items.push(ulMatch[1]);
      } else {
        flushList();
        currentList = { type: 'ul', items: [ulMatch[1]] };
      }
      continue;
    }

    // 순서 목록 (1. 2.)
    const olMatch = line.match(/^\s*\d+\.\s+(.+)/);
    if (olMatch) {
      if (currentList?.type === 'ol') {
        currentList.items.push(olMatch[1]);
      } else {
        flushList();
        currentList = { type: 'ol', items: [olMatch[1]] };
      }
      continue;
    }

    // 일반 단락
    flushList();
    blocks.push({ type: 'p', text: line });
  }
  flushList();
  flushTable();

  return blocks;
}

/** LLM 출력에서 HTML 태그 잔재 및 메타텍스트 제거 */
function sanitizeLlmOutput(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')          // <br> → 줄바꿈
    .replace(/<\/br>/gi, '\n')             // </br> → 줄바꿈
    .replace(/<[^>]+>/g, '')               // 나머지 HTML 태그 제거
    .replace(/^🔔[^\n]*/gm, '')            // 🔔 메타 주석 라인 제거
    .replace(/^\*\*참고\*\*:[^\n]*/gm, '') // **참고**: 메타 라인 제거
    .replace(/\n{3,}/g, '\n\n');           // 연속 빈 줄 정리
}

export default function MessageContent({ content }: { content: string }) {
  const blocks = parseBlocks(sanitizeLlmOutput(content));

  return (
    <div className="space-y-1.5">
      {blocks.map((block, i) => {
        if (block.type === 'br') return <div key={i} className="h-2" />;
        if (block.type === 'hr') return <hr key={i} className="border-slate-200 dark:border-slate-700 my-2" />;
        if (block.type === 'h1') return (
          <h2 key={i} className="font-bold text-base text-slate-800 dark:text-slate-100 mt-3 mb-1">
            {renderInline(block.text)}
          </h2>
        );
        if (block.type === 'h2') return (
          <h3 key={i} className="font-bold text-sm text-slate-700 dark:text-slate-200 mt-3 mb-1">
            {renderInline(block.text)}
          </h3>
        );
        if (block.type === 'h3') return (
          <h4 key={i} className="font-semibold text-sm text-slate-600 dark:text-slate-300 mt-2.5 mb-0.5 flex items-center gap-1">
            {renderInline(block.text)}
          </h4>
        );
        if (block.type === 'h4') return (
          <p key={i} className="font-medium text-xs text-slate-500 dark:text-slate-400 mt-2 mb-0.5 uppercase tracking-wide">
            {renderInline(block.text)}
          </p>
        );
        if (block.type === 'table') return (
          <div key={i} className="overflow-x-auto my-2">
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-700/50">
                  {block.headers.map((h, j) => (
                    <th key={j} className="border border-slate-200 dark:border-slate-600 px-2 py-1 text-left font-semibold text-slate-700 dark:text-slate-200">
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, j) => (
                  <tr key={j} className={j % 2 === 0 ? '' : 'bg-slate-50 dark:bg-slate-800/30'}>
                    {row.map((cell, k) => (
                      <td key={k} className="border border-slate-200 dark:border-slate-600 px-2 py-1 text-slate-600 dark:text-slate-300">
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        if (block.type === 'p') {
          return (
            <p key={i} className="leading-relaxed">
              {renderInline(block.text)}
            </p>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={i} className="list-disc list-outside pl-5 space-y-1">
              {block.items.map((item, j) => (
                <li key={j} className="leading-relaxed">
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={i} className="list-decimal list-outside pl-5 space-y-1">
              {block.items.map((item, j) => (
                <li key={j} className="leading-relaxed">
                  {renderInline(item)}
                </li>
              ))}
            </ol>
          );
        }
        return null;
      })}
    </div>
  );
}
