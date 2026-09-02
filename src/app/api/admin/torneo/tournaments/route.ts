import { NextRequest, NextResponse } from 'next/server';
import { normalizeAmericanFootballRuleset } from '@/lib/americanFootballRules';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServiceWriter } from '@/lib/supabase/serviceWriter';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';
import { resolveTournamentAdminScope } from '@/lib/auth/tournamentAdminScope';
import { isMissingColumnError, isMissingTableError } from '@/lib/utils/supabaseSchema';
import { invalidatePublicTournamentListCaches } from '@/lib/server/externalTournamentCacheInvalidation';
import { normalizeTournamentFormat } from '@/lib/utils/tournamentFormat';
import {
    buildPlayoffStages,
    ensurePlayoffBracketMatches,
    getPlayoffTeamsCount,
    isPlayoffPhaseType,
    resolvePlayoffStagesForTeams,
    syncPlayoffStagesToRounds,
} from '@/lib/server/playoffStages';
import { recalculatePhaseStandingsScopes } from '@/lib/server/recalculateStandings';

type JsonObject = Record<string, unknown>;
type ClubLookup = { id: string; name: string; short_name?: string | null };

const OPTIONAL_TOURNAMENT_COLUMNS = [
    'age_grade',
    'banner_url',
    'category',
    'country',
    'country_id',
    'created_by_user_id',
    'display_name',
    'format',
    'is_popular',
    'is_visible',
    'logo_url',
    'primary_color',
    'priority',
    'region',
    'ruleset',
    'season_id',
    'secondary_color',
    'slug',
    'sport_id',
    'status',
    'union_id',
];

function err(message: string, status = 400, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function slugify(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function readText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function readNullableText(value: unknown): string | null {
    const text = readText(value);
    return text.length > 0 ? text : null;
}

function readPositiveInt(value: unknown, fallback: number): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readNumber(value: unknown, fallback: number): number {
    const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(value: unknown, fallback = false): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'si'].includes(normalized)) return true;
        if (['false', '0', 'no'].includes(normalized)) return false;
    }
    return fallback;
}

function readStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map((item) => readText(item)).filter(Boolean)));
}

function isPublicTournamentStatus(status: string): boolean {
    const normalizedStatus = status.trim().toLowerCase();
    return normalizedStatus === 'published' || normalizedStatus === 'active';
}

/**
 * `groups` cuenta como fase de grupos. El creador manda el formato canonico
 * (`normalizeTournamentFormat`: `groups`, no `groups_playoff`), y este switch
 * solo conocia los alias viejos: un torneo "Grupos + Playoff" caia al `return
 * 'league'` y nacia con una unica fase de liga llamada "Tabla general".
 */
function getPhaseTypeFromFormat(format: string): 'league' | 'group_stage' | 'playoff' {
    if (format === 'groups' || format === 'group_stage' || format === 'groups_playoff') return 'group_stage';
    if (format === 'playoff' || format === 'knockout') return 'playoff';
    return 'league';
}

function isGroupsPlayoffFormat(format: string): boolean {
    return format === 'groups' || format === 'groups_playoff';
}

function getGroupNames(groupCount: number): string[] {
    return Array.from({ length: Math.max(1, groupCount) }, (_, index) => (
        `Zona ${String.fromCharCode(65 + index)}`
    ));
}

