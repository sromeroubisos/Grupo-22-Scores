import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
    getTournamentEspnAmericanFootballConfig,
    getTournamentEspnMotorsportConfig,
    isAmericanFootballSport,
    isMotorsportSport,
} from '@/lib/externalProviderPolicy';
import {
    getEspnAmericanFootballLeagueStandings,
    isEspnAmericanFootballLeagueSlug,
} from '@/lib/services/espnAmericanFootball';
import {
    getEspnMotorsportLeagueStandings,
    isEspnMotorsportLeagueSlug,
} from '@/lib/services/espnMotorsport';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const supabase = await createClient();

        const { data: tournament, error } = await supabase
            .from('tournaments')
            .select('ruleset, sport_id, sport')
            .eq('id', tournamentId)
            .single();

        if (error || !tournament) {
            return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }

        const sportKey = (tournament as any).sport_id ?? (tournament as any).sport ?? null;
        const isAmericanFootball = isAmericanFootballSport(sportKey);
        const isMotorsport = isMotorsportSport(sportKey);

        if (!isAmericanFootball && !isMotorsport) {
            return NextResponse.json({ error: 'This provider is only available for american football and motorsport tournaments.' }, { status: 409 });
        }

        const config = isAmericanFootball
            ? getTournamentEspnAmericanFootballConfig(tournament as any)
            : getTournamentEspnMotorsportConfig(tournament as any);

        if (isAmericanFootball && !isEspnAmericanFootballLeagueSlug(config?.league_slug)) {
            return NextResponse.json({ error: 'This tournament is not linked to ESPN yet.' }, { status: 400 });
        }

        if (isMotorsport && !isEspnMotorsportLeagueSlug(config?.league_slug)) {
            return NextResponse.json({ error: 'This tournament is not linked to ESPN yet.' }, { status: 400 });
        }

        const standings = isAmericanFootball
            ? await getEspnAmericanFootballLeagueStandings(config!.league_slug as any)
            : await getEspnMotorsportLeagueStandings(config!.league_slug as any);

        return NextResponse.json({
            standings: standings.rows,
            updated_at: new Date().toISOString(),
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
