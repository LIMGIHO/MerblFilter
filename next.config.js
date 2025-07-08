/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'blogpfthumb.phinf.naver.net',
      },
      {
        protocol: 'https',
        hostname: 'blogpfthumb.phinf.naver.net',
      },
      {
        protocol: 'http',
        hostname: 'postfiles.pstatic.net',
      },
      {
        protocol: 'https',
        hostname: 'postfiles.pstatic.net',
      },
      {
        protocol: 'http',
        hostname: 'phinf.pstatic.net',
      },
      {
        protocol: 'https',
        hostname: 'phinf.pstatic.net',
      },
    ],
  },
};

module.exports = nextConfig; 