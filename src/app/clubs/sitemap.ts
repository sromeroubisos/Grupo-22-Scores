// /clubs/sitemap.xml: cada club visible, por su id (el canonical de la ficha).
// Ver lib/seo/sitemapData.ts.

import type { MetadataRoute } from 'next';

import { publicClubs } from '@/lib/seo/sitemapData';
import { publicSiteUrl } from '@/lib/seo/siteUrl';

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const base = publicSiteUrl();
    return (await publicClubs()).map((row) => ({
        url: `${base}/clubs/${encodeURIComponent(row.id)}`,
        lastModified: row.updated_at ?? undefined,
        changeFrequency: 'weekly',
        priority: 0.6,
    }));
}
