import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  distDir: 'out',
  images: {
    unoptimized: true,
  },
  // Required for Tauri to access the app
  assetPrefix: './',
};

export default nextConfig;