function buildRuleset(body: JsonObject, sport: string) {
    const rules = body.ruleset && typeof body.ruleset === 'object' && !Array.isArray(body.ruleset)
        ? body.ruleset as JsonObject
        : {};

    const defaultWin = sport === 'rugby' ? 4 : sport === 'basketball' ? 2 : 3;
    const defaultDraw = sport === 'rugby' ? 2 : sport === 'basketball' ? 0 : 1;
    const defaultLoss = sport === 'basketball' ? 1 : 0;

    const pointsWin = readNumber(body.points_win ?? rules.pointsWin, defaultWin);
    const pointsDraw = readNumber(body.points_draw ?? rules.pointsDraw, defaultDraw);
    const pointsLoss = readNumber(body.points_loss ?? rules.pointsLoss, defaultLoss);
    const pointsBonusTry = readNumber(body.points_bonus_try ?? rules.pointsBonusTry, sport === 'rugby' ? 1 : 0);
    const pointsBonusLoss = readNumber(body.points_bonus_loss ?? rules.pointsBonusLoss, sport === 'rugby' ? 1 : 0);

    // Keep the legacy flat keys (read as a fallback by the standings engine) and
    // ALSO expose the canonical `points` / `pointsSystem` / `bonus` shape that the
    // gestor (TournamentStructureTab) and the standings-rules editor consume, so
    // whatever is specified here round-trips to the manager instead of resetting
    // to sport defaults the first time a phase is opened there.
    // `competition` viaja tal cual si el cliente lo manda. Antes se caia aca:
    // esta funcion arma un objeto explicito y descartaba cualquier clave que no
    // enumerara, asi que un torneo de circuito perdia `format_type` y
    // `champion_mode` y `isCircuitRuleset()` dejaba de reconocerlo.
    const competition = rules.competition && typeof rules.competition === 'object' && !Array.isArray(rules.competition)
        ? rules.competition
        : null;
    const americanFootball = sport === 'american-football'
        ? normalizeAmericanFootballRuleset(rules.americanFootball)
        : null;

    return {
        pointsWin,
        pointsDraw,
        pointsLoss,
        pointsBonusTry,
        pointsBonusLoss,
        fixtureMode: readText(body.fixture_mode ?? rules.fixtureMode) || 'manual',
        ...buildPointsSettings(pointsWin, pointsDraw, pointsLoss, pointsBonusTry, pointsBonusLoss),
        ...(competition ? { competition } : {}),
        // El reglamento de futbol americano (tackle/flag, cuartos, patadas,
        // plantel) viaja si el deporte lo tiene. Se normaliza aca para que lo
        // guardado sea siempre un reglamento completo, venga de donde venga.
        ...(americanFootball ? { americanFootball } : {}),
    };
}

/**
 * Canonical phase/standings points shape shared by the gestor's phase editor,
 * the standings-rules editor and the standings engine. Mirrors the object
 * TournamentStructureTab writes so a tournament created here opens with the
 * exact rules that were specified, not with default values.
 */
function buildPointsSettings(
    pointsWin: number,
    pointsDraw: number,
    pointsLoss: number,
    pointsBonusTry: number,
    pointsBonusLoss: number,
) {
    const allowBonusPoints = pointsBonusTry > 0 || pointsBonusLoss > 0;
    return {
        points: { win: pointsWin, draw: pointsDraw, loss: pointsLoss },
        pointsSystem: {
            win: pointsWin,
            draw: pointsDraw,
            loss: pointsLoss,
            allowBonusPoints,
            extraTimeAlternativeSystem: false,
            bonusTry: pointsBonusTry,
            bonusLoss: pointsBonusLoss,
            behavior: {
                whenToCalculate: 'on_match_finalized',
                input: { requires: ['score'], statusRequired: 'finalized' },
                output: { writesTo: ['standings'] },
                basePointsLogic: [
                    { if: { win: true }, then: { add: pointsWin } },
                    { if: { draw: true }, then: { add: pointsDraw } },
                    { if: { loss: true }, then: { add: pointsLoss } },
                ],
                idempotency: { key: 'match_id', rule: 'ignore_if_already_processed' },
            },
        },
        bonus: {
            offensive: pointsBonusTry > 0 ? { tries: 4, points: pointsBonusTry } : null,
            defensive: pointsBonusLoss > 0 ? { margin: 7, points: pointsBonusLoss } : null,
        },
    };
}

async function insertTournamentWithFallback(writer: any, payload: JsonObject) {
    let result = await writer.from('tournaments').insert([payload]).select('*').single();

    if (!result.error) return result;

    const missingColumns = OPTIONAL_TOURNAMENT_COLUMNS.filter((column) => isMissingColumnError(result.error, column));
    if (missingColumns.length === 0) return result;

    const reducedPayload = { ...payload };
    for (const column of missingColumns) {
        delete reducedPayload[column];
    }

    console.warn('[admin/torneo/tournaments] Retrying tournament insert without optional columns:', missingColumns);
    result = await writer.from('tournaments').insert([reducedPayload]).select('*').single();
    return result;
}

async function ensureCountry(writer: any, countryId: string | null, countryName: string | null) {
    if (!countryId) return;

    const { error } = await writer
        .from('countries')
        .upsert({ id: countryId, name: countryName || countryId }, { onConflict: 'id' });

    if (error && !isMissingTableError(error, 'countries')) {
        console.warn('[admin/torneo/tournaments] country upsert warning:', error.message);
    }
}

