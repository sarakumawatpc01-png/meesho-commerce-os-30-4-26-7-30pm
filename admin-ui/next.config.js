/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SUPERADMIN_DOMAIN: process.env.NEXT_PUBLIC_SUPERADMIN_DOMAIN || 'meesho.agencyfic.com',
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.meesho.com' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: 'img.clerk.com' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/engine/:path*',
        destination: `${process.env.NEXT_PUBLIC_ENGINE_URL || 'http://engine:3001'}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
