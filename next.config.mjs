import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
  async rewrites() {
    return [
      { source: '/console', destination: 'http://127.0.0.1:4000/console' },
      { source: '/admin', destination: 'http://127.0.0.1:4000/admin' },
      { source: '/healthz', destination: 'http://127.0.0.1:4000/healthz' },
      { source: '/v1/:path*', destination: 'http://127.0.0.1:4000/v1/:path*' },
    ];
  },
};

export default nextConfig;
