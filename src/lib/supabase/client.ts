import { createBrowserClient } from '@supabase/ssr'
import {
    coerceRefreshFailureToRetryable,
    isSupabaseAuthRequest,
    isSupabaseRefreshTokenRequest,
} from '@/lib/supabase/auth-fetch'
import { createInstrumentedSupabaseFetch, runSupabaseLatencyProbe } from '@/lib/perf/supabase'
import { formatDurationMs, logPerf, nowMs } from '@/lib/perf/measure'
import {
    createSupabaseAuthCookieChunks,
    getSupabaseAuthCookieOptions,
    getSupabaseAuthStorageKey,
    getSupabaseSharedCookieDomain,
    MAX_SUPABASE_AUTH_COOKIE_CHUNKS,
    normalizeSupabaseAuthCookieValue,
    normalizeSupabaseAuthCookies,
    parseSupabaseAuthCookiePayload,
    SUPABASE_AUTH_COOKIE_MAX_AGE_SECONDS,
} from '@/lib/supabase/auth-cookie'
import type { LooseSupabaseClient } from './loose'

let client: LooseSupabaseClient | undefined
const SUPABASE_AUTH_TIMEOUT_MS = 15000
const APP_AUTH_LOCAL_USER_KEY = 'g22_user'

function getSupabaseBrowserStorageKey() {
    return getSupabaseAuthStorageKey()
}

function expireBrowserCookie(name: string, domain?: string) {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    const cookieDomain = domain ? `; Domain=${domain}` : ''
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${cookieDomain}${secure}`
}

function setBrowserCookie(name: string, value: string, domain?: string) {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    const cookieDomain = domain ? `; Domain=${domain}` : ''
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${SUPABASE_AUTH_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${cookieDomain}${secure}`
}

// Pattern matching ANY supabase auth storage key, including from previous
// project refs that may still linger in the browser. A stale
// sb-<oldref>-auth-token cookie scoped to .g22scores.com gets sent
// alongside the current project's cookie and routinely confuses both
// middleware and the SSR helpers - that is the classic "works in
// incognito, fails in normal browser" failure mode.
const SUPABASE_STORAGE_KEY_PATTERN = /^sb-[a-z0-9]+-auth-token(?:\.\d+|-code-verifier|-user)?$/i

function collectSupabaseStorageKeys(): string[] {
    if (typeof window === 'undefined') return []
    const keys = new Set<string>()
    for (const storage of [window.localStorage, window.sessionStorage]) {
        try {
            for (let i = 0; i < storage.length; i += 1) {
                const key = storage.key(i)
                if (key && SUPABASE_STORAGE_KEY_PATTERN.test(key)) keys.add(key)
            }
        } catch {
            // best effort
        }
    }
    return Array.from(keys)
}

function collectSupabaseCookieNames(): string[] {
    if (typeof document === 'undefined' || !document.cookie) return []
    const names = new Set<string>()
    document.cookie.split(';').forEach((part) => {
        const trimmed = part.trim()
        if (!trimmed) return
        const eq = trimmed.indexOf('=')
        const name = eq >= 0 ? trimmed.slice(0, eq) : trimmed
        if (SUPABASE_STORAGE_KEY_PATTERN.test(name)) names.add(name)
    })
    return Array.from(names)
}

export function clearSupabaseBrowserSession() {
    if (typeof window === 'undefined') return

    // Drop the in-memory client singleton so the next createClient() call
    // rebuilds it against the freshly cleaned storage. Without this, the
    // cached client still carries the poisoned session in memory.
    client = undefined

    const storageKey = getSupabaseBrowserStorageKey()
    const baseStorageKeys = storageKey
        ? [storageKey, `${storageKey}-code-verifier`, `${storageKey}-user`]
        : []

    // Union: current-project keys + ANY sb-*-auth-token* keys still in
    // storage/cookies (covers leftovers from previous Supabase projects
    // or older builds where the storage key changed).
    const storageKeysToClear = new Set<string>([...baseStorageKeys, ...collectSupabaseStorageKeys()])
    storageKeysToClear.add(APP_AUTH_LOCAL_USER_KEY)
    storageKeysToClear.forEach((key) => {
        try { window.localStorage.removeItem(key) } catch { /* best effort */ }
        try { window.sessionStorage.removeItem(key) } catch { /* best effort */ }
    })

    const domain = getSupabaseSharedCookieDomain(window.location.hostname)
    const cookieNames = new Set<string>([...baseStorageKeys, ...collectSupabaseCookieNames()])
    if (storageKey) {
        for (let index = 0; index < MAX_SUPABASE_AUTH_COOKIE_CHUNKS; index += 1) {
            cookieNames.add(`${storageKey}.${index}`)
        }
    }

    cookieNames.forEach((name) => {
        expireBrowserCookie(name)
        if (domain) expireBrowserCookie(name, domain)
    })
}

