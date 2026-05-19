/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },

  // msedge-tts(내부적으로 ws 사용) 같은 네이티브 의존 패키지를 번들링하지 않고 그대로 require
  serverExternalPackages: ['msedge-tts', 'ws', 'bufferutil', 'utf-8-validate'],

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'blogimgs.pstatic.net', pathname: '/**' },
      { protocol: 'http', hostname: 'blogpfthumb.phinf.naver.net', pathname: '/**' },
      { protocol: 'https', hostname: 'blogpfthumb.phinf.naver.net', pathname: '/**' },
    ],
  },

  async headers() {
    return [
      {
        // 메인 목록 페이지에만 COEP/COOP 적용 (LLM 사용)
        source: '/posts',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
    ];
  },

  webpack: (config) => {
    // Node polyfill 제거
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };

    // Web Worker는 webpack 5 네이티브 방식(new URL('./llm.worker.ts', import.meta.url))으로 처리
    // worker-loader 제거 — 두 방식 동시 사용 시 "missing bootstrap script" 오류 발생

    return config;
  },
};

export default nextConfig;
