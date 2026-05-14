import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

function slugify(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const league = searchParams.get('league') || 'Argentina Liga Profesional';
    const season = searchParams.get('season') || String(new Date().getUTCFullYear());
    const kind = searchParams.get('kind') || 'team';   // team | player
    const teamIdParam = searchParams.get('team_id');

    if (kind !== 'team' && kind !== 'player') {
        return NextResponse.json({ error: 'kind must be "team" or "player"' }, { status: 400 });
    }

    const leagueKey = slugify(league);
    const supabase = await createClient();

    const meta = await supabase
        .from('sofascore_seasons')
        .select('league_key, league_name, season_year, season_id, last_refreshed_at, last_status, last_error')
        .eq('league_key', leagueKey)
        .eq('season_year', season)
        .maybeSingle();

    if (meta.error) {
        return NextResponse.json({ error: meta.error.message }, { status: 500 });
    }
    if (!meta.data) {
        return NextResponse.json(
            { error: 'No stats yet for this league/season. Run scripts/sofascore/scrape_stats.py first.' },
            { status: 404 }
        );
    }

    if (kind === 'team') {
        const { data, error } = await supabase
            .from('sofascore_team_stats')
            .select('team_id, team_name, stats, fetched_at')
            .eq('league_key', leagueKey)
            .eq('season_year', season)
            .order('team_name', { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ meta: meta.data, teams: data ?? [] });
    }

    let query = supabase
        .from('sofascore_player_stats')
        .select('player_id, player_name, team_id, team_name, position, stats, fetched_at')
        .eq('league_key', leagueKey)
        .eq('season_year', season);

    if (teamIdParam) {
        const teamIdNum = Number.parseInt(teamIdParam, 10);
        if (Number.isFinite(teamIdNum)) {
            query = query.eq('team_id', teamIdNum);
        }
    }

    const { data, error } = await query.order('player_name', { ascending: true });
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ meta: meta.data, players: data ?? [] });
}
