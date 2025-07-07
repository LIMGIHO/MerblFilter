import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'blogimgs.pstatic.net',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'ssl.pstatic.net',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'blogpfthumb.phinf.naver.net',
        pathname: '/**',
      }
    ],
  },
};

export default nextConfig;
