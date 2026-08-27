// La URL pública del sitio, para canonicals, sitemap y Open Graph.
// NEXT_PUBLIC_SITE_URL manda, pero si falta o apunta a localhost (entorno
// local) se cae al dominio de producción: un sitemap o un canonical con URLs
// locales le enseña mal al buscador.

const PRODUCTION_URL = 'https://g22scores.com';

export function publicSiteUrl(): string {
    const configured = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '').trim();
    if (!configured) return PRODUCTION_URL;
    try {
        const url = new URL(configured);
        const host = url.hostname.toLowerCase();
        const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
        if (url.protocol !== 'https:' || isLocal) return PRODUCTION_URL;
        return url.origin;
    } catch {
        return PRODUCTION_URL;
    }
}

/** Un path del sitio como URL absoluta (para JSON-LD, que no pasa por metadataBase). */
export function absoluteUrl(path: string): string {
    return new URL(path, publicSiteUrl()).toString();
}
