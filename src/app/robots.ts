// robots.txt: el sitio es público salvo el admin y la API, y el sitemap
// queda declarado para que cualquier buscador lo encuentre solo.

import type { MetadataRoute } from 'next';

import { publicSiteUrl } from '@/lib/seo/siteUrl';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: ['/admin/', '/api/'],
            },
        ],
        sitemap: `${publicSiteUrl()}/sitemap.xml`,
    };
}
