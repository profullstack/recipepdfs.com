import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The image runs the standalone server under Bun (`bun server.js`): it bundles
  // the server and only the dependencies it actually imports.
  output: 'standalone',
  // Trace from this directory, never a lockfile further up the disk, so
  // server.js always lands at the top of .next/standalone.
  outputFileTracingRoot: new URL('.', import.meta.url).pathname,
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
};

export default nextConfig;
