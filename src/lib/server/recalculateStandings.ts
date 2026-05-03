/**
 * Shared helper: calculate and persist standings for a given phase/group scope.
 * Called automatically after match result changes or rules updates.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { StandingsEngine } from '@/lib/services/standingsEngine';
import {
    FINAL_STANDINGS_STATUSES,
    filterMatchesForGroupScope,
} from '@/lib/standings/matchScope';
import { queryMatchesWithOptionalEvents } from '@/lib/utils/queryMatchesWithOptionalEvents';

export async function recalculatePhaseStandingsScopes(
    tournamentId: string,
    phaseId: string,
    tableType = 'general',
    seasonId?: string | null,
): Promise<{ ok: boolean; rows_calculated: number; scopes_recalculated: number }> {
    const supabase = createAdminClient();

    const { data: phase, error: phaseError } = await supabase
        .from('tournament_phases')
        .select('id, phase_type, season_id')
        .eq('id', phaseId)
        .eq('tournament_id', tournamentId)
        .single();

    if (phaseError || !phase) {
        console.error('[recalculatePhaseStandingsScopes] Phase not found', { tournamentId, phaseId });
        return { ok: false, rows_calculated: 0, scopes_recalculated: 0 };
    }

    const scopedSeasonId = seasonId ?? phase.season_id ?? null;

    let deleteQuery = supabase
        .from('tournament_standings')
        .delete()
        .eq('tournament_id', tournamentId)
        .eq('phase_id', phaseId);

    if (scopedSeasonId) {
        deleteQuery = deleteQuery.eq('season_id', scopedSeasonId);
    }

    const { error: deleteError } = await deleteQuery;

    if (deleteError) {
        console.error('[recalculatePhaseStandingsScopes] Error clearing stale standings', deleteError);
        return { ok: false, rows_calculated: 0, scopes_recalculated: 0 };
    }

    if (phase.phase_type === 'group_stage') {
        const { data: groups, error: groupsError } = await supabase
            .from('tournament_groups')
            .select('id')
            .eq('phase_id', phaseId)
            .order('order_index', { ascending: true });

        if (groupsError) {
            console.error('[recalculatePhaseStandingsScopes] Error fetching groups', groupsError);
            return { ok: false, rows_calculated: 0, scopes_recalculated: 0 };
        }

        if (Array.isArray(groups) && groups.length > 0) {
            const results = await Promise.all(
                groups.map((group) => recalculateAndPersistStandings(
                    tournamentId,
                    phaseId,
                    group.id,
                    tableType,
                    scopedSeasonId,
                )),
            );

            return {
                ok: results.every((result) => result.ok),
                rows_calculated: results.reduce((total, result) => total + result.rows_calculated, 0),
                scopes_recalculated: results.length,
            };
        }
    }

    const result = await recalculateAndPersistStandings(tournamentId, phaseId, null, tableType, scopedSeasonId);
    return {
        ok: result.ok,
        rows_calculated: result.rows_calculated,
        scopes_recalculated: 1,
    };
}

export async function recalculateAndPersistStandings(
    tournamentId: string,
    phaseId: string,
    groupId?: string | null,
    tableType = 'general',
    seasonId?: string | null,
): Promise<{ ok: boolean; rows_calculated: number }> {
    const supabase = createAdminClient();

    // 1. Fetch phase + tournament rules
    const [{ data: phase, error: phaseError }, { data: tournament }] = await Promise.all([
        supabase
            .from('tournament_phases')
            .select('id, settings, season_id')
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
    const scopedSeasonId = seasonId ?? phase.season_id ?? null;

    // 2. Fetch participants (exclude withdrawn/disqualified)
    let pQuery = supabase
        .from('tournament_participants')
        .select('id, club_id, name, group_id, status, clubs(name, logo_url)')
        .eq('tournament_id', tournamentId)
        .not('status', 'in', '("withdrawn","disqualified")');

    if (scopedSeasonId) pQuery = pQuery.eq('season_id', scopedSeasonId);
    if (groupId) pQuery = pQuery.eq('group_id', groupId);
    const { data: participants, error: pError } = await pQuery;
    if (pError) {
        console.error('[recalculateStandings] Error fetching participants', pError);
        return { ok: false, rows_calculated: 0 };
    }

    // 3. Fetch final matches for this phase
    const buildMatchesQuery = (includeEvents: boolean) => {
        let query = supabase
            .from('matches')
            .select(includeEvents
                ? 'id, home_club_id, away_club_id, score, events, status, date_time, phase_id, group_id, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason'
                : 'id, home_club_id, away_club_id, score, status, date_time, phase_id, group_id, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason')
            .eq('tournament_id', tournamentId)
            .eq('phase_id', phaseId)
            .in('status', [...FINAL_STANDINGS_STATUSES]);

        if (scopedSeasonId) {
            query = query.eq('season_id', scopedSeasonId);
        }

        return query;
    };

    const { data: matches, error: mError } = await queryMatchesWithOptionalEvents(
        () => buildMatchesQuery(true),
        () => buildMatchesQuery(false),
    );
    if (mError) {
        console.error('[recalculateStandings] Error fetching matches', mError);
        return { ok: false, rows_calculated: 0 };
    }

    const scopedMatches = filterMatchesForGroupScope(matches || [], participants || [], groupId);

    // 4. Run engine
    const table = StandingsEngine.generateTable(
        participants || [],
        scopedMatches,
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

    if (scopedSeasonId) {
        delQuery = delQuery.eq('season_id', scopedSeasonId);
    }

    if (groupId) {
        delQuery = delQuery.eq('group_id', groupId);
    } else {
        delQuery = (delQuery as typeof delQuery & {
            is: (column: string, value: null) => typeof delQuery;
        }).is('group_id', null);
    }
    await delQuery;

    const rows = table.map((row) => ({
        tournament_id: tournamentId,
        season_id: scopedSeasonId,
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
