/** @type {import('next').NextConfig} */
const nextConfig = {
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