async function createSeason(writer: any, params: {
    tournamentId: string;
    tournamentName: string;
    displayName: string;
    seasonCode: string;
    format: string;
    ruleset: JsonObject;
    status: string;
    userId: string;
}) {
    const seasonPayload = {
        tournament_id: params.tournamentId,
        legacy_tournament_id: params.tournamentId,
        season_code: params.seasonCode,
        name: `${params.displayName} ${params.seasonCode}`.trim(),
        display_name: `${params.displayName} ${params.seasonCode}`.trim(),
        slug: slugify(`${params.tournamentName}-${params.seasonCode}`),
        status: params.status === 'published' || params.status === 'active' ? 'active' : 'draft',
        is_active: true,
        format: params.format,
        ruleset: params.ruleset,
        settings: { source: 'admin_torneo_creator' },
        created_by_user_id: params.userId,
    };

    const { data, error } = await writer
        .from('tournament_seasons')
        .insert([seasonPayload])
        .select('id')
        .single();

    if (error) {
        if (!isMissingTableError(error, 'tournament_seasons')) {
            console.warn('[admin/torneo/tournaments] season warning:', error.message);
        }
        return { seasonId: null, warning: 'No se pudo crear la edicion/temporada del torneo.' };
    }

    const { error: updateError } = await writer
        .from('tournaments')
        .update({ current_season_id: data.id })
        .eq('id', params.tournamentId);

    if (updateError && !isMissingColumnError(updateError, 'current_season_id')) {
        console.warn('[admin/torneo/tournaments] current season warning:', updateError.message);
    }

    return { seasonId: data.id as string, warning: null };
}

/**
 * Un participante de torneo son TRES tablas, no una:
 * `tournament_participants` (el vinculo), `team_season_entries` + el back-ref
 * `season_entry_id` (la PAGINA del torneo lista por la entrada de temporada
 * cuando el torneo tiene temporada) y `tournament_phase_participants` (la tabla
 * de posiciones sale de ahi; la escribe `createPhases`). Este alta creaba solo
 * la primera: el torneo se veia bien en el gestor y la pantalla publica lo
 * mostraba vacio.
 *
 * La FK entre participante y entrada es circular, asi que va en tres pasos:
 * participante sin entry → entrada apuntando al participante → UPDATE del
 * back-ref.
 */
