import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
    getTournamentEspnAmericanFootballConfig,
    isAmericanFootballSport,
    withEspnAmericanFootballRuleset,
} from '@/lib/externalProviderPolicy';
import {
    getEspnAmericanFootballLeague,
    isEspnAmericanFootballLeagueSlug,
} from '@/lib/services/espnAmericanFootball';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const body = await request.json();
        const leagueSlug = body?.league_slug;

        if (!isEspnAmericanFootballLeagueSlug(leagueSlug)) {
            return NextResponse.json({ error: 'league_slug is required' }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: existing, error: readError } = await supabase
            .from('tournaments')
            .select('ruleset, sport_id, sport')
            .eq('id', tournamentId)
            .single();

        if (readError || !existing) {
            return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }

        if (!isAmericanFootballSport((existing as any).sport_id ?? (existing as any).sport ?? null)) {
            return NextResponse.json({ error: 'This provider is only available for american football tournaments.' }, { status: 409 });
        }

        const league = getEspnAmericanFootballLeague(leagueSlug);
        const previousConfig = getTournamentEspnAmericanFootballConfig(existing as any);
        const resolvedConfig = {
            league_slug: league.slug,
            league_name: league.shortName,
            country_name: league.countryName,
            tournament_url: league.tournamentUrl,
            resolved_at: new Date().toISOString(),
            last_sync_at: previousConfig?.last_sync_at,
        };

        const mergedRuleset = withEspnAmericanFootballRuleset((existing as any).ruleset, resolvedConfig);
        const { error: updateError } = await supabase
            .from('tournaments')
            .update({ ruleset: mergedRuleset } as any)
            .eq('id', tournamentId);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({
            config: getTournamentEspnAmericanFootballConfig({ ...existing, ruleset: mergedRuleset }),
            league,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
