import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: 'out',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  assetPrefix: '/',
};

export default nextConfig;
