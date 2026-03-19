import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/db/standings?tournament=<uuid>
// Light endpoint returning tournament standings joined with club info.
export async function GET(req: NextRequest) {
    const tournamentId = req.nextUrl.searchParams.get('tournament');
    if (!tournamentId) {
        return NextResponse.json({ error: 'tournament param required' }, { status: 400 });
    }

    const supabase = await createClient();

    const { data, error } = await supabase
        .from('tournament_standings')
        .select(`
            position, played, won, drawn, lost, points, scored, conceded,
            bonus_points, form, club_id, phase_id, group_id,
            club:clubs!tournament_standings_club_id_fkey(id, name, logo_url, short_name)
        `)
        .eq('tournament_id', tournamentId)
        .order('position', { ascending: true });

    if (error) {
        console.error('[GET /api/db/standings] query failed:', error);
        return NextResponse.json({ error: 'Failed to fetch standings' }, { status: 500 });
    }

    const rows = (data || []).map((row: any) => ({
        position: row.position,
        team: {
            name: row.club?.name ?? '',
            logo: row.club?.logo_url ?? '',
            id: row.club_id,
        },
        matches_total: row.played,
        wins_total: row.won,
        draws_total: row.drawn,
        losses_total: row.lost,
        goals_for: row.scored,
        goals_against: row.conceded,
        goal_difference: row.scored - row.conceded,
        points_total: row.points,
        bonus_points: row.bonus_points,
        form: row.form,
        phase_id: row.phase_id,
        group_id: row.group_id,
    }));

    return NextResponse.json({ ok: true, standings: rows });
}
