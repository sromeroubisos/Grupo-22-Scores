// Links de video de un partido: highlights, partido completo o clips.
//
// Un video no se aloja acá: se guarda el link y, cuando la plataforma lo
// permite, se embebe su reproductor. Este módulo reconoce la plataforma a
// partir de la URL y arma la dirección del iframe. Lo que no se puede embeber
// (Instagram, TikTok, X, un sitio cualquiera) se muestra como tarjeta con
// link afuera: nunca un iframe a ciegas a un dominio desconocido.
//
// Módulo puro: sin React, sin DOM, sin fetch. Lo usan el servidor (para
// validar y derivar la plataforma al guardar) y la página (para dibujar).

export type MatchVideoKind = 'full' | 'highlights' | 'clip';

/**
 * Qué portada se muestra: la original de la plataforma (y, si no tiene, la
 * placa generada) o siempre la placa generada con la estética de G22 Base.
 */
export type MatchVideoPoster = 'original' | 'generated';

export type MatchVideoProvider =
    | 'youtube'
    | 'vimeo'
    | 'dailymotion'
    | 'facebook'
    | 'twitch'
    | 'espn'
    | 'instagram'
    | 'tiktok'
    | 'x'
    | 'other';

export interface MatchVideoLink {
    /** Estable entre guardados: la página lo usa como key y para quitar. */
    id: string;
    /** Como lo pegó quien lo cargó, sin más normalización que el trim. */
    url: string;
    kind: MatchVideoKind;
    title: string | null;
    /** Derivada de la url al guardar. Se persiste para no recalcularla al listar. */
    provider: MatchVideoProvider;
    /** ISO. Vacío en filas viejas que no lo traían. */
    addedAt: string;
    /**
     * Portada del video: la que publica la plataforma (og:image, oEmbed), no
     * una fabricada acá. La resuelve el servidor al guardar y queda persistida.
     * Ausente = todavía no se buscó · null = se buscó y no hay · string = URL.
     */
    thumbnailUrl?: string | null;
    /** Ausente = 'original'. Ver `MatchVideoPoster`. */
    poster?: MatchVideoPoster;
}

export const MATCH_VIDEO_KINDS = ['highlights', 'full', 'clip'] as const;
export const MATCH_VIDEO_POSTERS = ['original', 'generated'] as const;

export const VIDEO_POSTER_LABELS: Record<MatchVideoPoster, string> = {
    original: 'Original de la plataforma',
    generated: 'Placa G22',
};

export const VIDEO_KIND_LABELS: Record<MatchVideoKind, string> = {
    full: 'Partido completo',
    highlights: 'Highlights',
    clip: 'Clip',
};

export const VIDEO_PROVIDER_LABELS: Record<MatchVideoProvider, string> = {
    youtube: 'YouTube',
    vimeo: 'Vimeo',
    dailymotion: 'Dailymotion',
    facebook: 'Facebook',
    twitch: 'Twitch',
    espn: 'ESPN',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    x: 'X',
    other: 'Otro sitio',
};

export const MAX_MATCH_VIDEOS = 20;
export const MAX_VIDEO_URL_LENGTH = 2048;
export const MAX_VIDEO_TITLE_LENGTH = 120;

export interface ParsedVideoUrl {
    provider: MatchVideoProvider;
    /** Dirección del reproductor embebido. null = no se embebe: se abre afuera. */
    embedUrl: string | null;
    /** Miniatura conocida sin pedirle nada a nadie (hoy solo YouTube). */
    thumbnailUrl: string | null;
    /**
     * 'portrait' para shorts y reels: el marco se dibuja alto en vez de ancho.
     * 'card' para una publicación (un tweet, un post de Instagram): el embed
     * trae texto y botones alrededor del video, así que el marco es una
     * tarjeta de alto fijo y ancho acotado, no una proporción.
     */
    aspect: 'video' | 'portrait' | 'card';
    /** El sitio, para el rótulo "Abrir en …" cuando no hay plataforma conocida. */
    host: string;
}

