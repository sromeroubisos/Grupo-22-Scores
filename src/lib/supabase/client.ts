import { createBrowserClient } from '@supabase/ssr'
import { createInstrumentedSupabaseFetch, runSupabaseLatencyProbe } from '@/lib/perf/supabase'
import { formatDurationMs, logPerf, nowMs } from '@/lib/perf/measure'
import type { LooseSupabaseClient } from './loose'

let client: LooseSupabaseClient | undefined
const SUPABASE_AUTH_TIMEOUT_MS = 15000

function getSupabaseBrowserStorageKey() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!url) return null

    try {
        const projectRef = new URL(url).hostname.split('.')[0]
        return `sb-${projectRef}-auth-token`
    } catch {
        return null
    }
}

export function clearSupabaseBrowserSession() {
    if (typeof window === 'undefined') return

    const storageKey = getSupabaseBrowserStorageKey()
    if (!storageKey) return

    window.localStorage.removeItem(storageKey)
    window.sessionStorage.removeItem(storageKey)
    window.localStorage.removeItem(`${storageKey}-code-verifier`)
    window.sessionStorage.removeItem(`${storageKey}-code-verifier`)
}

function resolveRequestUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input
    if (input instanceof URL) return input.toString()
    return input.url
}

function isSupabaseAuthRequest(input: string | URL | Request, supabaseUrl: string) {
    const requestUrl = resolveRequestUrl(input)
    return requestUrl.startsWith(`${supabaseUrl}/auth/v1`)
}

function isRefreshTokenRequest(input: string | URL | Request, supabaseUrl: string) {
    const requestUrl = resolveRequestUrl(input)
    if (!requestUrl.startsWith(`${supabaseUrl}/auth/v1/token`)) return false
    return requestUrl.includes('grant_type=refresh_token')
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

// Coalesces concurrent `/token?grant_type=refresh_token` POSTs originating
// from the same browser client into a single in-flight HTTP request. Multiple
// callers (e.g. parallel `getSession()` calls, multiple components mounting at
// once, autoRefresh ticker firing while a manual refresh is also in flight)
// would otherwise each hit Supabase Auth simultaneously, with all but one
// failing with 429 (over_request_rate_limit) due to per-IP /token caps.
let inFlightRefresh: { promise: Promise<Response>; finishedAt: number; reuseUntil: number } | null = null
const REFRESH_RESULT_REUSE_WINDOW_MS = 1500
const REFRESH_RATE_LIMIT_REUSE_WINDOW_MS = 10000

export function createClient() {
    if (client) return client

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const storageKey = getSupabaseBrowserStorageKey() || undefined
    const instrumentedFetch = createInstrumentedSupabaseFetch('client', url, fetch)

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

    const performAuthFetch = (input: string | URL | Request, init?: RequestInit) =>
        withAuthTimeout(input, init).then((response) => response.clone())

    const browserFetch = async (input: string | URL | Request, init?: RequestInit) => {
        // Single-flight refresh_token requests so concurrent callers reuse the
        // same in-flight HTTP request instead of stampeding Supabase Auth.
        // We also briefly cache the most recent successful refresh response so
        // that bursts of `getSession()` calls within ~1.5s share one HTTP roundtrip.
        if (url && isRefreshTokenRequest(input, url)) {
            if (inFlightRefresh) {
                const stillFresh =
                    inFlightRefresh.finishedAt === 0 ||
                    nowMs() < inFlightRefresh.reuseUntil
                if (stillFresh) {
                    try {
                        const cached = await inFlightRefresh.promise
                        if (cached.ok || cached.status === 429) {
                            return cached.clone()
                        }
                        // Non-OK responses other than rate limits can attempt a
                        // fresh request below.
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
                if (response.ok || response.status === 429) {
                    const finishedAt = nowMs()
                    const reuseWindowMs = response.status === 429
                        ? REFRESH_RATE_LIMIT_REUSE_WINDOW_MS
                        : REFRESH_RESULT_REUSE_WINDOW_MS
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

    const startedAt = nowMs()
    client = createBrowserClient(
        url || 'https://placeholder.supabase.co',
        key || 'placeholder-key',
        {
            auth: {
                storageKey,
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
