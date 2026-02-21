import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async redirects() {
    return [
      {
        source: '/torneos/:id',
        destination: '/tournaments/:id',
        permanent: false, // 307 Temporal redirects per Phase 0 spec
      },
      {
        source: '/clubes/:id',
        destination: '/clubs/:id',
        permanent: false,
      },
      {
        source: '/jugadores/:id',
        destination: '/players/:id',
        permanent: false,
      },
      {
        source: '/admin/super/torneos/:id',
        destination: '/admin/entities/:id/manage',
        permanent: false,
      },
      {
        source: '/admin/super/clubes/:id',
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