export interface ParseVideoUrlOptions {
    /**
     * Twitch exige declarar el dominio que embebe (`parent`) y sin él el
     * reproductor no arranca. La página lo pasa desde window.location; el
     * servidor no lo tiene y para él Twitch queda como link afuera.
     */
    embedParent?: string | null;
}

// ── URL ───────────────────────────────────────────────────────────────────

/** Solo http(s) con host. Rechaza javascript:, data:, rutas relativas y vacíos. */
export function parseHttpUrl(raw: unknown): URL | null {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (!trimmed || trimmed.length > MAX_VIDEO_URL_LENGTH) return null;

    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        return null;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname || !url.hostname.includes('.')) return null;
    return url;
}

export function isSafeHttpUrl(raw: unknown): boolean {
    return parseHttpUrl(raw) !== null;
}

function normalizeHost(url: URL): string {
    return url.hostname.toLowerCase().replace(/^www\./, '');
}

function segmentsOf(url: URL): string[] {
    return url.pathname.split('/').filter(Boolean);
}

function linkOnly(provider: MatchVideoProvider, host: string, aspect: ParsedVideoUrl['aspect'] = 'video'): ParsedVideoUrl {
    return { provider, embedUrl: null, thumbnailUrl: null, aspect, host };
}

// ── YouTube ───────────────────────────────────────────────────────────────

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_LIST_ID = /^[A-Za-z0-9_-]{2,}$/;
const YOUTUBE_HOSTS = new Set([
    'youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'gaming.youtube.com',
    'youtube-nocookie.com',
]);

/** `t=1h2m3s`, `t=90s`, `t=90`, `start=90` → segundos. Lo raro cae en 0. */
export function parseYouTubeStart(raw: string | null | undefined): number {
    if (!raw) return 0;
    const value = raw.trim();
    if (/^\d+$/.test(value)) return Number(value);

    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(value);
    if (!match || value === '') return 0;
    const [, h, m, s] = match;
    const total = Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
    return Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
}

