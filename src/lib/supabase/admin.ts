import { createClient } from '@supabase/supabase-js'

/**
 * Admin client using the service_role key.
 * Bypasses RLS — use ONLY in trusted server-side code (API routes, not client components).
 * Never expose this client or its key to the browser.
 *
 * Falls back to the anon key if SUPABASE_SERVICE_ROLE_KEY is not configured.
 * In that case, RLS policies still apply (inserts require an appropriate INSERT policy).
 */
export function createAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')

    const key = serviceKey || anonKey
    if (!key) throw new Error('Missing Supabase key (SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY)')

    if (!serviceKey) {
        console.warn('[admin] SUPABASE_SERVICE_ROLE_KEY not set — falling back to anon key. RLS policies apply.')
    }

    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}
