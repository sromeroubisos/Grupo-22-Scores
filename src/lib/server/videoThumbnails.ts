// La portada de un video: la que publica la plataforma, no una fabricada acá.
//
// YouTube se deduce de la URL (i.ytimg.com), Vimeo la da por oEmbed,
// Dailymotion por su API pública, y el resto (ESPN, un sitio cualquiera) por
// el og:image de la página del video. Se busca una sola vez y queda
// persistida en el link; las filas viejas se completan en la primera lectura.
//
// Pide páginas ajenas desde el servidor, así que hay tope de tiempo, de
// tamaño y de destino: nada de IPs, localhost ni dominios internos.

import { extractMetaImage } from '@/lib/matches/pageMeta';
import {
    isSafeHttpUrl,
    needsThumbnailLookup,
    parseVideoUrl,
    type MatchVideoLink,
    type ParsedVideoUrl,
} from '@/lib/matches/videoLinks';

const FETCH_TIMEOUT_MS = 6000;
const MAX_BODY_BYTES = 512 * 1024;
const DEFAULT_BUDGET_MS = 8000;
// En orden de prueba. ESPN (Akamai) contesta 202 con un cuerpo vacío a un UA
// de Chrome completo que no viene de un Chrome de verdad (la huella TLS no
// coincide), pero deja pasar el `Mozilla/5.0` pelado; otros sitios bloquean
// justamente el pelado. Se prueba uno, y si no hay 200, el otro.
const USER_AGENTS = [
    'Mozilla/5.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
] as const;

/**
 * undefined = no se pudo consultar (red, tiempo, 5xx): se reintenta en otra
 * lectura. null = se consultó y no hay portada: queda así.
 */
export type ThumbnailLookup = string | null | undefined;

type Fetched = { finalUrl: string; body: string };

function isFetchableHost(hostname: string): boolean {
    const host = hostname.toLowerCase();
    if (!host.includes('.')) return false;
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false; // IPv4 literal
    if (host.includes(':') || host.startsWith('[')) return false; // IPv6 literal
    return true;
}

async function readCapped(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return '';

    const decoder = new TextDecoder();
    let text = '';
    let received = 0;
    while (received < MAX_BODY_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        text += decoder.decode(value, { stream: true });
    }
    await reader.cancel().catch(() => undefined);
    return text;
}

/** null = respondió pero no sirve (4xx, destino vedado) · undefined = no se pudo consultar. */
async function fetchOnce(target: URL, accept: string, userAgent: string): Promise<Fetched | null | undefined> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(target.toString(), {
            headers: {
                'user-agent': userAgent,
                accept,
                'accept-language': 'es-AR,es;q=0.9,en;q=0.7',
            },
            redirect: 'follow',
            signal: controller.signal,
            cache: 'no-store',
        });

        const finalUrl = response.url || target.toString();
        if (!isFetchableHost(new URL(finalUrl).hostname)) return null;
        if (response.status >= 400 && response.status < 500) return null;
        // Solo un 200 cuenta como "consultado": un 202 (desafío anti-bot) o un
        // 5xx no dicen nada sobre la portada.
        if (response.status !== 200) return undefined;

        return { finalUrl, body: await readCapped(response) };
    } catch {
        return undefined;
    } finally {
        clearTimeout(timer);
    }
}

/** Prueba cada UA hasta conseguir la página. Ver `fetchOnce` para null/undefined. */
async function fetchCapped(url: string, accept: string): Promise<Fetched | null | undefined> {
    let target: URL;
    try {
        target = new URL(url);
    } catch {
        return null;
    }
    if (!isFetchableHost(target.hostname)) return null;

    let sawRejection = false;
    for (const userAgent of USER_AGENTS) {
        const result = await fetchOnce(target, accept, userAgent);
        if (result) return result;
        if (result === null) sawRejection = true;
    }
    // Un 4xx con algún UA es una respuesta; puro 202/5xx/red no lo es.
    return sawRejection ? null : undefined;
}

async function fromPage(url: string): Promise<ThumbnailLookup> {
    const page = await fetchCapped(url, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5');
    if (page === undefined) return undefined;
    if (page === null) return null;
    const image = extractMetaImage(page.body, page.finalUrl);
    return image && isSafeHttpUrl(image) ? image : null;
}

async function fromJson(url: string): Promise<Record<string, unknown> | null | undefined> {
    const result = await fetchCapped(url, 'application/json');
    if (result === undefined) return undefined;
    if (result === null) return null;
    try {
        const data: unknown = JSON.parse(result.body);
        return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

function pickUrl(data: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = data[key];
        if (typeof value === 'string' && isSafeHttpUrl(value)) return value;
    }
    return null;
}

async function fromVimeo(url: string): Promise<ThumbnailLookup> {
    const data = await fromJson(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}&width=640`);
    if (data === undefined) return undefined;
    if (data === null) return null;
    return pickUrl(data, ['thumbnail_url_with_play_button', 'thumbnail_url']) ?? null;
}

async function fromDailymotion(parsed: ParsedVideoUrl): Promise<ThumbnailLookup> {
    const id = /\/embed\/video\/([a-z0-9]+)/i.exec(parsed.embedUrl ?? '')?.[1];
    if (!id) return null;
    const data = await fromJson(`https://api.dailymotion.com/video/${encodeURIComponent(id)}?fields=thumbnail_720_url,thumbnail_480_url`);
    if (data === undefined) return undefined;
    if (data === null) return null;
    return pickUrl(data, ['thumbnail_720_url', 'thumbnail_480_url']);
}

/** La portada de un video por su URL. Ver `ThumbnailLookup` para los tres resultados. */
export async function resolveVideoThumbnail(url: string): Promise<ThumbnailLookup> {
    const parsed = parseVideoUrl(url);
    if (!parsed) return null;

    switch (parsed.provider) {
        case 'youtube':
            return parsed.thumbnailUrl ?? fromPage(url);
        case 'vimeo':
            return (await fromVimeo(url)) ?? fromPage(url);
        case 'dailymotion':
            return (await fromDailymotion(parsed)) ?? fromPage(url);
        default:
            return fromPage(url);
    }
}

/**
 * Completa la portada de los videos que nunca la buscaron, en paralelo y con
 * un tope de tiempo total. Lo que no llega a tiempo queda como estaba y se
 * reintenta en la próxima lectura; lo que se resolvió (con portada o sin
 * ella) queda persistible.
 */
export async function enrichVideoThumbnails(
    videos: MatchVideoLink[],
    options: { budgetMs?: number } = {},
): Promise<{ videos: MatchVideoLink[]; changed: boolean }> {
    const pending = videos.filter(needsThumbnailLookup);
    if (pending.length === 0) return { videos, changed: false };

    const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
    const settled = new Map<string, string | null>();

    const work = Promise.all(pending.map(async (video) => {
        const result = await resolveVideoThumbnail(video.url).catch(() => undefined);
        if (result !== undefined) settled.set(video.id, result);
    }));

    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
        work,
        new Promise<void>((resolve) => {
            timer = setTimeout(resolve, budgetMs);
        }),
    ]);
    if (timer) clearTimeout(timer);

    if (settled.size === 0) return { videos, changed: false };

    return {
        changed: true,
        videos: videos.map((video) => (
            settled.has(video.id) ? { ...video, thumbnailUrl: settled.get(video.id) ?? null } : video
        )),
    };
}
