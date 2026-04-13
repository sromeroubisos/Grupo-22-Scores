import { createBrowserClient } from '@supabase/ssr'
import { Database } from './types'
import { createInstrumentedSupabaseFetch, runSupabaseLatencyProbe } from '@/lib/perf/supabase'
import { formatDurationMs, logPerf, nowMs } from '@/lib/perf/measure'

let client: ReturnType<typeof createBrowserClient<Database>> | undefined
let clearedAuthSessionAt = 0
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

function clearBrokenSupabaseSessionOnce() {
    if (typeof window === 'undefined') return

    const now = Date.now()
    if (now - clearedAuthSessionAt < 3000) return
    clearedAuthSessionAt = now
    clearSupabaseBrowserSession()
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

    const browserFetch = async (input: string | URL | Request, init?: RequestInit) => {
        try {
            return await withAuthTimeout(input, init)
        } catch (error) {
            if (url && isSupabaseAuthRequest(input, url)) {
                clearBrokenSupabaseSessionOnce()
                return buildAuthFailureResponse()
            }
            throw error
        }
    }

    const startedAt = nowMs()
    client = createBrowserClient<Database>(
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
    )

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
