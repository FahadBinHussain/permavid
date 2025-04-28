import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: true,
  distDir: 'out',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  assetPrefix: '/',
};

export default nextConfig;
