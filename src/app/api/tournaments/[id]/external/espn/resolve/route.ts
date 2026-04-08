import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
    getTournamentEspnAmericanFootballConfig,
    getTournamentEspnMotorsportConfig,
    isAmericanFootballSport,
    isMotorsportSport,
    withEspnAmericanFootballRuleset,
    withEspnMotorsportRuleset,
} from '@/lib/externalProviderPolicy';
import {
    getEspnAmericanFootballLeague,
    isEspnAmericanFootballLeagueSlug,
} from '@/lib/services/espnAmericanFootball';
import {
    getEspnMotorsportLeague,
    isEspnMotorsportLeagueSlug,
} from '@/lib/services/espnMotorsport';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const body = await request.json();
        const leagueSlug = body?.league_slug;

        if (!leagueSlug || typeof leagueSlug !== 'string') {
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

        const sportKey = (existing as any).sport_id ?? (existing as any).sport ?? null;
        const isAmericanFootball = isAmericanFootballSport(sportKey);
        const isMotorsport = isMotorsportSport(sportKey);

        if (!isAmericanFootball && !isMotorsport) {
            return NextResponse.json({ error: 'This provider is only available for american football and motorsport tournaments.' }, { status: 409 });
        }

        if (isAmericanFootball && !isEspnAmericanFootballLeagueSlug(leagueSlug)) {
            return NextResponse.json({ error: 'league_slug is required' }, { status: 400 });
        }

        if (isMotorsport && !isEspnMotorsportLeagueSlug(leagueSlug)) {
            return NextResponse.json({ error: 'league_slug is required' }, { status: 400 });
        }

        const league = isAmericanFootball
            ? getEspnAmericanFootballLeague(leagueSlug as any)
            : getEspnMotorsportLeague(leagueSlug as any);
        const previousConfig = isAmericanFootball
            ? getTournamentEspnAmericanFootballConfig(existing as any)
            : getTournamentEspnMotorsportConfig(existing as any);
        const resolvedConfig = {
            league_slug: league.slug,
            league_name: league.shortName,
            country_name: league.countryName,
            tournament_url: league.tournamentUrl,
            resolved_at: new Date().toISOString(),
            last_sync_at: previousConfig?.last_sync_at,
        };

        const mergedRuleset = isAmericanFootball
            ? withEspnAmericanFootballRuleset((existing as any).ruleset, resolvedConfig)
            : withEspnMotorsportRuleset((existing as any).ruleset, resolvedConfig);
        const { error: updateError } = await supabase
            .from('tournaments')
            .update({ ruleset: mergedRuleset } as any)
            .eq('id', tournamentId);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({
            config: isAmericanFootball
                ? getTournamentEspnAmericanFootballConfig({ ...existing, ruleset: mergedRuleset })
                : getTournamentEspnMotorsportConfig({ ...existing, ruleset: mergedRuleset }),
            league,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
