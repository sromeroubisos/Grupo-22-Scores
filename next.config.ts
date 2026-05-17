import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'static.flashscore.com',
      },
      {
        protocol: 'https',
        hostname: 'a.espncdn.com',
      },
    ],
  },
  typescript: {
    // Keep production builds honest: type errors must fail the build.
    // Temporary scratch files are excluded in tsconfig.json instead.
    ignoreBuildErrors: false,
  },
  experimental: {
    // Optimiza la carga de librerías pesadas para que el build y el HMR sean más rápidos
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities',
    ],
  },
  async headers() {
    const authNoStoreHeaders = [
      {
        key: 'Cache-Control',
        value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
      {
        key: 'Pragma',
        value: 'no-cache',
      },
      {
        key: 'Expires',
        value: '0',
      },
    ];

    return [
      {
        source: '/login',
        headers: authNoStoreHeaders,
      },
      {
        source: '/auth/:path*',
        headers: authNoStoreHeaders,
      },
      {
        source: '/api/auth/:path*',
        headers: authNoStoreHeaders,
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
      {
        source: '/logos/clubs/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=604800',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600',
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/torneos/:id',
        destination: '/tournaments/:id',
        permanent: true,
      },
      {
        source: '/clubes/:id',
        destination: '/clubs/:id',
        permanent: true,
      },
      {
        source: '/jugadores/:id',
        destination: '/players/:id',
        permanent: true,
      },
      {
        source: '/partidos/:id',
        destination: '/matches/:id',
        permanent: true,
      },
      {
        source: '/admin/super/torneos/:id((?!crear$|ingesta$|new$)[^/]+)',
        destination: '/admin/entities/:id/manage',
        permanent: false,
      },
      {
        source: '/admin/super/clubes/:id((?!crear$|new$)[^/]+)',
        destination: '/admin/entities/:id/manage',
        permanent: false,
      },
      {
        source: '/admin/mis-torneos',
        destination: '/admin',
        permanent: false,
      }
    ];
  },

};

export default nextConfig;
