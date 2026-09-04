import {
    getFlashScoreMatchDetails,
    getFlashScoreMatchesRaw,
    fetchPenaltyInfoForMatchIds,
    getTournamentDetails,
    getTournamentIds,
    getTournamentResults,
    getTournamentFixtures,
    getTournamentStandings,
    getTournamentTopScorers,
    getTournamentStandingsForm,
    getTournamentStandingsHtFt,
    getTournamentStandingsOverUnder,
    getTournamentDraw,
    getTournamentArchives
} from '@/lib/services/flashscore';
import {
    getEspnAmericanFootballTournamentBundle,
    inferEspnAmericanFootballLeague,
    parseEspnAmericanFootballTournamentId,
} from '@/lib/services/espnAmericanFootball';
import {
    getEspnMotorsportTournamentBundle,
    inferEspnMotorsportLeague,
    parseEspnMotorsportTournamentId,
} from '@/lib/services/espnMotorsport';
import { StandingsEngine } from '@/lib/services/standingsEngine';
import { getReadClient } from '@/lib/supabase/read';
import { db } from '@/lib/mock-db';
import {
    persistFromTournamentPayload,
} from '@/lib/sync/catalog';
import { getTabSnapshot, hasMeaningfulPayload, upsertTabSnapshot } from '@/lib/sync/tabSnapshots';
import { sortMatchesByDate } from '@/lib/utils/matchOrdering';
import {
    getTournamentFlashScoreConfig,
    isAmericanFootballSport,
    isFlashScoreEnabledForSport,
    isFootballSport,
    isMotorsportSport,
} from '@/lib/externalProviderPolicy';
import {
    getEspnFootballTournamentBundle,
    inferEspnFootballLeague,
    parseEspnFootballTournamentId,
} from '@/lib/services/espnFootball';
import {
    getFihWorldCupTournamentBundle,
    parseFihTournamentId,
} from '@/lib/services/fihHockey';
import {
    getFisuRugbySevensTournamentBundle,
    parseFisuTournamentId,
} from '@/lib/services/fisuRugbySevens';
import {
    isBlockedTournamentId,
} from '@/lib/utils/blockedTournaments';
import { resolveExternalTournamentId } from '@/lib/utils/externalTournamentId';
import { resolveTeamLogo } from '@/lib/utils/teamLogoOverrides';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';
import { resolveSerializableLogoUrl } from '@/lib/utils/logoUrl';
import {
    applyExternalTournamentOverride,
    getExternalTournamentOverride,
} from '@/lib/server/externalTournamentOverrides';
import {
    applyExternalTournamentStandingsOverrideSet,
    getExternalTournamentStandingsOverride,
} from '@/lib/server/externalTournamentStandingsOverrides';
import { readResolvedTournamentIds, persistResolvedTournamentIds } from '@/lib/server/resolvedTournamentIds';
import { createApiPerfTracker } from '@/lib/perf/api';
import { formatDurationMs, logPerf, measureAsync, nowMs } from '@/lib/perf/measure';

const TAB_TIMEOUT_MS = 5000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DB_TOURNAMENT_META_SELECT = 'id, name, display_name, sport_id, country_id, logo_url, banner_url, url, ruleset, external_id, slug';
const DB_TOURNAMENT_META_SELECT_NO_URL = 'id, name, display_name, sport_id, country_id, logo_url, banner_url, ruleset, external_id, slug';
const DB_TOURNAMENT_META_SELECT_NO_BANNER_URL = 'id, name, display_name, sport_id, country_id, logo_url, url, ruleset, external_id, slug';
const DB_TOURNAMENT_META_SELECT_NO_BANNER_OR_URL = 'id, name, display_name, sport_id, country_id, logo_url, ruleset, external_id, slug';

function normalizeId(val: any): string | undefined {
    if (val === null || val === undefined) return undefined;
    const str = String(val).trim();
    return str ? str : undefined;
}

function stripFsPrefix(val?: string): string | undefined {
    if (!val) return val;
    return val.toLowerCase().startsWith('fs-') ? val.slice(3) : val;
}

/**
 * Los ids del proveedor no viajan siempre con la misma capitalización: el feed
 * diario los devuelve en minúscula (`0erzlii7`) y el detalle del partido —de
 * donde salen los links que ya circulan por el sitio— los devuelve mezclados
 * (`fs-0ErZlII7`). Comparar con `===` deja al torneo sin resolver y la página
 * termina con todas las pestañas vacías.
 */
function sameProviderId(a?: string | null, b?: string | null): boolean {
    if (!a || !b) return false;
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function normalizeTournamentUrl(raw?: string): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        try {
            const parsed = new URL(trimmed);
            return parsed.pathname || trimmed;
        } catch {
            return trimmed;
        }
    }
    return trimmed;
}

function applyDbTournamentPresentationOverrides(
    payload: unknown,
    dbTournamentMeta: {
        id?: string | null;
        name?: string | null;
        display_name?: string | null;
        logo_url?: string | null;
        banner_url?: string | null;
        country_id?: string | null;
        url?: string | null;
        slug?: string | null;
    } | null,
) {
    const basePayload = payload && typeof payload === 'object'
        ? payload as Record<string, unknown>
        : {};

    if (!dbTournamentMeta) {
        return basePayload;
    }

    const resolvedName = normalizeId(dbTournamentMeta.display_name || dbTournamentMeta.name);
    const resolvedLogo = resolveSerializableLogoUrl(dbTournamentMeta.logo_url || dbTournamentMeta.banner_url, {
        key: dbTournamentMeta.id || dbTournamentMeta.slug,
        name: dbTournamentMeta.display_name || dbTournamentMeta.name,
    });
    const resolvedCountryId = normalizeId(dbTournamentMeta.country_id);
    const resolvedUrl = normalizeTournamentUrl(dbTournamentMeta.url || undefined) || normalizeId(dbTournamentMeta.url);

    return {
        ...basePayload,
        ...(resolvedName ? {
            name: resolvedName,
            display_name: resolvedName,
        } : {}),
        ...(resolvedLogo ? {
            logo_url: resolvedLogo,
            image: resolvedLogo,
            logo: resolvedLogo,
            image_path: resolvedLogo,
            logo_path: resolvedLogo,
            tournament_logo: resolvedLogo,
            tournament_image_path: resolvedLogo,
        } : {}),
        ...(resolvedCountryId ? {
            country_id: resolvedCountryId,
        } : {}),
        ...(resolvedUrl ? {
            url: resolvedUrl,
        } : {}),
    };
}

function isRugbyApiSportsTournamentId(value: string): boolean {
    return /^ras-league-\d+$/i.test(value.trim());
}

function isEspnAmericanFootballTournamentId(value: string): boolean {
    return Boolean(parseEspnAmericanFootballTournamentId(value));
}

function isEspnMotorsportTournamentId(value: string): boolean {
    return Boolean(parseEspnMotorsportTournamentId(value));
}

function getFlashScoreSportCandidates(sportId: string, tournamentUrl?: string): string[] {
    const normalizedSport = String(sportId || 'rugby').trim().toLowerCase();
    const normalizedUrl = String(normalizeTournamentUrl(tournamentUrl) || '').toLowerCase();

    if (normalizedSport === 'rugby') {
        if (normalizedUrl.includes('/rugby-league/')) {
            return ['rugby-league', 'rugby-union'];
        }

        if (normalizedUrl.includes('/rugby-union/')) {
            return ['rugby-union', 'rugby-league'];
        }

        return ['rugby-union', 'rugby-league'];
    }

    return [normalizedSport];
}

function findFirstByKeys(obj: any, keys: string[], visited = new Set<any>()): string | undefined {
    if (!obj || typeof obj !== 'object') return undefined;
    if (visited.has(obj)) return undefined;
    visited.add(obj);
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const val = normalizeId((obj as any)[key]);
            if (val) return val;
        }
    }
    for (const value of Object.values(obj)) {
        const found = findFirstByKeys(value, keys, visited);
        if (found) return found;
    }
    return undefined;
}

function extractIds(data: any) {
    const d = data || {};
    return {
        tournamentId:
            normalizeId(d.tournament_id) ||
            normalizeId(d.tournamentId) ||
            normalizeId(d.tournament?.tournament_id) ||
            normalizeId(d.tournament?.id) ||
            findFirstByKeys(d, ['tournament_id', 'tournamentId', 'league_id', 'leagueId']),
        seasonId:
            normalizeId(d.season_id) ||
            normalizeId(d.seasonId) ||
            normalizeId(d.season?.id) ||
            normalizeId(d.season?.season_id) ||
            findFirstByKeys(d, ['season_id', 'seasonId']),
        templateId:
            normalizeId(d.tournament_template_id) ||
            normalizeId(d.template_id) ||
            normalizeId(d.templateId) ||
            normalizeId(d.tournament_template?.id) ||
            findFirstByKeys(d, ['tournament_template_id', 'template_id', 'templateId']),
        stageId:
            normalizeId(d.tournament_stage_id) ||
            normalizeId(d.stage_id) ||
            normalizeId(d.stageId) ||
            normalizeId(d.stage?.id) ||
            normalizeId(d.tournamentStageId) ||
            findFirstByKeys(d, ['tournament_stage_id', 'tournamentStageId', 'stage_id', 'stageId']),
        drawStageId:
            normalizeId(d.draw_stage_id) ||
            normalizeId(d.drawStageId) ||
            normalizeId(d.cur_draw_stage_id) || // Added generic check
            (Array.isArray(d.draw_stages) && d.draw_stages.length > 0 ? (
                typeof d.draw_stages[0] === 'object'
                    ? (normalizeId(d.draw_stages[0].draw_stage_id) || normalizeId(d.draw_stages[0].stage_id))
                    : normalizeId(d.draw_stages[0])
            ) : undefined) ||
            findFirstByKeys(d, ['draw_stage_id', 'drawStageId'])
    };
}

function extractUrl(data: any) {
    const raw =
        data?.url ||
        data?.tournament_url ||
        data?.tournament?.url ||
        data?.tournament?.tournament_url ||
        data?.tournament?.link;
    const cleaned = typeof raw === 'string' ? normalizeTournamentUrl(raw) : undefined;
    return cleaned && cleaned.trim().length > 0 ? cleaned : undefined;
}

/**
 * Por qué una pestaña vino vacía. `unresolved` es el caso feo: nunca supimos
 * contra qué ids preguntarle al proveedor, así que ni se le preguntó — muy
 * distinto de un torneo que sí respondió y no tiene nada cargado.
 */
type ProviderStatus = {
    ok: boolean;
    reason: 'unresolved' | 'provider-error' | 'partial' | null;
    message: string | null;
};

const PROVIDER_OK: ProviderStatus = { ok: true, reason: null, message: null };

type ResolvedIds = {
    tournamentId?: string;
    stageId?: string;
    templateId?: string;
    seasonId?: string;
    drawStageId?: string;
    tournamentUrl?: string;
};

type TournamentStage = { id: string; name: string };

type TournamentStageBundle = {
    stages: TournamentStage[];
    tournamentId?: string;
    seasonId?: string;
};

const EMPTY_STAGE_BUNDLE: TournamentStageBundle = { stages: [] };

/**
 * Every stage of a competition, read from the id bundle its shared URL resolves to.
 * La URL compartida resuelve SIEMPRE a la temporada corriente del proveedor, así
 * que el bundle vuelve con sus ids al lado de las etapas: sin ellos no hay forma
 * de saber si esas etapas son del año que la página está mostrando.
 */
async function resolveTournamentStages(tournamentUrl: string): Promise<TournamentStageBundle> {
    try {
        const idsRes = await getTournamentIds(tournamentUrl); // memoized per URL
        const idsData = idsRes?.DATA || idsRes;
        const source = Array.isArray(idsData) ? idsData[0] : idsData;
        const bundle: TournamentStageBundle = {
            stages: [],
            tournamentId: normalizeId(source?.tournament_id),
            seasonId: normalizeId(source?.season_id),
        };
        const rawStages = source?.tournament_stages;
        if (!Array.isArray(rawStages)) return bundle;
        bundle.stages = rawStages
            .map((stage: any) => ({
                id: normalizeId(stage?.tournament_stage_id) || normalizeId(stage?.stage_id) || '',
                name: String(stage?.name || '').trim(),
            }))
            .filter((stage: TournamentStage) => Boolean(stage.id));
        return bundle;
    } catch (error) {
        console.warn('[Tournament API] Could not resolve tournament stages:', error);
        return EMPTY_STAGE_BUNDLE;
    }
}

