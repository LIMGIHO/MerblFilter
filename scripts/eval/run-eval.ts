/**
 * LLM Eval Pipeline v2
 *
 * AISidePanel.tsx의 실제 파이프라인을 그대로 재현:
 *  - 동일한 시스템 프롬프트 (post / comments 모드)
 *  - 2-Stage 파이프라인 (post 모드: 구절 추출 → 답변)
 *  - 동일한 temperature / frequency_penalty / presence_penalty
 *  - 실제 서비스 모델: Qwen2.5-1.5B-Instruct-GGUF
 *
 * 실행: npx tsx scripts/eval/run-eval.ts
 * 전제:
 *   - LM Studio 서버 켜져 있어야 함 (http://localhost:1234)
 *     + Qwen2.5-1.5B-Instruct-GGUF 로드됨
 *   - Next.js dev 서버 켜져 있어야 함 (http://localhost:3000)
 */

import fs from 'fs';

// ── 설정 ────────────────────────────────────────────────────────────────
const CONFIG = {
  lmStudio:   'http://localhost:1234/v1',
  appBase:    'http://localhost:3000',
  blogId:     'ranto28',

  // 실제 서비스와 동일한 모델 (LM Studio API Identifier 기준)
  runnerModel: 'qwen2.5-1.5b-instruct',
  judgeModel:  'qwen3.5-4b-claude-4.6-opus-reasoning-distilled',

  samplePosts:      30,  // 게시글 수
  outputFile: 'scripts/eval/results.json',
};

// ── 테스트 질문 세트 (게시글당 3개, 컨텍스트 명시) ─────────────────────
const QUESTIONS: { q: string; context: 'post' | 'comments' }[] = [
  { q: '이 글의 핵심 내용을 3줄로 요약해줘',  context: 'post' },     // isSummary=true → temp 0.2
  { q: '저자의 주요 주장이 뭐야?',            context: 'post' },     // isSummary=false → temp 0.4
  { q: '댓글 반응이 어때?',                   context: 'comments' }, // comments 모드 → temp 0.4
];

// ── 타입 ─────────────────────────────────────────────────────────────────
interface Post { postId: string; title: string }

interface EvalItem {
  postId:   string;
  title:    string;
  question: string;
  context:  'post' | 'comments';
  stage1?:  string;   // post 모드 Stage1 추출 결과
  answer:   string;
  scores: {
    faithfulness:    number;
    relevance:       number;
    noHallucination: number;
    korean:          number;
    total:           number;
  };
  judgeReason: string;
  passed: boolean;
}

// ── AISidePanel.tsx와 완전히 동일한 COMMON_RULES ──────────────────────
const COMMON_RULES = `
- URL·링크·참조 출처를 절대 생성하지 마세요. 본문에 없는 링크는 존재하지 않습니다.
- "메르님은 ...을 바탕으로 답변합니다" 같은 메타 설명 텍스트 금지. 바로 내용만 작성.
- 같은 내용을 반복하지 마세요. 각 정보는 한 번만 언급.
- 한국어, "~입니다/~합니다" 어미 일관 사용.`;

function getSystemPrompt(context: 'post' | 'comments'): string {
  if (context === 'post') {
    return `당신은 아래 제공된 [본문]만을 근거로 답하는 블로그 분석 어시스턴트입니다.

절대 규칙:
- [본문]에 있는 내용만 사용하세요. 일반 상식이나 외부 지식으로 답하지 마세요.
- 본문에 없는 내용을 묻는 경우 "이 게시글에서는 해당 내용을 다루지 않습니다."라고만 답하세요.
- 마크다운(**굵게**, - 목록, 1. 번호) 적극 활용해 가독성 확보.
- 요약을 요청받으면 응답 마지막에 **[메르의 코멘트]** 섹션을 추가하고 원문을 그대로 인용하세요.${COMMON_RULES}`;
  }
  // comments
  return `당신은 아래 제공된 [독자 댓글]만을 분석하는 어시스턴트입니다.

절대 규칙:
- [독자 댓글]에 있는 내용만 사용하세요. 추론하거나 외부 지식을 사용하지 마세요.
- 댓글에 없는 내용을 묻는 경우 "댓글에서는 해당 내용을 찾을 수 없습니다."라고만 답하세요.
- 마크다운(**굵게**, - 목록, 1. 번호) 적극 활용해 가독성 확보.${COMMON_RULES}`;
}

