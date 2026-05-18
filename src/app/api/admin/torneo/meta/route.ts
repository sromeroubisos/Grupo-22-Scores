import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';

function err(message: string, status = 400, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

export async function GET() {
    const supabase = await createClient();

    try {
        await requireTournamentAdminContext(supabase);
    } catch {
        return err('Unauthorized', 401);
    }

    const [unionsResult, sportsResult, countriesResult] = await Promise.all([
        supabase
            .from('unions')
            .select('id, name, country')
            .order('name', { ascending: true }),
        supabase
            .from('sports')
            .select('id, name, icon, is_active, priority')
            .eq('is_active', true)
            .order('priority', { ascending: true }),
        supabase
            .from('countries')
            .select('id, name, code, flag_emoji')
            .order('name', { ascending: true }),
    ]);

    return NextResponse.json({
        unions: unionsResult.error ? [] : unionsResult.data ?? [],
        sports: sportsResult.error ? [] : sportsResult.data ?? [],
        countries: countriesResult.error ? [] : countriesResult.data ?? [],
    });
}
