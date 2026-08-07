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
import { supportsStandingsTableTypeColumn } from '@/lib/standings/tableTypeSupport';
import { isUuid } from '@/lib/utils/postgrest';
import { markEditTrace } from '@/lib/perf/editTrace';

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
            markEditTrace({ standingsRan: true, standingsPhaseType: 'group_stage', standingsGroups: groups.length });
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

    markEditTrace({ standingsRan: true, standingsPhaseType: phase.phase_type, standingsGroups: 1 });
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

    // 5. Persistir en tournament_standings.
    //
    // El orden importa más que cualquier otra cosa de este archivo. Antes era
    // BORRAR y después insertar, con un retorno temprano en el medio si la tabla
    // salía vacía: la peor combinación posible. Si el insert fallaba, la tabla
    // quedaba en cero; si el motor devolvía cero filas, la tabla quedaba en cero
    // con el borrado ya hecho y la función devolvía `ok: true`.
    //
    // Ahora se escribe primero y se limpian los sobrantes después:
    //   · si falla el upsert, la tabla vieja sigue publicada;
    //   · si falla el borrado de sobrantes, quedan filas de más — visible para el
    //     operador y corregible con otro recálculo.
    // Nunca queda vacía por accidente.
    const calculatedAt = new Date().toISOString();
    const supportsTableType = await supportsStandingsTableTypeColumn();

    const rows = table.map((row) => ({
        tournament_id: tournamentId,
        season_id: scopedSeasonId,
        phase_id: phaseId,
        group_id: groupId || null,
        club_id: row.teamId,
        // Sin la migración la columna no existe y mandarla haría fallar el
        // insert entero. `stats.table_type` se sigue escribiendo siempre: es el
        // respaldo del backfill y lo que leen las versiones viejas.
        ...(supportsTableType ? { table_type: tableType } : {}),
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

    /** Acota una query al scope exacto que este recálculo acaba de resolver. */
    const applyScope = <Q>(query: Q): Q => {
        let scoped = (query as any).eq('tournament_id', tournamentId).eq('phase_id', phaseId);
        if (scopedSeasonId) scoped = scoped.eq('season_id', scopedSeasonId);
        scoped = groupId ? scoped.eq('group_id', groupId) : scoped.is('group_id', null);
        if (supportsTableType) scoped = scoped.eq('table_type', tableType);
        return scoped as Q;
    };

    /**
     * Una tabla vacía NO borra la publicada. Es la guarda que hace verdadero al
     * comentario de arriba, y va antes de las dos ramas porque las dos podían
     * romperlo: la vieja borraba y salía por el retorno temprano, y la nueva se
     * salteaba el upsert pero igual limpiaba "sobrantes" — con el conjunto de
     * clubes vigentes vacío, eso es borrar todo.
     *
     * El motor devuelve cero filas cuando no hay participantes, y eso casi
     * siempre es una carga que falló, no una fase que se quedó sin equipos. Ante
     * la duda se conserva lo publicado: una tabla vieja se ve y se corrige con
     * otro recálculo; una borrada hay que ir a buscarla al respaldo.
     *
     * El costo es que una fase vaciada a propósito se queda con su última tabla.
     * No es invisible: el indicador de desfasaje de la barra pasa a "Publicada
     * desactualizada" y nombra los clubes que sobran.
     */
    if (rows.length === 0) {
        console.warn(
            '[recalculateStandings] El motor devolvió cero filas: se conserva la tabla publicada',
            { tournamentId, phaseId, groupId: groupId ?? null, tableType },
        );
        return { ok: true, rows_calculated: 0 };
    }

    if (!supportsTableType) {
        /**
         * Camino previo a la migración. No se puede hacer upsert todavía: el
         * UNIQUE viejo es (tournament_id, phase_id, group_id, club_id) —sin
         * temporada y con NULLS DISTINCT—, así que para las filas con
         * `group_id` NULL, que son la mayoría, el ON CONFLICT nunca dispararía y
         * cada recálculo acumularía duplicados. El UNIQUE que hace correcto al
         * upsert llega con la misma migración que la columna.
         *
         * Acá el borrado sin filtro de perspectiva no destruye nada porque el
         * endpoint devuelve 409 para todo lo que no sea `general`: sin columna
         * es imposible que existan filas de local o visitante.
         */
        const { error: deleteError } = await applyScope(
            supabase.from('tournament_standings').delete(),
        );
        if (deleteError) {
            console.error('[recalculateStandings] Error clearing stale standings', deleteError);
            return { ok: false, rows_calculated: 0 };
        }

        const { error: insertError } = await supabase.from('tournament_standings').insert(rows);
        if (insertError) {
            console.error('[recalculateStandings] Error inserting standings', insertError);
            return { ok: false, rows_calculated: 0 };
        }

        console.log(`[recalculateStandings] Persisted ${rows.length} rows for phase ${phaseId}`);
        return { ok: true, rows_calculated: rows.length };
    }

    /**
     * El upsert se apoya en `tournament_standings_scope_unique`, el índice de
     * seis columnas con NULLS NOT DISTINCT que trae la migración. Las seis
     * columnas del `onConflict` tienen que coincidir EXACTAMENTE con las del
     * índice o Postgres no lo infiere y devuelve 42P10.
     *
     * `NULLS NOT DISTINCT` no es un detalle: `season_id` y `group_id` son NULL en
     * la mayoría de las filas, y con la semántica por defecto el ON CONFLICT
     * nunca dispararía para ellas — cada recálculo insertaría un juego nuevo
     * encima del anterior.
     */
    const { error: upsertError } = await supabase
        .from('tournament_standings')
        .upsert(rows, {
            onConflict: 'tournament_id,season_id,phase_id,group_id,club_id,table_type',
        });

    if (upsertError) {
        console.error('[recalculateStandings] Error upserting standings', upsertError);
        return { ok: false, rows_calculated: 0 };
    }

    /**
     * Sobrantes: clubes que estaban en la tabla guardada y ya no están en la
     * nueva (se fueron de la fase, cambiaron de grupo). Se resuelven leyendo los
     * ids y borrando por clave primaria en vez de armar un `not.in` con los
     * club_id: los club_id son slugs de texto y meterlos en un filtro de
     * PostgREST obliga a citarlos a mano.
     */
    const { data: persisted, error: readbackError } = await applyScope(
        supabase.from('tournament_standings').select('id, club_id'),
    );

    if (readbackError) {
        console.error('[recalculateStandings] Error listando filas para limpiar sobrantes', readbackError);
    } else {
        const vigentes = new Set(rows.map((row) => row.club_id));
        const sobrantes = (persisted ?? [])
            .filter((row: { club_id: string }) => !vigentes.has(row.club_id))
            .map((row: { id: string }) => row.id);

        if (sobrantes.length > 0) {
            const { error: deleteError } = await supabase
                .from('tournament_standings')
                .delete()
                .in('id', sobrantes);

            if (deleteError) {
                // No aborta: la tabla nueva ya está publicada y correcta. Quedan
                // filas de más, que se ven y se arreglan con otro recálculo.
                console.error('[recalculateStandings] Error borrando filas sobrantes', deleteError);
            }
        }
    }

    console.log(`[recalculateStandings] Persisted ${rows.length} rows for phase ${phaseId}`);
    return { ok: true, rows_calculated: rows.length };
}
