import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentReadContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { StandingsEngine } from '@/lib/services/standingsEngine';
import { CIRCUIT_GLOBAL_SENTINEL } from '@/components/admin/entities/tournament/standings/types';
import {
    FINAL_STANDINGS_STATUSES,
    filterMatchesForGroupScope,
    isFinalStandingsStatus,
} from '@/lib/standings/matchScope';
import { queryMatchesWithOptionalEvents } from '@/lib/utils/queryMatchesWithOptionalEvents';
import { resolveStandingsCarryOverRows } from '@/lib/server/standingsCarryOver';
import { loadPhaseScopedParticipants } from '@/lib/server/phaseParticipants';
import { normalizeTableType } from '@/lib/standings/tableType';
import { comparePublishedVsLive, describeDrift } from '@/lib/standings/publishedDrift';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';
import { applyStandingsTableType, supportsStandingsTableTypeColumn } from '@/lib/standings/tableTypeSupport';
import { isUuid } from '@/lib/utils/postgrest';

// --- Circuit placement points helpers ---

const DEFAULT_CIRCUIT_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

type QueryError = {
    code?: string | null;
    message?: string | null;
    details?: string | null;
} | null;

type StandingMatchRow = {
    id: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    score: Record<string, unknown> | null;
    events: unknown[] | null;
    status: string | null;
    date_time: string | null;
    phase_id: string | null;
    group_id: string | null;
    home_base_points: number | null;
    away_base_points: number | null;
    home_bonus_points: number | null;
    away_bonus_points: number | null;
    points_autocalculated: boolean | null;
    points_override_reason: string | null;
};

type StandingMatchRowWithoutEvents = Omit<StandingMatchRow, 'events'>;

type ParticipantScopeRow = {
    id?: unknown;
    club_id?: unknown;
};

function normalizeScopeId(value: unknown): string {
    return String(value ?? '').trim();
}

function getParticipantTeamId(participant: ParticipantScopeRow): string {
    return normalizeScopeId(participant.club_id ?? participant.id);
}

function getMatchTeamId(match: Record<string, unknown>, side: 'home' | 'away'): string {
    return normalizeScopeId(match[`${side}_club_id`] ?? match[`${side}_participant_id`]);
}

function buildParticipantTeamIdSet(participants: ParticipantScopeRow[]): Set<string> {
    return new Set(participants.map(getParticipantTeamId).filter(Boolean));
}

function filterStandingRowsForParticipantScope<TRow extends { club_id?: unknown }>(
    rows: TRow[],
    participants: ParticipantScopeRow[],
): TRow[] {
    const allowedTeamIds = buildParticipantTeamIdSet(participants);
    if (allowedTeamIds.size === 0) return [];

    return rows.filter((row) => allowedTeamIds.has(normalizeScopeId(row.club_id)));
}

function filterMatchesForParticipantScope<TMatch extends Record<string, unknown>>(
    matches: TMatch[],
    participants: ParticipantScopeRow[],
    groupId?: string | null,
): TMatch[] {
    const groupScopedMatches = filterMatchesForGroupScope(matches, participants, groupId);
    const allowedTeamIds = buildParticipantTeamIdSet(participants);
    if (allowedTeamIds.size === 0) return [];

    return groupScopedMatches.filter((match) => {
        const homeId = getMatchTeamId(match, 'home');
        const awayId = getMatchTeamId(match, 'away');
        return Boolean(homeId && awayId && allowedTeamIds.has(homeId) && allowedTeamIds.has(awayId));
    });
}

function getDefaultCircuitPlacementPoints(): Array<{ position: number; points: number }> {
    return DEFAULT_CIRCUIT_POINTS.map((pts, i) => ({ position: i + 1, points: pts }));
}

function parseCircuitPlacementPoints(input: unknown): Array<{ position: number; points: number }> {
    if (!input) return [];
    if (Array.isArray(input)) {
        return input
            .map((item, i) => {
                if (typeof item === 'number') return { position: i + 1, points: item };
                if (item && typeof item === 'object') {
                    const pt = item as Record<string, unknown>;
                    const pos = Number(pt.position ?? pt.pos ?? i + 1);
                    const pts = Number(pt.points ?? pt.pts ?? 0);
                    return { position: pos, points: pts };
                }
                return null;
            })
            .filter(Boolean) as Array<{ position: number; points: number }>;
    }
    return [];
}