function parseYouTube(url: URL, host: string): ParsedVideoUrl | null {
    const segments = segmentsOf(url);
    let id: string | null = null;
    let portrait = false;

    if (host === 'youtu.be') {
        id = segments[0] ?? null;
    } else if (YOUTUBE_HOSTS.has(host)) {
        const [first, second] = segments;
        if (first === 'watch') {
            id = url.searchParams.get('v');
        } else if (first === 'shorts' || first === 'live' || first === 'embed' || first === 'v') {
            id = second ?? null;
            portrait = first === 'shorts';
        } else if (first === 'playlist') {
            const list = url.searchParams.get('list');
            if (list && YOUTUBE_LIST_ID.test(list)) {
                return {
                    provider: 'youtube',
                    embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}`,
                    thumbnailUrl: null,
                    aspect: 'video',
                    host: 'youtube.com',
                };
            }
            return linkOnly('youtube', 'youtube.com');
        }
    } else {
        return null;
    }

    // Reconocido como YouTube pero sin un id de video (un canal, una búsqueda):
    // se abre afuera en vez de embeber algo que no va a cargar.
    if (!id || !YOUTUBE_ID.test(id)) return linkOnly('youtube', 'youtube.com');

    const start = parseYouTubeStart(url.searchParams.get('t') ?? url.searchParams.get('start'));
    const params = new URLSearchParams({ rel: '0' });
    if (start > 0) params.set('start', String(start));

    return {
        provider: 'youtube',
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`,
        thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        aspect: portrait ? 'portrait' : 'video',
        host: 'youtube.com',
    };
}

// ── Vimeo ─────────────────────────────────────────────────────────────────

function parseVimeo(url: URL, host: string): ParsedVideoUrl | null {
    if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null;

    // vimeo.com/123456 · vimeo.com/123456/abcdef (privado) ·
    // vimeo.com/channels/x/123456 · player.vimeo.com/video/123456
    const segments = segmentsOf(url);
    const index = segments.findIndex((segment) => /^\d{5,}$/.test(segment));
    if (index < 0) return linkOnly('vimeo', 'vimeo.com');

    const id = segments[index];
    const next = segments[index + 1];
    const hash = next && /^[a-f0-9]{6,}$/i.test(next) ? next : url.searchParams.get('h');
    const params = new URLSearchParams({ dnt: '1' });
    if (hash) params.set('h', hash);

    return {
        provider: 'vimeo',
        embedUrl: `https://player.vimeo.com/video/${id}?${params.toString()}`,
        thumbnailUrl: null,
        aspect: 'video',
        host: 'vimeo.com',
    };
}

// ── Dailymotion ───────────────────────────────────────────────────────────

function parseDailymotion(url: URL, host: string): ParsedVideoUrl | null {
    if (host !== 'dailymotion.com' && host !== 'dai.ly') return null;

    const segments = segmentsOf(url);
    const raw = host === 'dai.ly' ? segments[0] : segments[0] === 'video' ? segments[1] : null;
    const id = raw ? (/^(x[a-z0-9]+)/i.exec(raw)?.[1] ?? null) : null;
    if (!id) return linkOnly('dailymotion', 'dailymotion.com');

    return {
        provider: 'dailymotion',
        embedUrl: `https://www.dailymotion.com/embed/video/${id}`,
        thumbnailUrl: null,
        aspect: 'video',
        host: 'dailymotion.com',
    };
}

// ── Facebook ──────────────────────────────────────────────────────────────

const FACEBOOK_HOSTS = new Set(['facebook.com', 'm.facebook.com', 'web.facebook.com', 'fb.com']);

function parseFacebook(url: URL, host: string): ParsedVideoUrl | null {
    // El corto fb.watch redirige y el plugin de Facebook no lo resuelve: afuera.
    if (host === 'fb.watch') return linkOnly('facebook', 'facebook.com');
    if (!FACEBOOK_HOSTS.has(host)) return null;

    const path = url.pathname;
    const isReel = path.startsWith('/reel/');
    const isVideo = /\/videos?\//.test(path) || path.startsWith('/watch') || isReel;
    if (!isVideo) return linkOnly('facebook', 'facebook.com');

    // El plugin quiere la dirección canónica con www.
    const canonical = new URL(url.toString());
    canonical.hostname = 'www.facebook.com';
    canonical.protocol = 'https:';

    return {
        provider: 'facebook',
        embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(canonical.toString())}&show_text=false`,
        thumbnailUrl: null,
        aspect: isReel ? 'portrait' : 'video',
        host: 'facebook.com',
    };
}

// ── Twitch ────────────────────────────────────────────────────────────────

function parseTwitch(url: URL, host: string, parent: string | null): ParsedVideoUrl | null {
    const segments = segmentsOf(url);

    if (host === 'clips.twitch.tv') {
        const slug = segments[0];
        if (!slug || !parent) return linkOnly('twitch', 'twitch.tv');
        return {
            provider: 'twitch',
            embedUrl: `https://clips.twitch.tv/embed?clip=${encodeURIComponent(slug)}&parent=${encodeURIComponent(parent)}&autoplay=false`,
            thumbnailUrl: null,
            aspect: 'video',
            host: 'twitch.tv',
        };
    }

    if (host !== 'twitch.tv' && host !== 'm.twitch.tv') return null;

    // twitch.tv/videos/123456 · twitch.tv/{canal}/clip/{slug}
    if (segments[0] === 'videos' && /^\d+$/.test(segments[1] ?? '') && parent) {
        return {
            provider: 'twitch',
            embedUrl: `https://player.twitch.tv/?video=v${segments[1]}&parent=${encodeURIComponent(parent)}&autoplay=false`,
            thumbnailUrl: null,
            aspect: 'video',
            host: 'twitch.tv',
        };
    }
    if (segments[1] === 'clip' && segments[2] && parent) {
        return {
            provider: 'twitch',
            embedUrl: `https://clips.twitch.tv/embed?clip=${encodeURIComponent(segments[2])}&parent=${encodeURIComponent(parent)}&autoplay=false`,
            thumbnailUrl: null,
            aspect: 'video',
            host: 'twitch.tv',
        };
    }
    return linkOnly('twitch', 'twitch.tv');
}

