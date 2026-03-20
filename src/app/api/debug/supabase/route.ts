import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
    }

    const results: Record<string, { ok: boolean; error?: string; count?: number }> = {};

    try {
        const supabase = await createClient();

        for (const table of ['matches', 'clubs', 'tournaments', 'unions'] as const) {
            const { data, error } = await supabase.from(table).select('id', { count: 'exact', head: false }).limit(1);
            results[table] = error
                ? { ok: false, error: `${error.message} (code: ${error.code})` }
                : { ok: true, count: data?.length ?? 0 };
        }

        // Test sport filter approach (the previously failing query pattern)
        const { error: sportFilterError } = await supabase
            .from('matches')
            .select('id, tournament:tournaments!inner(id, sport_id)')
            .limit(1);

        results['sport_filter_test'] = sportFilterError
            ? { ok: false, error: `${sportFilterError.message} (code: ${sportFilterError.code})` }
            : { ok: true };

        const allOk = Object.values(results).every(r => r.ok);
        return NextResponse.json({ ok: allOk, tables: results });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ ok: false, error: message, tables: results });
    }
}
