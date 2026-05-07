const AUTH_COOKIE_MAX_AGE_DAYS = 400;

export const SUPABASE_AUTH_COOKIE_MAX_AGE_SECONDS =
    AUTH_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
export const SUPABASE_AUTH_COOKIE_PATH = '/';
export const SUPABASE_AUTH_COOKIE_SAME_SITE = 'lax' as const;
export const MAX_SUPABASE_AUTH_COOKIE_CHUNKS = 12;
export const SUPABASE_AUTH_COOKIE_CHUNK_SIZE = 3180;
export const SUPABASE_AUTH_COOKIE_BASE64_PREFIX = 'base64-';

export type SupabaseCookieLike = { name: string; value: string };

export function getSupabaseProjectRef(url = process.env.NEXT_PUBLIC_SUPABASE_URL): string | null {
    if (!url) return null;

    try {
        return new URL(url).hostname.split('.')[0] || null;
    } catch {
        return null;
    }
}

export function getSupabaseAuthStorageKey(url = process.env.NEXT_PUBLIC_SUPABASE_URL): string | null {
    const projectRef = getSupabaseProjectRef(url);
    return projectRef ? `sb-${projectRef}-auth-token` : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getAuthCookieChunkIndex(name: string, baseName: string): number | null {
    if (!name.startsWith(`${baseName}.`)) return null;

    const suffix = name.slice(baseName.length + 1);
    if (!/^\d+$/.test(suffix)) return null;

    const index = Number(suffix);
    return Number.isInteger(index) && index >= 0 ? index : null;
}

function decodeBase64UrlToUtf8(value: string): string | null {
    try {
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(value, 'base64url').toString('utf-8');
        }

        let normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const padding = normalized.length % 4;
        if (padding) normalized += '='.repeat(4 - padding);

        const binary = atob(normalized);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    } catch {
        return null;
    }
}

function encodeUtf8ToBase64Url(value: string): string {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(value, 'utf-8').toString('base64url');
    }

    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });

    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function decodeSupabaseAuthCookieValue(value: string): { decoded: string; wasBase64Url: boolean } | null {
    if (!value) return null;

    if (!value.startsWith(SUPABASE_AUTH_COOKIE_BASE64_PREFIX)) {
        return { decoded: value, wasBase64Url: false };
    }

    const decoded = decodeBase64UrlToUtf8(value.slice(SUPABASE_AUTH_COOKIE_BASE64_PREFIX.length));
    return decoded ? { decoded, wasBase64Url: true } : null;
}

function encodeSupabaseAuthCookieValue(decoded: string, wasBase64Url: boolean): string {
    if (!wasBase64Url) return decoded;
    return `${SUPABASE_AUTH_COOKIE_BASE64_PREFIX}${encodeUtf8ToBase64Url(decoded)}`;
}

function unwrapDoubleSerializedSession(decoded: string): string | null {
    try {
        const parsed = JSON.parse(decoded) as unknown;
        if (typeof parsed !== 'string') return null;

        const candidate = parsed.trim();
        if (!candidate.startsWith('{')) return null;

        const inner = JSON.parse(candidate) as unknown;
        if (!isRecord(inner) || typeof inner.access_token !== 'string') {
            return null;
        }

        return candidate;
    } catch {
        return null;
    }
}

export function normalizeSupabaseAuthCookieValue(value: string): string {
    const cookie = decodeSupabaseAuthCookieValue(value);
    if (!cookie) return value;

    const normalized = unwrapDoubleSerializedSession(cookie.decoded);
    if (!normalized) return value;

    return encodeSupabaseAuthCookieValue(normalized, cookie.wasBase64Url);
}

export function parseSupabaseAuthCookiePayload(value: string): Record<string, unknown> | null {
    const cookie = decodeSupabaseAuthCookieValue(value);
    if (!cookie) return null;

    let candidate = cookie.decoded;
    for (let depth = 0; depth < 2; depth += 1) {
        try {
            const parsed = JSON.parse(candidate) as unknown;
            if (isRecord(parsed)) return parsed;
            if (typeof parsed !== 'string') return null;
            candidate = parsed;
        } catch {
            return null;
        }
    }

    return null;
}

export function readSupabaseAuthSessionCookieValue(cookies: readonly SupabaseCookieLike[]): string | null {
    const baseName = getSupabaseAuthStorageKey();
    if (!baseName) return null;

    const direct = cookies.find((cookie) => cookie.name === baseName)?.value;
    if (direct) return normalizeSupabaseAuthCookieValue(direct);

    const chunks: string[] = [];
    for (let index = 0; index < MAX_SUPABASE_AUTH_COOKIE_CHUNKS; index += 1) {
        const chunk = cookies.find((cookie) => cookie.name === `${baseName}.${index}`)?.value;
        if (!chunk) break;
        chunks.push(chunk);
    }

    return chunks.length ? normalizeSupabaseAuthCookieValue(chunks.join('')) : null;
}

