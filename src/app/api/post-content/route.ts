import { NextRequest, NextResponse } from 'next/server';

/**
 * 네이버 블로그 게시글 본문 텍스트 추출
 * 모바일 페이지(m.blog.naver.com)에서 본문을 가져와 HTML 태그 제거 후 plain text 반환.
 */

/**
 * 특정 class를 포함하는 div 블록을 div depth tracking으로 통째 제거
 */
function removeDivsByClass(
  html: string,
  classPattern: RegExp,
  contentCheck?: (innerHtml: string) => boolean,
): string {
  let result = '';
  let i = 0;

  while (i < html.length) {
    // 다음 <div ...> 찾기
    const divTagRe = /<div(\s[^>]*)?>/gi;
    divTagRe.lastIndex = i;
    const m = divTagRe.exec(html);

    if (!m) {
      result += html.slice(i);
      break;
    }

    if (classPattern.test(m[0])) {
      // depth tracking으로 닫히는 </div> 위치 찾기
      let depth = 1;
      let j = m.index + m[0].length;
      const innerStart = j;
      let innerEnd = j;
      while (j < html.length && depth > 0) {
        const openIdx = html.indexOf('<div', j);
        const closeIdx = html.indexOf('</div>', j);
        if (closeIdx === -1) { j = html.length; break; }
        if (openIdx !== -1 && openIdx < closeIdx) {
          depth++;
          j = openIdx + 4;
        } else {
          depth--;
          if (depth === 0) innerEnd = closeIdx;
          j = closeIdx + 6;
        }
      }

      // contentCheck가 있으면 검사. 통과(=true)할 때만 제거.
      // 검사기 없으면 무조건 제거 (기존 동작 호환)
      const innerHtml = html.slice(innerStart, innerEnd);
      const shouldRemove = !contentCheck || contentCheck(innerHtml);

      if (shouldRemove) {
        result += html.slice(i, m.index);
        i = j;
      } else {
        // 매칭 div 자체는 보존하고 다음 char로 진행
        result += html.slice(i, m.index + m[0].length);
        i = m.index + m[0].length;
      }
    } else {
      // 매칭 안 됨 — div 태그까지 포함해서 보존하고 계속
      result += html.slice(i, m.index + m[0].length);
      i = m.index + m[0].length;
    }
  }

  return result;
}

/**
 * Naver 블로그 OG 링크 카드 블록 제거
 * SE3: se-module-oglink, se-section-oglink
 * SE2: se2_link
 */
