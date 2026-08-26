// Metadatos de una página ajena: la portada que la plataforma publica para
// un video (og:image / twitter:image). Módulo puro: recibe el HTML ya bajado,
// no lo pide. Lo usa el servidor al guardar un video para dejar la portada
// persistida; la app no fabrica portadas propias.

const META_TAG = /<meta\b[^>]*>/gi;
const ATTRIBUTE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

/** Por prioridad: gana la primera clave de esta lista que aparezca, no la primera etiqueta. */
const IMAGE_KEYS: readonly string[] = [
    'og:image:secure_url',
    'og:image',
    'og:image:url',
    'twitter:image',
    'twitter:image:src',
];

function decodeEntities(value: string): string {
    return value
        .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        // Al final, para que "&amp;lt;" quede como el literal "&lt;" y no se decodifique dos veces.
        .replace(/&amp;/g, '&');
}

function attributesOf(tag: string): Record<string, string> {
    const out: Record<string, string> = {};
    ATTRIBUTE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ATTRIBUTE.exec(tag)) !== null) {
        out[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
    }
    return out;
}

/** El contenido de las <meta> pedidas, por clave (la primera aparición de cada una). */
export function collectMetaContents(html: string, keys: readonly string[]): Map<string, string> {
    const wanted = new Set(keys);
    const found = new Map<string, string>();

    for (const tag of html.match(META_TAG) ?? []) {
        const attrs = attributesOf(tag);
        const key = (attrs.property ?? attrs.name ?? '').trim().toLowerCase();
        const content = attrs.content?.trim();
        if (!key || !content || !wanted.has(key) || found.has(key)) continue;
        found.set(key, decodeEntities(content));
        if (found.size === wanted.size) break;
    }

    return found;
}

/** Resuelve una dirección relativa contra la página. Solo http(s). */
export function toAbsoluteHttpUrl(raw: string, base: string): string | null {
    try {
        const url = new URL(raw.trim(), base);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        return url.toString();
    } catch {
        return null;
    }
}

/** La portada que declara la página, absoluta. null si no declara ninguna usable. */
export function extractMetaImage(html: string, pageUrl: string): string | null {
    const found = collectMetaContents(html, IMAGE_KEYS);
    for (const key of IMAGE_KEYS) {
        const raw = found.get(key);
        if (!raw) continue;
        const absolute = toAbsoluteHttpUrl(raw, pageUrl);
        if (absolute) return absolute;
    }
    return null;
}
