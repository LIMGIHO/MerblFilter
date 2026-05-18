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
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },

  webpack: (config, { isServer }) => {
    // Node polyfill 제거
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };

    // Web Worker 지원: .worker.ts 파일을 worker-loader로 처리
    if (!isServer) {
      config.module.rules.push({
        test: /\.worker\.(ts|js)$/,
        use: [{ loader: 'worker-loader', options: { inline: 'no-fallback' } }],
      });
    }

    return config;
  },
};

export default nextConfig;