function removeOgCards(html: string): string {
  let out = html;
  for (const pat of [/se-module-oglink/, /se-section-oglink/, /se2_link/]) {
    out = removeDivsByClass(out, pat);
  }
  return out;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x[0-9a-f]+;/gi, '')
    .replace(/&#\d+;/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 본문 텍스트에서 "한줄 코멘트" 이후 텍스트를 추출
 * 예: "한줄 코멘트.. 금리는 내려도 집값은 안 내린다" → "금리는 내려도 집값은 안 내린다"
 *
 * 주의: 메르 글은 상단에 '이전 글 소개'로 그 글의 한줄코멘트를 먼저 인용하고,
 * 현재 글의 진짜 한줄코멘트는 맨 아래에 둔다. 따라서 첫 매치가 아니라
 * **마지막 매치**를 잡아야 현재 글의 코멘트가 나온다.
 */
function extractOneLiner(text: string): string {
  const re = /한\s*줄\s*코멘트\s*[.．·:：]*\s*(.+?)(\n|$)/gi;
  let m: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((m = re.exec(text)) !== null) last = m;
  return last ? last[1].trim() : '';
}

/**
 * div depth tracking으로 본문 컨테이너의 진짜 끝을 찾아냄
 * (Naver 모바일 페이지는 `post_btn_area` 같은 마커가 없어서 regex로는 한계)
 */
function extractByDepth(html: string, openTagRegex: RegExp): string {
  const startMatch = html.match(openTagRegex);
  if (!startMatch || startMatch.index === undefined) return '';

  const contentStart = startMatch.index + startMatch[0].length;
  let depth = 1;
  let i = contentStart;

  while (i < html.length && depth > 0) {
    const openIdx = html.indexOf('<div', i);
    const closeIdx = html.indexOf('</div>', i);
    if (closeIdx === -1) break;
    if (openIdx !== -1 && openIdx < closeIdx) {
      depth += 1;
      i = openIdx + 4;
    } else {
      depth -= 1;
      if (depth === 0) return html.slice(contentStart, closeIdx);
      i = closeIdx + 6;
    }
  }
  return '';
}

/**
 * "뉴스내용" 패턴 인용 카드 HTML 제거
 *
 * Naver 블로그 SE3에서 작성자가 직접 [제목]+[뉴스내용]+[발췌] 형태로
 * 입력한 뉴스 인용 카드. OG 카드와 달리 일반 텍스트 컴포넌트라
 * class 단독으로는 식별 불가.
 *
 * 매칭 단위: <div class="se-component se-text"> 컴포넌트 (depth tracking)
 * 안전 조건 (둘 다 만족할 때만 제거):
 *   1) "뉴스내용" 또는 "뉴스 내용" 텍스트 포함
 *   2) <a> 링크 태그 1개 이상 포함
 *
 * → 실제 뉴스 인용 카드만 정확히 잡고,
 *   일반 텍스트 단락은 컴포넌트 단위로 보존.
 */
/**
 * 뉴스 인용 카드 제거 (단락 단위)
 *
 * 카드 구조 (Naver SE3 작성자가 직접 입력한 패턴):
 *   <p>...<a>제목</a>...</p>
 *   <p>뉴스내용</p>          ← 정확히 이 텍스트만 들어있는 단락 식별 마커
 *   <p>...<a>발췌</a>...</p>
 *
 * 동작:
 *   1) 모든 <p>...</p> 단락 추출 (위치 + 본문 텍스트)
 *   2) 본문 텍스트가 정확히 "뉴스내용" 또는 "뉴스 내용"인 단락 마킹
 *   3) 마킹된 단락의 직전/직후 "비어있지 않은" 단락도 마킹
 *      (사이에 빈 단락 ​ zero-width만 있는 경우 건너뛰며 탐색)
 *   4) 마킹된 단락들을 위치 기반 역순으로 통째 제거
 *
 * 안전성:
 *   - "뉴스내용" 정확 매칭 → "뉴스내용을 보면..." 같은 일반 문장 영향 없음
 *   - 단락 단위 → se-component 묶음에 영향받지 않음
 *   - 변형 없는 단순 텍스트 비교 → false positive 극히 낮음
 */
function removeNewsQuoteParagraphs(html: string): string {
  const paragraphs: { start: number; end: number; text: string }[] = [];
  const reP = /<p[^>]*>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = reP.exec(html)) !== null) {
    const inner = m[1];
    const text = inner
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/[​‌‍]/g, '') // zero-width 문자 제거
      .replace(/\s+/g, ' ')
      .trim();
    paragraphs.push({ start: m.index, end: m.index + m[0].length, text });
  }

  const toRemove = new Set<number>();
  for (let i = 0; i < paragraphs.length; i++) {
    const t = paragraphs[i].text;
    if (t === '뉴스내용' || t === '뉴스 내용') {
      toRemove.add(i);
      // 직전 비어있지 않은 단락
      for (let j = i - 1; j >= 0; j--) {
        if (paragraphs[j].text !== '') {
          toRemove.add(j);
          break;
        }
      }
      // 직후 비어있지 않은 단락
      for (let j = i + 1; j < paragraphs.length; j++) {
        if (paragraphs[j].text !== '') {
          toRemove.add(j);
          break;
        }
      }
    }
  }

  if (toRemove.size === 0) return html;

  // 위치 역순으로 제거 → 인덱스 무너지지 않음
  const ranges = Array.from(toRemove)
    .map((i) => paragraphs[i])
    .sort((a, b) => b.start - a.start);
  let out = html;
  for (const r of ranges) {
    out = out.slice(0, r.start) + out.slice(r.end);
  }
  return out;
}

function removeNewsQuoteCards(html: string): string {
  return removeNewsQuoteParagraphs(html);
}

function extractBody(html: string): string {
  // SmartEditor3 (최신 네이버 블로그)
  let raw = extractByDepth(html, /<div[^>]*class="[^"]*se-main-container[^"]*"[^>]*>/);
  if (!raw) {
    // 구형 SmartEditor2
    raw = extractByDepth(html, /<div[^>]*id=["']postViewArea["'][^>]*>/);
  }
  if (!raw) {
    // 더 구형
    raw = extractByDepth(html, /<div[^>]*class="[^"]*post_ct[^"]*"[^>]*>/);
  }
  return raw ? stripHtml(removeOgCards(removeNewsQuoteCards(raw))) : '';
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const postId = searchParams.get('postId');
  const blogId = searchParams.get('blogId') ?? 'ranto28';

  if (!postId) {
    return NextResponse.json({ content: '', error: 'postId required' }, { status: 400 });
  }

  try {
    const url = `https://m.blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${postId}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ content: '', error: `HTTP ${res.status}` }, { status: 200 });
    }

    const html = await res.text();
    const content = extractBody(html);
    const oneLiner = extractOneLiner(content);

    return NextResponse.json({ content, oneLiner, length: content.length });
  } catch (e) {
    return NextResponse.json({ content: '', error: String(e) }, { status: 200 });
  }
}
