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
import {
    findCarryOverDependentPhases,
    resolveStandingsCarryOverRows,
} from '@/lib/server/standingsCarryOver';
import { loadPhaseScopedParticipants } from '@/lib/server/phaseParticipants';
import { isUuid } from '@/lib/utils/postgrest';

type RecalculateOptions = {
    includeDependents?: boolean;
    visitedPhaseIds?: Set<string>;
};

async function recalculateCarryOverDependents(
    tournamentId: string,
    sourcePhaseId: string,
    tableType: string,
    seasonId: string | null,
    visitedPhaseIds: Set<string>,
) {
    const supabase = createAdminClient();
    const dependents = await findCarryOverDependentPhases({
        supabase,
        tournamentId,
        sourcePhaseId,
        seasonId,
    });

    for (const phase of dependents) {
        if (visitedPhaseIds.has(phase.id)) continue;
        const result = await recalculatePhaseStandingsScopes(tournamentId, phase.id, tableType, seasonId, {
            includeDependents: true,
            visitedPhaseIds,
        });
        if (!result.ok) {
            console.error('[recalculateStandings] Dependent carry-over phase failed', {
                tournamentId,
                sourcePhaseId,
                dependentPhaseId: phase.id,
            });
        }
    }
}

export async function recalculatePhaseStandingsScopes(
    tournamentId: string,
    phaseId: string,
    tableType = 'general',
    seasonId?: string | null,
    options: RecalculateOptions = {},
): Promise<{ ok: boolean; rows_calculated: number; scopes_recalculated: number }> {
    if (seasonId && !isUuid(seasonId)) {
        console.error('[recalculatePhaseStandingsScopes] seasonId inválido (se esperaba UUID)', { tournamentId, phaseId, seasonId });
        return { ok: false, rows_calculated: 0, scopes_recalculated: 0 };
    }

    const supabase = createAdminClient();
    const includeDependents = options.includeDependents ?? true;
    const visitedPhaseIds = options.visitedPhaseIds ?? new Set<string>();

    if (visitedPhaseIds.has(phaseId)) {
        return { ok: true, rows_calculated: 0, scopes_recalculated: 0 };
    }
    visitedPhaseIds.add(phaseId);

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

    // NOTE: stale rows are cleared per-scope inside recalculateAndPersistStandings,
    // only after the new table was computed successfully (avoids wiping standings
    // when the recalculation fails mid-way).

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

            const result = {
                ok: results.every((result) => result.ok),
                rows_calculated: results.reduce((total, result) => total + result.rows_calculated, 0),
                scopes_recalculated: results.length,
            };

            if (result.ok && includeDependents) {
                await recalculateCarryOverDependents(
                    tournamentId,
                    phaseId,
                    tableType,
                    scopedSeasonId,
                    visitedPhaseIds,
                );
            }

            return result;
        }
    }

    const result = await recalculateAndPersistStandings(tournamentId, phaseId, null, tableType, scopedSeasonId);
    const finalResult = {
        ok: result.ok,
        rows_calculated: result.rows_calculated,
        scopes_recalculated: 1,
    };

    if (finalResult.ok && includeDependents) {
        await recalculateCarryOverDependents(
            tournamentId,
            phaseId,
            tableType,
            scopedSeasonId,
            visitedPhaseIds,
        );
    }

    return finalResult;
}

export async function recalculateAndPersistStandings(
    tournamentId: string,
    phaseId: string,
    groupId?: string | null,
    tableType = 'general',
    seasonId?: string | null,
): Promise<{ ok: boolean; rows_calculated: number }> {
    if (seasonId && !isUuid(seasonId)) {
        console.error('[recalculateStandings] seasonId inválido (se esperaba UUID)', { tournamentId, phaseId, seasonId });
        return { ok: false, rows_calculated: 0 };
    }

    const supabase = createAdminClient();

    // 1. Fetch phase + tournament rules
    const [{ data: phase, error: phaseError }, { data: tournament }] = await Promise.all([
        supabase
            .from('tournament_phases')
            .select('id, name, phase_type, order_index, settings, season_id')
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

    // 2. Fetch participants scoped to this phase/group. Falls back to the
    // legacy tournament_participants.group_id model until the migration exists.
    let participants: Awaited<ReturnType<typeof loadPhaseScopedParticipants>>['participants'];
    try {
        const participantScope = await loadPhaseScopedParticipants(supabase, {
            tournamentId,
            phaseId,
            groupId,
            seasonId: scopedSeasonId,
        });
        participants = participantScope.participants;
    } catch (error) {
        console.error('[recalculateStandings] Error fetching phase participants', error);
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
    const carryOver = await resolveStandingsCarryOverRows({
        supabase,
        tournamentId,
        currentPhase: phase,
        tournamentRuleset: tournament?.ruleset,
        seasonId: scopedSeasonId,
        tableType,
    });

    // 4. Run engine
    const table = StandingsEngine.generateTable(
        participants || [],
        scopedMatches,
        resolvedRules,
        tableType,
        { carryOverRows: carryOver.rows },
    );

    // 5. Persist to tournament_standings. The new table was computed successfully
    // above, so only now clear the stale rows for this scope before inserting.
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
    const { error: deleteError } = await delQuery;
    if (deleteError) {
        console.error('[recalculateStandings] Error clearing stale standings', deleteError);
        return { ok: false, rows_calculated: 0 };
    }

    if (table.length === 0) {
        return { ok: true, rows_calculated: 0 };
    }

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
            carry_over: row.carry_over ?? null,
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
