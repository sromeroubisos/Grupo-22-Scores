import { createClient } from '@supabase/supabase-js'

/**
 * Admin client using the service_role (or new sb_secret) key.
 * Bypasses RLS — use ONLY in trusted server-side code (Server Actions, API routes).
 * Never expose this client or its key to the browser.
 *
 * FAILS CLOSED: throws if SUPABASE_SERVICE_ROLE_KEY is not set.
 * No fallback to anon key — silent fallback would bypass the intent of admin access.
 */
export function createAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url) throw new Error('[createAdminClient] Missing NEXT_PUBLIC_SUPABASE_URL')
    if (!serviceKey) throw new Error('[createAdminClient] Missing SUPABASE_SERVICE_ROLE_KEY — add it to .env.local (dev) and Vercel env vars (prod). Never use NEXT_PUBLIC_ prefix.')

    return createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}