// ── LM Studio API 호출 ───────────────────────────────────────────────────
async function callLM(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  opts: { temperature: number; maxTokens: number; frequencyPenalty?: number; presencePenalty?: number } = { temperature: 0.3, maxTokens: 400 },
): Promise<string> {
  const res = await fetch(`${CONFIG.lmStudio}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
      temperature:       opts.temperature,
      max_tokens:        opts.maxTokens,
      frequency_penalty: opts.frequencyPenalty ?? 0,
      presence_penalty:  opts.presencePenalty  ?? 0,
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`LM Studio 오류: ${res.status} ${await res.text()}`);
  const data = await res.json() as {
    choices: Array<{ message: { content: string; reasoning_content?: string } }>
  };
  const msg = data.choices[0].message;
  return (msg.content || msg.reasoning_content || '').trim();
}

// ── 앱 API ──────────────────────────────────────────────────────────────
async function fetchPosts(): Promise<Post[]> {
  const res = await fetch(`${CONFIG.appBase}/api/posts?blogId=${CONFIG.blogId}`);
  if (!res.ok) throw new Error('게시글 목록 API 실패');
  return res.json();
}

async function fetchPostContent(postId: string): Promise<{ content: string; oneLiner: string }> {
  const res = await fetch(`${CONFIG.appBase}/api/post-content?postId=${postId}&blogId=${CONFIG.blogId}`);
  if (!res.ok) return { content: '', oneLiner: '' };
  return res.json();
}

async function fetchComments(postId: string): Promise<string> {
  const res = await fetch(`${CONFIG.appBase}/api/comments?blogId=${CONFIG.blogId}&postId=${postId}&page=1`);
  if (!res.ok) return '';
  const json = await res.json() as { result?: { commentList?: Array<{ contents?: string; writerNickname?: string }> } };
  const list = json?.result?.commentList ?? [];
  return list
    .filter(c => c.contents)
    .slice(0, 50)
    .map(c => `${c.writerNickname || '익명'}: ${(c.contents || '').replace(/<[^>]+>/g, '').slice(0, 150)}`)
    .join('\n');
}

// ── 실제 서비스와 동일한 2-Stage 파이프라인 ────────────────────────────
async function runPipeline(
  context: 'post' | 'comments',
  title: string,
  postBody: string,
  oneLiner: string,
  commentsText: string,
  question: string,
): Promise<{ answer: string; stage1?: string }> {

  const isSummary = /요약|정리|핵심|3줄/.test(question);
  // AISidePanel.tsx와 동일한 temperature 분기
  const temperature = isSummary ? 0.2 : 0.4;
  // AISidePanel.tsx와 동일한 maxTokens 분기
  const maxTokens = isSummary ? 1024 : 1536;

  const systemPrompt = getSystemPrompt(context);

  // ── comments 모드: 1-Stage ──────────────────────────────────────────
  if (context === 'comments') {
    const userPrompt = `[게시글 제목]\n${title}\n\n[독자 댓글]\n${commentsText || '(댓글 없음)'}\n\n[요청]\n${question}`;
    const answer = await callLM(CONFIG.runnerModel, systemPrompt, userPrompt, {
      temperature,
      maxTokens,
      frequencyPenalty: 0.6,
      presencePenalty:  0.4,
    });
    return { answer };
  }

  // ── post 모드: 2-Stage ──────────────────────────────────────────────
  let stage1Result: string | undefined;
  let finalUserPrompt: string;

  if (postBody) {
    // Stage 1: 구절 추출 (temp 0.1, maxTokens 200) — AISidePanel.tsx와 동일
    const stage1System = `주어진 [본문]에서 [질문]에 직접 답할 수 있는 문장을 2~3개 그대로 인용하세요. 인용문만 출력하고 설명은 쓰지 마세요. 관련 내용이 없으면 "없음"이라고만 쓰세요.`;
    const stage1Prompt = `[본문]\n${postBody}\n\n[메르의 코멘트 (본문의 일부로 취급)]\n${oneLiner || ''}\n\n[질문]\n${question}`;
    stage1Result = await callLM(CONFIG.runnerModel, stage1System, stage1Prompt, {
      temperature: 0.1,
      maxTokens: 200,
    });

    // Stage 1 결과 유효성 검사 (AISidePanel.tsx와 동일)
    const extracted = stage1Result.trim();
    const isValid = extracted.length > 15 && !extracted.startsWith('없음') && !extracted.startsWith('관련');

    if (isValid) {
      finalUserPrompt = `[게시글 제목]\n${title}\n\n[본문 (관련 구절)]\n${extracted}\n\n[메르의 코멘트 (작성자 후기)]\n${oneLiner || '(없음)'}\n\n[요청]\n${question}`;
    } else {
      // Stage 1 실패 → 원본 전체 본문으로 fallback
      stage1Result = `[fallback] ${extracted}`;
      finalUserPrompt = `[게시글 제목]\n${title}\n\n[본문]\n${postBody.slice(0, 3000)}\n\n[메르의 코멘트 (작성자 후기)]\n${oneLiner || '(없음)'}\n\n[요청]\n${question}`;
    }
  } else {
    finalUserPrompt = `[게시글 제목]\n${title}\n\n[본문]\n(본문을 가져오지 못했습니다)\n\n[요청]\n${question}`;
  }

  // Stage 2: 실제 답변 생성
  const answer = await callLM(CONFIG.runnerModel, systemPrompt, finalUserPrompt, {
    temperature,
    maxTokens,
    frequencyPenalty: 0.6,
    presencePenalty:  0.4,
  });

  return { answer, stage1: stage1Result };
}

// ── Judge 채점 ───────────────────────────────────────────────────────────
async function judgeAnswer(
  question: string,
  context: string,
  answer: string,
  sourceText: string,
): Promise<{ scores: EvalItem['scores']; reason: string }> {
  const judgeSystem = `당신은 AI 어시스턴트 응답 품질 평가자입니다.
다음 기준으로 각 항목을 1~5점으로 채점하세요. 반드시 JSON으로만 응답하세요.

채점 기준:
- faithfulness (1~5): 답변이 제공된 소스 텍스트에만 근거하는가? 없는 내용 추가 없는가?
- relevance (1~5): 질문에 정확히 답하는가? 주제에서 벗어나지 않는가?
- noHallucination (1~5): 사실을 정확히 인용하는가? 없는 정보·가짜 링크·오타 없는가?
- korean (1~5): 한국어가 자연스럽고 어색하지 않은가? 어미가 일관적인가?

응답 형식 (JSON만, 다른 텍스트 없이):
{"faithfulness":4,"relevance":5,"noHallucination":3,"korean":4,"reason":"이유를 한 문장으로"}`;

  const judgeUser = `[질문]\n${question}\n\n[컨텍스트 타입]\n${context}\n\n[소스 텍스트 (앞 600자)]\n${sourceText.slice(0, 600)}\n\n[AI 답변]\n${answer.slice(0, 1000)}`;

  const raw = await callLM(CONFIG.judgeModel, judgeSystem, judgeUser, { temperature: 0.1, maxTokens: 800 });

  try {
    const stripped = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const jsonMatch = stripped.match(/\{[\s\S]*?\}/) ?? raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error(`JSON 없음: ${raw.slice(0, 200)}`);
    const parsed = JSON.parse(jsonMatch[0]) as {
      faithfulness: number; relevance: number;
      noHallucination: number; korean: number; reason: string;
    };
    const total = (parsed.faithfulness + parsed.relevance + parsed.noHallucination + parsed.korean) / 4;
    return {
      scores: { ...parsed, total: Math.round(total * 10) / 10 },
      reason: parsed.reason,
    };
  } catch {
    return {
      scores: { faithfulness: 0, relevance: 0, noHallucination: 0, korean: 0, total: 0 },
      reason: `Judge 파싱 실패: ${raw.slice(0, 150)}`,
    };
  }
}

// ── 메인 ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 LLM Eval Pipeline v2 시작');
  console.log(`   모델: ${CONFIG.runnerModel}`);
  console.log(`   파이프라인: AISidePanel.tsx 실제 로직과 동일\n`);

  // LM Studio 연결 확인
  try {
    const r = await fetch(`${CONFIG.lmStudio}/models`);
    const d = await r.json() as { data: Array<{ id: string }> };
    const ids = d.data.map((m: {id: string}) => m.id);
    console.log(`✅ LM Studio 연결됨. 로드된 모델: ${ids.join(', ')}\n`);
    // 모델 ID 자동 매칭 (qwen2.5-1.5b 포함 여부 확인)
    const qwenModel = ids.find((id: string) => id.toLowerCase().includes('qwen2.5') && id.toLowerCase().includes('1.5b'));
    if (qwenModel && qwenModel !== CONFIG.runnerModel) {
      CONFIG.runnerModel = qwenModel;
      console.log(`   → 자동 감지된 모델 ID: ${qwenModel}\n`);
    }
  } catch {
    console.error('❌ LM Studio에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.');
    process.exit(1);
  }

  // 게시글 목록
  console.log('📰 게시글 목록 가져오는 중...');
  const allPosts = await fetchPosts();
  const posts = allPosts.slice(0, CONFIG.samplePosts);
  console.log(`   → ${posts.length}개 게시글 선택\n`);

  const results: EvalItem[] = [];

  for (let pi = 0; pi < posts.length; pi++) {
    const post = posts[pi];
    console.log(`\n[${pi + 1}/${posts.length}] "${post.title.slice(0, 50)}"`);

    // 본문 + 댓글 병렬 fetch
    const [{ content: postBody, oneLiner }, commentsText] = await Promise.all([
      fetchPostContent(post.postId),
      fetchComments(post.postId),
    ]);

    for (const { q: question, context } of QUESTIONS) {
      const label = context === 'post' ? '📄' : '💬';
      process.stdout.write(`  ${label} "${question.slice(0, 30)}..." `);

      try {
        // 실제 파이프라인 실행
        const { answer, stage1 } = await runPipeline(
          context, post.title, postBody, oneLiner, commentsText, question
        );

        // Judge 채점
        const sourceText = context === 'post'
          ? `${postBody.slice(0, 600)}\n[코멘트] ${oneLiner}`
          : commentsText.slice(0, 600);
        const { scores, reason } = await judgeAnswer(question, context, answer, sourceText);

        const item: EvalItem = {
          postId: post.postId,
          title:  post.title,
          question,
          context,
          stage1,
          answer,
          scores,
          judgeReason: reason,
          passed: scores.total >= 3.5,
        };
        results.push(item);

        const icon = item.passed ? '✅' : '❌';
        console.log(`${icon} ${scores.total.toFixed(1)} — ${reason.slice(0, 60)}`);
      } catch (e) {
        console.log(`💥 오류: ${String(e).slice(0, 80)}`);
        results.push({
          postId: post.postId, title: post.title,
          question, context, answer: '', stage1: undefined,
          scores: { faithfulness: 0, relevance: 0, noHallucination: 0, korean: 0, total: 0 },
          judgeReason: `실행 오류: ${String(e).slice(0, 100)}`,
          passed: false,
        });
      }
    }

    // 중간 저장 (10게시글마다)
    if ((pi + 1) % 10 === 0) {
      fs.writeFileSync(CONFIG.outputFile, JSON.stringify(results, null, 2));
      console.log(`\n   💾 중간 저장 완료 (${results.length}개)`);
    }
  }

  // ── 결과 요약 ────────────────────────────────────────────────────────
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const avgTotal     = results.reduce((s, r) => s + r.scores.total, 0) / total;
  const avgFaith     = results.reduce((s, r) => s + r.scores.faithfulness, 0) / total;
  const avgRel       = results.reduce((s, r) => s + r.scores.relevance, 0) / total;
  const avgHalluc    = results.reduce((s, r) => s + r.scores.noHallucination, 0) / total;
  const avgKorean    = results.reduce((s, r) => s + r.scores.korean, 0) / total;

  const postItems     = results.filter(r => r.context === 'post');
  const commentsItems = results.filter(r => r.context === 'comments');
  const stage1Valid   = postItems.filter(r => r.stage1 && !r.stage1.startsWith('[fallback]')).length;

  console.log('\n' + '═'.repeat(60));
  console.log('📊 결과 요약');
  console.log('═'.repeat(60));
  console.log(`총 질문:    ${total}개`);
  console.log(`통과 (≥3.5): ${passed}개 (${Math.round(passed/total*100)}%)`);
  console.log(`평균 점수:  ${avgTotal.toFixed(2)} / 5.0\n`);
  console.log('항목별 점수:');
  console.log(`  충실성       (faithfulness):  ${avgFaith.toFixed(2)}`);
  console.log(`  관련성       (relevance):     ${avgRel.toFixed(2)}`);
  console.log(`  환각 없음    (no hallucin.):  ${avgHalluc.toFixed(2)}`);
  console.log(`  한국어 품질  (korean):        ${avgKorean.toFixed(2)}`);
  console.log(`\n컨텍스트별:`);
  const avgPost = postItems.length ? postItems.reduce((s,r) => s+r.scores.total, 0)/postItems.length : 0;
  const avgCom  = commentsItems.length ? commentsItems.reduce((s,r) => s+r.scores.total, 0)/commentsItems.length : 0;
  console.log(`  post       ${avgPost.toFixed(2)} / 5.0  (Stage1 성공: ${stage1Valid}/${postItems.length})`);
  console.log(`  comments   ${avgCom.toFixed(2)} / 5.0`);

  // 최하위 10개
  const worst = [...results].sort((a, b) => a.scores.total - b.scores.total).slice(0, 10);
  console.log('\n❌ 최하위 10개:');
  worst.forEach((r, i) => {
    console.log(`  ${i+1}. [${r.context}] "${r.question}" → ${r.scores.total} — ${r.judgeReason.slice(0, 60)}`);
  });

  // 최상위 10개
  const best = [...results].sort((a, b) => b.scores.total - a.scores.total).slice(0, 10);
  console.log('\n✅ 최상위 10개:');
  best.forEach((r, i) => {
    console.log(`  ${i+1}. [${r.context}] "${r.question}" → ${r.scores.total} — ${r.judgeReason.slice(0, 60)}`);
  });

  console.log('═'.repeat(60));

  // 최종 저장
  fs.writeFileSync(CONFIG.outputFile, JSON.stringify(results, null, 2));
  console.log(`\n💾 상세 결과 저장: ${CONFIG.outputFile}`);
}

main().catch(console.error);