// ── ESPN ──────────────────────────────────────────────────────────────────
//
// espn.com y sus ediciones (espn.com.ar, espn.com.mx, espn.co.uk, espn.cl…).
// La página del clip no se deja enmarcar (frame-ancestors solo de ESPN),
// pero el reproductor sindicado sí: /watch/syndicatedplayer/_/id/{id}, que es
// a donde redirige el viejo /core/video/iframe?id=. Se arma sobre la misma
// edición que pegaron: un clip regional no siempre existe en la global.

const ESPN_HOST = /^(?:[a-z0-9-]+\.)*espn\.(?:com(?:\.[a-z]{2})?|co\.[a-z]{2}|cl|in|ph|nl)$/;
const ESPN_VIDEO_ID = /^\d{4,12}$/;

function parseEspn(url: URL, host: string): ParsedVideoUrl | null {
    if (!ESPN_HOST.test(host)) return null;

    // /video/clip/_/id/{id} · /video/clip?id= · /core/video/iframe?id= ·
    // /core/video/iframe/_/id/{id}/… · /watch/syndicatedplayer/_/id/{id}.
    // /watch/player/_/id/ es ESPN+ (con suscripción) y una nota no es un
    // video: se abren afuera.
    const segments = segmentsOf(url);
    const [first, second] = segments;
    const isClip = first === 'video'
        || (first === 'core' && second === 'video')
        || (first === 'watch' && second === 'syndicatedplayer');
    if (!isClip) return linkOnly('espn', host);

    const idIndex = segments.indexOf('id');
    const raw = idIndex >= 0 ? segments[idIndex + 1] : url.searchParams.get('id');
    const id = raw && ESPN_VIDEO_ID.test(raw) ? raw : null;
    if (!id) return linkOnly('espn', host);

    // La edición apex y la móvil redirigen a www.; un subdominio propio
    // (espndeportes.espn.com) se respeta.
    const apex = host.replace(/^m\./, '');
    const edition = apex.startsWith('espn.') ? `www.${apex}` : host;

    return {
        provider: 'espn',
        embedUrl: `https://${edition}/watch/syndicatedplayer/_/id/${id}`,
        thumbnailUrl: null,
        aspect: 'video',
        host,
    };
}

// ── X (Twitter) ───────────────────────────────────────────────────────────
//
// El embed oficial sin widgets.js: platform.twitter.com/embed/Tweet.html?id=
// dibuja la publicación con su video adentro. Es una tarjeta (texto, autor,
// botones), no un reproductor a proporción: va con aspect 'card'.

const X_HOSTS = new Set(['x.com', 'twitter.com', 'mobile.twitter.com', 'm.twitter.com']);
const X_STATUS_ID = /^\d{5,25}$/;

function parseX(url: URL, host: string): ParsedVideoUrl | null {
    // El corto t.co redirige: sin resolverlo no hay id. Afuera.
    if (host === 't.co') return linkOnly('x', 'x.com');
    if (!X_HOSTS.has(host)) return null;

    // x.com/{usuario}/status/{id} · x.com/i/status/{id} · x.com/i/web/status/{id}
    const segments = segmentsOf(url);
    const statusIndex = segments.indexOf('status');
    const id = statusIndex >= 0 ? segments[statusIndex + 1] : null;
    if (!id || !X_STATUS_ID.test(id)) return linkOnly('x', 'x.com');

    const params = new URLSearchParams({ id, dnt: 'true', theme: 'dark', hideThread: 'true' });
    return {
        provider: 'x',
        embedUrl: `https://platform.twitter.com/embed/Tweet.html?${params.toString()}`,
        thumbnailUrl: null,
        aspect: 'card',
        host: 'x.com',
    };
}

// ── Instagram ─────────────────────────────────────────────────────────────
//
// instagram.com/p/{código}/embed/ (y /reel/, /tv/) es el embed oficial y
// no pide script. Un reel va alto; un post, como tarjeta.

const INSTAGRAM_CODE = /^[A-Za-z0-9_-]{5,40}$/;

