// /tournaments/sitemap.xml: cada torneo público, por la misma URL que declara
// su canonical (el slug si lo tiene). Ver lib/seo/sitemapData.ts.

import type { MetadataRoute } from 'next';

import { publicTournaments } from '@/lib/seo/sitemapData';
import { publicSiteUrl } from '@/lib/seo/siteUrl';

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const base = publicSiteUrl();
    return (await publicTournaments()).map((row) => ({
        url: `${base}/tournaments/${encodeURIComponent(row.slug || row.id)}`,
        lastModified: row.updated_at ?? undefined,
        changeFrequency: 'daily',
        priority: 0.8,
    }));
}
