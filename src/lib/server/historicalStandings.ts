import { getReadClient } from '@/lib/supabase/read';
import { StandingsEngine } from '@/lib/services/standingsEngine';
import { applyStandingsTableType, supportsStandingsTableTypeColumn } from '@/lib/standings/tableTypeSupport';
import { readPhaseCarryOverConfig } from '@/lib/server/standingsCarryOver';
import { resolveSerializableLogoUrl } from '@/lib/utils/logoUrl';
import { resolveTournamentSeasonFamily } from '@/lib/server/tournamentSeasonFamily';
import {
    buildHistoricalTable,
    withoutCarriedOver,
    type SeasonTable,
    type SeasonTableRow,
} from '@/lib/standings/historicalTable';

/**
 * La tabla histórica de un torneo, armada en el servidor.
 *
 * Cada temporada aporta la MISMA tabla que muestra su página
 * (buildStandingsSnapshot en TournamentDetailClient):
 *   · fase manual con tabla cargada → la oficial, tal cual;
 *   · fase manual sin tabla (lo importado de rugbyarchive que trajo solo los
 *     partidos) o automática → la cuenta del motor con los partidos jugados.
 * Si la histórica usara otra fuente que la página, el club que suma 60 puntos
 * en la tabla de 2019 sumaría otra cosa en la histórica.
 *
 * Solo fases no eliminatorias. Una fase que arrastra puntos aporta lo suyo,
 * no lo arrastrado (withoutCarriedOver).
 */

type ReadClient = Awaited<ReturnType<typeof getReadClient>>;

export type HistoricalStandingsRow = SeasonTableRow & {
    position: number;
    seasons: number;
    club: { id: string; name: string; logo: string | null };
};

export type HistoricalStandingsResult = {
    tournamentId: string;
    /** Temporadas de la familia que aportaron al menos una fila. */
    seasonsCounted: number;
    /** Temporadas de la familia (las del selector). */
    seasonsTotal: number;
    firstSeason: string | null;
    lastSeason: string | null;
    /** Las temporadas que sumaron, por el mismo id que usa el selector. */
    seasonKeys: string[];
    rows: HistoricalStandingsRow[];
};

type SeasonUnit = { key: string; label: string; tournamentId: string; seasonId: string | null };

type PhaseRow = {
    id: string;
    tournament_id: string;
    season_id: string | null;
    phase_type: string | null;
    order_index: number | null;
    settings: any;
};

const PAGE = 1000;
const IN_CHUNK = 60;
const FINAL_STATUSES = ['final', 'finished', 'ft'];

function isKnockoutPhaseType(phaseType: unknown) {
    const normalized = String(phaseType ?? '').trim().toLowerCase();
    return normalized === 'playoff' || normalized === 'knockout';
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

/**
 * Pagina por lo que llegó y desempata por la PK: PostgREST corta en 1000
 * filas aunque se pida más, y sin un orden total una página puede repetir o
 * saltear filas.
 */
async function selectAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: any }>): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await build(from, from + PAGE - 1);
        if (error) throw new Error(error.message || String(error));
        const rows = (data ?? []) as T[];
        out.push(...rows);
        if (rows.length < PAGE) return out;
    }
}

function persistedToSeasonRow(row: any): SeasonTableRow {
    return {
        clubId: String(row.club_id ?? ''),
        played: Number(row.played) || 0,
        won: Number(row.won) || 0,
        drawn: Number(row.drawn) || 0,
        lost: Number(row.lost) || 0,
        scored: Number(row.scored) || 0,
        conceded: Number(row.conceded) || 0,
        bonus: Number(row.bonus_points) || 0,
        points: Number(row.points) || 0,
    };
}

/** La tabla de una fase con sus partidos: la misma cuenta que la página. */
function calculatePhaseRows(phase: PhaseRow, matches: any[], ruleset: any): SeasonTableRow[] {
    const clubIds = new Set<string>();
    matches.forEach((match) => {
        if (match.home_club_id) clubIds.add(String(match.home_club_id));
        if (match.away_club_id) clubIds.add(String(match.away_club_id));
    });
    if (clubIds.size === 0) return [];

    const participants = [...clubIds].sort().map((clubId) => ({ id: clubId, club_id: clubId }));
    const rules = StandingsEngine.resolveRules(phase.settings ?? {}, ruleset ?? {});
    const finals = matches.map((match) => ({ ...match, status: 'final' }));

    return StandingsEngine.generateTable(participants, finals, rules).map((row: any) => ({
        clubId: String(row.teamId ?? ''),
        played: Number(row.played) || 0,
        won: Number(row.won) || 0,
        drawn: Number(row.drawn) || 0,
        lost: Number(row.lost) || 0,
        scored: Number(row.points_for) || 0,
        conceded: Number(row.points_against) || 0,
        bonus: (Number(row.bonus_offensive) || 0) + (Number(row.bonus_defensive) || 0),
        points: Number(row.total_points) || 0,
    }));
}