export function normalizeSupabaseAuthCookies<T extends SupabaseCookieLike>(cookies: readonly T[]): T[] {
    const baseName = getSupabaseAuthStorageKey();
    if (!baseName) return [...cookies];

    const directIndex = cookies.findIndex((cookie) => cookie.name === baseName);
    if (directIndex >= 0) {
        const current = cookies[directIndex];
        const normalized = normalizeSupabaseAuthCookieValue(current.value);
        if (normalized === current.value) return [...cookies];

        const next = [...cookies];
        next[directIndex] = { ...current, value: normalized };
        return next;
    }

    const orderedChunks = cookies
        .map((cookie) => ({
            cookie,
            index: getAuthCookieChunkIndex(cookie.name, baseName),
        }))
        .filter((entry): entry is { cookie: T; index: number } => entry.index !== null)
        .sort((a, b) => a.index - b.index);

    if (!orderedChunks.length || orderedChunks[0].index !== 0) return [...cookies];

    const chunks: string[] = [];
    for (let expectedIndex = 0; expectedIndex < orderedChunks.length; expectedIndex += 1) {
        const chunk = orderedChunks.find((entry) => entry.index === expectedIndex);
        if (!chunk) break;
        chunks.push(chunk.cookie.value);
    }

    const combined = chunks.join('');
    const normalized = normalizeSupabaseAuthCookieValue(combined);
    if (!combined || normalized === combined) return [...cookies];

    return [
        ...cookies.filter((cookie) => getAuthCookieChunkIndex(cookie.name, baseName) === null),
        { ...orderedChunks[0].cookie, name: baseName, value: normalized },
    ];
}

export function createSupabaseAuthCookieChunks(name: string, value: string) {
    const encodedValue = encodeURIComponent(value);
    if (encodedValue.length <= SUPABASE_AUTH_COOKIE_CHUNK_SIZE) {
        return [{ name, value }];
    }

    const chunks: string[] = [];
    let remainingEncodedValue = encodedValue;

    while (remainingEncodedValue.length > 0) {
        let encodedChunkHead = remainingEncodedValue.slice(0, SUPABASE_AUTH_COOKIE_CHUNK_SIZE);
        const lastEscapePos = encodedChunkHead.lastIndexOf('%');

        if (lastEscapePos > SUPABASE_AUTH_COOKIE_CHUNK_SIZE - 3) {
            encodedChunkHead = encodedChunkHead.slice(0, lastEscapePos);
        }

        let valueHead = '';
        while (encodedChunkHead.length > 0) {
            try {
                valueHead = decodeURIComponent(encodedChunkHead);
                break;
            } catch (error) {
                if (
                    error instanceof URIError &&
                    encodedChunkHead.length > 3 &&
                    encodedChunkHead.charAt(encodedChunkHead.length - 3) === '%'
                ) {
                    encodedChunkHead = encodedChunkHead.slice(0, encodedChunkHead.length - 3);
                    continue;
                }
                throw error;
            }
        }

        chunks.push(valueHead);
        remainingEncodedValue = remainingEncodedValue.slice(encodedChunkHead.length);
    }

    return chunks.map((chunk, index) => ({ name: `${name}.${index}`, value: chunk }));
}

function normalizeHostname(hostname?: string | null) {
    return (hostname || '')
        .split(',')[0]
        .trim()
        .split(':')[0]
        .toLowerCase();
}

export function getSupabaseSharedCookieDomain(hostname?: string | null): string | undefined {
    const normalized = normalizeHostname(hostname);
    if (normalized === 'g22scores.com' || normalized.endsWith('.g22scores.com')) {
        return '.g22scores.com';
    }
    return undefined;
}

export function getSupabaseAuthCookieOptions(hostname?: string | null) {
    const name = getSupabaseAuthStorageKey() || undefined;
    const domain = getSupabaseSharedCookieDomain(hostname);

    return {
        ...(name ? { name } : {}),
        path: SUPABASE_AUTH_COOKIE_PATH,
        sameSite: SUPABASE_AUTH_COOKIE_SAME_SITE,
        maxAge: SUPABASE_AUTH_COOKIE_MAX_AGE_SECONDS,
        ...(domain ? { domain } : {}),
    };
}
