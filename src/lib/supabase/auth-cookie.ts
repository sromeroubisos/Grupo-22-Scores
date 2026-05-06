const AUTH_COOKIE_MAX_AGE_DAYS = 400;

export const SUPABASE_AUTH_COOKIE_MAX_AGE_SECONDS =
    AUTH_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
export const SUPABASE_AUTH_COOKIE_PATH = '/';
export const SUPABASE_AUTH_COOKIE_SAME_SITE = 'lax' as const;
export const MAX_SUPABASE_AUTH_COOKIE_CHUNKS = 12;

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
