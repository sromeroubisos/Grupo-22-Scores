import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StandingsEngine } from '@/lib/services/standingsEngine';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tournamentId } = await params;
        const searchParams = request.nextUrl.searchParams;
        const phaseId = searchParams.get('phaseId');
        const groupId = searchParams.get('groupId');

        if (!phaseId) {
            return NextResponse.json({ error: 'phaseId is required' }, { status: 400 });
        }

        const supabase = await createClient();

        // 1. Fetch persisted standings
        let query = supabase
            .from('tournament_standings')
            .select(`
                club_id,
                position,
                played,
                won,
                drawn,
                lost,
                points,
                scored,
                conceded,
                bonus_points,
                form,
                stats,
                last_updated
            `)
            .eq('tournament_id', tournamentId)
            .eq('phase_id', phaseId)
            .order('position', { ascending: true });

        if (groupId) {
            query = query.eq('group_id', groupId);
        } else {
            query = (query as any).is('group_id', null);
        }

        const { data: standings, error: standingsError } = await query;

        if (standingsError) throw standingsError;

        // 2. Fetch phase rules for context (lite version)
        const { data: phase } = await supabase
            .from('tournament_phases')
            .select('settings')
            .eq('id', phaseId)
            .single();

        const { data: tournament } = await supabase
            .from('tournaments')
            .select('ruleset')
            .eq('id', tournamentId)
            .single();

        const resolvedRules = StandingsEngine.resolveRules(phase?.settings, tournament?.ruleset);

        // 3. Map to expected frontend structure
        const table = (standings || []).map(row => ({
            teamId: row.club_id,
            team: {
                name: row.stats?.team_name || 'Desconocido',
                logo: row.stats?.team_logo || null
            },
            position: row.position,
            played: row.played,
            won: row.won,
            drawn: row.drawn,
            lost: row.lost,
            points_for: row.scored,
            points_against: row.conceded,
            difference: row.stats?.difference || 0,
            bonus_offensive: row.stats?.bonus_offensive || 0,
            bonus_defensive: row.stats?.bonus_defensive || 0,
            total_points: row.points,
            form: row.form ? row.form.split('') : [],
            adjustments: row.stats?.adjustments || [],
            status: row.stats?.status || null
        }));

        const lastCalculatedAt = standings?.[0]?.last_updated ?? null;

        return NextResponse.json({
            ok: true,
            table,
            rules: resolvedRules,
            last_calculated_at: lastCalculatedAt,
            is_lite: true
        });

    } catch (e: any) {
        console.error('Exception fetching standings-lite:', e);
        return NextResponse.json(
            { error: 'Internal server error', details: e.message },
            { status: 500 },
        );
    }
}
