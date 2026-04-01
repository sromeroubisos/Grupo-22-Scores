import { createBrowserClient } from '@supabase/ssr'
import { Database } from './types'

let client: ReturnType<typeof createBrowserClient<Database>> | undefined
let clearedAuthSessionAt = 0

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

export function createClient() {
    if (client) return client

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const storageKey = getSupabaseBrowserStorageKey() || undefined
    const browserFetch = async (input: string | URL | Request, init?: RequestInit) => {
        try {
            return await fetch(input, init)
        } catch (error) {
            if (url && isSupabaseAuthRequest(input, url)) {
                clearBrokenSupabaseSessionOnce()
            }
            throw error
        }
    }


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

    return client
}