function resolveCircuitPlacementPoints(
    phaseSettings: Record<string, unknown> | null,
    tournamentRuleset: Record<string, unknown> | null,
    phaseId: string,
    phaseOrder: number,
): Array<{ position: number; points: number }> {
    const fromPhase = parseCircuitPlacementPoints(
        (phaseSettings as any)?.circuit?.pointsByPlacement ?? (phaseSettings as any)?.placementPoints,
    );
    if (fromPhase.length > 0) return fromPhase;

    const stages = Array.isArray((tournamentRuleset as any)?.circuit?.stages)
        ? (tournamentRuleset as any).circuit.stages
        : [];
    const stageMatch = stages.find(
        (s: any) =>
            String(s?.id || '') === phaseId ||
            Number(s?.order) === phaseOrder + 1 ||
            Number(s?.order) === phaseOrder,
    );
    const fromRuleset = parseCircuitPlacementPoints(stageMatch?.circuit_points);
    if (fromRuleset.length > 0) return fromRuleset;

    return getDefaultCircuitPlacementPoints();
}

// --- Circuit global aggregation ---

async function handleCircuitGlobalStandings(tournamentId: string, supabase: any, seasonId?: string | null) {
    // Fetch tournament ruleset
    const { data: tournament, error: tErr } = await supabase
        .from('tournaments')
        .select('id, ruleset')
        .eq('id', tournamentId)
        .single();
    if (tErr) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });

    const ruleset = (tournament.ruleset ?? {}) as Record<string, unknown>;

    // Fetch all phases ordered
    let phasesQuery = supabase
        .from('tournament_phases')
        .select('id, name, order_index, settings')
        .eq('tournament_id', tournamentId)
        .order('order_index', { ascending: true });

    if (seasonId) {
        phasesQuery = phasesQuery.eq('season_id', seasonId);
    }

    const { data: phases, error: pErr } = await phasesQuery;
    if (pErr) return NextResponse.json({ error: 'Error fetching phases' }, { status: 500 });

    if (!phases || phases.length === 0) {
        return NextResponse.json({ ok: true, table: [], metrics: { counted_matches: 0, pending_results: 0, manual_overrides: 0 }, rules: null, last_calculated_at: null });
    }

    // Aggregate placement points across phases
    const rowsByClub = new Map<string, {
        teamId: string;
        team: { id: string; name: string; logo: string | null };
        total_points: number;
        stages_played: number;
        stage_titles: number;
        podiums: number;
        best_finish: number | null;
    }>();

    let totalFinalMatches = 0;

    for (const phase of phases) {
        const phaseSettings = (phase.settings ?? {}) as Record<string, unknown>;
        const placementMap = new Map(
            resolveCircuitPlacementPoints(phaseSettings, ruleset, phase.id, phase.order_index ?? 0)
                .map(({ position, points }) => [position, points]),
        );

        let rowsQuery = supabase
            .from('tournament_standings')
            .select('club_id, position, points, stats')
            .eq('tournament_id', tournamentId)
            .eq('phase_id', phase.id)
            .order('position', { ascending: true });

        if (seasonId) {
            rowsQuery = rowsQuery.eq('season_id', seasonId);
        }

        // El agregador de circuito suma puntos por posición a lo largo de las
        // fases. Sin filtrar, cada club entraría tres veces por fase y los
        // puntos del circuito se triplicarían.
        rowsQuery = applyStandingsTableType(
            rowsQuery,
            await supportsStandingsTableTypeColumn(),
        );

        const { data: rows } = await rowsQuery;

        if (!rows || rows.length === 0) continue;

        // Count final matches for this phase as a proxy for "played"
        let phaseMatchQuery = supabase
            .from('matches')
            .select('id', { count: 'exact', head: true })
            .eq('tournament_id', tournamentId)
            .eq('phase_id', phase.id)
            .in('status', [...FINAL_STANDINGS_STATUSES]);

        if (seasonId) {
            phaseMatchQuery = phaseMatchQuery.eq('season_id', seasonId);
        }

        const { count: phaseMatchCount } = await phaseMatchQuery;
        totalFinalMatches += phaseMatchCount ?? 0;

        for (const row of rows) {
            const teamId = row.club_id;
            const position = Number(row.position ?? 0);
            const pts = position > 0 ? (placementMap.get(position) ?? 0) : 0;
            const stats = row.stats as Record<string, unknown> | null;
            const teamName = (stats?.team_name as string) || 'Equipo';
            // Proxy, no el base64 guardado. Ver el comentario del otro armado de
            // filas más abajo.
            const teamLogo = buildTeamLogoProxyUrl({
                key: teamId,
                name: teamName,
                fallback: (stats?.team_logo as string) || null,
            });

            const prev = rowsByClub.get(teamId);
            if (prev) {
                prev.total_points += pts;
                prev.stages_played += 1;
                if (position === 1) prev.stage_titles += 1;
                if (position <= 3) prev.podiums += 1;
                if (prev.best_finish === null || position < prev.best_finish) prev.best_finish = position;
            } else {
                rowsByClub.set(teamId, {
                    teamId,
                    team: { id: teamId, name: teamName, logo: teamLogo },
                    total_points: pts,
                    stages_played: 1,
                    stage_titles: position === 1 ? 1 : 0,
                    podiums: position <= 3 ? 1 : 0,
                    best_finish: position > 0 ? position : null,
                });
            }
        }
    }

    // Sort and assign positions
    const sorted = Array.from(rowsByClub.values()).sort((a, b) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points;
        if (b.stage_titles !== a.stage_titles) return b.stage_titles - a.stage_titles;
        if (b.podiums !== a.podiums) return b.podiums - a.podiums;
        const aBest = a.best_finish ?? 9999;
        const bBest = b.best_finish ?? 9999;
        return aBest - bBest;
    });

    const table = sorted.map((row, index) => ({
        teamId: row.teamId,
        team: row.team,
        position: index + 1,
        played: row.stages_played,
        won: row.stage_titles,
        drawn: 0,
        lost: 0,
        points_for: 0,
        points_against: 0,
        difference: 0,
        bonus_offensive: 0,
        bonus_defensive: 0,
        adjustments: 0,
        total_points: row.total_points,
        form: [],
        status: null,
    }));

    return NextResponse.json({
        ok: true,
        table,
        metrics: { counted_matches: totalFinalMatches, pending_results: 0, manual_overrides: 0 },
        rules: null,
        last_calculated_at: null,
    });
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tournamentId } = await params;
        // Admin standings only exist for internal (UUID) tournaments. A non-UUID id
        // would be passed straight into the `tournaments.id` / `tournament_phases.tournament_id`
        // uuid columns below, so reject it up front instead of spamming Postgres.
        if (!isUuid(tournamentId)) {
            return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }
        const searchParams = request.nextUrl.searchParams;
        const phaseId = searchParams.get('phaseId');
        const groupId = searchParams.get('groupId');
        const tableType = normalizeTableType(searchParams.get('tableType'));
        if (!tableType) {
            return NextResponse.json(
                { error: 'tableType inválido: se esperaba general, home o away.' },
                { status: 400 },
            );
        }
        let seasonId =
            searchParams.get('seasonId') ||
            searchParams.get('season_id') ||
            searchParams.get('season');

        // `season` llega de la URL y a veces trae la ETIQUETA de la temporada
        // ('2026') en lugar de su id. Son dos columnas distintas con el mismo
        // nombre: `tournaments.season_id` es TEXT con el año, pero las seis
        // tablas del alcance (fases, grupos, partidos, participantes,
        // posiciones) la tienen UUID. Cruzarlas tiraba 22P02 en las diez
        // consultas de abajo — las ráfagas de la auditoría del 08/08.
        // Se descarta y más abajo se resuelve la temporada vigente del torneo,
        // que es la que se quería ver.
        if (seasonId && !isUuid(seasonId)) {
            seasonId = null;
        }

        if (!phaseId) {
            return NextResponse.json({ error: 'phaseId is required' }, { status: 400 });
        }

        // Salvo el centinela del circuito, `phaseId` va derecho a una columna
        // uuid. Un nombre de pestaña o un número de página llegando acá era un
        // 22P02 y un 500; ahora es un 400 que dice qué pasó.
        if (phaseId !== CIRCUIT_GLOBAL_SENTINEL && !isUuid(phaseId)) {
            return NextResponse.json({ error: 'phaseId inválido' }, { status: 400 });
        }

        // `groupId` no se descarta en silencio: sin filtro la consulta cae en
        // `is('group_id', null)` y devolvería la tabla sin grupos como si fuera
        // la del grupo pedido.
        if (groupId && !isUuid(groupId)) {
            return NextResponse.json({ error: 'groupId inválido' }, { status: 400 });
        }

        // Lectura acotada a quien pertenece al torneo. Hasta acá alcanzaba con
        // tener sesión y el id del torneo para leer su tabla y su reglamento.
        const { writer: supabase } = await requireTournamentReadContext(tournamentId);

        if (!seasonId) {
            const { data: tournamentSeason } = await supabase
                .from('tournaments')
                .select('current_season_id')
                .eq('id', tournamentId)
                .maybeSingle();
            seasonId = tournamentSeason?.current_season_id ?? null;
        }

        if (phaseId === CIRCUIT_GLOBAL_SENTINEL) {
            return handleCircuitGlobalStandings(tournamentId, supabase, seasonId);
        }

        // 1. Fetch phase + tournament rules
        const { data: phase, error: phaseError } = await supabase
            .from('tournament_phases')
            .select('id, name, phase_type, order_index, settings, season_id, tournament_id')
            .eq('id', phaseId)
            .eq('tournament_id', tournamentId)
            .single();

        if (phaseError) {
            return NextResponse.json({ error: 'Phase not found' }, { status: 404 });
        }

        const { data: tournament, error: tournamentError } = await supabase
            .from('tournaments')
            .select('id, name, ruleset, status')
            .eq('id', tournamentId)
            .single();

        if (tournamentError) {
            return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }

        const resolvedRules = StandingsEngine.resolveRules(phase.settings, tournament?.ruleset);
        const supportsGroups = phase.phase_type === 'group_stage';
        const scopedGroupId = supportsGroups ? groupId : null;

        if (resolvedRules.calculation_mode === 'fully_manual') {
            let standingsQuery = supabase
                .from('tournament_standings')
                .select('club_id, position, played, won, drawn, lost, points, scored, conceded, bonus_points, form, stats, last_updated')
                .eq('tournament_id', tournamentId)
                .eq('phase_id', phaseId)
                .order('position', { ascending: true });

            if (scopedGroupId) {
                standingsQuery = standingsQuery.eq('group_id', scopedGroupId);
            } else {
                standingsQuery = (standingsQuery as typeof standingsQuery & { is: (column: string, value: null) => typeof standingsQuery }).is('group_id', null);
            }

            if (seasonId) {
                standingsQuery = standingsQuery.eq('season_id', seasonId);
            }

            // Rama fully_manual: la tabla que se muestra es la guardada, así que
            // tiene que ser la de la perspectiva que el operador está mirando.
            standingsQuery = applyStandingsTableType(
                standingsQuery,
                await supportsStandingsTableTypeColumn(),
                tableType,
            );

            let manualMatchesQuery = scopedGroupId
                ? supabase
                    .from('matches')
                    .select('id, status, group_id, home_club_id, away_club_id')
                    .eq('tournament_id', tournamentId)
                    .eq('phase_id', phaseId)
                : supabase
                    .from('matches')
                    .select('id, status, group_id, home_club_id, away_club_id')
                    .eq('tournament_id', tournamentId)
                    .eq('phase_id', phaseId);

            if (seasonId) {
                manualMatchesQuery = manualMatchesQuery.eq('season_id', seasonId);
            }

            const [
                { data: persistedRows, error: persistedError },
                participantScope,
                { data: matches, error: mError },
            ] = await Promise.all([
                standingsQuery,
                loadPhaseScopedParticipants(supabase, {
                    tournamentId,
                    phaseId,
                    groupId: scopedGroupId,
                    seasonId,
                }),
                manualMatchesQuery,
            ]);

            if (persistedError) {
                throw persistedError;
            }
            if (mError) throw mError;

            const participantRows = (participantScope.participants || []) as any[];
            const persistedStandingRows = filterStandingRowsForParticipantScope(
                (persistedRows || []) as any[],
                participantRows,
            );
            const matchRows = (matches || []) as any[];

            const participantMap = new Map<string, any>(
                participantRows.map((participant) => [
                    participant.club_id || participant.id,
                    participant,
                ])
            );

            const table = persistedStandingRows.map((row) => {
                const participant = participantMap.get(row.club_id);
                const participantClub = Array.isArray(participant?.clubs) ? participant.clubs[0] : participant?.clubs;
                return {
                    participantId: participant?.id || row.club_id,
                    teamId: row.club_id,
                    team: {
                        id: row.club_id,
                        name: row.stats?.team_name || participantClub?.name || participant?.name || 'Equipo',
                        // URL de proxy, no el base64 del JSONB: es lo que hace
                        // posible recortar `stats.team_logo` de la tabla sin que
                        // los escudos desaparezcan.
                        logo: buildTeamLogoProxyUrl({
                            key: row.club_id,
                            name: row.stats?.team_name || participantClub?.name || participant?.name || null,
                            fallback: participantClub?.logo_url || row.stats?.team_logo || null,
                        }),
                    },
                    position: row.position,
                    played: row.played,
                    won: row.won,
                    drawn: row.drawn,
                    lost: row.lost,
                    points_for: row.scored,
                    points_against: row.conceded,
                    difference: row.stats?.difference ?? (row.scored - row.conceded),
                    base_points: row.points - row.bonus_points,
                    bonus_offensive: row.stats?.try_bonus ?? row.stats?.bonus_offensive ?? 0,
                    bonus_defensive: row.stats?.losing_bonus ?? row.stats?.bonus_defensive ?? 0,
                    adjustments: row.stats?.adjustments ?? 0,
                    total_points: row.points,
                    form: row.form ? String(row.form).split('') : [],
                    status: row.stats?.status || null,
                };
            });

            const scopedMatches = filterMatchesForParticipantScope(matchRows, participantRows, scopedGroupId);
            const metrics = {
                counted_matches: scopedMatches.filter((match) => isFinalStandingsStatus(match.status)).length,
                pending_results: scopedMatches.filter((match) => ['scheduled', 'live', 'suspended', 'delayed', 'postponed'].includes(String(match.status ?? ''))).length,
                manual_overrides: table.length,
            };

            return NextResponse.json({
                ok: true,
                table,
                metrics,
                rules: resolvedRules,
                last_calculated_at: persistedRows?.[0]?.last_updated ?? null,
            });
        }

        // 2. Fetch participants scoped to this phase/group. This keeps the
        // tournament registration intact while letting each phase define its roster.
        const { participants } = await loadPhaseScopedParticipants(supabase, {
            tournamentId,
            phaseId,
            groupId: scopedGroupId,
            seasonId,
        });

        // 3. Fetch final matches for this phase
        const fetchMatchesWithEvents = async (): Promise<{ data: StandingMatchRow[] | null; error: QueryError }> => {
            let query = supabase
                .from('matches')
                .select('id, home_club_id, away_club_id, score, events, status, date_time, phase_id, group_id, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason')
                .eq('tournament_id', tournamentId)
                .eq('phase_id', phaseId)
                .in('status', [...FINAL_STANDINGS_STATUSES]);
            if (seasonId) query = query.eq('season_id', seasonId);
            const { data, error } = await query;
            return {
                data: data as StandingMatchRow[] | null,
                error,
            };
        };

        const fetchMatchesWithoutEvents = async (): Promise<{ data: StandingMatchRowWithoutEvents[] | null; error: QueryError }> => {
            let query = supabase
                .from('matches')
                .select('id, home_club_id, away_club_id, score, status, date_time, phase_id, group_id, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason')
                .eq('tournament_id', tournamentId)
                .eq('phase_id', phaseId)
                .in('status', [...FINAL_STANDINGS_STATUSES]);
            if (seasonId) query = query.eq('season_id', seasonId);
            const { data, error } = await query;
            return {
                data: data as StandingMatchRowWithoutEvents[] | null,
                error,
            };
        };

        const { data: matches, error: mError } = await queryMatchesWithOptionalEvents(
            fetchMatchesWithEvents,
            fetchMatchesWithoutEvents,
        );
        if (mError) throw mError;

        const scopedMatches = filterMatchesForParticipantScope(matches || [], participants || [], scopedGroupId);
        const carryOver = await resolveStandingsCarryOverRows({
            supabase,
            tournamentId,
            currentPhase: phase,
            tournamentRuleset: tournament?.ruleset,
            seasonId,
            tableType,
        });

        // 4. Compute standings
        const table = StandingsEngine.generateTable(
            participants || [],
            scopedMatches,
            resolvedRules,
            tableType,
            { carryOverRows: carryOver.rows },
        );

        // 5. Metrics
        const metrics = {
            counted_matches: scopedMatches.length,
            pending_results: 0,
            manual_overrides:
                scopedMatches.filter((match) => match.points_autocalculated === false).length +
                (resolvedRules.adjustments?.length || 0),
        };

        // Count non-final matches for this phase
        let pendingQuery = supabase
            .from('matches')
            .select('id, group_id, home_club_id, away_club_id, status')
            .eq('tournament_id', tournamentId)
            .eq('phase_id', phaseId)
            .in('status', ['scheduled', 'live', 'suspended', 'delayed', 'postponed']);
        if (seasonId) pendingQuery = pendingQuery.eq('season_id', seasonId);
        const { data: pendingMatches, error: pendingError } = await pendingQuery;
        if (pendingError) throw pendingError;
        metrics.pending_results = filterMatchesForParticipantScope(
            pendingMatches || [],
            participants || [],
            scopedGroupId,
        ).length;

        /**
         * 6. Lo que quedó PUBLICADO para este scope.
         *
         * Este viaje ya se hacía para sacar la fecha del último cálculo; ahora
         * trae además `club_id`, `position` y `points` —el mismo query, un
         * puñado de filas más— y con eso se puede decir algo que hasta ahora no
         * se decía en ningún lado: si la tabla guardada dice lo mismo que la que
         * el operador tiene delante.
         *
         * Importa porque la tabla que se muestra se calcula en vivo y casi
         * siempre está bien; la que puede estar mal es la guardada, que es la
         * que lee el hincha.
         */
        let lastCalculatedAt: string | null = null;
        let publishedDrift: ReturnType<typeof comparePublishedVsLive> = { state: 'al_dia', diffs: [] };
        {
            let cQuery = supabase
                .from('tournament_standings')
                .select('club_id, position, points, last_updated')
                .eq('tournament_id', tournamentId)
                .eq('phase_id', phaseId)
                .order('last_updated', { ascending: false });

            if (seasonId) {
                cQuery = cQuery.eq('season_id', seasonId);
            }

            if (scopedGroupId) {
                cQuery = cQuery.eq('group_id', scopedGroupId);
            } else {
                cQuery = (cQuery as typeof cQuery & { is: (column: string, value: null) => typeof cQuery }).is('group_id', null);
            }

            // "Último cálculo" de ESTA perspectiva. Sin filtrar, recalcular la
            // general le refrescaría la fecha a la tabla de local sin haberla
            // tocado.
            cQuery = applyStandingsTableType(
                cQuery,
                await supportsStandingsTableTypeColumn(),
                tableType,
            );

            const { data: cached } = await cQuery;
            lastCalculatedAt = cached?.[0]?.last_updated ?? null;
            publishedDrift = comparePublishedVsLive(cached ?? [], table);
        }

        return NextResponse.json({
            ok: true,
            table,
            metrics,
            rules: resolvedRules,
            carry_over: {
                enabled: carryOver.enabled,
                source_phase_id: carryOver.sourcePhaseId,
                source_phase_name: carryOver.sourcePhaseName,
                rows: carryOver.rows.length,
            },
            last_calculated_at: lastCalculatedAt,
            published_drift: {
                state: publishedDrift.state,
                count: publishedDrift.diffs.length,
                teams: describeDrift(publishedDrift.diffs),
            },
        });
    } catch (e: unknown) {
        console.error('Exception generating standings:', e);
        return tournamentApiErrorResponse(e);
    }
}
