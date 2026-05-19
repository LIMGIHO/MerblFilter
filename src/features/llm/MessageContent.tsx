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
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'hr' }
  | { type: 'br' };

function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let currentList: Block | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // 빈 줄 → 단락 구분
    if (!line.trim()) {
      if (currentList) {
        blocks.push(currentList);
        currentList = null;
      } else {
        blocks.push({ type: 'br' });
      }
      continue;
    }

    // 구분선 (---, ***)
    if (/^[-*]{3,}$/.test(line.trim())) {
      if (currentList) { blocks.push(currentList); currentList = null; }
      blocks.push({ type: 'hr' });
      continue;
    }

    // 헤딩 (###, ##, #)
    const h3Match = line.match(/^###\s+(.+)/);
    if (h3Match) {
      if (currentList) { blocks.push(currentList); currentList = null; }
      blocks.push({ type: 'h3', text: h3Match[1] });
      continue;
    }
    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) {
      if (currentList) { blocks.push(currentList); currentList = null; }
      blocks.push({ type: 'h2', text: h2Match[1] });
      continue;
    }
    const h1Match = line.match(/^#\s+(.+)/);
    if (h1Match) {
      if (currentList) { blocks.push(currentList); currentList = null; }
      blocks.push({ type: 'h1', text: h1Match[1] });
      continue;
    }

    // 무순서 목록 (- 또는 *)
    const ulMatch = line.match(/^\s*[-*]\s+(.+)/);
    if (ulMatch) {
      if (currentList?.type === 'ul') {
        currentList.items.push(ulMatch[1]);
      } else {
        if (currentList) blocks.push(currentList);
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
        if (currentList) blocks.push(currentList);
        currentList = { type: 'ol', items: [olMatch[1]] };
      }
      continue;
    }

    // 일반 단락
    if (currentList) {
      blocks.push(currentList);
      currentList = null;
    }
    blocks.push({ type: 'p', text: line });
  }
  if (currentList) blocks.push(currentList);

  return blocks;
}

/** LLM 출력에서 HTML 태그 잔재 제거 */
function sanitizeLlmOutput(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')   // <br> → 줄바꿈
    .replace(/<\/br>/gi, '\n')       // </br> → 줄바꿈
    .replace(/<[^>]+>/g, '');        // 나머지 HTML 태그 제거
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