function parseInstagram(url: URL, host: string): ParsedVideoUrl | null {
    if (host !== 'instagram.com' && host !== 'instagr.am') return null;

    const segments = segmentsOf(url);
    // instagram.com/p/{código} · /reel/{código} · /reels/{código} · /tv/{código} ·
    // /{usuario}/p/{código} · /{usuario}/reel/{código}
    const typeIndex = segments.findIndex((segment) => segment === 'p' || segment === 'reel' || segment === 'reels' || segment === 'tv');
    const code = typeIndex >= 0 ? segments[typeIndex + 1] : null;
    if (!code || !INSTAGRAM_CODE.test(code)) return linkOnly('instagram', 'instagram.com', 'portrait');

    const type = segments[typeIndex] === 'reels' ? 'reel' : segments[typeIndex];
    return {
        provider: 'instagram',
        embedUrl: `https://www.instagram.com/${type}/${code}/embed/`,
        thumbnailUrl: null,
        aspect: type === 'reel' ? 'portrait' : 'card',
        host: 'instagram.com',
    };
}

// ── TikTok ────────────────────────────────────────────────────────────────

const TIKTOK_ID = /^\d{10,25}$/;

function parseTikTok(url: URL, host: string): ParsedVideoUrl | null {
    if (host !== 'tiktok.com' && host !== 'm.tiktok.com' && host !== 'vm.tiktok.com') return null;

    // tiktok.com/@{usuario}/video/{id}. El corto vm.tiktok.com/{código} redirige: afuera.
    const segments = segmentsOf(url);
    const videoIndex = segments.indexOf('video');
    const id = videoIndex >= 0 ? segments[videoIndex + 1] : null;
    if (!id || !TIKTOK_ID.test(id)) return linkOnly('tiktok', 'tiktok.com', 'portrait');

    return {
        provider: 'tiktok',
        embedUrl: `https://www.tiktok.com/embed/v2/${id}`,
        thumbnailUrl: null,
        aspect: 'portrait',
        host: 'tiktok.com',
    };
}

// ── Punto de entrada ──────────────────────────────────────────────────────

/** null si no es una URL http(s) válida. Todo lo demás se reconoce, aunque sea "otro sitio". */
export function parseVideoUrl(raw: unknown, options: ParseVideoUrlOptions = {}): ParsedVideoUrl | null {
    const url = parseHttpUrl(raw);
    if (!url) return null;

    const host = normalizeHost(url);
    const parent = options.embedParent?.trim() || null;

    return (
        parseYouTube(url, host)
        ?? parseVimeo(url, host)
        ?? parseDailymotion(url, host)
        ?? parseFacebook(url, host)
        ?? parseTwitch(url, host, parent)
        ?? parseEspn(url, host)
        ?? parseX(url, host)
        ?? parseInstagram(url, host)
        ?? parseTikTok(url, host)
        ?? { provider: 'other', embedUrl: null, thumbnailUrl: null, aspect: 'video', host }
    );
}

export function detectVideoProvider(raw: unknown): MatchVideoProvider {
    return parseVideoUrl(raw)?.provider ?? 'other';
}

/**
 * El reproductor recién se carga cuando alguien toca "Reproducir", así que
 * tiene que arrancar solo. Cada plataforma lo pide con su nombre.
 */
export function withAutoplay(provider: MatchVideoProvider, embedUrl: string): string {
    const url = new URL(embedUrl);
    switch (provider) {
        case 'facebook':
        case 'twitch':
        case 'espn':
            url.searchParams.set('autoplay', 'true');
            break;
        // Una publicación embebida no tiene autoplay: el video arranca cuando
        // el lector lo toca adentro de la tarjeta.
        case 'x':
        case 'instagram':
        case 'tiktok':
            break;
        default:
            url.searchParams.set('autoplay', '1');
    }
    return url.toString();
}

// ── Normalización de lo guardado / transportado ───────────────────────────

const PROVIDERS = new Set<string>(Object.keys(VIDEO_PROVIDER_LABELS));
const KINDS = new Set<string>(MATCH_VIDEO_KINDS);

/** Id determinista para filas viejas sin id: FNV-1a sobre la url. */
export function stableVideoId(url: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < url.length; i += 1) {
        hash ^= url.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `v-${hash.toString(16).padStart(8, '0')}`;
}

export function isMatchVideoKind(value: unknown): value is MatchVideoKind {
    return typeof value === 'string' && KINDS.has(value);
}

