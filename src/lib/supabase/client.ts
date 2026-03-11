import { createBrowserClient } from '@supabase/ssr'
import { Database } from './types'

let client: ReturnType<typeof createBrowserClient<Database>> | undefined

export function createClient() {
    if (client) return client

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    console.log('[SupabaseClient] Initializing with URL:', url ? 'OK' : 'MISSING', 'Key length:', key?.length || 0);

    client = createBrowserClient<Database>(
        url || 'https://placeholder.supabase.co',
        key || 'placeholder-key'
    )

    return client
}
