// La sesión, fresca, antes de tocar una ruta o una API que la exige.
//
// En el teléfono la pestaña se congela en segundo plano: el timer de
// auto-refresh no corre, el access token vence, y el primer pedido al volver
// cae en un 401 ("no se pudo verificar tu sesión") o en un rebote a /login
// desde el guard del servidor. En escritorio no pasa porque la pestaña sigue
// viva. `ensureFreshSession` es la rutina que ProtectedLink ya usaba para
// entrar al admin; acá vive aparte para que también la usen los `fetch` que
// crean una votación, guardan una noticia o suben una imagen.

import { createClient } from '@/lib/supabase/client'
import { commitSupabaseSessionForServer } from '@/lib/supabase/sessionBridge'

export type SessionOutcome = 'navigate' | 'login'

export type SessionLike = {
    access_token?: string | null
    refresh_token?: string | null
    expires_at?: number | null
}

// Authoritative access-token expiry (unix seconds): prefer the session's own
// expires_at, fall back to decoding the JWT. Never the bespoke cookie hint.
export function readSessionExpirySeconds(session: SessionLike): number | null {
    if (typeof session.expires_at === 'number' && Number.isFinite(session.expires_at)) {
        return session.expires_at
    }
    const token = typeof session.access_token === 'string' ? session.access_token : ''
    const segments = token.split('.')
    if (segments.length < 2) return null
    try {
        let payload = segments[1].replace(/-/g, '+').replace(/_/g, '/')
        const padding = payload.length % 4
        if (padding) payload += '='.repeat(4 - padding)
        const parsed = JSON.parse(atob(payload)) as { exp?: unknown }
        return typeof parsed.exp === 'number' ? parsed.exp : null
    } catch {
        return null
    }
}

async function commitAndNavigate(session: SessionLike | null, href: string): Promise<SessionOutcome> {
    if (!session?.access_token || !session?.refresh_token) return 'login'
    try {
        await commitSupabaseSessionForServer(
            { access_token: session.access_token, refresh_token: session.refresh_token },
            href,
        )
        return 'navigate'
    } catch {
        return 'login'
    }
}

/**
 * Make sure the auth cookie carries a usable session BEFORE we hand off to a
 * server-guarded route — without losing the session on mobile.
 *
 * COMMIT-FIRST (mobile-robust): we read the current session and POST it to
 * `/api/auth/commit-session`. The server's `supabase.auth.setSession()`
 * refreshes an EXPIRED access token using the refresh token *server-side*
 * (server -> Supabase, fast, not subject to a backgrounded mobile tab or a
 * flaky mobile network). This is what made desktop work but mobile keep
 * bouncing: on mobile the tab is frozen so the access token expires, and the
 * old client-side `refreshSession()` raced GoTrue's tab-resume auto-refresh
 * for the *rotating* refresh token — one call invalidated the other and the
 * session died. Letting the server do the single authoritative refresh
 * removes that race.
 *
 * Source of truth = the real supabase-ssr client (`getSession`), never the
 * bespoke cookie hint (it misreads large chunked Google sessions). We only
 * end at `/login` after server commit, a re-read, and a last-resort client
 * refresh have all failed.
 */
export async function ensureFreshSession(href: string): Promise<SessionOutcome> {
    const supabase = createClient()

    const readSession = async (): Promise<SessionLike | null> => {
        try {
            const { data } = await supabase.auth.getSession()
            return (data?.session as SessionLike | null) ?? null
        } catch {
            return null
        }
    }
    const clientRefresh = async (): Promise<SessionLike | null> => {
        try {
            const { data, error } = await supabase.auth.refreshSession()
            return !error ? ((data?.session as SessionLike | null) ?? null) : null
        } catch {
            return null
        }
    }

    const session = await readSession()

    if (session?.access_token && session?.refresh_token) {
        // 0. Fast path: the access token is comfortably fresh. A document
        //    navigation already carries the valid cookie, and the server proxy
        //    fast-paths anything with >120s left — so re-committing would only
        //    add a Supabase Auth setSession + a users write per click for no
        //    benefit. 300s margin guarantees the token survives the nav +
        //    server roundtrip. (Expired tokens — the mobile frozen-tab case —
        //    skip this and go commit-first below.)
        const expSeconds = readSessionExpirySeconds(session)
        const nowSeconds = Math.floor(Date.now() / 1000)
        if (typeof expSeconds === 'number' && expSeconds > nowSeconds + 300) {
            return 'navigate'
        }

        // 1. Commit as-is. Server-side setSession() refreshes it if the
        //    access token is expired (the mobile case).
        if ((await commitAndNavigate(session, href)) === 'navigate') return 'navigate'

        // 2. Commit failed — most likely the refresh token rotated under us
        //    because a concurrent refresher (GoTrue tab-resume auto-refresh)
        //    won. Whoever won persisted a fresh session to the cookie; re-read
        //    and commit that one.
        const reread = await readSession()
        if (
            reread?.access_token &&
            reread.refresh_token &&
            reread.access_token !== session.access_token &&
            (await commitAndNavigate(reread, href)) === 'navigate'
        ) {
            return 'navigate'
        }

        // 3. Last resort: a single awaited client refresh. browserFetch
        //    coalesces this with any in-flight GoTrue refresh, so it cannot
        //    double-spend the refresh token. Never raced against a timeout.
        const refreshed = await clientRefresh()
        if (refreshed && (await commitAndNavigate(refreshed, href)) === 'navigate') {
            return 'navigate'
        }

        return 'login'
    }

    // No session in storage — the refresh-token cookie may still be present
    // (only the access token was dropped). One real refresh, then commit.
    const refreshed = await clientRefresh()
    if (refreshed && (await commitAndNavigate(refreshed, href)) === 'navigate') {
        return 'navigate'
    }
    return 'login'
}

const RETRY_AFTER_401_MS = 1200

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * `fetch` para un pedido que exige sesión (crear una votación, guardar una
 * noticia, subir una imagen). Antes de pedir asegura la cookie con la misma
 * rutina que ProtectedLink; si igual vuelve un 401 —el servidor no vio la
 * cookie nueva, o el token rotó en el medio— espera un momento, vuelve a
 * asegurarla y reintenta UNA vez. Sin sesión de verdad, el pedido sale igual y
 * el 401 lo maneja quien llama (por ejemplo, mandando a iniciar sesión).
 */
export async function sessionFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const here = typeof window === 'undefined' ? '/' : window.location.pathname
    await ensureFreshSession(here).catch(() => 'login' as const)

    const request = () => fetch(input, { credentials: 'same-origin', ...init })
    const first = await request()
    if (first.status !== 401) return first

    await wait(RETRY_AFTER_401_MS)
    const outcome = await ensureFreshSession(here).catch(() => 'login' as const)
    if (outcome === 'login') return first
    return request()
}
