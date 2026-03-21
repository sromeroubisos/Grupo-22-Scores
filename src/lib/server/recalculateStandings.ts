/**
 * Shared helper: calculate and persist standings for a given phase/group scope.
 * Called automatically after match result changes or rules updates.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { StandingsEngine } from '@/lib/services/standingsEngine';

export async function recalculateAndPersistStandings(
    tournamentId: string,
    phaseId: string,
    groupId?: string | null,
    tableType = 'general',
): Promise<{ ok: boolean; rows_calculated: number }> {
    const supabase = createAdminClient();

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
        console.error('[recalculateStandings] Phase not found', { tournamentId, phaseId });
        return { ok: false, rows_calculated: 0 };
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
    if (pError) {
        console.error('[recalculateStandings] Error fetching participants', pError);
        return { ok: false, rows_calculated: 0 };
    }

    // 3. Fetch final matches for this phase
    let mQuery = supabase
        .from('matches')
        .select('id, home_club_id, away_club_id, score, status, date_time, phase_id, group_id, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason')
        .eq('tournament_id', tournamentId)
        .eq('phase_id', phaseId)
        .eq('status', 'final');

    if (groupId) mQuery = mQuery.eq('group_id', groupId);
    const { data: matches, error: mError } = await mQuery;
    if (mError) {
        console.error('[recalculateStandings] Error fetching matches', mError);
        return { ok: false, rows_calculated: 0 };
    }

    // 4. Run engine
    const table = StandingsEngine.generateTable(
        participants || [],
        matches || [],
        resolvedRules,
        tableType,
    );

    if (table.length === 0) {
        return { ok: true, rows_calculated: 0 };
    }

    // 5. Persist to tournament_standings
    const calculatedAt = new Date().toISOString();

    let delQuery = supabase
        .from('tournament_standings')
        .delete()
        .eq('tournament_id', tournamentId)
        .eq('phase_id', phaseId);

    if (groupId) {
        delQuery = delQuery.eq('group_id', groupId);
    } else {
        delQuery = (delQuery as any).is('group_id', null);
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

    const { error: insertError } = await supabase.from('tournament_standings').insert(rows);
    if (insertError) {
        console.error('[recalculateStandings] Error inserting standings', insertError);
        return { ok: false, rows_calculated: 0 };
    }

    console.log(`[recalculateStandings] Persisted ${rows.length} rows for phase ${phaseId}`);
    return { ok: true, rows_calculated: rows.length };
}
