import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: 'export', // Commented out to allow API routes
  reactStrictMode: true,
  distDir: 'out',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  assetPrefix: '/',
};

export default nextConfig;
