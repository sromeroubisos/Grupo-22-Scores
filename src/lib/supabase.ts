import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Database } from './database.types';
import { createInstrumentedSupabaseFetch } from '@/lib/perf/supabase';
import { formatDurationMs, logPerf, nowMs } from '@/lib/perf/measure';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const startedAt = nowMs();

export const supabase = createSupabaseClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
        global: {
            fetch: createInstrumentedSupabaseFetch('client', supabaseUrl, fetch),
        },
    }
);

logPerf(
    ['CLIENT', 'SUPABASE'],
    {
        operation: 'create_shared_client',
        duration: formatDurationMs(nowMs() - startedAt),
    },
    'client',
)

export { createSupabaseClient as createClient };
