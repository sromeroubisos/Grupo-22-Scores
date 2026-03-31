import { createBrowserClient } from '@supabase/ssr'
import { Database } from './types'

let client: ReturnType<typeof createBrowserClient<Database>> | undefined

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

export function createClient() {
    if (client) return client

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const storageKey = getSupabaseBrowserStorageKey() || undefined


    client = createBrowserClient<Database>(
        url || 'https://placeholder.supabase.co',
        key || 'placeholder-key',
        {
            auth: {
                storageKey,
            },
        }
    )

    return client
}
