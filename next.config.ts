import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

// ─── Encabezados de seguridad ────────────────────────────────────────────────
//
// La CSP va en REPORT-ONLY a propósito: el sitio carga fuentes de Google y de
// Typekit, embebe videos de seis plataformas, el captcha de Cloudflare y la
// analítica de Vercel, y una lista incompleta en modo enforced rompe pantallas
// sin aviso. Report-only deja ver en la consola qué bloquearía; cuando quede
// limpia, se pasa a `Content-Security-Policy`. 'unsafe-inline' en script-src
// sigue porque el layout tiene scripts inline (tema, JSON-LD) y Next mete los
// suyos; sacarlo pide nonces en el proxy.
const isDev = process.env.NODE_ENV !== 'production';

// El servicio de Python (sofascore) se llama desde el cliente cuando está configurado.
function originOf(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://challenges.cloudflare.com https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://use.typekit.net https://p.typekit.net",
  "font-src 'self' data: https://fonts.gstatic.com https://use.typekit.net",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  [
    "connect-src 'self'",
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://challenges.cloudflare.com',
    'https://vitals.vercel-insights.com',
    'https://va.vercel-scripts.com',
    originOf(process.env.NEXT_PUBLIC_SOFASCORE_SERVICE_URL),
    isDev ? 'ws://localhost:* http://localhost:*' : null,
  ].filter(Boolean).join(' '),
  // Los reproductores que arma `videoLinks.ts` (embedUrl) y el captcha.
  [
    "frame-src 'self'",
    'https://www.youtube-nocookie.com',
    'https://www.youtube.com',
    'https://player.vimeo.com',
    'https://www.dailymotion.com',
    'https://www.facebook.com',
    'https://player.twitch.tv',
    'https://clips.twitch.tv',
    'https://platform.twitter.com',
    'https://www.instagram.com',
    'https://www.tiktok.com',
    'https://challenges.cloudflare.com',
  ].join(' '),
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Ninguna página del sitio se enmarca desde afuera; las placas del export se
  // dibujan en canvas, no en iframe. SAMEORIGIN deja abierta la puerta propia.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Sin `includeSubDomains` ni `preload` a propósito: la lista de preload de los
  // navegadores tarda meses en revertirse, y no está relevado si algún subdominio
  // de g22scores.com sirve solo http. Subirlo cuando eso esté confirmado.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  // payment=(self): el checkout de MercadoPago es por redirect, pero no cuesta
  // dejarle la API de pagos al propio origen.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
  { key: 'Content-Security-Policy-Report-Only', value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  // No anunciar el framework en cada respuesta.
  poweredByHeader: false,
  /* config options here */
  images: {
    // Next 16 cambio el default de `localPatterns`: si no se declara, la config
    // queda en [{ pathname: '**', search: '' }] y CUALQUIER imagen local con
    // query string hace tirar a `next/image` (error E871) en pleno render.
    //
    // El escudo de todo partido de base de datos entra por
    // `/api/assets/team-logo?key=...&name=...&v=...` (ver `logoUrl.ts` y
    // `TeamLogo.tsx`), asi que la portada, /resultados y /fixtures se caian
    // enteras con "ERROR INESPERADO" apenas aparecia un partido nuestro. Los
    // partidos externos seguian dibujandose porque traen URL absoluta de
    // FlashScore: por eso el sintoma se leia como "la base carga mal" cuando en
    // realidad era el proxy de escudos.
    //
    // Al proxy se le permite cualquier query (`search` omitido = no se compara);
    // el resto del sitio se queda con la regla nueva, sin query.
    localPatterns: [
      { pathname: '/api/assets/team-logo' },
      { pathname: '**', search: '' },
    ],
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
      {
        // Escudos de los clubes y logos de competicion de RugbyPass. Sin
        // declarar el host, el escudo no carga — y un host no declarado puede
        // voltear la pantalla entera, no solo dejar el hueco.
        protocol: 'https',
        hostname: 'eu-cdn.rugbypass.com',
      },
      {
        // Escudos de las franquicias y logo de la liga Ultimate Sevens, servidos
        // desde el WordPress de su match centre (`wp-content/uploads`).
        protocol: 'https',
        hostname: 'www.ultimatesevens.com',
        pathname: '/wp-content/uploads/**',
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
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // El proxy de escudos sirve imagenes desde NUESTRO origen. Aunque la ruta ya
        // verifica el contenido, si algo se le escapara (un SVG, un HTML) esta CSP
        // lo deja inerte: sin scripts, sin formularios, sin navegar, como sandbox.
        // Va enforced, no report-only: una imagen no necesita nada de eso.
        source: '/api/assets/team-logo',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
          },
        ],
      },
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
      // cornercorto.com es un dominio del mismo proyecto de Vercel que manda
      // derecho a la home de hockey. Se redirige (no se reescribe) para que el
      // dominio no quede como espejo indexable de todo el sitio ni abra una
      // sesion aparte por host. Quedan afuera /api/* (crons y fetches). 307 a
      // proposito: un 308 lo cachea el navegador y ata las manos si mas
      // adelante el dominio pasa a servir hockey con marca propia.
      {
        source: '/:path((?!api(?:/|$)).*)',
        has: [{ type: 'host', value: '(www\\.)?cornercorto\\.com' }],
        destination: 'https://www.g22scores.com/?sport=field-hockey',
        permanent: false,
      },
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
