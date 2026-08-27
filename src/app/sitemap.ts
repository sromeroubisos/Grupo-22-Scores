// sitemap.xml: las páginas públicas fijas más todas las noticias publicadas.
// Va con un cliente anónimo pelado (sin cookies): el sitemap no tiene request
// del que leer sesión, y el RLS ya deja al anónimo ver lo publicado. Si la
// base no contesta, salen las páginas fijas igual — un sitemap corto le sirve
// al buscador; uno caído, no.

import { createClient } from '@supabase/supabase-js';
import type { MetadataRoute } from 'next';

import { publicSiteUrl } from '@/lib/seo/siteUrl';

// PostgREST corta en 1000 filas: el tope va explícito para que nadie crea
// que trae más que eso. Las noticias salen de la más nueva a la más vieja,
// así lo que queda afuera es lo menos relevante.
const NEWS_LIMIT = 1000;

export const revalidate = 3600;

type NewsSitemapRow = {
    id: string;
    published_at: string | null;
    updated_at: string | null;
};

async function publishedNews(): Promise<NewsSitemapRow[]> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return [];

    try {
        const supabase = createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await supabase
            .from('news')
            .select('id, published_at, updated_at')
            .eq('status', 'published')
            .order('published_at', { ascending: false })
            .limit(NEWS_LIMIT);
        if (error) return [];
        return (data as NewsSitemapRow[] | null) ?? [];
    } catch {
        return [];
    }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const base = publicSiteUrl();

    const staticPages: MetadataRoute.Sitemap = [
        { url: base, changeFrequency: 'hourly', priority: 1 },
        { url: `${base}/noticias`, changeFrequency: 'daily', priority: 0.9 },
        { url: `${base}/noticias/videos`, changeFrequency: 'daily', priority: 0.7 },
        { url: `${base}/rankings`, changeFrequency: 'weekly', priority: 0.6 },
        { url: `${base}/juegos`, changeFrequency: 'monthly', priority: 0.5 },
        { url: `${base}/para-clubes`, changeFrequency: 'monthly', priority: 0.5 },
        { url: `${base}/para-torneos`, changeFrequency: 'monthly', priority: 0.5 },
    ];

    const newsPages: MetadataRoute.Sitemap = (await publishedNews()).map((news) => ({
        url: `${base}/noticias/${news.id}`,
        lastModified: news.updated_at ?? news.published_at ?? undefined,
        changeFrequency: 'weekly',
        priority: 0.8,
    }));

    return [...staticPages, ...newsPages];
}
