import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StandingsEngine } from '@/lib/services/standingsEngine';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tournamentId } = await params;
        const body = await request.json();
        const { phaseId, groupId, tableType = 'general' } = body;

        if (!phaseId) {
            return NextResponse.json({ error: 'phaseId is required' }, { status: 400 });
        }

        const supabase = await createClient();

        // 1. Fetch phase + tournament rules
        const [{ data: phase, error: phaseError }, { data: tournament }] = await Promise.all([
            supabase
                .from('tournament_phases')
                .select('id, settings')
                .eq('id', phaseId)
                .eq('tournament_id', tournamentId)
                .single(),
            supabase
                .from('tournaments')
                .select('ruleset')
                .eq('id', tournamentId)
                .single(),
        ]);

        if (phaseError || !phase) {
            return NextResponse.json({ error: 'Phase not found' }, { status: 404 });
        }

        const resolvedRules = StandingsEngine.resolveRules(phase.settings, tournament?.ruleset);

        // 2. Fetch participants (exclude withdrawn/disqualified)
        let pQuery = supabase
            .from('tournament_participants')
            .select('id, club_id, name, group_id, status, clubs(name, logo_url)')
            .eq('tournament_id', tournamentId)
            .not('status', 'in', '("withdrawn","disqualified")');

        if (groupId) pQuery = pQuery.eq('group_id', groupId);
        const { data: participants, error: pError } = await pQuery;
        if (pError) throw pError;

        // 3. Fetch final matches for this phase
        let mQuery = supabase
            .from('matches')
            .select('id, home_club_id, away_club_id, score, status, date_time, phase_id, group_id, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason')
            .eq('tournament_id', tournamentId)
            .eq('phase_id', phaseId)
            .eq('status', 'final');

        if (groupId) mQuery = mQuery.eq('group_id', groupId);
        const { data: matches, error: mError } = await mQuery;
        if (mError) throw mError;

        // 4. Run engine
        const table = StandingsEngine.generateTable(
            participants || [],
            matches || [],
            resolvedRules,
            tableType,
        );

        // 5. Persist to tournament_standings
        const calculatedAt = new Date().toISOString();

        if (table.length > 0) {
            // Clear stale rows for this scope
            let delQuery = supabase
                .from('tournament_standings')
                .delete()
                .eq('tournament_id', tournamentId)
                .eq('phase_id', phaseId);

            if (groupId) {
                delQuery = delQuery.eq('group_id', groupId);
            } else {
                delQuery = (delQuery as typeof delQuery & { is: (column: string, value: null) => typeof delQuery }).is('group_id', null);
            }
            await delQuery;

            const rows = table.map((row) => ({
                tournament_id: tournamentId,
                phase_id: phaseId,
                group_id: groupId || null,
                club_id: row.teamId,
                position: row.position,
                played: row.played,
                won: row.won,
                drawn: row.drawn,
                lost: row.lost,
                points: row.total_points,
                scored: row.points_for,
                conceded: row.points_against,
                bonus_points: (row.bonus_offensive || 0) + (row.bonus_defensive || 0),
                form: (row.form || []).join(''),
                stats: {
                    difference: row.difference,
                    bonus_offensive: row.bonus_offensive,
                    bonus_defensive: row.bonus_defensive,
                    adjustments: row.adjustments,
                    team_name: row.team?.name,
                    team_logo: row.team?.logo,
                    status: row.status,
                    table_type: tableType,
                    calculated_at: calculatedAt,
                },
                last_updated: calculatedAt,
            }));

            await supabase.from('tournament_standings').insert(rows);
        }

        // 6. Audit log
        await supabase.from('admin_audit_log').insert({
            entity_type: 'standings',
            entity_id: tournamentId,
            action: 'recalculated_standings_table',
            changes: {
                phase_id: phaseId,
                group_id: groupId ?? null,
                table_type: tableType,
                rows_calculated: table.length,
                calculated_at: calculatedAt,
            },
        });

        return NextResponse.json({
            ok: true,
            rows_calculated: table.length,
            calculated_at: calculatedAt,
        });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        console.error('Exception recalculating standings:', e);
        return NextResponse.json(
            { error: 'Failed to recalculate standings', details: message },
            { status: 500 },
        );
    }
}
