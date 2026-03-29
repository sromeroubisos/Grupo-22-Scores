import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTournamentRugbyApiSportsConfig, isRugbySport } from '@/lib/externalProviderPolicy';
import { getRugbyApiSportsGames } from '@/lib/services/rugbyApiSports';
import { normalizeRugbyGameForSyncPreview } from '@/lib/services/rugbyApiSportsTransforms';

const PAGE_SIZE = 20;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') || '1'));
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

        const { data: participantsData } = await supabase
            .from('tournament_participants')
            .select('club_id, clubs(id, name, short_name)')
            .eq('tournament_id', tournamentId)
            .eq('status', 'active');

        const participants = (participantsData ?? [])
            .map((participant: any) => ({
                club_id: participant.club_id,
                clubs: Array.isArray(participant.clubs) ? participant.clubs[0] : participant.clubs,
            }))
            .filter((participant: any) => participant.clubs);

        const games = await getRugbyApiSportsGames({
            league: config.league_id,
            season: config.season,
            timezone: 'America/Argentina/Buenos_Aires',
        });

        const filtered = games
            .filter((game) => {
                const short = String(game.status?.short || '').toUpperCase();
                return ['FT', 'AET', 'AW'].includes(short);
            })
            .sort((left, right) => right.timestamp - left.timestamp);

        const start = (page - 1) * PAGE_SIZE;
        const matches = filtered
            .slice(start, start + PAGE_SIZE)
            .map((game) => normalizeRugbyGameForSyncPreview(game, participants));

        return NextResponse.json({
            matches,
            page,
            has_more: start + PAGE_SIZE < filtered.length,
            total: filtered.length,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