// Persist the minimal app-auth user hint (the `g22_user` key AuthContext
// reads via readCachedAuthUser). After OAuth finalize / email login the
// browser session cookie is valid, but the destination is often a public
// page where AuthContext's `skipPublicAnonymousAuth` gate bails to guest
// when (a) there is no cached user AND (b) the bespoke session-cookie
// freshness hint misses (chunked Google sessions are read less reliably
// here than by supabase-ssr itself). Writing this hint guarantees
// `initialCachedUser` is non-null so AuthContext always runs its real
// getSession() bootstrap and recognizes the just-established session.
export function persistAppAuthUserHint(input: {
    id: string
    email: string
    name?: string | null
    role?: string | null
    avatarUrl?: string | null
}) {
    if (typeof window === 'undefined') return
    if (!input.id || !input.email) return

    try {
        const payload: Record<string, unknown> = {
            id: input.id,
            email: input.email,
            name: input.name && input.name.trim()
                ? input.name
                : (input.email.split('@')[0] || 'Usuario'),
            role: input.role || 'fan',
        }
        if (input.avatarUrl) payload.avatarUrl = input.avatarUrl
        window.localStorage.setItem(APP_AUTH_LOCAL_USER_KEY, JSON.stringify(payload))
    } catch {
        // Best-effort only: AuthContext still bootstraps from the session cookie.
    }
}

function readBrowserCookies() {
    if (typeof document === 'undefined' || !document.cookie) return []

    return document.cookie
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const separatorIndex = part.indexOf('=')
            const name = separatorIndex >= 0 ? part.slice(0, separatorIndex) : part
            const rawValue = separatorIndex >= 0 ? part.slice(separatorIndex + 1) : ''
            let value = rawValue
            try {
                value = decodeURIComponent(rawValue)
            } catch {
                value = rawValue
            }
            return { name, value }
        })
}

function readRawAuthSessionCookie(cookies: Array<{ name: string; value: string }>, storageKey: string) {
    const direct = cookies.find((cookie) => cookie.name === storageKey)?.value
    if (direct) return direct

    const chunks: string[] = []
    for (let index = 0; index < MAX_SUPABASE_AUTH_COOKIE_CHUNKS; index += 1) {
        const chunk = cookies.find((cookie) => cookie.name === `${storageKey}.${index}`)?.value
        if (!chunk) break
        chunks.push(chunk)
    }

    return chunks.length ? chunks.join('') : null
}

function persistNormalizedBrowserSessionCookie(storageKey: string, value: string) {
    const domain = getSupabaseSharedCookieDomain(window.location.hostname)
    const cookieNames = [storageKey]

    for (let index = 0; index < MAX_SUPABASE_AUTH_COOKIE_CHUNKS; index += 1) {
        cookieNames.push(`${storageKey}.${index}`)
    }

    cookieNames.forEach((name) => {
        expireBrowserCookie(name)
        if (domain) expireBrowserCookie(name, domain)
    })

    const chunks = createSupabaseAuthCookieChunks(storageKey, value)
    chunks.forEach(({ name, value: chunkValue }) => {
        setBrowserCookie(name, chunkValue, domain)
    })
}

function normalizeSupabaseBrowserSessionCookie() {
    if (typeof window === 'undefined') return

    const storageKey = getSupabaseBrowserStorageKey()
    if (!storageKey) return

    const cookies = readBrowserCookies()
    const rawSessionCookie = readRawAuthSessionCookie(cookies, storageKey)
    if (!rawSessionCookie) return

    const normalizedCookies = normalizeSupabaseAuthCookies(cookies)
    const normalizedSessionCookie = readRawAuthSessionCookie(normalizedCookies, storageKey)
    if (!normalizedSessionCookie || normalizedSessionCookie === rawSessionCookie) return

    persistNormalizedBrowserSessionCookie(storageKey, normalizedSessionCookie)
}

function getBrowserStorageStores() {
    if (typeof window === 'undefined') return []

    const stores: Storage[] = []
    try {
        stores.push(window.localStorage)
    } catch {
        // Storage access can throw in strict privacy modes.
    }

    try {
        stores.push(window.sessionStorage)
    } catch {
        // Storage access can throw in strict privacy modes.
    }

    return stores
}