/**
 * Los ids de UNA temporada pasada, sacados de sus propios partidos.
 *
 * El proveedor sirve cualquier temporada vieja por `template_id + season_id`
 * —los resultados ya salen bien—, pero la tabla se pide por
 * `tournament_id + tournament_stage_id`, y esos NO viajan con el `season_id`:
 * el bundle de la URL solo conoce los de la temporada corriente. Sin puente, un
 * torneo con el selector en 2023/24 muestra los partidos de 2023/24 y la tabla
 * de hoy. Y `tournaments/archives`, que sería la vía natural para listar
 * temporadas, en rugby devuelve vacío.
 *
 * El puente es el partido: cada uno lleva el `tournament_id` y el
 * `tournament_stage_id` de SU edición. Se usa el más viejo de los resultados
 * porque la fase regular arranca antes que cualquier playoff, así que su etapa
 * es la que tiene la tabla. Una sola llamada, y sobre resultados que igual
 * había que pedir (van por la misma caché).
 */
async function resolveSeasonScopedIds(
    results: any[],
): Promise<{ tournamentId?: string; stageId?: string }> {
    const conFecha = results
        .filter((match) => match && Number.isFinite(Number(match.timestamp)))
        .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

    const primero = conFecha[0] ?? results[0];
    const matchId = normalizeId(primero?.match_id ?? primero?.id);
    if (!matchId) return {};

    try {
        const detalle = await getFlashScoreMatchDetails(matchId);
        const torneo = (detalle as any)?.DATA?.tournament ?? (detalle as any)?.tournament;
        return {
            tournamentId: normalizeId(torneo?.tournament_id),
            stageId: normalizeId(torneo?.tournament_stage_id),
        };
    } catch (error) {
        console.warn('[Tournament API] No se pudieron resolver los ids de la temporada pedida:', error);
        return {};
    }
}

// The stage that holds the league table. Knockout/placement stages have none.
const MAIN_STAGE_NAME_RE = /^(main|regular season|group stage|league stage|round robin)$/i;

function pickStandingsStageId(stages: TournamentStage[], currentStageId?: string): string | undefined {
    const mainStage = stages.find((stage) => MAIN_STAGE_NAME_RE.test(stage.name));
    return mainStage?.id || currentStageId;
}

function mergeResolvedIds(base: ResolvedIds, next: ResolvedIds): ResolvedIds {
    return {
        tournamentId: base.tournamentId || next.tournamentId,
        stageId: base.stageId || next.stageId,
        templateId: base.templateId || next.templateId,
        seasonId: base.seasonId || next.seasonId,
        drawStageId: base.drawStageId || next.drawStageId,
        tournamentUrl: base.tournamentUrl || next.tournamentUrl
    };
}

function normalizeDetails(raw: any) {
    const data = raw?.DATA || raw;
    if (!data) return null;
    if (Array.isArray(data)) return data.length > 0 ? data : null;
    if (typeof data === 'object' && Object.keys(data).length === 0) return null;
    return data;
}

function getStandingTeamName(row: any) {
    return (
        row?.team?.name ||
        row?.participant?.name ||
        row?.team_name ||
        row?.name ||
        ''
    );
}

function getStandingTeamId(row: any) {
    return normalizeId(
        row?.team?.id ||
        row?.team?.team_id ||
        row?.participant?.id ||
        row?.team_id,
    );
}

function getStandingTeamLogo(row: any) {
    return resolveTeamLogo(row?.team, row?.participant, row);
}

function getStandingTeamUrl(row: any) {
    return (
        row?.team?.team_url ||
        row?.participant?.team_url ||
        row?.team_url ||
        ''
    );
}

function getMatchTeamId(team: any, fallbackId?: any) {
    return normalizeId(team?.id || team?.team_id || fallbackId);
}

function getMatchTeamName(team: any, fallbackName?: any) {
    return String(team?.name || fallbackName || '').trim();
}

function getMatchTeamLogo(team: any, fallbackLogo?: any) {
    return resolveTeamLogo(team, { logo: fallbackLogo });
}

function getMatchTeamUrl(team: any) {
    return team?.team_url || '';
}

function buildStandingsTeamAssetMap(...matchGroups: any[][]) {
    const teamAssets = new Map<string, { id?: string; name?: string; logo?: string; teamUrl?: string }>();

    const register = (team: { id?: string; name?: string; logo?: string; teamUrl?: string }) => {
        const name = String(team.name || '').trim();
        const id = normalizeId(team.id);
        const logo = String(team.logo || '').trim();
        const teamUrl = String(team.teamUrl || '').trim();

        const keys = [
            id ? `id:${id}` : null,
            name ? `name:${name.toLowerCase()}` : null,
        ].filter(Boolean) as string[];

        if (keys.length === 0) return;

        for (const key of keys) {
            const previous = teamAssets.get(key);
            teamAssets.set(key, {
                id: previous?.id || id,
                name: previous?.name || name,
                logo: previous?.logo || logo,
                teamUrl: previous?.teamUrl || teamUrl,
            });
        }
    };

    matchGroups
        .filter(Array.isArray)
        .flat()
        .forEach((match: any) => {
            register({
                id: getMatchTeamId(match?.home_team, match?.home_team_id || match?.home_club_id),
                name: getMatchTeamName(match?.home_team, match?.event_home_team || match?.home_team_name),
                logo: getMatchTeamLogo(match?.home_team, match?.home_team_logo),
                teamUrl: getMatchTeamUrl(match?.home_team),
            });
            register({
                id: getMatchTeamId(match?.away_team, match?.away_team_id || match?.away_club_id),
                name: getMatchTeamName(match?.away_team, match?.event_away_team || match?.away_team_name),
                logo: getMatchTeamLogo(match?.away_team, match?.away_team_logo),
                teamUrl: getMatchTeamUrl(match?.away_team),
            });
        });

    return teamAssets;
}

type TeamAssetMap = Map<string, { id?: string; name?: string; logo?: string; teamUrl?: string }>;

// The bracket feed appends an internal seed number to the team name ("France U20_165")
// and ships no crest at all — unlike results/fixtures, which carry the real name and
// image for the same team_id. Repair the bracket from that index.
const BRACKET_SEED_SUFFIX_RE = /_\d+$/;

function repairBracketTeam(team: any, teamAssets: TeamAssetMap) {
    if (!team || typeof team !== 'object') return team;

    const id = getMatchTeamId(team);
    const rawName = getMatchTeamName(team);
    const cleanedName = rawName.replace(BRACKET_SEED_SUFFIX_RE, '').trim();
    const known =
        (id ? teamAssets.get(`id:${id}`) : undefined) ||
        (cleanedName ? teamAssets.get(`name:${cleanedName.toLowerCase()}`) : undefined);

    const logo = getMatchTeamLogo(team) || known?.logo || '';

    return {
        ...team,
        name: known?.name || cleanedName || rawName,
        logo,
        image_path: team.image_path || logo,
        small_image_path: team.small_image_path || logo,
        team_url: getMatchTeamUrl(team) || known?.teamUrl || '',
    };
}

function repairBracketRounds(rounds: any, teamAssets: TeamAssetMap): any[] {
    if (!Array.isArray(rounds)) return [];
    return rounds.map((round: any) => ({
        ...round,
        matches: Array.isArray(round?.matches)
            ? round.matches.map((match: any) => ({
                ...match,
                home_team: repairBracketTeam(match?.home_team, teamAssets),
                away_team: repairBracketTeam(match?.away_team, teamAssets),
            }))
            : [],
    }));
}

function roundsHaveMatches(rounds: any[]): boolean {
    return rounds.some((round) => Array.isArray(round?.matches) && round.matches.length > 0);
}

// A group stage arrives as ONE flat array with the group name on each row
// ({ group: "Group A", ... }), so a 16-team tournament renders as a single 1–16 table in
// which a group winner can sit below a team that lost every match. DB tournaments already
// ship the grouped shape the UI knows ({ group_name, rows }); reshape into it.
function groupFlatStandings(standings: any): any {
    if (!Array.isArray(standings) || standings.length === 0) return standings;
    // Already grouped (DB tournaments, or a provider that nests them).
    if (standings.some((row: any) => Array.isArray(row?.rows))) return standings;

    const groups = new Map<string, any[]>();
    for (const row of standings) {
        const groupName = String(row?.group ?? row?.group_name ?? '').trim();
        // A league has no groups — leave its single table alone.
        if (!groupName) return standings;
        if (!groups.has(groupName)) groups.set(groupName, []);
        groups.get(groupName)!.push(row);
    }

    if (groups.size < 2) return standings;

    return [...groups.entries()].map(([groupName, rows]) => ({
        group_name: groupName,
        name: groupName,
        rows,
    }));
}

function enrichStandingsRowsWithTeamAssets(
    rows: any,
    teamAssets: Map<string, { id?: string; name?: string; logo?: string; teamUrl?: string }>
): any {
    if (!Array.isArray(rows)) return rows;

    return rows.map((row: any) => {
        if (Array.isArray(row?.rows)) {
            return {
                ...row,
                rows: enrichStandingsRowsWithTeamAssets(row.rows, teamAssets),
            };
        }

        const existingId = getStandingTeamId(row);
        const existingName = String(getStandingTeamName(row) || '').trim();
        const existingLogo = String(getStandingTeamLogo(row) || '').trim();
        const existingTeamUrl = String(getStandingTeamUrl(row) || '').trim();

        const fallback =
            (existingId ? teamAssets.get(`id:${existingId}`) : undefined) ||
            (existingName ? teamAssets.get(`name:${existingName.toLowerCase()}`) : undefined);

        const logo = existingLogo || fallback?.logo || '';
        const teamUrl = existingTeamUrl || fallback?.teamUrl || '';
        const team = row?.team && typeof row.team === 'object' ? row.team : {};
        const participant = row?.participant && typeof row.participant === 'object' ? row.participant : {};

        return {
            ...row,
            team: {
                ...team,
                id: team.id || team.team_id || existingId || fallback?.id,
                name: team.name || existingName || fallback?.name,
                team_url: team.team_url || teamUrl || undefined,
                logo: team.logo || logo || undefined,
                image_path: team.image_path || logo || undefined,
                small_image_path: team.small_image_path || logo || undefined,
                source: team.source || 'flashscore',
                provider: team.provider || 'flashscore',
            },
            participant: {
                ...participant,
                id: participant.id || existingId || fallback?.id,
                name: participant.name || existingName || fallback?.name,
                team_url: participant.team_url || teamUrl || undefined,
                logo: participant.logo || logo || undefined,
                image_path: participant.image_path || logo || undefined,
                small_image_path: participant.small_image_path || logo || undefined,
                source: participant.source || 'flashscore',
                provider: participant.provider || 'flashscore',
            },
            team_id: row?.team_id || existingId || fallback?.id,
            team_name: row?.team_name || existingName || fallback?.name,
            team_url: row?.team_url || teamUrl || undefined,
            team_logo: row?.team_logo || logo || undefined,
            logo: row?.logo || logo || undefined,
            source: row?.source || 'flashscore',
            provider: row?.provider || 'flashscore',
        };
    });
}

function buildExternalStandingsParticipants(...matchGroups: any[][]) {
    const participants = new Map<string, any>();

    const register = (team: any, fallbackName?: any, fallbackLogo?: any) => {
        const teamId = getMatchTeamId(team);
        const teamName = getMatchTeamName(team, fallbackName);
        if (!teamId || !teamName) return;

        const current = participants.get(teamId);
        participants.set(teamId, {
            id: current?.id || teamId,
            club_id: current?.club_id || teamId,
            name: current?.name || teamName,
            clubs: {
                name: current?.clubs?.name || teamName,
                logo_url: current?.clubs?.logo_url || getMatchTeamLogo(team, fallbackLogo) || null,
            },
        });
    };

    matchGroups
        .filter(Array.isArray)
        .flat()
        .forEach((match: any) => {
            register(match?.home_team, match?.event_home_team || match?.home_team_name, match?.home_team_logo);
            register(match?.away_team, match?.event_away_team || match?.away_team_name, match?.away_team_logo);
        });

    return Array.from(participants.values());
}

