/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },

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
