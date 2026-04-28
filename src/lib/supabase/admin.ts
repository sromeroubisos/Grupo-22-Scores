import { createClient } from '@supabase/supabase-js'
import { createInstrumentedSupabaseFetch } from '@/lib/perf/supabase';
import { formatDurationMs, logPerf, nowMs } from '@/lib/perf/measure';
import type { LooseSupabaseClient } from './loose';

let adminClientSingleton: LooseSupabaseClient | null = null

/**
 * Admin client using the service_role (or new sb_secret) key.
 * Bypasses RLS — use ONLY in trusted server-side code (Server Actions, API routes).
 * Never expose this client or its key to the browser.
 *
 * FAILS CLOSED: throws if SUPABASE_SERVICE_ROLE_KEY is not set.
 * No fallback to anon key — silent fallback would bypass the intent of admin access.
 */
export function createAdminClient(): LooseSupabaseClient {
    const startedAt = nowMs()
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url) throw new Error('[createAdminClient] Missing NEXT_PUBLIC_SUPABASE_URL')
    if (!serviceKey) throw new Error('[createAdminClient] Missing SUPABASE_SERVICE_ROLE_KEY — add it to .env.local (dev) and Vercel env vars (prod). Never use NEXT_PUBLIC_ prefix.')

    if (adminClientSingleton) {
        return adminClientSingleton
    }

    adminClientSingleton = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: {
            fetch: createInstrumentedSupabaseFetch('server', url, fetch),
        },
    }) as LooseSupabaseClient

    logPerf(
        ['SERVER', 'SUPABASE'],
        {
            operation: 'create_admin_client',
            duration: formatDurationMs(nowMs() - startedAt),
        },
        'server',
    )

    return adminClientSingleton
}
