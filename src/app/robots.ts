// robots.txt: el sitio es público salvo lo privado, y declara los sitemaps
// para que cualquier buscador los encuentre solo.
//
// La API no se cierra entera: las fichas de partido, club y torneo se pintan
// en el navegador con lo que traen estos endpoints de LECTURA, y Google
// renderiza con las mismas reglas que rastrea. Con /api/ bloqueado entero veía
// la ficha vacía. Lo que escribe o es privado (admin, cron, auth, cuentas)
// sigue cerrado; la regla más larga gana, así que estos Allow le ganan al
// Disallow de /api/.

import type { MetadataRoute } from 'next';

import { publicSiteUrl } from '@/lib/seo/siteUrl';

const RENDER_APIS = [
    '/api/matches/',
    '/api/teams',
    '/api/team-squads',
    '/api/tournaments',
    '/api/db/standings',
    '/api/db/tournaments',
    '/api/public/',
    '/api/home/',
    '/api/news',
    '/api/assets/',
    '/api/players',
    '/api/rankings',
];

export default function robots(): MetadataRoute.Robots {
    const base = publicSiteUrl();
    return {
        rules: [
            {
                userAgent: '*',
                allow: ['/', ...RENDER_APIS],
                disallow: [
                    '/api/',
                    '/admin/',
                    '/club-admin/',
                    '/auth/',
                    '/profile',
                    '/favorites',
                    '/notifications',
                    '/billing',
                    '/checkout/',
                    '/exportar',
                    '/invitacion-club',
                    '/matches/*/editar',
                ],
            },
        ],
        sitemap: [
            `${base}/sitemap.xml`,
            `${base}/tournaments/sitemap.xml`,
            `${base}/clubs/sitemap.xml`,
            `${base}/matches/sitemap.xml`,
        ],
    };
}
