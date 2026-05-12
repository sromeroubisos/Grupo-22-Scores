import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { createInstrumentedSupabaseFetch, runSupabaseLatencyProbe } from '@/lib/perf/supabase';
import { formatDurationMs, logPerf, nowMs } from '@/lib/perf/measure';
import { createRetryableRefreshFetch } from '@/lib/supabase/auth-fetch';
import { getSupabaseAuthCookieOptions, normalizeSupabaseAuthCookies } from '@/lib/supabase/auth-cookie';
import type { LooseSupabaseClient } from './loose';

export async function createClient() {
    const startedAt = nowMs()
    const cookieStore = await cookies()
    const headerStore = await headers()
    const requestHost = headerStore.get('x-forwarded-host') || headerStore.get('host')
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'
    const instrumentedFetch = createInstrumentedSupabaseFetch('server', url, fetch)
    const authFetch = createRetryableRefreshFetch(url, instrumentedFetch)

    const client = createServerClient(
        url,
        key,
        {
            cookieOptions: getSupabaseAuthCookieOptions(requestHost),
            auth: {
                autoRefreshToken: false,
                detectSessionInUrl: false,
                persistSession: true,
                flowType: 'pkce',
            },
            cookies: {
                getAll() {
                    return normalizeSupabaseAuthCookies(cookieStore.getAll())
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            // Respect Supabase's original cookie flags. Overriding them here
                            // breaks refresh-token persistence and the session can disappear.
                            cookieStore.set(name, value, options)
                        })
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
            global: {
                fetch: authFetch,
            },
        }
    ) as LooseSupabaseClient

    logPerf(
        ['SERVER', 'SUPABASE'],
        {
            operation: 'create_server_client',
            duration: formatDurationMs(nowMs() - startedAt),
            cookieCount: cookieStore.getAll().length,
        },
        'server',
    )

    return client
}

export async function runServerSupabaseLatencyCheck(table = 'matches') {
    const supabase = await createClient();
    return runSupabaseLatencyProbe(supabase, {
        runtime: 'server',
        table,
    });
}