function buildExternalFinalMatches(matches: any[]) {
    if (!Array.isArray(matches)) return [];

    return matches
        .map((match: any) => {
            const homeId = getMatchTeamId(match?.home_team, match?.home_team_id || match?.home_club_id);
            const awayId = getMatchTeamId(match?.away_team, match?.away_team_id || match?.away_club_id);
            if (!homeId || !awayId) return null;

            const timestamp = Number(match?.timestamp || match?.start_time || match?.time || match?.event_timestamp || 0);
            return {
                id: match?.match_id || match?.event_key || match?.id || `${homeId}-${awayId}-${timestamp || 'na'}`,
                home_club_id: homeId,
                away_club_id: awayId,
                score: {
                    home: Number(match?.scores?.home ?? match?.home_score ?? 0),
                    away: Number(match?.scores?.away ?? match?.away_score ?? 0),
                },
                status: 'final',
                date_time: timestamp ? new Date(timestamp * 1000).toISOString() : null,
                events: null,
                points_autocalculated: true,
            };
        })
        .filter(Boolean);
}

function mapCalculatedExternalStanding(row: any) {
    return {
        position: row.position ?? 0,
        team: {
            id: row.teamId ?? row.team?.id ?? null,
            name: row.team?.name ?? 'Equipo',
            logo: row.team?.logo ?? '',
            image_path: row.team?.logo ?? undefined,
            small_image_path: row.team?.logo ?? undefined,
            source: 'local-calculated',
            provider: 'local-calculated',
        },
        participant: {
            id: row.participantId ?? row.teamId ?? row.team?.id ?? null,
            name: row.team?.name ?? 'Equipo',
            logo: row.team?.logo ?? '',
            image_path: row.team?.logo ?? undefined,
            small_image_path: row.team?.logo ?? undefined,
            source: 'local-calculated',
            provider: 'local-calculated',
        },
        team_id: row.teamId ?? row.team?.id ?? null,
        team_name: row.team?.name ?? 'Equipo',
        team_logo: row.team?.logo ?? '',
        played: row.played ?? 0,
        won: row.won ?? 0,
        drawn: row.drawn ?? 0,
        lost: row.lost ?? 0,
        scored: row.points_for ?? 0,
        conceded: row.points_against ?? 0,
        points: row.total_points ?? 0,
        difference: row.difference ?? 0,
        matches_total: row.played ?? 0,
        wins_total: row.won ?? 0,
        draws_total: row.drawn ?? 0,
        losses_total: row.lost ?? 0,
        goals_for: row.points_for ?? 0,
        goals_against: row.points_against ?? 0,
        goal_difference: row.difference ?? 0,
        points_total: row.total_points ?? 0,
        bonus_points: (row.bonus_offensive ?? 0) + (row.bonus_defensive ?? 0),
        form: Array.isArray(row.form) ? row.form.join('') : (row.form ?? ''),
        source: 'local-calculated',
        provider: 'local-calculated',
    };
}

function buildFallbackResolvedRules(sportId: string, tournamentRuleset: any) {
    const resolved = StandingsEngine.resolveRules({}, tournamentRuleset ?? {});
    if (sportId !== 'basketball') return resolved;

    const hasExplicitPoints =
        tournamentRuleset?.points?.win != null ||
        tournamentRuleset?.pointsSystem?.win != null ||
        tournamentRuleset?.pointsWin != null;

    if (hasExplicitPoints) return resolved;

    return {
        ...resolved,
        points_for_win: 2,
        points_for_draw: 0,
        points_for_loss: 1,
        tiebreakers: Array.isArray(resolved?.tiebreakers) && resolved.tiebreakers.length > 0
            ? resolved.tiebreakers
            : ['points_difference', 'won'],
    };
}

function buildLocalFallbackStandings(
    sportId: string,
    results: any[],
    fixtures: any[],
    tournamentRuleset: any,
) {
    const participants = buildExternalStandingsParticipants(results, fixtures);
    const finalMatches = buildExternalFinalMatches(results);
    if (participants.length === 0 || finalMatches.length === 0) return [];

    const resolvedRules = buildFallbackResolvedRules(sportId, tournamentRuleset);
    const calculated = StandingsEngine.generateTable(participants, finalMatches, resolvedRules);
    return calculated.map(mapCalculatedExternalStanding);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`[${label}] timeout after ${ms}ms`));
        }, ms);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
    });
}

function timedTab<T>(label: string, promise: Promise<T>, ms: number = TAB_TIMEOUT_MS): Promise<T> {
    return measureAsync(
        `tournaments_${label}`,
        async () => withTimeout(promise, ms, label).catch((error) => {
            console.warn(`[Tournament API] ${label} failed:`, error);
            throw error;
        }),
        {
            runtime: 'server',
            tags: ['API', 'QUERY'],
            metadata: {
                route: '/api/tournaments',
                step: label,
            },
        },
    );
}


async function findDbTournamentMeta(id: string) {
    if (
        !id ||
        id.toLowerCase().startsWith('fs-') ||
        isRugbyApiSportsTournamentId(id) ||
        isEspnAmericanFootballTournamentId(id) ||
        isEspnMotorsportTournamentId(id) ||
        parseFihTournamentId(id) !== null ||
        parseFisuTournamentId(id) !== null
    ) {
        return null;
    }

    try {
        const readClient = await getReadClient();
        const queryByIdentifier = async (selectClause: string) => {
            const baseQuery = readClient
                .from('tournaments')
                .select(selectClause);

            return UUID_RE.test(id)
                ? baseQuery.eq('id', id).maybeSingle()
                : baseQuery.eq('slug', id).maybeSingle();
        };

        let response = await queryByIdentifier(DB_TOURNAMENT_META_SELECT);
        const missingUrl = isMissingColumnError(response.error, 'url');

        if (missingUrl) {
            response = await queryByIdentifier(DB_TOURNAMENT_META_SELECT_NO_URL);
        }

        if (isMissingColumnError(response.error, 'banner_url')) {
            response = await queryByIdentifier(
                missingUrl
                    ? DB_TOURNAMENT_META_SELECT_NO_BANNER_OR_URL
                    : DB_TOURNAMENT_META_SELECT_NO_BANNER_URL,
            );
        }

        return response.data || null;
    } catch (error) {
        console.warn('[Tournament API] Could not load DB tournament metadata:', error);
        return null;
    }
}


async function fetchAndExtractFromOffset(
    tournamentId: string,
    sportId: string,
    offset: number,
): Promise<ResolvedIds> {
    try {
        const raw = await getFlashScoreMatchesRaw(offset, sportId, undefined, { lane: 'resolution' });
        const tournaments = Array.isArray(raw) ? raw : (raw?.DATA || raw?.data || []);

        const matchTournament = tournaments.find((t: any) => (
            sameProviderId(t?.tournament_id, tournamentId) ||
            sameProviderId(t?.tournament_stage_id, tournamentId)
        ));

        if (!matchTournament) return {};

        console.log(`Found tournament match on offset ${offset}:`, matchTournament.tournament_id);

        const extracted = extractIds(matchTournament);
        const urlFromTournament = extractUrl(matchTournament);
        let partial: ResolvedIds = {
            tournamentId: extracted.tournamentId || tournamentId,
            stageId: extracted.stageId,
            templateId: extracted.templateId,
            seasonId: extracted.seasonId,
            drawStageId: extracted.drawStageId,
            tournamentUrl: urlFromTournament,
        };

        if (partial.stageId && partial.templateId && partial.seasonId && partial.drawStageId) {
            return partial;
        }

        const match = Array.isArray(matchTournament.matches) ? matchTournament.matches[0] : null;
        const matchId = match?.match_id || match?.event_key || match?.id;
        if (!matchId) return partial;

        const matchDetailsRes = await getFlashScoreMatchDetails(String(matchId));
        const matchDetails = normalizeDetails(matchDetailsRes);

        if (matchDetails) {
            const extractedFromMatch = extractIds(matchDetails);
            const urlFromMatch = extractUrl(matchDetails);
            partial = mergeResolvedIds(partial, {
                tournamentId: extractedFromMatch.tournamentId || tournamentId,
                stageId: extractedFromMatch.stageId,
                templateId: extractedFromMatch.templateId,
                seasonId: extractedFromMatch.seasonId,
                drawStageId: extractedFromMatch.drawStageId,
                tournamentUrl: urlFromMatch,
            });
        }

        return partial;
    } catch (err) {
        console.error(`Error resolving IDs at offset ${offset}:`, err);
        return {};
    }
}

async function resolveIdsFromTournamentId(
    tournamentId: string,
    sportId: string = 'rugby',
    tournamentUrl?: string,
): Promise<ResolvedIds> {
    let resolved: ResolvedIds = { tournamentId };
    const sportCandidates = getFlashScoreSportCandidates(sportId, tournamentUrl);

    console.log(`Resolving IDs for tournamentId: ${tournamentId} (Sport: ${sportId})`);

    // Round 1: try today (offset 0) — most likely to have any active tournament
    const round1Results = await Promise.allSettled(
        sportCandidates.map((candidateSport) => fetchAndExtractFromOffset(tournamentId, candidateSport, 0)),
    );

    for (const result of round1Results) {
        if (result.status === 'fulfilled' && result.value) {
            resolved = mergeResolvedIds(resolved, result.value);
            if (resolved.stageId && resolved.templateId && resolved.seasonId) {
                return resolved;
            }
        }
    }

    // Round 2: try all remaining offsets in parallel
    const remainingOffsets = [-1, 1, -2, 2, -3, 3, -5, 5, -7, 7];
    const results = await Promise.allSettled(
        remainingOffsets.flatMap((offset) =>
            sportCandidates.map((candidateSport) => fetchAndExtractFromOffset(tournamentId, candidateSport, offset)),
        )
    );

    for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
            resolved = mergeResolvedIds(resolved, result.value);
            if (resolved.stageId && resolved.templateId && resolved.seasonId) {
                break;
            }
        }
    }

    return resolved;
}

