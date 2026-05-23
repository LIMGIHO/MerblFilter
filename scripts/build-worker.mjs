#!/usr/bin/env node
/**
 * llm.worker.ts를 webpack 없이 esbuild로 독립 번들링
 * 출력: public/llm-worker.js
 *
 * 실행: node scripts/build-worker.mjs
 * (또는 pnpm build:worker)
 *
 * 왜 필요한가:
 *   webpack 5 + Next.js dev 모드에서 new Worker(new URL('./llm.worker.ts', ...)) 패턴이
 *   app-pages-browser 청크(React, document 참조 포함)로 번들되어 Worker 컨텍스트에서 즉사함.
 *   esbuild로 Worker-only 독립 번들을 생성하면 이 문제를 완전히 우회.
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

await build({
  entryPoints: [resolve(root, 'src/features/llm/llm.worker.ts')],
  bundle: true,
  outfile: resolve(root, 'public/llm-worker.js'),
  platform: 'browser',
  target: ['chrome90', 'firefox90', 'safari15'],
  format: 'iife',
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env': '{}',
    'process.platform': '"browser"',
  },
  // Worker 전용: DOM API 없음, self/globalThis만 사용
  globalName: undefined,
  treeShaking: true,
  minify: false, // 디버깅 편의상 압축 안 함 (필요시 true)
  sourcemap: false,
  logLevel: 'info',
});

console.log('✅ public/llm-worker.js 빌드 완료');