function isUsableSupabaseSessionStorageValue(value: string) {
    const parsed = parseSupabaseAuthCookiePayload(value)
    return typeof parsed?.access_token === 'string'
}

function readBrowserSessionStorageValue(storageKey: string): string | null {
    for (const storage of getBrowserStorageStores()) {
        try {
            const rawValue = storage.getItem(storageKey)
            if (rawValue) return normalizeSupabaseAuthCookieValue(rawValue)
        } catch {
            // Best effort only.
        }
    }

    return null
}

function readBrowserSessionCookieValue(storageKey: string): string | null {
    const rawValue = readRawAuthSessionCookie(readBrowserCookies(), storageKey)
    return rawValue ? normalizeSupabaseAuthCookieValue(rawValue) : null
}

function readBrowserSessionValue(storageKey: string): string | null {
    return readBrowserSessionStorageValue(storageKey) || readBrowserSessionCookieValue(storageKey)
}

function readAccessTokenExpirySeconds(accessToken: unknown): number | null {
    if (typeof accessToken !== 'string') return null
    const segments = accessToken.split('.')
    if (segments.length < 2) return null

    try {
        let payloadSegment = segments[1].replace(/-/g, '+').replace(/_/g, '/')
        const padding = payloadSegment.length % 4
        if (padding) payloadSegment += '='.repeat(4 - padding)
        const payload = JSON.parse(atob(payloadSegment)) as { exp?: unknown }
        return typeof payload.exp === 'number' ? payload.exp : null
    } catch {
        return null
    }
}

export function getSupabaseBrowserSessionHint() {
    const fallback = {
        hasSession: false,
        hasRefreshToken: false,
        accessTokenExpiresAt: null as number | null,
        isAccessTokenFresh: false,
    }

    if (typeof window === 'undefined') return fallback

    const storageKey = getSupabaseBrowserStorageKey()
    if (!storageKey) return fallback

    const sessionValue = readBrowserSessionValue(storageKey)
    if (!sessionValue) return fallback

    const parsed = parseSupabaseAuthCookiePayload(sessionValue)
    if (!parsed) return fallback

    const accessTokenExpiresAt = readAccessTokenExpirySeconds(parsed.access_token)
    const nowSeconds = Math.floor(Date.now() / 1000)

    return {
        hasSession: typeof parsed.access_token === 'string',
        hasRefreshToken: typeof parsed.refresh_token === 'string',
        accessTokenExpiresAt,
        isAccessTokenFresh: typeof accessTokenExpiresAt === 'number' && accessTokenExpiresAt > nowSeconds + 30,
    }
}

function hasCachedAppAuthUser() {
    if (typeof window === 'undefined') return false

    try {
        const raw = window.localStorage.getItem(APP_AUTH_LOCAL_USER_KEY)
        if (!raw) return false
        const parsed = JSON.parse(raw) as { id?: unknown; email?: unknown }
        return typeof parsed.id === 'string' && typeof parsed.email === 'string'
    } catch {
        return false
    }
}

function normalizeSupabaseBrowserSessionStorage() {
    if (typeof window === 'undefined') return

    const storageKey = getSupabaseBrowserStorageKey()
    if (!storageKey) return

    for (const storage of getBrowserStorageStores()) {
        let rawValue: string | null = null
        try {
            rawValue = storage.getItem(storageKey)
        } catch {
            continue
        }

        if (!rawValue) continue

        const normalizedValue = normalizeSupabaseAuthCookieValue(rawValue)
        if (isUsableSupabaseSessionStorageValue(normalizedValue)) {
            if (normalizedValue !== rawValue) {
                try {
                    storage.setItem(storageKey, normalizedValue)
                } catch {
                    try {
                        storage.removeItem(storageKey)
                    } catch {
                        // Best effort: avoid letting malformed storage break auth bootstrap.
                    }
                }
            }
            continue
        }

        try {
            storage.removeItem(storageKey)
        } catch {
            // Corrupt storage is best-effort cleanup only.
        }
    }
}

function buildAuthFailureResponse() {
    return new Response(
        JSON.stringify({
            error: 'supabase_auth_unreachable',
            message: 'Supabase auth request failed',
        }),
        {
            status: 503,
            headers: {
                'Content-Type': 'application/json',
            },
        }
    )
}

