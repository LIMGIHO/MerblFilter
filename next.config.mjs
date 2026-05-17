/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'blogimgs.pstatic.net',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig; 