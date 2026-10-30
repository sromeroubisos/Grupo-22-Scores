// /matches/sitemap.xml: los partidos de los últimos 18 meses y los próximos
// 60 días. Ver lib/seo/sitemapData.ts.

import type { MetadataRoute } from 'next';

import { recentMatches } from '@/lib/seo/sitemapData';
import { publicSiteUrl } from '@/lib/seo/siteUrl';

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const base = publicSiteUrl();
    return (await recentMatches()).map((row) => ({
        url: `${base}/matches/${row.id}`,
        lastModified: row.updated_at ?? undefined,
        changeFrequency: 'daily',
        priority: 0.5,
    }));
}