export async function buildTournamentHistoricalStandings(
    supabase: ReadClient,
    routeId: string,
): Promise<HistoricalStandingsResult | null> {
    const family = await resolveTournamentSeasonFamily(supabase, routeId);
    if (!family) return null;

    // ── Las temporadas: las internas de cada torneo, y los torneos que son
    //    una temporada por sí mismos (sin filas en tournament_seasons).
    const units: SeasonUnit[] = family.seasonRows.map((season) => ({
        key: season.id,
        label: String(season.season_code || season.display_name || season.name || '').trim(),
        tournamentId: season.tournament_id,
        seasonId: season.id,
    }));
    const withSeasonRows = new Set(family.seasonRows.map((season) => season.tournament_id));
    family.tournaments
        .filter((row) => !withSeasonRows.has(row.id))
        .forEach((row) => units.push({
            key: row.id,
            label: String(row.season_id || row.display_name || row.name || '').trim(),
            tournamentId: row.id,
            seasonId: null,
        }));

    const tournamentIds = [...new Set(units.map((unit) => unit.tournamentId))];

    const [{ data: rulesetRows, error: rulesetError }, phases] = await Promise.all([
        supabase.from('tournaments').select('id, ruleset').in('id', tournamentIds),
        selectAll<PhaseRow>((from, to) =>
            supabase
                .from('tournament_phases')
                .select('id, tournament_id, season_id, phase_type, order_index, settings')
                .in('tournament_id', tournamentIds)
                .order('id', { ascending: true })
                .range(from, to),
        ),
    ]);
    if (rulesetError) throw new Error(rulesetError.message);
    const rulesetOf = new Map((rulesetRows ?? []).map((row: any) => [String(row.id), row.ruleset]));

    // Cada fase va a su temporada. Una fase sin season_id en un torneo que sí
    // tiene temporadas no la muestra ninguna página, así que tampoco suma.
    const unitOfPhase = new Map<string, SeasonUnit>();
    const phasesOfUnit = new Map<string, PhaseRow[]>();
    for (const phase of phases) {
        if (isKnockoutPhaseType(phase.phase_type)) continue;
        const unit = units.find((candidate) =>
            candidate.tournamentId === phase.tournament_id &&
            (candidate.seasonId ? phase.season_id === candidate.seasonId : true),
        );
        if (!unit) continue;
        unitOfPhase.set(phase.id, unit);
        const list = phasesOfUnit.get(unit.key) ?? [];
        list.push(phase);
        phasesOfUnit.set(unit.key, list);
    }
    const regularPhaseIds = [...unitOfPhase.keys()];
    if (regularPhaseIds.length === 0) {
        return {
            tournamentId: family.lookup.id,
            seasonsCounted: 0,
            seasonsTotal: units.length,
            firstSeason: null,
            lastSeason: null,
            seasonKeys: [],
            rows: [],
        };
    }

    // ── Tablas guardadas de esas fases (solo la general).
    const supportsTableType = await supportsStandingsTableTypeColumn();
    const persisted = (await Promise.all(
        chunk(regularPhaseIds, IN_CHUNK).map((ids) =>
            selectAll<any>((from, to) =>
                applyStandingsTableType(
                    supabase
                        .from('tournament_standings')
                        .select('id, club_id, phase_id, played, won, drawn, lost, points, scored, conceded, bonus_points')
                        .in('phase_id', ids),
                    supportsTableType,
                )
                    .order('id', { ascending: true })
                    .range(from, to),
            ),
        ),
    )).flat();
    const persistedByPhase = new Map<string, SeasonTableRow[]>();
    persisted.forEach((row) => {
        const list = persistedByPhase.get(String(row.phase_id)) ?? [];
        list.push(persistedToSeasonRow(row));
        persistedByPhase.set(String(row.phase_id), list);
    });

    // ── Qué fases se calculan con los partidos (las mismas reglas que la página).
    const phaseById = new Map(phases.map((phase) => [phase.id, phase]));
    const usesPersisted = (phase: PhaseRow) => {
        const hasRows = (persistedByPhase.get(phase.id)?.length ?? 0) > 0;
        const manual = phase.settings?.standings?.mode === 'fully_manual';
        return hasRows && (manual || readPhaseCarryOverConfig(phase.settings).enabled);
    };
    const phasesToCalculate = regularPhaseIds.filter((phaseId) => !usesPersisted(phaseById.get(phaseId)!));

    const matches = (await Promise.all(
        chunk(phasesToCalculate, IN_CHUNK).map((ids) =>
            selectAll<any>((from, to) =>
                supabase
                    .from('matches')
                    .select(`
                        id, status, score, events, phase_id, group_id,
                        home_club_id, away_club_id,
                        home_base_points, away_base_points,
                        home_bonus_points, away_bonus_points,
                        points_autocalculated
                    `)
                    .in('phase_id', ids)
                    .in('status', FINAL_STATUSES)
                    .order('id', { ascending: true })
                    .range(from, to),
            ),
        ),
    )).flat();
    const matchesByPhase = new Map<string, any[]>();
    matches.forEach((match) => {
        const list = matchesByPhase.get(String(match.phase_id)) ?? [];
        list.push(match);
        matchesByPhase.set(String(match.phase_id), list);
    });

    // ── La tabla de cada fase, y la suma.
    const rowsOfPhase = new Map<string, SeasonTableRow[]>();
    const tableOf = (phase: PhaseRow): SeasonTableRow[] => {
        const cached = rowsOfPhase.get(phase.id);
        if (cached) return cached;
        const rows = usesPersisted(phase)
            ? persistedByPhase.get(phase.id) ?? []
            : calculatePhaseRows(phase, matchesByPhase.get(phase.id) ?? [], rulesetOf.get(phase.tournament_id));
        rowsOfPhase.set(phase.id, rows);
        return rows;
    };

    const tables: SeasonTable[] = [];
    const countedUnits = new Set<string>();
    for (const unit of units) {
        const unitPhases = (phasesOfUnit.get(unit.key) ?? [])
            .slice()
            .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0) || a.id.localeCompare(b.id));
        unitPhases.forEach((phase, index) => {
            let rows = tableOf(phase);
            const carry = readPhaseCarryOverConfig(phase.settings);
            // Solo la tabla GUARDADA trae lo arrastrado adentro; la calculada
            // acá cuenta únicamente los partidos de la fase.
            if (carry.enabled && usesPersisted(phase)) {
                const source = carry.sourcePhaseId ? phaseById.get(carry.sourcePhaseId) : unitPhases[index - 1];
                if (source && unitOfPhase.has(source.id)) rows = withoutCarriedOver(rows, tableOf(source));
            }
            if (rows.some((row) => row.played > 0)) countedUnits.add(unit.key);
            tables.push({ seasonKey: unit.key, rows });
        });
    }

    const table = buildHistoricalTable(tables);

    // ── Nombre y escudo de cada club. El logo pasa por el proxy: un base64 de
    //    `clubs.logo_url` por fila inflaría la respuesta (ver /api/teams).
    const clubIds = table.map((row) => row.clubId);
    const clubs = (await Promise.all(
        chunk(clubIds, IN_CHUNK).map(async (ids) => {
            const { data, error } = await supabase.from('clubs').select('id, name, short_name, logo_url').in('id', ids);
            if (error) throw new Error(error.message);
            return data ?? [];
        }),
    )).flat() as Array<{ id: string; name: string | null; short_name: string | null; logo_url: string | null }>;
    const clubById = new Map(clubs.map((club) => [club.id, club]));

    const labels = units
        .filter((unit) => countedUnits.has(unit.key))
        .map((unit) => unit.label)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));

    return {
        tournamentId: family.lookup.id,
        seasonsCounted: countedUnits.size,
        seasonsTotal: units.length,
        firstSeason: labels[0] ?? null,
        lastSeason: labels[labels.length - 1] ?? null,
        seasonKeys: [...countedUnits].sort(),
        rows: table.map((row) => {
            const club = clubById.get(row.clubId);
            const name = club?.name || club?.short_name || 'Club';
            return {
                ...row,
                club: {
                    id: row.clubId,
                    name,
                    logo: club ? resolveSerializableLogoUrl(club.logo_url, { key: club.id, name }) : null,
                },
            };
        }),
    };
}
