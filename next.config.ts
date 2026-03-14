import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // Velocidad extrema: saltamos la comprobación de tipos durante el build.
    // Los errores se verán en el IDE o en el pre-commit.
    ignoreBuildErrors: true,
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