export async function GET(request: Request) {
    const perf = createApiPerfTracker('/api/tournaments');
    const startedAt = nowMs();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id') || '';
    let url = searchParams.get('url') || searchParams.get('tournament_url') || searchParams.get('tournamentUrl') || '';
    const sport = searchParams.get('sport') || searchParams.get('sportId') || 'rugby'; // Default to rugby
    const requestedName = normalizeId(searchParams.get('name') || searchParams.get('display_name') || searchParams.get('displayName'));
    const requestedSeason =
        searchParams.get('season') ||
        searchParams.get('season_id') ||
        searchParams.get('seasonId') ||
        undefined;
    perf.note({
        id: id || 'none',
        sport,
        hasUrl: Boolean(searchParams.get('url') || searchParams.get('tournament_url') || searchParams.get('tournamentUrl')),
    });

    let tournamentId = searchParams.get('tournament_id') || searchParams.get('tournamentId') || undefined;
    let stageId = searchParams.get('tournament_stage_id') || searchParams.get('tournamentStageId') || searchParams.get('stageId') || undefined;
    let templateId = searchParams.get('tournament_template_id') || searchParams.get('templateId') || undefined;
    let seasonId = searchParams.get('season_id') || searchParams.get('seasonId') || requestedSeason || undefined;
    let drawStageId = searchParams.get('draw_stage_id') || searchParams.get('drawStageId') || undefined;
    const flashScoreEnabledForSport = isFlashScoreEnabledForSport(sport);

    if (
        isBlockedTournamentId(id) ||
        isBlockedTournamentId(tournamentId) ||
        isBlockedTournamentId(stageId) ||
        isBlockedTournamentId(templateId) ||
        isBlockedTournamentId(drawStageId)
    ) {
        return perf.json(
            { ok: false, error: 'Tournament not found' },
            { status: 404 }
        );
    }

    // Try to get tournament from local data to check for flashScoreIds
    let localTournament: any = null;
    if (id) {
        try {
            const { getAllTournaments } = await import('@/lib/data/tournaments');
            const allTournaments = getAllTournaments();

            // Try to find by ID first
            localTournament = allTournaments.find(t => t.id === id);

            // If not found and ID has fs- prefix, try to match by flashScoreIds (case-insensitive)
            if (!localTournament && id.toLowerCase().startsWith('fs-')) {
                const rawId = id.slice(3).toLowerCase();
                localTournament = allTournaments.find(t =>
                    t.flashScoreIds && (
                        t.flashScoreIds.tournamentId?.toLowerCase() === rawId ||
                        t.flashScoreIds.tournamentStageId?.toLowerCase() === rawId ||
                        t.flashScoreIds.tournamentTemplateId?.toLowerCase() === rawId
                    )
                );
                console.log('Searching by fs- prefix (case-insensitive), found:', localTournament ? localTournament.id : 'none');
            }

            // If tournament has flashScoreIds, use them as defaults
            if (localTournament?.flashScoreIds) {
                console.log('Found flashScoreIds in tournament definition:', localTournament.flashScoreIds);
                tournamentId = tournamentId || localTournament.flashScoreIds.tournamentId;
                stageId = stageId || localTournament.flashScoreIds.tournamentStageId;
                templateId = templateId || localTournament.flashScoreIds.tournamentTemplateId;
                seasonId = seasonId || localTournament.flashScoreIds.seasonId;
            }

            // Use tournament URL if not provided
            if (!url && localTournament?.url) {
                url = localTournament.url;
            }
        } catch (err) {
            console.log('Could not load tournament from local data:', err);
        }
    }

    url = normalizeTournamentUrl(url) || url;

    const dbTournamentMeta = await perf.measureStep(
        'find_db_tournament_meta',
        async () => findDbTournamentMeta(id),
        {
            bucket: 'query',
            logQuery: true,
        },
    );
    const resolvedSportId = dbTournamentMeta?.sport_id || localTournament?.sportId || sport;
    const dbFlashScoreConfig = getTournamentFlashScoreConfig(dbTournamentMeta as any);

    tournamentId = tournamentId || dbFlashScoreConfig?.tournament_id;
    stageId = stageId || dbFlashScoreConfig?.tournament_stage_id;
    templateId = templateId || dbFlashScoreConfig?.tournament_template_id;
    seasonId = seasonId || (dbFlashScoreConfig?.season_id != null ? String(dbFlashScoreConfig.season_id) : undefined);
    if (!url && dbFlashScoreConfig?.tournament_url) {
        url = dbFlashScoreConfig.tournament_url;
    }

    // Warm-path short-circuit: si ya resolvimos estos IDs antes (esta instancia, o un
    // request previo que los guardó en el ruleset), salteamos el sweep por completo.
    if (flashScoreEnabledForSport && (!stageId || !templateId || !seasonId || !tournamentId)) {
        const cachedIds = readResolvedTournamentIds(id, url);
        if (cachedIds) {
            tournamentId = tournamentId || cachedIds.tournamentId;
            stageId = stageId || cachedIds.stageId;
            templateId = templateId || cachedIds.templateId;
            seasonId = seasonId || cachedIds.seasonId;
            if (!url && cachedIds.url) url = cachedIds.url;
        }
    }

    const hasFsPrefix = id.toLowerCase().startsWith('fs-');
    const rawId = hasFsPrefix ? id.slice(3) : id;

    if (hasFsPrefix && rawId && !url) {
        tournamentId = tournamentId || rawId;
    }

    tournamentId = stripFsPrefix(tournamentId);
    stageId = stripFsPrefix(stageId);
    drawStageId = stripFsPrefix(drawStageId);

    let externalOverrideId: string | null = resolveExternalTournamentId({
        routeId: id,
        externalId: dbTournamentMeta?.external_id,
        sportId: resolvedSportId,
        ruleset: dbTournamentMeta?.ruleset || localTournament?.ruleset,
        flashScoreIds: {
            tournamentId,
            tournamentStageId: stageId,
            tournamentTemplateId: templateId,
            seasonId,
        },
    });

    if (externalOverrideId && !url) {
        try {
            const externalTournamentOverride = await getExternalTournamentOverride(externalOverrideId);
            if (externalTournamentOverride?.url) {
                url = normalizeTournamentUrl(externalTournamentOverride.url) || externalTournamentOverride.url;
            }
        } catch (error) {
            console.warn('[Tournament API] Could not load external tournament override:', error);
        }
    }

    console.log('TOURNAMENT API GET:', {
        id,
        url,
        sport,
        tournamentId,
        stageId,
        templateId,
        seasonId,
        requestedSeason,
        drawStageId,
        hasLocalTournament: !!localTournament,
        hasDbTournament: !!dbTournamentMeta,
    });
    console.log('ID Parsing:', { hasFsPrefix, rawId });

    const isBlockedTournament =
        isBlockedTournamentId(id) ||
        isBlockedTournamentId(tournamentId) ||
        isBlockedTournamentId(stageId) ||
        isBlockedTournamentId(dbTournamentMeta?.id) ||
        isBlockedTournamentId(dbTournamentMeta?.slug);

    if (isBlockedTournament) {
        return perf.json(
            { ok: false, error: 'Tournament not found' },
            { status: 404 }
        );
    }

    let details: any = null;
    const espnLeague = isAmericanFootballSport(resolvedSportId)
        ? inferEspnAmericanFootballLeague({
            id,
            externalId: dbTournamentMeta?.external_id,
            tournamentUrl: url || dbTournamentMeta?.url || localTournament?.url,
            name: dbTournamentMeta?.display_name || dbTournamentMeta?.name || localTournament?.name,
            ruleset: dbTournamentMeta?.ruleset || localTournament?.ruleset,
        })
        : null;
    const espnMotorsportLeague = isMotorsportSport(resolvedSportId)
        ? inferEspnMotorsportLeague({
            id,
            externalId: dbTournamentMeta?.external_id,
            tournamentUrl: url || dbTournamentMeta?.url || localTournament?.url,
            name: dbTournamentMeta?.display_name || dbTournamentMeta?.name || localTournament?.name,
            ruleset: dbTournamentMeta?.ruleset || localTournament?.ruleset,
        })
        : null;
    const espnSoccerLeague =
        parseEspnFootballTournamentId(id) ||
        parseEspnFootballTournamentId(dbTournamentMeta?.external_id) ||
        (isFootballSport(resolvedSportId)
            ? inferEspnFootballLeague({
                id,
                externalId: dbTournamentMeta?.external_id,
                tournamentUrl: url || dbTournamentMeta?.url || localTournament?.url,
                name: dbTournamentMeta?.display_name || dbTournamentMeta?.name || localTournament?.name,
            })
            : null);

    const fihCompetition = parseFihTournamentId(id) || parseFihTournamentId(dbTournamentMeta?.external_id);
    const fisuCompetition = parseFisuTournamentId(id) || parseFisuTournamentId(dbTournamentMeta?.external_id);

    try {
        // Mundial Universitario de Seven 2026: la fuente es la FISU (Bornan).
        // Igual que el Mundial de hockey, el id ya dice qué competencia es y el
        // torneo no vive en FlashScore ni en la base.
        if (fisuCompetition) {
            const bundle = await getFisuRugbySevensTournamentBundle(fisuCompetition);

            return perf.json({
                ok: true,
                _debug: {
                    query: { id, url, sport, requestedSeason },
                    resolvedIds: bundle.ids,
                    provider: 'fisu',
                    counts: {
                        results: bundle.results.length,
                        fixtures: bundle.fixtures.length,
                        standings: bundle.standings.length,
                    },
                },
                _cache: {
                    entityId: bundle.ids.tournamentId,
                    tabSources: {
                        details: 'api',
                        results: 'api',
                        fixtures: 'api',
                        standings: 'api',
                    },
                },
                ids: bundle.ids,
                details: bundle.details,
                results: bundle.results,
                fixtures: bundle.fixtures,
                standings: bundle.standings,
                standingsForm: bundle.standingsForm,
                standingsHtFt: bundle.standingsHtFt,
                standingsOverUnder: bundle.standingsOverUnder,
                teamLabels: bundle.teamLabels,
                topScorers: bundle.topScorers,
                draw: bundle.draw,
                archives: bundle.archives,
            });
        }

        // Mundial de Hockey 2026: la fuente es la FIH (Altius RT). No pasa por la
        // resolución de IDs de FlashScore porque el torneo no vive en FlashScore:
        // el id ya dice qué competencia es.
        if (fihCompetition) {
            const bundle = await getFihWorldCupTournamentBundle(fihCompetition);

            return perf.json({
                ok: true,
                _debug: {
                    query: { id, url, sport, requestedSeason },
                    resolvedIds: bundle.ids,
                    provider: 'fih',
                    counts: {
                        results: bundle.results.length,
                        fixtures: bundle.fixtures.length,
                        standings: bundle.standings.length,
                    },
                },
                _cache: {
                    entityId: bundle.ids.tournamentId,
                    tabSources: {
                        details: 'api',
                        results: 'api',
                        fixtures: 'api',
                        standings: 'api',
                    },
                },
                ids: bundle.ids,
                details: bundle.details,
                results: bundle.results,
                fixtures: bundle.fixtures,
                standings: bundle.standings,
                standingsForm: bundle.standingsForm,
                standingsHtFt: bundle.standingsHtFt,
                standingsOverUnder: bundle.standingsOverUnder,
                teamLabels: bundle.teamLabels,
                topScorers: bundle.topScorers,
                draw: bundle.draw,
                archives: bundle.archives,
            });
        }

        if (espnSoccerLeague) {
            const seasonYear = (() => {
                const raw = String(requestedSeason ?? '').trim();
                if (!raw) return undefined;
                const num = Number(raw);
                return Number.isFinite(num) && num >= 1900 && num <= 2200 ? num : undefined;
            })();
            const bundle = await getEspnFootballTournamentBundle(espnSoccerLeague, { season: seasonYear, routeId: id });
            externalOverrideId = resolveExternalTournamentId({
                routeId: id,
                externalId: dbTournamentMeta?.external_id,
                sportId: resolvedSportId,
                ruleset: dbTournamentMeta?.ruleset || localTournament?.ruleset,
                flashScoreIds: {
                    tournamentId: bundle.ids?.tournamentId,
                    tournamentStageId: bundle.ids?.stageId,
                    tournamentTemplateId: bundle.ids?.templateId,
                    seasonId: bundle.ids?.seasonId,
                },
            });

            let detailsPayload: any = bundle.details;
            let standingsPayload: any = bundle.standings;
            let standingsFormPayload: any = bundle.standingsForm;
            let standingsHtFtPayload: any = bundle.standingsHtFt;
            let standingsOverUnderPayload: any = bundle.standingsOverUnder;
            let externalStandingsTeamLabels: any[] = Array.isArray(bundle.teamLabels) ? bundle.teamLabels : [];
            let externalStandingsFormTeamLabels: any[] = [];
            let externalStandingsHtFtTeamLabels: any[] = [];
            let externalStandingsOverUnderTeamLabels: any[] = [];
            let customStandingsTables: any[] = [];

            if (externalOverrideId) {
                const externalTournamentOverride = await getExternalTournamentOverride(externalOverrideId);
                if (externalTournamentOverride) {
                    detailsPayload = applyExternalTournamentOverride(
                        (detailsPayload && typeof detailsPayload === 'object')
                            ? detailsPayload
                            : {},
                        externalTournamentOverride,
                    );
                }

                const externalStandingsOverride = await getExternalTournamentStandingsOverride(externalOverrideId);
                if (externalStandingsOverride) {
                    const overriddenStandings = applyExternalTournamentStandingsOverrideSet(
                        {
                            standings: standingsPayload,
                            standingsForm: standingsFormPayload,
                            standingsHtFt: standingsHtFtPayload,
                            standingsOverUnder: standingsOverUnderPayload,
                        },
                        externalStandingsOverride,
                    );
                    standingsPayload = overriddenStandings.standings;
                    standingsFormPayload = overriddenStandings.standingsForm;
                    standingsHtFtPayload = overriddenStandings.standingsHtFt;
                    standingsOverUnderPayload = overriddenStandings.standingsOverUnder;
                    externalStandingsTeamLabels = overriddenStandings.teamLabels;
                    externalStandingsFormTeamLabels = overriddenStandings.standingsFormTeamLabels;
                    externalStandingsHtFtTeamLabels = overriddenStandings.standingsHtFtTeamLabels;
                    externalStandingsOverUnderTeamLabels = overriddenStandings.standingsOverUnderTeamLabels;
                    customStandingsTables = overriddenStandings.customTables;
                }
            }

            detailsPayload = applyDbTournamentPresentationOverrides(detailsPayload, dbTournamentMeta);

            return perf.json({
                ok: true,
                _debug: {
                    query: { id, url, sport, requestedSeason },
                    resolvedIds: bundle.ids,
                    externalOverrideId,
                    provider: 'espn',
                    league: espnSoccerLeague,
                    counts: {
                        results: Array.isArray(bundle.results) ? bundle.results.length : 0,
                        fixtures: Array.isArray(bundle.fixtures) ? bundle.fixtures.length : 0,
                        standings: Array.isArray(standingsPayload) ? standingsPayload.length : 0,
                    },
                },
                ids: {
                    ...bundle.ids,
                    drawStageId: bundle.ids?.stageId,
                },
                details: detailsPayload,
                results: bundle.results,
                fixtures: bundle.fixtures,
                standings: standingsPayload,
                standingsForm: standingsFormPayload,
                standingsHtFt: standingsHtFtPayload,
                standingsOverUnder: standingsOverUnderPayload,
                teamLabels: externalStandingsTeamLabels,
                standingsFormTeamLabels: externalStandingsFormTeamLabels,
                standingsHtFtTeamLabels: externalStandingsHtFtTeamLabels,
                standingsOverUnderTeamLabels: externalStandingsOverUnderTeamLabels,
                customStandingsTables,
                topScorers: bundle.topScorers,
                draw: bundle.draw,
                archives: bundle.archives,
            });
        }

        if (espnLeague) {
            const bundle = await getEspnAmericanFootballTournamentBundle(espnLeague);
            externalOverrideId = resolveExternalTournamentId({
                routeId: id,
                externalId: dbTournamentMeta?.external_id,
                sportId: resolvedSportId,
                ruleset: dbTournamentMeta?.ruleset || localTournament?.ruleset,
                flashScoreIds: {
                    tournamentId: bundle.ids?.tournamentId,
                    tournamentStageId: bundle.ids?.stageId,
                    tournamentTemplateId: bundle.ids?.templateId,
                    seasonId: bundle.ids?.seasonId,
                },
            });

            let detailsPayload: any = bundle.details;
            let standingsPayload: any = bundle.standings;
            let standingsFormPayload: any = bundle.standingsForm;
            let standingsHtFtPayload: any = bundle.standingsHtFt;
            let standingsOverUnderPayload: any = bundle.standingsOverUnder;
            let externalStandingsTeamLabels: any[] = [];
            let externalStandingsFormTeamLabels: any[] = [];
            let externalStandingsHtFtTeamLabels: any[] = [];
            let externalStandingsOverUnderTeamLabels: any[] = [];
            let customStandingsTables: any[] = [];

            if (externalOverrideId) {
                const externalTournamentOverride = await getExternalTournamentOverride(externalOverrideId);
                if (externalTournamentOverride) {
                    detailsPayload = applyExternalTournamentOverride(
                        (detailsPayload && typeof detailsPayload === 'object')
                            ? detailsPayload
                            : {},
                        externalTournamentOverride,
                    );
                }

                const externalStandingsOverride = await getExternalTournamentStandingsOverride(externalOverrideId);
                if (externalStandingsOverride) {
                    const overriddenStandings = applyExternalTournamentStandingsOverrideSet(
                        {
                            standings: standingsPayload,
                            standingsForm: standingsFormPayload,
                            standingsHtFt: standingsHtFtPayload,
                            standingsOverUnder: standingsOverUnderPayload,
                        },
                        externalStandingsOverride,
                    );
                    standingsPayload = overriddenStandings.standings;
                    standingsFormPayload = overriddenStandings.standingsForm;
                    standingsHtFtPayload = overriddenStandings.standingsHtFt;
                    standingsOverUnderPayload = overriddenStandings.standingsOverUnder;
                    externalStandingsTeamLabels = overriddenStandings.teamLabels;
                    externalStandingsFormTeamLabels = overriddenStandings.standingsFormTeamLabels;
                    externalStandingsHtFtTeamLabels = overriddenStandings.standingsHtFtTeamLabels;
                    externalStandingsOverUnderTeamLabels = overriddenStandings.standingsOverUnderTeamLabels;
                    customStandingsTables = overriddenStandings.customTables;
                }
            }

            detailsPayload = applyDbTournamentPresentationOverrides(detailsPayload, dbTournamentMeta);

            try {
                persistFromTournamentPayload({
                    ids: {
                        tournamentId: bundle.ids?.tournamentId,
                        seasonId: bundle.ids?.seasonId != null ? String(bundle.ids.seasonId) : undefined,
                    },
                    sport,
                    details: detailsPayload,
                    standings: standingsPayload,
                    fixtures: bundle.fixtures,
                    results: bundle.results,
                    topScorers: bundle.topScorers,
                });
            } catch (persistError) {
                console.warn('Catalog persist failed:', persistError);
            }

            const snapshotEntityId = bundle.ids?.tournamentId || id || url || 'unknown';

            return perf.json({
                ok: true,
                _debug: {
                    query: { id, url, sport, requestedSeason },
                    resolvedIds: bundle.ids,
                    externalOverrideId,
                    provider: 'espn',
                    league: espnLeague,
                    counts: {
                        results: Array.isArray(bundle.results) ? bundle.results.length : 0,
                        fixtures: Array.isArray(bundle.fixtures) ? bundle.fixtures.length : 0,
                        standings: Array.isArray(standingsPayload) ? standingsPayload.length : 0,
                        topScorers: Array.isArray(bundle.topScorers) ? bundle.topScorers.length : 0,
                    },
                },
                _cache: {
                    entityId: snapshotEntityId,
                    tabSources: {
                        details: 'api',
                        results: 'api',
                        fixtures: 'api',
                        standings: 'api',
                        standingsForm: 'api',
                        standingsHtFt: 'api',
                        standingsOverUnder: 'api',
                        topScorers: 'api',
                        draw: 'api',
                        archives: 'api',
                    },
                },
                ids: {
                    ...bundle.ids,
                    drawStageId: bundle.ids?.stageId,
                },
                details: detailsPayload,
                results: bundle.results,
                fixtures: bundle.fixtures,
                standings: standingsPayload,
                standingsForm: standingsFormPayload,
                standingsHtFt: standingsHtFtPayload,
                standingsOverUnder: standingsOverUnderPayload,
                teamLabels: externalStandingsTeamLabels,
                standingsFormTeamLabels: externalStandingsFormTeamLabels,
                standingsHtFtTeamLabels: externalStandingsHtFtTeamLabels,
                standingsOverUnderTeamLabels: externalStandingsOverUnderTeamLabels,
                customStandingsTables,
                topScorers: bundle.topScorers,
                draw: bundle.draw,
                archives: bundle.archives,
            });
        }

        if (espnMotorsportLeague) {
            const bundle = await getEspnMotorsportTournamentBundle(espnMotorsportLeague);
            externalOverrideId = resolveExternalTournamentId({
                routeId: id,
                externalId: dbTournamentMeta?.external_id,
                sportId: resolvedSportId,
                ruleset: dbTournamentMeta?.ruleset || localTournament?.ruleset,
                flashScoreIds: {
                    tournamentId: bundle.ids?.tournamentId,
                    tournamentStageId: bundle.ids?.stageId,
                    tournamentTemplateId: bundle.ids?.templateId,
                    seasonId: bundle.ids?.seasonId,
                },
            });

            let detailsPayload: any = bundle.details;
            let standingsPayload: any = bundle.standings;
            let standingsFormPayload: any = bundle.standingsForm;
            let standingsHtFtPayload: any = bundle.standingsHtFt;
            let standingsOverUnderPayload: any = bundle.standingsOverUnder;
            let externalStandingsTeamLabels: any[] = [];
            let externalStandingsFormTeamLabels: any[] = [];
            let externalStandingsHtFtTeamLabels: any[] = [];
            let externalStandingsOverUnderTeamLabels: any[] = [];
            let customStandingsTables: any[] = [];

            if (externalOverrideId) {
                const externalTournamentOverride = await getExternalTournamentOverride(externalOverrideId);
                if (externalTournamentOverride) {
                    detailsPayload = applyExternalTournamentOverride(
                        (detailsPayload && typeof detailsPayload === 'object')
                            ? detailsPayload
                            : {},
                        externalTournamentOverride,
                    );
                }

                const externalStandingsOverride = await getExternalTournamentStandingsOverride(externalOverrideId);
                if (externalStandingsOverride) {
                    const overriddenStandings = applyExternalTournamentStandingsOverrideSet(
                        {
                            standings: standingsPayload,
                            standingsForm: standingsFormPayload,
                            standingsHtFt: standingsHtFtPayload,
                            standingsOverUnder: standingsOverUnderPayload,
                        },
                        externalStandingsOverride,
                    );
                    standingsPayload = overriddenStandings.standings;
                    standingsFormPayload = overriddenStandings.standingsForm;
                    standingsHtFtPayload = overriddenStandings.standingsHtFt;
                    standingsOverUnderPayload = overriddenStandings.standingsOverUnder;
                    externalStandingsTeamLabels = overriddenStandings.teamLabels;
                    externalStandingsFormTeamLabels = overriddenStandings.standingsFormTeamLabels;
                    externalStandingsHtFtTeamLabels = overriddenStandings.standingsHtFtTeamLabels;
                    externalStandingsOverUnderTeamLabels = overriddenStandings.standingsOverUnderTeamLabels;
                    customStandingsTables = overriddenStandings.customTables;
                }
            }

            detailsPayload = applyDbTournamentPresentationOverrides(detailsPayload, dbTournamentMeta);

            try {
                persistFromTournamentPayload({
                    ids: {
                        tournamentId: bundle.ids?.tournamentId,
                        seasonId: bundle.ids?.seasonId != null ? String(bundle.ids.seasonId) : undefined,
                    },
                    sport,
                    details: detailsPayload,
                    standings: standingsPayload,
                    fixtures: bundle.fixtures,
                    results: bundle.results,
                    topScorers: bundle.topScorers,
                });
            } catch (persistError) {
                console.warn('Catalog persist failed:', persistError);
            }

            const snapshotEntityId = bundle.ids?.tournamentId || id || url || 'unknown';

            return perf.json({
                ok: true,
                _debug: {
                    query: { id, url, sport, requestedSeason },
                    resolvedIds: bundle.ids,
                    externalOverrideId,
                    provider: 'espn',
                    league: espnMotorsportLeague,
                    counts: {
                        results: Array.isArray(bundle.results) ? bundle.results.length : 0,
                        fixtures: Array.isArray(bundle.fixtures) ? bundle.fixtures.length : 0,
                        standings: Array.isArray(standingsPayload) ? standingsPayload.length : 0,
                        topScorers: Array.isArray(bundle.topScorers) ? bundle.topScorers.length : 0,
                    },
                },
                _cache: {
                    entityId: snapshotEntityId,
                    tabSources: {
                        details: 'api',
                        results: 'api',
                        fixtures: 'api',
                        standings: 'api',
                        standingsForm: 'api',
                        standingsHtFt: 'api',
                        standingsOverUnder: 'api',
                        topScorers: 'api',
                        draw: 'api',
                        archives: 'api',
                    },
                },
                ids: {
                    ...bundle.ids,
                    drawStageId: bundle.ids?.stageId,
                },
                details: detailsPayload,
                results: bundle.results,
                fixtures: bundle.fixtures,
                standings: standingsPayload,
                standingsForm: standingsFormPayload,
                standingsHtFt: standingsHtFtPayload,
                standingsOverUnder: standingsOverUnderPayload,
                teamLabels: externalStandingsTeamLabels,
                standingsFormTeamLabels: externalStandingsFormTeamLabels,
                standingsHtFtTeamLabels: externalStandingsHtFtTeamLabels,
                standingsOverUnderTeamLabels: externalStandingsOverUnderTeamLabels,
                customStandingsTables,
                topScorers: bundle.topScorers,
                draw: bundle.draw,
                archives: bundle.archives,
            });
        }

        if (flashScoreEnabledForSport && hasFsPrefix && rawId && !stageId && !url) {
            console.log('Attempting details with rawId as stageId:', rawId);
            const detailsAttemptRes = await getTournamentDetails(rawId);
            const detailsAttempt = normalizeDetails(detailsAttemptRes);
            console.log('Details attempt result:', detailsAttempt ? 'Found' : 'Not found');
            if (detailsAttempt) {
                const extracted = extractIds(detailsAttempt);
                const detailsUrl = extractUrl(detailsAttempt);
                if (extracted.stageId || extracted.tournamentId || detailsUrl) {
                    details = detailsAttempt;
                    tournamentId = extracted.tournamentId || tournamentId;
                    seasonId = extracted.seasonId || seasonId;
                    templateId = extracted.templateId || templateId;
                    stageId = extracted.stageId || stageId || rawId;
                    drawStageId = extracted.drawStageId || drawStageId;
                    if (detailsUrl) {
                        url = url || detailsUrl;
                    }
                }
            }
        }

        if (flashScoreEnabledForSport && stageId && !details) {
            const detailsRes = await getTournamentDetails(stageId);
            details = normalizeDetails(detailsRes);

            if (details) {
                const extracted = extractIds(details);
                tournamentId = extracted.tournamentId || tournamentId;
                seasonId = extracted.seasonId || seasonId;
                templateId = extracted.templateId || templateId;
                stageId = extracted.stageId || stageId;
                drawStageId = extracted.drawStageId || drawStageId;

                const detailsUrl = extractUrl(details);
                if (detailsUrl) {
                    const idsRes = await getTournamentIds(detailsUrl);
                    const idsData = idsRes?.DATA || idsRes;
                    if (Array.isArray(idsData) && idsData.length > 0) {
                        const first = idsData[0];
                        tournamentId = first.tournament_id || tournamentId;
                        seasonId = first.season_id || seasonId;
                        templateId = first.tournament_template_id || templateId;
                        stageId = first.tournament_stage_id || stageId;
                        drawStageId = extractIds(first).drawStageId || drawStageId;
                    } else if (idsData && typeof idsData === 'object') {
                        tournamentId = idsData.tournament_id || tournamentId;
                        seasonId = idsData.season_id || seasonId;
                        templateId = idsData.tournament_template_id || templateId;
                        stageId = idsData.tournament_stage_id || stageId;
                        drawStageId = extractIds(idsData).drawStageId || drawStageId;
                    }
                }
            }
        }

        if (flashScoreEnabledForSport && tournamentId && (!stageId || !templateId || !seasonId || !url)) {
            const resolved = await resolveIdsFromTournamentId(tournamentId, sport, url);
            tournamentId = resolved.tournamentId || tournamentId;
            seasonId = resolved.seasonId || seasonId;
            templateId = resolved.templateId || templateId;
            stageId = resolved.stageId || stageId;
            drawStageId = resolved.drawStageId || drawStageId;
            if (resolved.tournamentUrl) {
                url = url || resolved.tournamentUrl;
            }
        }

        if (flashScoreEnabledForSport && url && (!templateId || !seasonId || !stageId || !tournamentId)) {
            let idsRes = await getTournamentIds(url);
            let idsData = idsRes?.DATA || idsRes;

            // --- PROACTIVE FIX: If no IDs found and URL is just a slug, try common patterns ---
            const urlPath = url.startsWith('http') ? new URL(url).pathname : url;
            const urlSegments = urlPath.split('/').filter(Boolean);

            if ((!idsData || (Array.isArray(idsData) && idsData.length === 0)) && urlSegments.length <= 2) {
                const slug = urlSegments[urlSegments.length - 1];
                if (slug) {
                    const attempts: string[] = [];
                    if (sport === 'rugby' || sport === 'rugby-union' || sport === 'rugby-league') {
                        const rugbySportCandidates = getFlashScoreSportCandidates(sport, url);
                        if (rugbySportCandidates.includes('rugby-union')) {
                            attempts.push(`/rugby-union/south-america/${slug}/`);
                            attempts.push(`/rugby-union/world/${slug}/`);
                            attempts.push(`/rugby-union/europe/${slug}/`);
                        }
                        if (rugbySportCandidates.includes('rugby-league')) {
                            attempts.push(`/rugby-league/world/${slug}/`);
                            attempts.push(`/rugby-league/europe/${slug}/`);
                            attempts.push(`/rugby-league/australia/${slug}/`);
                        }
                    } else if (sport === 'football') {
                        attempts.push(`/football/europe/${slug}/`);
                        attempts.push(`/football/south-america/${slug}/`);
                        attempts.push(`/football/world/${slug}/`);
                    } else if (sport === 'basketball') {
                        attempts.push(`/basketball/south-america/${slug}/`);
                        attempts.push(`/basketball/world/${slug}/`);
                        attempts.push(`/basketball/europe/${slug}/`);
                    } else if (sport === 'hockey' || sport === 'field-hockey') {
                        attempts.push(`/hockey/south-america/${slug}/`);
                        attempts.push(`/hockey/world/${slug}/`);
                        attempts.push(`/hockey/europe/${slug}/`);
                    } else if (sport === 'volleyball') {
                        attempts.push(`/volleyball/south-america/${slug}/`);
                        attempts.push(`/volleyball/world/${slug}/`);
                        attempts.push(`/volleyball/europe/${slug}/`);
                    } else if (sport === 'handball') {
                        attempts.push(`/handball/europe/${slug}/`);
                        attempts.push(`/handball/world/${slug}/`);
                    } else if (sport === 'tennis') {
                        attempts.push(`/tennis/atp-singles/${slug}/`);
                        attempts.push(`/tennis/wta-singles/${slug}/`);
                    } else if (sport === 'american-football') {
                        attempts.push(`/american-football/usa/${slug}/`);
                        attempts.push(`/american-football/world/${slug}/`);
                    } else if (sport === 'baseball') {
                        attempts.push(`/baseball/usa/${slug}/`);
                        attempts.push(`/baseball/world/${slug}/`);
                    } else {
                        // Generic fallback for unknown sports
                        attempts.push(`/${sport}/world/${slug}/`);
                        attempts.push(`/${sport}/south-america/${slug}/`);
                    }

                    for (const altUrl of attempts) {
                        console.log(`[Tournament API] RETRY with alt URL: ${altUrl}`);
                        const altRes = await getTournamentIds(altUrl);
                        const altData = altRes?.DATA || altRes;
                        if (altData && (!Array.isArray(altData) || altData.length > 0)) {
                            console.log(`[Tournament API] Found data with alt URL: ${altUrl}`);
                            idsRes = altRes;
                            idsData = altData;
                            url = altUrl;
                            break;
                        }
                    }
                }
            }

            if (Array.isArray(idsData) && idsData.length > 0) {
                const first = idsData[0];
                tournamentId = first.tournament_id || tournamentId;
                seasonId = first.season_id || seasonId;
                templateId = first.tournament_template_id || templateId;
                stageId = first.tournament_stage_id || stageId;
                drawStageId = extractIds(first).drawStageId || drawStageId;
            } else if (idsData && typeof idsData === 'object' && Object.keys(idsData).length > 0) {
                tournamentId = idsData.tournament_id || tournamentId;
                seasonId = idsData.season_id || seasonId;
                templateId = idsData.tournament_template_id || templateId;
                stageId = idsData.tournament_stage_id || stageId;
                drawStageId = extractIds(idsData).drawStageId || drawStageId;
            }
        }

        tournamentId = stripFsPrefix(tournamentId);
        stageId = stripFsPrefix(stageId);

        // FlashScore splits a competition into stages and only one of them carries the
        // standings table (the "Main" stage). `stageId` here is the provider's *current*
        // stage — for a tournament in its knockout phase that's "Play Offs", which has a
        // bracket but no table. Resolve the full stage list from the shared tournament URL
        // so standings can come from the stage that actually holds them, while the bracket
        // keeps using the current stage.
        const stageBundle = flashScoreEnabledForSport && url
            ? await resolveTournamentStages(url)
            : EMPTY_STAGE_BUNDLE;
        // Pero esa URL apunta siempre a la temporada CORRIENTE del proveedor. Cuando
        // la que estamos mostrando es otra —ids fijados en el catálogo o en el ruleset
        // del torneo— sus etapas son de otro año, y pedir la tabla contra la "Main"
        // de la temporada nueva devuelve el plantel entero en cero mientras los
        // resultados siguen mostrando la vieja. Ante la duda, la etapa que ya teníamos.
        const stageBundleIsSameSeason =
            (!stageBundle.tournamentId || !tournamentId || sameProviderId(stageBundle.tournamentId, tournamentId)) &&
            (!stageBundle.seasonId || !seasonId || sameProviderId(stageBundle.seasonId, seasonId));
        const tournamentStages = stageBundleIsSameSeason ? stageBundle.stages : [];
        let standingsTournamentId = tournamentId;
        let standingsStageId = pickStandingsStageId(tournamentStages, stageId);

        // Selector de temporada: si piden una que no es la corriente, los ids que
        // tenemos son de otro año y la tabla saldría de la edición equivocada.
        // Los resultados no tienen ese problema —van por `template + season`— así
        // que se usan de puente (ver resolveSeasonScopedIds). La llamada extra es
        // una sola y comparte caché con el fetch de resultados de más abajo.
        const pideTemporadaPasada = Boolean(
            requestedSeason
            && stageBundle.seasonId
            && !sameProviderId(requestedSeason, stageBundle.seasonId),
        );
        if (flashScoreEnabledForSport && pideTemporadaPasada && templateId && seasonId) {
            const previos = await getTournamentResults(templateId, seasonId).catch(() => null);
            const crudos = previos?.DATA ?? previos ?? [];
            const planos = Array.isArray(crudos)
                ? crudos.flatMap((fila: any) => (Array.isArray(fila?.matches) ? fila.matches : [fila]))
                : [];
            const propios = await resolveSeasonScopedIds(planos);
            if (propios.tournamentId && propios.stageId) {
                standingsTournamentId = propios.tournamentId;
                standingsStageId = propios.stageId;
            }
        }

        const canFetchMatches = flashScoreEnabledForSport && !!(templateId && seasonId);
        const canFetchStandings = flashScoreEnabledForSport && !!(standingsTournamentId && standingsStageId);
        const canFetchDraw = flashScoreEnabledForSport && !!(tournamentId && stageId); // Use stageId instead of drawStageId
        const canFetchArchives = flashScoreEnabledForSport && !!stageId;
        externalOverrideId = resolveExternalTournamentId({
            routeId: id,
            externalId: dbTournamentMeta?.external_id,
            sportId: dbTournamentMeta?.sport_id || localTournament?.sportId || sport,
            ruleset: dbTournamentMeta?.ruleset || localTournament?.ruleset,
            flashScoreIds: {
                tournamentId,
                tournamentStageId: stageId,
                tournamentTemplateId: templateId,
                seasonId,
            },
        });
        const detailsPromise = flashScoreEnabledForSport && stageId && !details
            ? getTournamentDetails(stageId)
            : Promise.resolve(details);

        const snapshotEntityId = tournamentId || stageId || id || url || 'unknown';
        const snapshotKey = { entityType: 'tournament' as const, entityId: snapshotEntityId };
        const tabSources: Record<string, 'api' | 'snapshot' | 'empty'> = {};

        const resolveTab = (tab: string, payload: any, fetchOk: boolean) => {
            const snapshot = getTabSnapshot({ ...snapshotKey, tab });
            const hasData = hasMeaningfulPayload(payload);

            if (!fetchOk || (!hasData && snapshot)) {
                tabSources[tab] = snapshot ? 'snapshot' : 'empty';
                return snapshot?.payload ?? (Array.isArray(payload) ? [] : payload ?? null);
            }

            if (hasData) {
                upsertTabSnapshot({ ...snapshotKey, tab, payload, fetchStatus: 'ok' });
                tabSources[tab] = 'api';
                return payload;
            }

            tabSources[tab] = 'empty';
            return Array.isArray(payload) ? [] : payload ?? null;
        };

        const settled = await Promise.allSettled([
            canFetchMatches ? timedTab('results', getTournamentResults(templateId!, seasonId!)) : Promise.resolve([]),
            canFetchMatches ? timedTab('fixtures', getTournamentFixtures(templateId!, seasonId!)) : Promise.resolve([]),
            canFetchStandings ? timedTab('standings', getTournamentStandings(standingsTournamentId!, standingsStageId!)) : Promise.resolve([]),
            canFetchStandings ? timedTab('topScorers', getTournamentTopScorers(standingsTournamentId!, standingsStageId!)) : Promise.resolve([]),
            canFetchStandings ? timedTab('standingsForm', getTournamentStandingsForm(standingsTournamentId!, standingsStageId!)) : Promise.resolve([]),
            canFetchStandings ? timedTab('standingsHtFt', getTournamentStandingsHtFt(standingsTournamentId!, standingsStageId!)) : Promise.resolve([]),
            canFetchStandings ? timedTab('standingsOverUnder', getTournamentStandingsOverUnder(standingsTournamentId!, standingsStageId!)) : Promise.resolve([]),
            timedTab('details', detailsPromise),
            canFetchDraw ? timedTab('draw', getTournamentDraw(tournamentId!, stageId!)) : Promise.resolve([]),
            canFetchArchives ? timedTab('archives', getTournamentArchives(stageId!)) : Promise.resolve([])
        ]);

        const resultsRes = settled[0].status === 'fulfilled' ? settled[0].value : null;
        const fixturesRes = settled[1].status === 'fulfilled' ? settled[1].value : null;
        const standingsRes = settled[2].status === 'fulfilled' ? settled[2].value : null;
        const topScorersRes = settled[3].status === 'fulfilled' ? settled[3].value : null;
        const standingsFormRes = settled[4].status === 'fulfilled' ? settled[4].value : null;
        const standingsHtFtRes = settled[5].status === 'fulfilled' ? settled[5].value : null;
        const standingsOverUnderRes = settled[6].status === 'fulfilled' ? settled[6].value : null;
        const detailsRes = settled[7].status === 'fulfilled' ? settled[7].value : null;
        const drawRes = settled[8].status === 'fulfilled' ? settled[8].value : null;
        const archivesRes = settled[9].status === 'fulfilled' ? settled[9].value : null;

        const resultsFetchOk = canFetchMatches && settled[0].status === 'fulfilled';
        const fixturesFetchOk = canFetchMatches && settled[1].status === 'fulfilled';
        const standingsFetchOk = canFetchStandings && settled[2].status === 'fulfilled';
        const topScorersFetchOk = canFetchStandings && settled[3].status === 'fulfilled';
        const standingsFormFetchOk = canFetchStandings && settled[4].status === 'fulfilled';
        const standingsHtFtFetchOk = canFetchStandings && settled[5].status === 'fulfilled';
        const standingsOverUnderFetchOk = canFetchStandings && settled[6].status === 'fulfilled';
        const detailsFetchOk = settled[7].status === 'fulfilled';
        const drawFetchOk = canFetchDraw && settled[8].status === 'fulfilled';
        const archivesFetchOk = canFetchArchives && settled[9].status === 'fulfilled';

        // Una pestaña vacía puede serlo por dos motivos muy distintos: el torneo
        // no tiene nada cargado, o nunca pudimos preguntarle al proveedor. Sin
        // separarlos la página pinta lo mismo en los dos casos.
        const attemptedSettlements = [
            canFetchMatches ? settled[0] : null,
            canFetchMatches ? settled[1] : null,
            canFetchStandings ? settled[2] : null,
            canFetchStandings ? settled[3] : null,
            canFetchStandings ? settled[4] : null,
            canFetchStandings ? settled[5] : null,
            canFetchStandings ? settled[6] : null,
            settled[7],
            canFetchDraw ? settled[8] : null,
            canFetchArchives ? settled[9] : null,
        ].filter(Boolean) as PromiseSettledResult<any>[];
        const providerRejections = attemptedSettlements.filter((s) => s.status === 'rejected').length;
        const couldAskProvider = canFetchMatches || canFetchStandings;

        let detailsPayload = resolveTab('details', normalizeDetails(detailsRes) || details, detailsFetchOk);
        const resultsPayload = sortMatchesByDate(
            resolveTab('results', resultsRes?.DATA || resultsRes || [], resultsFetchOk) || [],
            'desc',
        );
        const fixturesPayload = sortMatchesByDate(
            resolveTab('fixtures', fixturesRes?.DATA || fixturesRes || [], fixturesFetchOk) || [],
            'asc',
        );
        const standingsFormPayload = resolveTab('standingsForm', standingsFormRes?.DATA || standingsFormRes || [], standingsFormFetchOk);
        const standingsHtFtPayload = resolveTab('standingsHtFt', standingsHtFtRes?.DATA || standingsHtFtRes || [], standingsHtFtFetchOk);
        const standingsOverUnderPayload = resolveTab('standingsOverUnder', standingsOverUnderRes?.DATA || standingsOverUnderRes || [], standingsOverUnderFetchOk);
        const topScorersPayload = resolveTab('topScorers', topScorersRes?.DATA || topScorersRes || [], topScorersFetchOk);
        const drawPayload = resolveTab('draw', drawRes?.DATA || drawRes || [], drawFetchOk);
        const archivesPayload = resolveTab('archives', archivesRes?.DATA || archivesRes || [], archivesFetchOk);
        // Penalty-shootout enrichment. Results/draw payloads carry only the
        // regulation score; the shootout lives in match details. Detect the
        // candidates from RESULTS (a finished knockout that ended level went to
        // penalties), pull the shootout once, then splice it into both the
        // results rows and the bracket (whose `draw` scores are aggregates, so we
        // also correct them back to the regulation score).
        try {
            const resultsArr = Array.isArray(resultsPayload) ? resultsPayload : [];
            const drawRounds = Array.isArray(drawPayload) ? drawPayload : [];
            const matchKey = (m: any) => String(m?.match_id ?? m?.id ?? m?.event_key ?? '');
            // Only knockout matches can go to penalties. Restrict candidates to
            // matches that are in the bracket (draw) AND ended level in results —
            // this skips group-stage / league draws so leagues pay no extra cost.
            const drawIds = new Set<string>();
            for (const round of drawRounds) {
                const roundMatches = (round as any)?.matches;
                if (Array.isArray(roundMatches)) {
                    for (const m of roundMatches) {
                        const k = matchKey(m);
                        if (k) drawIds.add(k);
                    }
                }
            }
            const candidateIds: string[] = [];
            for (const m of resultsArr) {
                const sc = (m as any)?.scores;
                const k = matchKey(m);
                if (k && drawIds.has(k) && sc && typeof sc.home === 'number' && typeof sc.away === 'number' && sc.home === sc.away) {
                    candidateIds.push(k);
                }
            }
            if (candidateIds.length > 0) {
                const penaltyMap = await fetchPenaltyInfoForMatchIds(candidateIds);
                if (penaltyMap.size > 0) {
                    const applyPenalties = (m: any, overrideRegulationScore: boolean) => {
                        const info = penaltyMap.get(matchKey(m));
                        if (!info) return;
                        if (!m.scores || typeof m.scores !== 'object') m.scores = {};
                        m.scores.penalties = info.penalties;
                        if (overrideRegulationScore) {
                            if (typeof info.regHome === 'number') m.scores.home = info.regHome;
                            if (typeof info.regAway === 'number') m.scores.away = info.regAway;
                        }
                    };
                    for (const m of resultsArr) applyPenalties(m, false);
                    for (const round of drawRounds) {
                        const roundMatches = (round as any)?.matches;
                        if (Array.isArray(roundMatches)) {
                            for (const m of roundMatches) applyPenalties(m, true);
                        }
                    }
                }
            }
        } catch (penaltyEnrichError) {
            console.error('[tournaments] penalty enrichment failed:', penaltyEnrichError);
        }

        const teamAssets = buildStandingsTeamAssetMap(
            Array.isArray(resultsPayload) ? resultsPayload : [],
            Array.isArray(fixturesPayload) ? fixturesPayload : [],
        );

        // A tournament runs several brackets side by side — Play Offs, 5th-8th places,
        // 9th-12th places… — and the draw endpoint only ever returns the one for the stage
        // it is asked about. Fetch every non-league stage so the UI can switch between them
        // instead of showing whichever one happens to be active.
        const bracketStages = tournamentStages.filter((stage) => !MAIN_STAGE_NAME_RE.test(stage.name));
        const brackets = canFetchDraw && bracketStages.length > 0
            ? (await Promise.all(
                bracketStages.map(async (stage) => {
                    const rounds = stage.id === stageId
                        ? drawPayload
                        : await getTournamentDraw(tournamentId!, stage.id)
                            .then((res: any) => res?.DATA || res || [])
                            .catch(() => []);
                    return {
                        stageId: stage.id,
                        name: stage.name,
                        active: stage.id === stageId,
                        rounds: repairBracketRounds(rounds, teamAssets),
                    };
                }),
            )).filter((bracket) => roundsHaveMatches(bracket.rounds))
            : [];

        const bracketDrawPayload = brackets.find((bracket) => bracket.stageId === stageId)?.rounds
            ?? repairBracketRounds(drawPayload, teamAssets);

        const standingsSnapshot = getTabSnapshot({ ...snapshotKey, tab: 'standings' });
        const rawStandings = standingsFetchOk ? (standingsRes?.DATA || standingsRes || []) : null;
        let standingsSource: 'api' | 'snapshot' | 'empty' = 'empty';

        if (!standingsFetchOk || (!hasMeaningfulPayload(rawStandings) && standingsSnapshot)) {
            standingsSource = standingsSnapshot ? 'snapshot' : 'empty';
        } else {
            standingsSource = 'api';
        }

        const baseStandings = standingsSource === 'snapshot' ? (standingsSnapshot?.payload || []) : (rawStandings || []);
        const fallbackCalculatedStandings =
            resolvedSportId === 'basketball' && !hasMeaningfulPayload(baseStandings)
                ? buildLocalFallbackStandings(
                    resolvedSportId,
                    Array.isArray(resultsPayload) ? resultsPayload : [],
                    Array.isArray(fixturesPayload) ? fixturesPayload : [],
                    dbTournamentMeta?.ruleset || localTournament?.ruleset,
                )
                : [];
        const standingsBasePayload = groupFlatStandings(
            hasMeaningfulPayload(baseStandings) ? baseStandings : fallbackCalculatedStandings,
        );
        const preparedStandings = enrichStandingsRowsWithTeamAssets(standingsBasePayload, teamAssets);
        let finalStandings = preparedStandings;
        let finalStandingsForm = enrichStandingsRowsWithTeamAssets(groupFlatStandings(standingsFormPayload), teamAssets);
        let finalStandingsHtFt = enrichStandingsRowsWithTeamAssets(groupFlatStandings(standingsHtFtPayload), teamAssets);
        let finalStandingsOverUnder = enrichStandingsRowsWithTeamAssets(groupFlatStandings(standingsOverUnderPayload), teamAssets);
        let externalStandingsTeamLabels: any[] = [];
        let externalStandingsFormTeamLabels: any[] = [];
        let externalStandingsHtFtTeamLabels: any[] = [];
        let externalStandingsOverUnderTeamLabels: any[] = [];
        let customStandingsTables: any[] = [];

        if (externalOverrideId) {
            const externalTournamentOverride = await getExternalTournamentOverride(externalOverrideId);
            if (externalTournamentOverride) {
                detailsPayload = applyExternalTournamentOverride(
                    (detailsPayload && typeof detailsPayload === 'object')
                        ? detailsPayload
                        : {},
                    externalTournamentOverride,
                );
            }

            const externalStandingsOverride = await getExternalTournamentStandingsOverride(externalOverrideId);
            if (externalStandingsOverride) {
                const overriddenStandings = applyExternalTournamentStandingsOverrideSet(
                    {
                        standings: preparedStandings,
                        standingsForm: finalStandingsForm,
                        standingsHtFt: finalStandingsHtFt,
                        standingsOverUnder: finalStandingsOverUnder,
                    },
                    externalStandingsOverride,
                );
                finalStandings = overriddenStandings.standings;
                finalStandingsForm = overriddenStandings.standingsForm;
                finalStandingsHtFt = overriddenStandings.standingsHtFt;
                finalStandingsOverUnder = overriddenStandings.standingsOverUnder;
                externalStandingsTeamLabels = overriddenStandings.teamLabels;
                externalStandingsFormTeamLabels = overriddenStandings.standingsFormTeamLabels;
                externalStandingsHtFtTeamLabels = overriddenStandings.standingsHtFtTeamLabels;
                externalStandingsOverUnderTeamLabels = overriddenStandings.standingsOverUnderTeamLabels;
                customStandingsTables = overriddenStandings.customTables;
            }
        }

        detailsPayload = applyDbTournamentPresentationOverrides(detailsPayload, dbTournamentMeta);

        if (requestedName) {
            const currentDetails = detailsPayload && typeof detailsPayload === 'object'
                ? detailsPayload as Record<string, unknown>
                : {};
            detailsPayload = {
                ...currentDetails,
                name: currentDetails.name || requestedName,
                display_name: currentDetails.display_name || requestedName,
            };
        }

        console.log('FINAL RESOLVED:', {
            tournamentId, stageId, templateId, seasonId,
            hasDetails: !!detailsPayload,
            results: resultsPayload?.length || 0,
            standings: Array.isArray(finalStandings) ? finalStandings.length : 0
        });

        if (!flashScoreEnabledForSport) {
            tabSources.details = tabSources.details || 'empty';
            tabSources.results = tabSources.results || 'empty';
            tabSources.fixtures = tabSources.fixtures || 'empty';
            tabSources.standings = tabSources.standings || 'empty';
        }

        // --- Custom Re-grouping Logic ---
        const customConfigs = db.phaseConfigurations[id];

        if (customConfigs && customConfigs.length > 0) {
            const activePhase = customConfigs.find(p => p.status === 'published') || customConfigs[0];
            if ((activePhase.phaseType === 'groups' || activePhase.phaseType === 'league') && activePhase.groupAssignments) {
                const assignments = activePhase.groupAssignments;
                const groups: Record<number, any[]> = {};

                // Flatten all rows if they were already grouped, or just use them
                let allRows: any[] = [];
                if (finalStandings[0]?.rows) {
                    finalStandings.forEach((g: any) => allRows.push(...(g.rows || [])));
                } else {
                    allRows = finalStandings;
                }

                allRows.forEach(row => {
                    const team = row.team || row.participant || row;
                    const teamId = team.id || team.team_id || team.participant_id || team.name;
                    const groupIdx = assignments[teamId] ?? 0;

                    if (!groups[groupIdx]) groups[groupIdx] = [];
                    groups[groupIdx].push(row);
                });

                // Convert to FlashScore-like grouped format
                finalStandings = Object.keys(groups).sort().map(key => {
                    const idx = parseInt(key);
                    return {
                        group_name: `Grupo ${String.fromCharCode(65 + idx)}`,
                        rows: groups[idx].sort((a, b) => (a.position || 0) - (b.position || 0))
                    };
                });
            }
        }

        if ((standingsSource === 'api' || hasMeaningfulPayload(fallbackCalculatedStandings)) && hasMeaningfulPayload(preparedStandings)) {
            upsertTabSnapshot({ ...snapshotKey, tab: 'standings', payload: preparedStandings, fetchStatus: 'ok' });
            tabSources.standings = 'api';
        } else if (standingsSource === 'snapshot') {
            tabSources.standings = 'snapshot';
        } else {
            tabSources.standings = 'empty';
        }

        if (standingsFormFetchOk && hasMeaningfulPayload(finalStandingsForm)) {
            upsertTabSnapshot({ ...snapshotKey, tab: 'standingsForm', payload: finalStandingsForm, fetchStatus: 'ok' });
        }
        if (standingsHtFtFetchOk && hasMeaningfulPayload(finalStandingsHtFt)) {
            upsertTabSnapshot({ ...snapshotKey, tab: 'standingsHtFt', payload: finalStandingsHtFt, fetchStatus: 'ok' });
        }
        if (standingsOverUnderFetchOk && hasMeaningfulPayload(finalStandingsOverUnder)) {
            upsertTabSnapshot({ ...snapshotKey, tab: 'standingsOverUnder', payload: finalStandingsOverUnder, fetchStatus: 'ok' });
        }

        try {
            persistFromTournamentPayload({
                ids: { tournamentId, seasonId },
                sport,
                details: detailsPayload,
                standings: preparedStandings,
                fixtures: fixturesPayload,
                results: resultsPayload,
                topScorers: topScorersPayload
            });
        } catch (persistError) {
            console.warn('Catalog persist failed:', persistError);
        }

        logPerf(
            ['API', 'WARN'],
            {
                route: '/api/tournaments',
                reason: 'initial payload includes details + results + fixtures + standings + variants + draw + archives',
                duration: formatDurationMs(nowMs() - startedAt),
            },
            'server',
        );

        // Fire-and-forget: recordar los IDs resueltos para no volver a barrer nunca.
        // Gateado a un set COMPLETO + prueba de que los IDs trajeron datos reales
        // (nunca cacheamos una resolución vacía/rota).
        const resolutionProducedData =
            hasMeaningfulPayload(detailsPayload) ||
            (Array.isArray(resultsPayload) && resultsPayload.length > 0) ||
            (Array.isArray(fixturesPayload) && fixturesPayload.length > 0) ||
            hasMeaningfulPayload(finalStandings);
        if (flashScoreEnabledForSport && resolutionProducedData) {
            persistResolvedTournamentIds({
                routeId: id,
                ids: { tournamentId, stageId, templateId, seasonId, url },
                dbTournamentMeta,
            });
        }

        const providerStatus: ProviderStatus = (() => {
            if (!flashScoreEnabledForSport) return PROVIDER_OK;
            if (!couldAskProvider) {
                return {
                    ok: false,
                    reason: 'unresolved',
                    message: 'No pudimos identificar este torneo en el proveedor. Las pestañas están vacías porque no se llegó a pedir los datos, no porque el torneo no tenga partidos.',
                };
            }
            if (providerRejections > 0 && !resolutionProducedData) {
                return {
                    ok: false,
                    reason: 'provider-error',
                    message: 'El proveedor de datos no respondió. Lo que ves puede estar incompleto o desactualizado.',
                };
            }
            if (providerRejections > 0) {
                return {
                    ok: false,
                    reason: 'partial',
                    message: 'Algunas pestañas no se pudieron cargar: el proveedor falló al responderlas.',
                };
            }
            return PROVIDER_OK;
        })();

        return perf.json({
            ok: true,
            _debug: {
                query: { id, url, sport, tournamentId, stageId, templateId, seasonId },
                resolvedIds: { tournamentId, stageId, templateId, seasonId },
                externalOverrideId,
                counts: {
                    results: Array.isArray(resultsPayload) ? resultsPayload.length : 0,
                    fixtures: Array.isArray(fixturesPayload) ? fixturesPayload.length : 0,
                    standings: Array.isArray(finalStandings) ? finalStandings.length : 0,
                    topScorers: Array.isArray(topScorersPayload) ? topScorersPayload.length : 0
                }
            },
            _cache: {
                entityId: snapshotEntityId,
                tabSources
            },
            providerStatus,
            ids: { tournamentId, stageId, templateId, seasonId, drawStageId },
            details: detailsPayload,
            results: resultsPayload,
            fixtures: fixturesPayload,
            standings: finalStandings,
            standingsForm: finalStandingsForm,
            standingsHtFt: finalStandingsHtFt,
            standingsOverUnder: finalStandingsOverUnder,
            teamLabels: externalStandingsTeamLabels,
            standingsFormTeamLabels: externalStandingsFormTeamLabels,
            standingsHtFtTeamLabels: externalStandingsHtFtTeamLabels,
            standingsOverUnderTeamLabels: externalStandingsOverUnderTeamLabels,
            customStandingsTables,
            topScorers: topScorersPayload,
            draw: bracketDrawPayload,
            brackets,
            archives: archivesPayload
        });
    } catch (e: any) {
        console.error('Tournament API error', e);
        try {
            const fallbackEntityId = tournamentId || stageId || id || url || 'unknown';
            const fallbackKey = { entityType: 'tournament' as const, entityId: fallbackEntityId };
            const fallbackSources: Record<string, 'snapshot' | 'empty'> = {};

            const readFallback = (tab: string, emptyValue: any) => {
                const snap = getTabSnapshot({ ...fallbackKey, tab });
                if (snap) {
                    fallbackSources[tab] = 'snapshot';
                    return snap.payload;
                }
                fallbackSources[tab] = 'empty';
                return emptyValue;
            };

            const fallbackDetails = readFallback('details', null);
            const fallbackResults = sortMatchesByDate(readFallback('results', []), 'desc');
            const fallbackFixtures = sortMatchesByDate(readFallback('fixtures', []), 'asc');
            const fallbackStandings = readFallback('standings', []);
            const fallbackStandingsForm = readFallback('standingsForm', []);
            const fallbackStandingsHtFt = readFallback('standingsHtFt', []);
            const fallbackStandingsOverUnder = readFallback('standingsOverUnder', []);
            const fallbackTopScorers = readFallback('topScorers', []);
            const fallbackDraw = readFallback('draw', []);
            const fallbackArchives = readFallback('archives', []);
            let fallbackDetailsPayload = fallbackDetails;
            let fallbackStandingsPayload = fallbackStandings;
            let fallbackStandingsFormPayload = fallbackStandingsForm;
            let fallbackStandingsHtFtPayload = fallbackStandingsHtFt;
            let fallbackStandingsOverUnderPayload = fallbackStandingsOverUnder;
            let fallbackTeamLabels: any[] = [];
            let fallbackStandingsFormTeamLabels: any[] = [];
            let fallbackStandingsHtFtTeamLabels: any[] = [];
            let fallbackStandingsOverUnderTeamLabels: any[] = [];
            let fallbackCustomStandingsTables: any[] = [];

            if (externalOverrideId) {
                const externalTournamentOverride = await getExternalTournamentOverride(externalOverrideId);
                if (externalTournamentOverride) {
                    fallbackDetailsPayload = applyExternalTournamentOverride(
                        (fallbackDetailsPayload && typeof fallbackDetailsPayload === 'object')
                            ? fallbackDetailsPayload as Record<string, unknown>
                            : {},
                        externalTournamentOverride,
                    );
                }

                const externalStandingsOverride = await getExternalTournamentStandingsOverride(externalOverrideId);
                if (externalStandingsOverride) {
                    const overriddenStandings = applyExternalTournamentStandingsOverrideSet(
                        {
                            standings: fallbackStandings,
                            standingsForm: fallbackStandingsForm,
                            standingsHtFt: fallbackStandingsHtFt,
                            standingsOverUnder: fallbackStandingsOverUnder,
                        },
                        externalStandingsOverride,
                    );
                    fallbackStandingsPayload = overriddenStandings.standings;
                    fallbackStandingsFormPayload = overriddenStandings.standingsForm;
                    fallbackStandingsHtFtPayload = overriddenStandings.standingsHtFt;
                    fallbackStandingsOverUnderPayload = overriddenStandings.standingsOverUnder;
                    fallbackTeamLabels = overriddenStandings.teamLabels;
                    fallbackStandingsFormTeamLabels = overriddenStandings.standingsFormTeamLabels;
                    fallbackStandingsHtFtTeamLabels = overriddenStandings.standingsHtFtTeamLabels;
                    fallbackStandingsOverUnderTeamLabels = overriddenStandings.standingsOverUnderTeamLabels;
                    fallbackCustomStandingsTables = overriddenStandings.customTables;
                }
            }

            fallbackDetailsPayload = applyDbTournamentPresentationOverrides(fallbackDetailsPayload, dbTournamentMeta);

            const hasAnySnapshot = Object.values(fallbackSources).some((v) => v === 'snapshot');
            if (hasAnySnapshot) {
                return perf.json({
                    ok: true,
                    _cache: {
                        entityId: fallbackEntityId,
                        tabSources: fallbackSources,
                        fallback: true
                    },
                    providerStatus: {
                        ok: false,
                        reason: 'provider-error',
                        message: 'El proveedor de datos no respondió. Estás viendo la última versión guardada.',
                    } satisfies ProviderStatus,
                    ids: { tournamentId, stageId, templateId, seasonId, drawStageId },
                    details: fallbackDetailsPayload,
                    results: fallbackResults,
                    fixtures: fallbackFixtures,
                    standings: fallbackStandingsPayload,
                    standingsForm: fallbackStandingsFormPayload,
                    standingsHtFt: fallbackStandingsHtFtPayload,
                    standingsOverUnder: fallbackStandingsOverUnderPayload,
                    teamLabels: fallbackTeamLabels,
                    standingsFormTeamLabels: fallbackStandingsFormTeamLabels,
                    standingsHtFtTeamLabels: fallbackStandingsHtFtTeamLabels,
                    standingsOverUnderTeamLabels: fallbackStandingsOverUnderTeamLabels,
                    customStandingsTables: fallbackCustomStandingsTables,
                    topScorers: fallbackTopScorers,
                    draw: fallbackDraw,
                    archives: fallbackArchives
                });
            }
        } catch (fallbackError) {
            console.error('Tournament fallback error', fallbackError);
        }
        return perf.json(
            { ok: false, error: 'Failed to load tournament data', details: e.message || String(e) },
            { status: 500 }
        );
    }
}