// Coalesces concurrent /token?grant_type=refresh_token POSTs originating
// from the same browser client into a single in-flight HTTP request.
let inFlightRefresh: { promise: Promise<Response>; finishedAt: number; reuseUntil: number } | null = null
const REFRESH_RESULT_REUSE_WINDOW_MS = 1500
const REFRESH_RATE_LIMIT_REUSE_WINDOW_MS = 10000
const REFRESH_ERROR_REUSE_WINDOW_MS = 5000

function shouldReuseRefreshResponse(response: Response) {
    return response.ok || response.status === 400 || response.status === 429 || response.status >= 500
}

function getRefreshReuseWindowMs(response: Response) {
    if (response.status === 429) return REFRESH_RATE_LIMIT_REUSE_WINDOW_MS
    if (!response.ok) return REFRESH_ERROR_REUSE_WINDOW_MS
    return REFRESH_RESULT_REUSE_WINDOW_MS
}

export function createClient() {
    if (client) return client

    normalizeSupabaseBrowserSessionStorage()
    normalizeSupabaseBrowserSessionCookie()
    let sessionHint = getSupabaseBrowserSessionHint()
    const hasCachedUser = hasCachedAppAuthUser()

    // An expired access token is NOT a dead session: as long as a refresh
    // token is present, supabase-ssr can silently mint a fresh one. Wiping
    // here logged out users that returned after the access token TTL (e.g.
    // a backgrounded mobile tab, or > 1h away) on devices where the
    // localStorage `g22_user` hint was lost but the auth cookie survived.
    // Only nuke a session that is genuinely unrecoverable: stale access
    // token, NO refresh token, and no cached app-auth user hint.
    if (
        sessionHint.hasSession &&
        !sessionHint.isAccessTokenFresh &&
        !sessionHint.hasRefreshToken &&
        !hasCachedUser
    ) {
        clearSupabaseBrowserSession()
        sessionHint = getSupabaseBrowserSessionHint()
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const storageKey = getSupabaseBrowserStorageKey() || undefined
    const instrumentedFetch = createInstrumentedSupabaseFetch('client', url, fetch)
    // Keep auto-refresh enabled whenever there is a recovery path: no
    // session at all, a fresh access token, a refresh token to spend, or a
    // cached app-auth user. Disabling it only for the truly-dead case keeps
    // the original anti refresh-storm intent without stranding a session
    // whose access token simply expired (the case fixed above).
    const shouldAutoRefreshToken =
        !sessionHint.hasSession ||
        sessionHint.isAccessTokenFresh ||
        sessionHint.hasRefreshToken ||
        hasCachedUser

    const withAuthTimeout = async (input: string | URL | Request, init?: RequestInit) => {
        if (typeof window === 'undefined' || !url || !isSupabaseAuthRequest(input, url)) {
            return instrumentedFetch(input, init)
        }

        const controller = new AbortController()
        const timeoutId = window.setTimeout(() => {
            controller.abort(new DOMException('Supabase auth timeout', 'AbortError'))
        }, SUPABASE_AUTH_TIMEOUT_MS)

        const upstreamSignal = init?.signal
        const abortFromUpstream = () => controller.abort(upstreamSignal?.reason)

        if (upstreamSignal) {
            if (upstreamSignal.aborted) {
                abortFromUpstream()
            } else {
                upstreamSignal.addEventListener('abort', abortFromUpstream, { once: true })
            }
        }

        try {
            return await instrumentedFetch(input, {
                ...init,
                signal: controller.signal,
            })
        } finally {
            window.clearTimeout(timeoutId)
            if (upstreamSignal) {
                upstreamSignal.removeEventListener('abort', abortFromUpstream)
            }
        }
    }

    const performAuthFetch = async (input: string | URL | Request, init?: RequestInit) => {
        const response = await withAuthTimeout(input, init)
        const normalizedResponse = url
            ? await coerceRefreshFailureToRetryable(input, url, response, init)
            : response

        return normalizedResponse.clone()
    }

    const browserFetch = async (input: string | URL | Request, init?: RequestInit) => {
        if (url && isSupabaseRefreshTokenRequest(input, url)) {
            if (inFlightRefresh) {
                const stillFresh =
                    inFlightRefresh.finishedAt === 0 ||
                    nowMs() < inFlightRefresh.reuseUntil
                if (stillFresh) {
                    try {
                        const cached = await inFlightRefresh.promise
                        if (shouldReuseRefreshResponse(cached)) {
                            return cached.clone()
                        }
                    } catch {
                        // Fall through to a fresh attempt if the cached one failed.
                    }
                }
            }

            const attempt = (async () => {
                try {
                    return await performAuthFetch(input, init)
                } catch (error) {
                    console.warn('[SupabaseClient] Auth request failed, preserving local session state:', error)
                    return buildAuthFailureResponse()
                }
            })()

            inFlightRefresh = { promise: attempt, finishedAt: 0, reuseUntil: Number.POSITIVE_INFINITY }

            try {
                const response = await attempt
                if (shouldReuseRefreshResponse(response)) {
                    const finishedAt = nowMs()
                    const reuseWindowMs = getRefreshReuseWindowMs(response)
                    inFlightRefresh = {
                        promise: attempt,
                        finishedAt,
                        reuseUntil: finishedAt + reuseWindowMs,
                    }
                    setTimeout(() => {
                        if (inFlightRefresh && inFlightRefresh.promise === attempt) {
                            inFlightRefresh = null
                        }
                    }, reuseWindowMs)
                } else {
                    inFlightRefresh = null
                }
                return response.clone()
            } catch (error) {
                inFlightRefresh = null
                throw error
            }
        }

        try {
            return await withAuthTimeout(input, init)
        } catch (error) {
            if (url && isSupabaseAuthRequest(input, url)) {
                console.warn('[SupabaseClient] Auth request failed, preserving local session state:', error)
                return buildAuthFailureResponse()
            }
            throw error
        }
    }

    // Explicit cookie handlers - NOT passing these makes supabase-ssr fall
    // back to localStorage for the PKCE code_verifier, which is invisible
    // to the server route handler that runs exchangeCodeForSession() at
    // /auth/callback. Symptom: "PKCE code verifier not found in storage.
    // ... For SSR" right after Google OAuth. Storing as cookies (with the
    // shared .g22scores.com domain in production) lets the server read it
    // back.
    const cookieDomain = typeof window !== 'undefined'
        ? getSupabaseSharedCookieDomain(window.location.hostname)
        : undefined
    const cookieIsSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'

    type CookieToSet = {
        name: string
        value: string
        options?: {
            maxAge?: number
            expires?: Date | string
            path?: string
            sameSite?: string | boolean
            domain?: string
            secure?: boolean
        }
    }

    const browserCookies = {
        getAll() {
            return readBrowserCookies()
        },
        setAll(cookiesToSet: CookieToSet[]) {
            if (typeof document === 'undefined') return
            cookiesToSet.forEach(({ name, value, options }) => {
                const parts: string[] = [`${name}=${encodeURIComponent(value)}`]
                const path = options?.path ?? '/'
                parts.push(`Path=${path}`)
                const sameSite = typeof options?.sameSite === 'string' ? options.sameSite : 'Lax'
                parts.push(`SameSite=${sameSite}`)
                if (typeof options?.maxAge === 'number') {
                    parts.push(`Max-Age=${options.maxAge}`)
                } else if (!value) {
                    parts.push('Max-Age=0')
                }
                if (options?.expires) {
                    const expires = options.expires instanceof Date
                        ? options.expires.toUTCString()
                        : String(options.expires)
                    parts.push(`Expires=${expires}`)
                }
                const domain = options?.domain ?? cookieDomain
                if (domain) parts.push(`Domain=${domain}`)
                if (cookieIsSecure || options?.secure) parts.push('Secure')
                document.cookie = parts.join('; ')
            })
        },
    }

    const startedAt = nowMs()
    client = createBrowserClient(
        url || 'https://placeholder.supabase.co',
        key || 'placeholder-key',
        {
            // We keep our own module-level singleton so clearSupabaseBrowserSession()
            // can actually force a clean GoTrue client after wiping stale storage.
            isSingleton: false,
            cookieOptions: getSupabaseAuthCookieOptions(
                typeof window !== 'undefined' ? window.location.hostname : undefined,
            ),
            cookies: browserCookies,
            auth: {
                storageKey,
                flowType: 'pkce',
                autoRefreshToken: shouldAutoRefreshToken,
            },
            global: {
                fetch: browserFetch,
            },
        }
    ) as LooseSupabaseClient

    logPerf(
        ['CLIENT', 'SUPABASE'],
        {
            operation: 'create_browser_client',
            storageKey: storageKey || 'none',
            autoRefreshToken: shouldAutoRefreshToken,
            duration: formatDurationMs(nowMs() - startedAt),
        },
        'client',
    )

    return client
}

export async function runClientSupabaseLatencyCheck(table = 'matches') {
    const supabase = createClient()
    return runSupabaseLatencyProbe(supabase, {
        runtime: 'client',
        table,
    })
}
