import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import {
    getTournamentEspnAmericanFootballConfig,
    getTournamentEspnMotorsportConfig,
    isAmericanFootballSport,
    isMotorsportSport,
    withEspnAmericanFootballRuleset,
    withEspnMotorsportRuleset,
} from '@/lib/externalProviderPolicy';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('tournaments')
            .select('ruleset, sport_id, sport')
            .eq('id', tournamentId)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }

        const sportKey = (data as any).sport_id ?? (data as any).sport ?? null;

        if (!isAmericanFootballSport(sportKey) && !isMotorsportSport(sportKey)) {
            return NextResponse.json({ error: 'This provider is only available for american football and motorsport tournaments.' }, { status: 409 });
        }

        return NextResponse.json({
            provider: 'espn',
            config: isAmericanFootballSport(sportKey)
                ? getTournamentEspnAmericanFootballConfig(data as any)
                : getTournamentEspnMotorsportConfig(data as any),
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const body = await request.json();
        const config = body?.config;

        if (!config || typeof config !== 'object') {
            return NextResponse.json({ error: 'config object is required' }, { status: 400 });
        }

        const { writer: supabase } = await requireTournamentMutationContext(tournamentId);
        const { data: existing, error: readError } = await supabase
            .from('tournaments')
            .select('ruleset, sport_id, sport')
            .eq('id', tournamentId)
            .single();

        if (readError || !existing) {
            return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }

        const sportKey = (existing as any).sport_id ?? (existing as any).sport ?? null;

        if (!isAmericanFootballSport(sportKey) && !isMotorsportSport(sportKey)) {
            return NextResponse.json({ error: 'This provider is only available for american football and motorsport tournaments.' }, { status: 409 });
        }

        const mergedRuleset = isAmericanFootballSport(sportKey)
            ? withEspnAmericanFootballRuleset((existing as any).ruleset, config)
            : withEspnMotorsportRuleset((existing as any).ruleset, config);
        const { error: updateError } = await supabase
            .from('tournaments')
            .update({ ruleset: mergedRuleset } as any)
            .eq('id', tournamentId);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({
            provider: 'espn',
            config: isAmericanFootballSport(sportKey)
                ? getTournamentEspnAmericanFootballConfig({ ...existing, ruleset: mergedRuleset })
                : getTournamentEspnMotorsportConfig({ ...existing, ruleset: mergedRuleset }),
        });
    } catch (error: unknown) {
        return tournamentApiErrorResponse(error);
    }
}
