import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

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
      {
        // Banderas y logo del Mundial de Hockey, servidos por la FIH (Altius RT).
        protocol: 'https',
        hostname: 'hockey-cdn.altius.live',
      },
    ],
  },
  typescript: {
    // Keep production builds honest: type errors must fail the build.
    // Temporary scratch files are excluded in tsconfig.json instead.
    ignoreBuildErrors: false,
  },
  // Las rutas que dibujan la tarjeta compartible leen los .otf de Articulat con
  // `readFile` en tiempo de request (ver `src/lib/carrera/cardFonts.ts`). Los
  // archivos de `public/` se sirven estáticos pero NO entran solos en el bundle
  // del servidor, así que sin esto la imagen sale con la tipografía genérica en
  // producción y nadie se entera hasta que alguien comparte su carrera.
  outputFileTracingIncludes: {
    '/juegos/minijuegos/carrera-rugby/c/[token]/imagen': ['./public/fonts/articulat/**'],
    '/juegos/minijuegos/carrera-rugby/c/[token]/opengraph-image': ['./public/fonts/articulat/**'],
  },
  // El globo "N" de las Dev Tools de Next se planta abajo a la izquierda y en
  // mobile tapa el final de la pantalla — en Carrera de Rugby se come las
  // últimas líneas del retiro. Sólo existe en `next dev` (producción nunca lo
  // muestra), así que apagarlo no cambia nada de lo que ve el jugador: cambia lo
  // que vemos nosotros al probar en 390px, que es donde se diseña este juego.
  devIndicators: false,
  experimental: {
    // Turbopack guarda su caché de dev como una base de datos en disco (.next/dev/cache,
    // archivos .sst). OneDrive sincroniza esa carpeta y deja los archivos mapeados en
    // memoria, así que Turbopack no puede reescribirlos: falla con ERROR_USER_MAPPED_FILE
    // (os error 1224), el índice queda apuntando a .sst inexistentes y el siguiente read
    // hace panic en Rust y mata el dev server. Sin caché persistente no hay nada que
    // corromper. Solo afecta a dev; el build usa turbopackFileSystemCacheForBuild (false).
    // Se puede volver a activar si el proyecto sale de OneDrive.
    turbopackFileSystemCacheForDev: false,
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

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

export default bundleAnalyzer(nextConfig);
