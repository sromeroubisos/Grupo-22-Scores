import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createInstrumentedSupabaseFetch } from '@/lib/perf/supabase';
import { formatDurationMs, logPerf, nowMs } from '@/lib/perf/measure';
import type { LooseSupabaseClient } from './supabase/loose';

let supabaseSingleton: LooseSupabaseClient | null = null;

function getPublicSupabaseConfig() {
    return {
        url: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
        anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
    };
}

export function getSupabaseClient(): LooseSupabaseClient {
    if (supabaseSingleton) return supabaseSingleton;

    const { url, anonKey } = getPublicSupabaseConfig();
    const startedAt = nowMs();

    supabaseSingleton = createSupabaseClient(
        url,
        anonKey,
        {
            global: {
                fetch: createInstrumentedSupabaseFetch('client', url, fetch),
            },
        }
    ) as LooseSupabaseClient;

    logPerf(
        ['CLIENT', 'SUPABASE'],
        {
            operation: 'create_shared_client',
            duration: formatDurationMs(nowMs() - startedAt),
        },
        'client',
    );

    return supabaseSingleton;
}

export const supabase = new Proxy({} as LooseSupabaseClient, {
    get(_target, property, receiver) {
        const client = getSupabaseClient() as Record<PropertyKey, unknown>;
        const value = Reflect.get(client, property, receiver);
        return typeof value === 'function' ? value.bind(client) : value;
    },
});

export { createSupabaseClient as createClient };
