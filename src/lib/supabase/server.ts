import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createInstrumentedSupabaseFetch, runSupabaseLatencyProbe } from '@/lib/perf/supabase';
import { formatDurationMs, logPerf, nowMs } from '@/lib/perf/measure';

export async function createClient() {
    const startedAt = nowMs()
    const cookieStore = await cookies()
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'
    const instrumentedFetch = createInstrumentedSupabaseFetch('server', url, fetch)

    const client = createServerClient(
        url,
        key,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
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
                fetch: instrumentedFetch,
            },
        }
    )

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
