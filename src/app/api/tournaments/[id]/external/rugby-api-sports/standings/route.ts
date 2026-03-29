import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTournamentRugbyApiSportsConfig, isRugbySport } from '@/lib/externalProviderPolicy';
import { getRugbyApiSportsStandings } from '@/lib/services/rugbyApiSports';
import { normalizeRugbyStandingsRows } from '@/lib/services/rugbyApiSportsTransforms';

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

        if (!isRugbySport((tournament as any).sport_id ?? (tournament as any).sport ?? null)) {
            return NextResponse.json({ error: 'This provider is only available for rugby tournaments.' }, { status: 409 });
        }

        const config = getTournamentRugbyApiSportsConfig(tournament as any);
        if (!config?.league_id || !config?.season) {
            return NextResponse.json({ error: 'This tournament is not linked to Rugby API-Sports yet.' }, { status: 400 });
        }

        const standings = await getRugbyApiSportsStandings({
            league: config.league_id,
            season: config.season,
            stage: config.stage,
            group: config.group,
        });

        return NextResponse.json({
            standings: normalizeRugbyStandingsRows(standings),
            updated_at: new Date().toISOString(),
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