export function isMatchVideoPoster(value: unknown): value is MatchVideoPoster {
    return value === 'original' || value === 'generated';
}

/** true si quien lo cargó pidió la placa generada aunque haya miniatura original. */
export function wantsGeneratedPoster(video: Pick<MatchVideoLink, 'poster'>): boolean {
    return video.poster === 'generated';
}

/**
 * De lo que venga (una fila de la base, un payload de la API) a la lista que
 * dibuja la página. Lo que no tiene url válida se descarta; lo demás se
 * completa con valores seguros. Nunca lanza.
 */
export function normalizeMatchVideoLinks(raw: unknown): MatchVideoLink[] {
    if (!Array.isArray(raw)) return [];

    const out: MatchVideoLink[] = [];
    const seen = new Set<string>();

    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const record = item as Record<string, unknown>;
        const url = typeof record.url === 'string' ? record.url.trim() : '';
        if (!isSafeHttpUrl(url)) continue;

        const dedupeKey = url.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const provider = typeof record.provider === 'string' && PROVIDERS.has(record.provider)
            ? record.provider as MatchVideoProvider
            : detectVideoProvider(url);
        const title = typeof record.title === 'string' && record.title.trim()
            ? record.title.trim().slice(0, MAX_VIDEO_TITLE_LENGTH)
            : null;

        const link: MatchVideoLink = {
            id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : stableVideoId(url),
            url,
            kind: isMatchVideoKind(record.kind) ? record.kind : 'highlights',
            title,
            provider,
            addedAt: typeof record.addedAt === 'string' ? record.addedAt : '',
        };

        // La portada solo viaja si es un link sano; null se respeta (ya se
        // buscó y no hay); cualquier otra cosa se descarta y se vuelve a buscar.
        const thumbnail = record.thumbnailUrl;
        if (thumbnail === null) link.thumbnailUrl = null;
        else if (typeof thumbnail === 'string' && isSafeHttpUrl(thumbnail)) link.thumbnailUrl = thumbnail.trim();

        // 'original' es lo que se asume: solo se guarda lo que se pidió a mano.
        if (record.poster === 'generated') link.poster = 'generated';

        out.push(link);

        if (out.length >= MAX_MATCH_VIDEOS) break;
    }

    return out;
}

/** Cómo se presenta un video cuando no trae título propio. */
export function describeVideo(video: Pick<MatchVideoLink, 'title' | 'kind' | 'provider'>): string {
    if (video.title) return video.title;
    return `${VIDEO_KIND_LABELS[video.kind]} · ${VIDEO_PROVIDER_LABELS[video.provider]}`;
}

/**
 * La portada que se muestra: la guardada (la de la plataforma) o, si todavía
 * no se buscó, la que se deduce de la URL sin pedir nada (hoy solo YouTube).
 */
export function videoPosterUrl(
    video: Pick<MatchVideoLink, 'thumbnailUrl'>,
    parsed: Pick<ParsedVideoUrl, 'thumbnailUrl'> | null | undefined,
): string | null {
    return video.thumbnailUrl || parsed?.thumbnailUrl || null;
}

/** true si al video nunca se le buscó portada (ni encontrada ni descartada). */
export function needsThumbnailLookup(video: Pick<MatchVideoLink, 'thumbnailUrl'>): boolean {
    return video.thumbnailUrl === undefined;
}

// ── Archivos directos ─────────────────────────────────────────────────────

const DIRECT_MEDIA_EXTENSIONS: readonly string[] = ['mp4', 'webm', 'mov', 'm4v', 'ogv'];

/**
 * La extensión si el link es un ARCHIVO de video (un .mp4 en un storage
 * propio), a diferencia de un video de plataforma (YouTube, ESPN...), que solo
 * existe como link. null si no lo es.
 */
export function directMediaExtension(raw: unknown): string | null {
    const url = parseHttpUrl(raw);
    if (!url) return null;
    const ext = url.pathname.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
    return ext && DIRECT_MEDIA_EXTENSIONS.includes(ext) ? ext : null;
}

export function isDirectMediaUrl(raw: unknown): boolean {
    return directMediaExtension(raw) !== null;
}