async function createParticipants(writer: any, params: {
    tournamentId: string;
    seasonId: string | null;
    clubIds: string[];
    category: string | null;
    divisionByClub: Record<string, string>;
}) {
    const warnings: string[] = [];
    if (params.clubIds.length === 0) return { participants: [], warnings };

    const { data: clubs, error: clubsError } = await writer
        .from('clubs')
        .select('id, name, short_name')
        .in('id', params.clubIds);

    if (clubsError) {
        return { participants: [], warnings: ['No se pudieron cargar los clubes seleccionados.'] };
    }

    // El plantel elegido se valida contra `club_divisions`: solo entra si la
    // division existe y pertenece a ese club. Un id ajeno se descarta en
    // silencio antes que inscribir el plantel de otro club.
    const requestedDivisionIds = Array.from(new Set(
        params.clubIds.map((clubId) => params.divisionByClub[clubId]).filter(Boolean),
    ));
    const divisionOwner = new Map<string, string>();
    if (requestedDivisionIds.length > 0) {
        const { data: divisionRows, error: divisionError } = await writer
            .from('club_divisions')
            .select('id, club_id')
            .in('id', requestedDivisionIds);

        if (divisionError) {
            if (!isMissingTableError(divisionError, 'club_divisions')) {
                warnings.push('No se pudieron validar los planteles elegidos; los clubes quedaron inscriptos sin plantel.');
            }
        } else {
            for (const row of divisionRows ?? []) {
                divisionOwner.set(row.id, row.club_id);
            }
        }
    }

    const clubById = new Map<string, ClubLookup>(
        (clubs ?? []).map((club: ClubLookup) => [club.id, club]),
    );
    const rows = params.clubIds
        .map((clubId, index) => {
            const club = clubById.get(clubId);
            if (!club) return null;

            const requestedDivision = params.divisionByClub[clubId];
            const divisionId = requestedDivision && divisionOwner.get(requestedDivision) === clubId
                ? requestedDivision
                : null;

            // PostgREST exige claves uniformes en el insert masivo: la columna
            // va en TODAS las filas (con null) o en ninguna.
            return {
                tournament_id: params.tournamentId,
                season_id: params.seasonId,
                division_id: divisionId,
                club_id: clubId,
                name: club.name,
                short_code: club.short_name ?? null,
                type: 'club',
                status: 'active',
                seed: index + 1,
                notes: params.category ? `Categoria: ${params.category}` : null,
            };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

    if (rows.length === 0) {
        return { participants: [], warnings: ['Los clubes seleccionados no estan disponibles.'] };
    }

    // `season_id` y `division_id` son opcionales en el esquema real: si la base
    // no tiene la columna, se saca de todas las filas y se reintenta.
    const optionalColumns = ['season_id', 'division_id'];
    let insertRows = rows;
    let result = await writer
        .from('tournament_participants')
        .insert(insertRows)
        .select('id, tournament_id, club_id, name, status, seed');

    for (let attempt = 0; attempt < optionalColumns.length && result.error; attempt += 1) {
        const missing = optionalColumns.filter((column) => isMissingColumnError(result.error, column));
        if (missing.length === 0) break;

        insertRows = insertRows.map((row) => {
            const rest = { ...row };
            for (const column of missing) delete rest[column];
            return rest;
        });
        result = await writer
            .from('tournament_participants')
            .insert(insertRows)
            .select('id, tournament_id, club_id, name, status, seed');
    }

    if (result.error) {
        warnings.push('El torneo fue creado, pero no se pudieron inscribir los clubes.');
        return { participants: [], warnings };
    }

    const participants = result.data ?? [];

    // team_season_entries + back-ref. Solo tiene sentido con temporada: sin
    // `season_id` la pagina lista directo por participante (patron URBA).
    if (params.seasonId && participants.length > 0) {
        const entries = participants
            .filter((participant: { club_id: string | null }) => Boolean(participant.club_id))
            .map((participant: { id: string; club_id: string; seed?: number | null }) => ({
                id: crypto.randomUUID(),
                season_id: params.seasonId,
                tournament_id: params.tournamentId,
                club_id: participant.club_id,
                source_participant_id: participant.id,
                status: 'active',
                seed: participant.seed ?? null,
                settings: { source: 'admin_torneo_creator' },
            }));

        const { error: entriesError } = await writer
            .from('team_season_entries')
            .insert(entries);

        if (entriesError) {
            if (!isMissingTableError(entriesError, 'team_season_entries')) {
                warnings.push('Los clubes quedaron inscriptos, pero sin entrada de temporada: la pagina del torneo puede no listarlos.');
                console.warn('[admin/torneo/tournaments] team_season_entries warning:', entriesError.message);
            }
        } else {
            for (const entry of entries) {
                const { error: backRefError } = await writer
                    .from('tournament_participants')
                    .update({ season_entry_id: entry.id })
                    .eq('id', entry.source_participant_id);

                if (backRefError) {
                    if (!isMissingColumnError(backRefError, 'season_entry_id')) {
                        warnings.push('No se pudo vincular a los participantes con su entrada de temporada.');
                        console.warn('[admin/torneo/tournaments] season_entry_id warning:', backRefError.message);
                    }
                    break;
                }
            }
        }
    }

    return { participants, warnings };
}

async function createPhases(writer: any, params: {
    tournamentId: string;
    seasonId: string | null;
    format: string;
    teamCount: number;
    groupCount: number;
    qualifiersPerGroup: number;
    leagueRounds: number;
    ruleset: JsonObject;
    participantRows: Array<{ id: string; club_id: string | null; seed?: number | null }>;
    /** Configuracion del creador rapido/avanzado (quickCreator, desempates,
     *  etiquetas de tabla). Se funde en la PRIMERA fase para que editar el
     *  torneo restaure lo que se configuro al crearlo. */
    settingsExtra: JsonObject | null;
}) {
    const warnings: string[] = [];
    const phases: any[] = [];
    const ruleset = params.ruleset as JsonObject;
    const baseSettings = {
        source: 'admin_torneo_creator',
        teamsCount: params.teamCount,
        // Canonical shape consumed by the gestor's phase editor + standings engine.
        points: ruleset.points,
        pointsSystem: ruleset.pointsSystem,
        bonus: ruleset.bonus,
        selectedTeamIds: params.participantRows.map((row) => row.club_id).filter(Boolean),
    };

    const phasePlans = isGroupsPlayoffFormat(params.format)
        ? [
            {
                name: 'Fase de grupos',
                phase_type: 'group_stage',
                order_index: 0,
                settings: {
                    ...baseSettings,
                    group_names: getGroupNames(params.groupCount),
                    advanceCount: params.qualifiersPerGroup,
                    phaseMode: 'groups',
                },
            },
            {
                name: 'Playoffs',
                phase_type: 'playoff',
                order_index: 1,
                settings: {
                    ...baseSettings,
                    teamsCount: Math.max(2, params.groupCount * params.qualifiersPerGroup),
                    playoffThirdPlace: false,
                    phaseMode: 'playoff',
                },
            },
        ]
        : [
            {
                name: getPhaseTypeFromFormat(params.format) === 'league'
                    ? 'Tabla general'
                    : getPhaseTypeFromFormat(params.format) === 'playoff'
                        ? 'Playoffs'
                        : 'Fase de grupos',
                phase_type: getPhaseTypeFromFormat(params.format),
                order_index: 0,
                settings: {
                    ...baseSettings,
                    group_names: getPhaseTypeFromFormat(params.format) === 'group_stage'
                        ? getGroupNames(params.groupCount)
                        : [],
                    advanceCount: params.qualifiersPerGroup,
                    legs: params.leagueRounds,
                    phaseMode: params.format,
                },
            },
        ];

    for (const plan of phasePlans) {
        // Una fase playoff sin sus etapas ni su cuadro es un cascaron: el
        // gestor la abre vacia y no hay llaves que completar. Se calculan aca
        // y se materializan (rondas + partidos placeholder) tras el insert,
        // igual que hace POST /api/tournaments/[id]/phases.
        const planSettings: JsonObject = {
            ...plan.settings,
            ...(plan.order_index === 0 && params.settingsExtra ? params.settingsExtra : {}),
        };

        const playoffStages = isPlayoffPhaseType(plan.phase_type)
            ? resolvePlayoffStagesForTeams(planSettings, getPlayoffTeamsCount(planSettings))
            : [];
        const playoffStageMatchCounts = playoffStages.map((stage) => stage.matchCount);

        if (isPlayoffPhaseType(plan.phase_type)) {
            planSettings.playoffStages = buildPlayoffStages(playoffStages);
            planSettings.playoff_stage_names = playoffStages.map((stage) => stage.name);
            planSettings.playoffStageMatchCounts = playoffStageMatchCounts;
            planSettings.playoff_match_counts = playoffStageMatchCounts;
        }

        const phasePayload = {
            tournament_id: params.tournamentId,
            season_id: params.seasonId,
            name: plan.name,
            phase_type: plan.phase_type,
            order_index: plan.order_index,
            is_active: plan.order_index === 0,
            settings: planSettings,
        };

        let phaseResult = await writer
            .from('tournament_phases')
            .insert([phasePayload])
            .select('id, name, phase_type')
            .single();

        if (phaseResult.error && isMissingColumnError(phaseResult.error, 'season_id')) {
            const fallbackPayload = { ...phasePayload };
            delete (fallbackPayload as Partial<typeof phasePayload>).season_id;
            phaseResult = await writer
                .from('tournament_phases')
                .insert([fallbackPayload])
                .select('id, name, phase_type')
                .single();
        }

        if (phaseResult.error) {
            if (!isMissingTableError(phaseResult.error, 'tournament_phases')) {
                warnings.push(`No se pudo crear la fase ${plan.name}.`);
            }
            continue;
        }

        const phase = phaseResult.data;
        phases.push(phase);

        if (isPlayoffPhaseType(plan.phase_type) && playoffStages.length > 0) {
            const syncResult = await syncPlayoffStagesToRounds(writer, phase.id, params.seasonId, playoffStages);
            if (!syncResult.ok) {
                warnings.push(`La fase ${plan.name} se creo, pero no se pudieron crear sus etapas playoff.`);
            } else {
                const bracketResult = await ensurePlayoffBracketMatches(writer, {
                    tournamentId: params.tournamentId,
                    phaseId: phase.id,
                    seasonId: params.seasonId,
                    teamsCount: getPlayoffTeamsCount(planSettings),
                    stageMatchCounts: playoffStageMatchCounts,
                });
                if (!bracketResult.ok) {
                    warnings.push(`La fase ${plan.name} se creo, pero no se pudo armar el cuadro playoff.`);
                }
            }
        }

        let groups: any[] = [];
        if (plan.phase_type === 'group_stage') {
            const groupNames = Array.isArray((planSettings as { group_names?: unknown }).group_names)
                ? (planSettings as { group_names: string[] }).group_names
                : [];
            const groupRows = groupNames.map((name, index) => ({
                phase_id: phase.id,
                season_id: params.seasonId,
                name,
                order_index: index,
            }));

            if (groupRows.length > 0) {
                let groupResult = await writer
                    .from('tournament_groups')
                    .insert(groupRows)
                    .select('id, phase_id, name, order_index');

                if (groupResult.error && isMissingColumnError(groupResult.error, 'season_id')) {
                    const fallbackRows = groupRows.map((row) => {
                        const rest = { ...row };
                        delete (rest as Partial<typeof row>).season_id;
                        return rest;
                    });
                    groupResult = await writer
                        .from('tournament_groups')
                        .insert(fallbackRows)
                        .select('id, phase_id, name, order_index');
                }

                if (!groupResult.error) {
                    groups = groupResult.data ?? [];
                }
            }
        }

        if (params.participantRows.length > 0) {
            const phaseParticipantRows = params.participantRows.map((participant, index) => ({
                tournament_id: params.tournamentId,
                season_id: params.seasonId,
                phase_id: phase.id,
                participant_id: participant.id,
                group_id: groups.length > 0 ? groups[index % groups.length].id : null,
                status: 'active',
                seed: participant.seed ?? index + 1,
            }));

            let phaseParticipantResult = await writer
                .from('tournament_phase_participants')
                .insert(phaseParticipantRows);

            if (phaseParticipantResult.error && isMissingColumnError(phaseParticipantResult.error, 'season_id')) {
                const fallbackRows = phaseParticipantRows.map((row) => {
                    const rest = { ...row };
                    delete (rest as Partial<typeof row>).season_id;
                    return rest;
                });
                phaseParticipantResult = await writer
                    .from('tournament_phase_participants')
                    .insert(fallbackRows);
            }

            if (
                phaseParticipantResult.error &&
                !isMissingTableError(phaseParticipantResult.error, 'tournament_phase_participants')
            ) {
                warnings.push(`La fase ${plan.name} fue creada, pero no se pudo asignar su roster.`);
            }
        }
    }

    // Siembra la tabla de posiciones de cada fase. `tournament_standings` es
    // persistida — nadie la rehace sola: sin este paso el torneo nuevo muestra
    // la tabla vacia hasta que alguien la recalcule a mano desde el gestor.
    // No es fatal: la fase ya existe y el gestor puede recalcular.
    for (const phase of phases) {
        try {
            const recalcResult = await recalculatePhaseStandingsScopes(params.tournamentId, phase.id);
            if (!recalcResult.ok) {
                console.warn('[admin/torneo/tournaments] standings seed warning for phase', phase.id);
            }
        } catch (recalcError) {
            console.warn('[admin/torneo/tournaments] standings seed error:', recalcError);
        }
    }

    return { phases, warnings };
}

const FULL_COLUMNS = 'id, name, display_name, slug, sport_id, season_id, country, country_id, region, category, age_grade, format, status, is_visible, is_popular, union_id, logo_url, primary_color, secondary_color, ruleset, created_at, created_by_user_id';
const BASIC_COLUMNS = 'id, name, display_name, slug, sport_id, season_id, status, is_visible, created_at';
/** Tope de PostgREST por respuesta (db-max-rows). */
const PAGE_SIZE = 1000;
/** Techo de seguridad para `limit=all`: hoy la tabla tiene ~1100 filas. */
const ALL_ROWS_CEILING = 20000;

export async function GET(request: NextRequest) {
    const supabase = await createClient();

    let context;
    try {
        context = await requireTournamentAdminContext(supabase);
    } catch {
        return err('Unauthorized', 401);
    }

    const scope = await resolveTournamentAdminScope(supabase, context);

    if (!scope.isUnlimited && scope.tournamentIds.size === 0) {
        return NextResponse.json({ data: [] });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim();
    const status = (searchParams.get('status') || '').trim();
    const limitParam = (searchParams.get('limit') || '').trim();
    // `limit=all` devuelve la tabla entera. Los diálogos que asignan torneos a
    // un usuario buscan en memoria sobre lo que reciben: si acá se corta, un
    // torneo viejo es imposible de encontrar por más que se escriba su nombre.
    const limit = limitParam === 'all'
        ? ALL_ROWS_CEILING
        : Math.min(Number.parseInt(limitParam || '300', 10) || 300, ALL_ROWS_CEILING);
    // `fields=basic` deja afuera escudo y reglamento: la lista completa pesa
    // 1,2 MB con todo y 200 KB con lo que necesita un selector.
    const columns = searchParams.get('fields') === 'basic' ? BASIC_COLUMNS : FULL_COLUMNS;

    // Service-role read: results are already constrained to scope.tournamentIds
    // below, but the RLS SELECT policy would hide the caller's own drafts.
    const reader = getServiceWriter(supabase, 'admin/torneo/tournaments');
    const escapedSearch = search.replace(/[%_]/g, (m) => `\\${m}`);

    // PostgREST corta cada respuesta en 1000 filas (db-max-rows) sin importar
    // el limit que se pida, así que se trae por tandas con range() hasta que
    // una vuelva incompleta. El orden desempata por id para que dos tandas no
    // se pisen cuando varios torneos comparten created_at.
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; from < limit; from += PAGE_SIZE) {
        const to = Math.min(from + PAGE_SIZE, limit) - 1;
        let query = reader
            .from('tournaments')
            .select(columns)
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(from, to);

        if (!scope.isUnlimited) {
            query = query.in('id', Array.from(scope.tournamentIds));
        }

        if (search) {
            query = query.or(`name.ilike.%${escapedSearch}%,display_name.ilike.%${escapedSearch}%,slug.ilike.%${escapedSearch}%`);
        }

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;
        if (error) {
            return err('No se pudieron cargar los torneos', 500, error.message);
        }
        const batch = (data ?? []) as Record<string, unknown>[];
        rows.push(...batch);
        if (batch.length < to - from + 1) break;
    }

    return NextResponse.json({ data: rows });
}

export async function POST(request: NextRequest) {
    const supabase = await createClient();

    let context;
    try {
        context = await requireTournamentAdminContext(supabase);
    } catch {
        return err('Unauthorized', 401);
    }

    let body: JsonObject;
    try {
        body = (await request.json()) as JsonObject;
    } catch {
        return err('Payload JSON invalido', 400);
    }

    const name = readText(body.name);
    const displayName = readText(body.display_name) || name;
    const sport = readText(body.sport_id ?? body.sport) || 'rugby';
    const season = readText(body.season_id ?? body.season) || String(new Date().getFullYear());
    const country = readNullableText(body.country);
    const countryId = readNullableText(body.country_id);
    const region = readNullableText(body.region);
    const unionId = readNullableText(body.union_id);
    const category = readNullableText(body.category);
    const ageGrade = readNullableText(body.age_grade);
    const format = readText(body.format) || 'league';
    const logoUrl = readNullableText(body.logo_url);
    const primaryColor = readNullableText(body.primary_color);
    const secondaryColor = readNullableText(body.secondary_color);
    const status = readText(body.status) || 'draft';
    const explicitVisible = typeof body.is_visible === 'boolean' ? body.is_visible : null;
    const isVisible = explicitVisible ?? isPublicTournamentStatus(status);
    const isPopular = readBoolean(body.is_popular, false);
    const ruleset = buildRuleset(body, sport);
    const participantClubIds = readStringList(body.participant_club_ids);
    // Plantel a inscribir por club: { [clubId]: divisionId }. Opcional.
    const participantDivisions: Record<string, string> = {};
    if (body.participant_divisions && typeof body.participant_divisions === 'object' && !Array.isArray(body.participant_divisions)) {
        for (const [clubId, divisionId] of Object.entries(body.participant_divisions as JsonObject)) {
            const cleanClubId = readText(clubId);
            const cleanDivisionId = readText(divisionId);
            if (cleanClubId && cleanDivisionId) participantDivisions[cleanClubId] = cleanDivisionId;
        }
    }
    const phaseSettingsExtra = body.phase_settings_extra
        && typeof body.phase_settings_extra === 'object'
        && !Array.isArray(body.phase_settings_extra)
        ? body.phase_settings_extra as JsonObject
        : null;
    const teamCount = readPositiveInt(body.team_count, Math.max(participantClubIds.length, 2));
    const groupCount = readPositiveInt(body.group_count, Math.max(2, Math.ceil(teamCount / 4)));
    const qualifiersPerGroup = readPositiveInt(body.qualifiers_per_group, 2);
    const leagueRounds = readPositiveInt(body.league_rounds, 1);

    if (name.length < 3) {
        return err('El nombre del torneo debe tener al menos 3 caracteres', 400);
    }

    const scope = await resolveTournamentAdminScope(supabase, context);
    if (!scope.isUnlimited && participantClubIds.some((clubId) => !scope.clubIds.has(clubId))) {
        return err('Hay clubes seleccionados fuera de tu alcance.', 403);
    }

    const writer = getServiceWriter(supabase, 'admin/torneo/tournaments') as any;
    await ensureCountry(writer, countryId, country);

    const requestedSlug = readText(body.slug);
    const slug = slugify(requestedSlug || `${name}-${season}`);

    const payload: JsonObject = {
        name,
        display_name: displayName,
        slug,
        sport_id: sport,
        season_id: season,
        country,
        country_id: countryId,
        region,
        union_id: unionId,
        category,
        age_grade: ageGrade,
        format,
        logo_url: logoUrl,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        status,
        is_visible: isVisible,
        is_popular: isPopular,
        ruleset,
        created_by_user_id: context.userId,
    };

    for (const [key, value] of Object.entries(payload)) {
        if (value === null || value === undefined || value === '') {
            delete payload[key];
        }
    }

    const { data, error } = await insertTournamentWithFallback(writer, payload);

    if (error) {
        if (error.code === '23505') {
            return err('Ya existe un torneo con ese nombre y temporada', 409, { slug });
        }
        return err('No se pudo crear el torneo', 500, error.message);
    }

    const warnings: string[] = [];

    // El creador queda dueno del torneo: ya guardamos created_by_user_id (que
    // resolveTournamentAdminScope usa para mostrarlo en el panel) y ademas
    // concedemos una membership admin explicita. Se intenta con admin client
    // (service role) para que RLS nunca la bloquee, con un reintento.
    const membershipRow = {
        user_id: context.userId,
        scope_type: 'tournament',
        scope_id: data.id,
        role: 'admin',
    };

    const grantMembership = async (client: any) =>
        client.from('memberships').insert([membershipRow]);

    let membershipResult = await grantMembership(writer);

    if (membershipResult.error && membershipResult.error.code !== '23505') {
        let adminClient: any = null;
        try {
            adminClient = createAdminClient();
        } catch {
            adminClient = null;
        }
        membershipResult = await grantMembership(adminClient ?? writer);
    }

    if (membershipResult.error && membershipResult.error.code !== '23505') {
        // El torneo sigue siendo visible/propio por created_by_user_id, asi que
        // no hacemos rollback; solo avisamos.
        warnings.push('El torneo fue creado y es tuyo, pero no se pudo registrar la membership explicita.');
        console.warn('[admin/torneo/tournaments] Could not grant membership for creator:', membershipResult.error.message);
    }

    const createSeasonFlag = body.create_season !== false;
    let seasonId: string | null = null;
    if (createSeasonFlag) {
        const seasonResult = await createSeason(writer, {
            tournamentId: data.id,
            tournamentName: name,
            displayName,
            seasonCode: season,
            format,
            ruleset,
            status,
            userId: context.userId,
        });
        seasonId = seasonResult.seasonId;
        if (seasonResult.warning) warnings.push(seasonResult.warning);
    }

    const participantResult = await createParticipants(writer, {
        tournamentId: data.id,
        seasonId,
        clubIds: participantClubIds,
        category,
        divisionByClub: participantDivisions,
    });
    warnings.push(...participantResult.warnings);

    if (body.create_phase !== false) {
        const phaseResult = await createPhases(writer, {
            tournamentId: data.id,
            seasonId,
            format: normalizeTournamentFormat(format),
            teamCount,
            groupCount,
            qualifiersPerGroup,
            leagueRounds,
            ruleset,
            participantRows: participantResult.participants,
            settingsExtra: phaseSettingsExtra,
        });
        warnings.push(...phaseResult.warnings);
    }

    // Un torneo recien creado aparece en el listado publico en el proximo
    // pedido, no cuando vence el TTL.
    invalidatePublicTournamentListCaches();

    return NextResponse.json({
        data: {
            ...data,
            current_season_id: seasonId,
            participants_count: participantResult.participants.length,
        },
        warnings,
    }, { status: 201 });
}
