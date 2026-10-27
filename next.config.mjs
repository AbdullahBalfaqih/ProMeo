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
    const backend = process.env.BACKEND_URL;
    if (backend) {
      return [
        { source: '/console', destination: `${backend}/console` },
        { source: '/admin', destination: `${backend}/admin` },
        { source: '/healthz', destination: `${backend}/healthz` },
        { source: '/v1/:path*', destination: `${backend}/v1/:path*` },
      ];
    }
    return [];
  },
};

export default nextConfig;
