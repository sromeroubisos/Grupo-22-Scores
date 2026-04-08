import {
    getTournamentEspnAmericanFootballConfig,
    getTournamentEspnMotorsportConfig,
    getTournamentFlashScoreConfig,
    getTournamentRugbyApiSportsConfig,
    isAmericanFootballSport,
    isMotorsportSport,
    isRugbySport,
} from '@/lib/externalProviderPolicy';
import { parseEspnAmericanFootballTournamentId, toEspnAmericanFootballTournamentId } from '@/lib/services/espnAmericanFootball';
import { parseEspnMotorsportTournamentId, toEspnMotorsportTournamentId } from '@/lib/services/espnMotorsport';

type FlashScoreIdsLike = {
    tournamentId?: unknown;
    tournamentStageId?: unknown;
    tournamentTemplateId?: unknown;
    seasonId?: unknown;
};

type ResolveExternalTournamentIdInput = {
    routeId?: unknown;
    externalId?: unknown;
    sportId?: unknown;
    ruleset?: unknown;
    flashScoreIds?: FlashScoreIdsLike | null;
};

const FLASHSCORE_TOURNAMENT_ID_RE = /^fs-/i;
const RUGBY_API_SPORTS_TOURNAMENT_ID_RE = /^ras-league-\d+$/i;
const ESPN_TOURNAMENT_ID_RE = /^espn-league-[a-z0-9-]+$/i;
const ESPN_MOTORSPORT_TOURNAMENT_ID_RE = /^espn-racing-league-[a-z0-9-]+$/i;

function normalizeString(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    return trimmed || null;
}

function toFlashScoreTournamentId(value: unknown): string | null {
    const normalized = normalizeString(value);
    if (!normalized) return null;
    if (
        RUGBY_API_SPORTS_TOURNAMENT_ID_RE.test(normalized) ||
        ESPN_TOURNAMENT_ID_RE.test(normalized) ||
        ESPN_MOTORSPORT_TOURNAMENT_ID_RE.test(normalized)
    ) return normalized;
    return FLASHSCORE_TOURNAMENT_ID_RE.test(normalized) ? normalized : `fs-${normalized}`;
}

function toRugbyApiTournamentId(value: unknown): string | null {
    const normalized = normalizeString(value);
    if (!normalized) return null;
    if (RUGBY_API_SPORTS_TOURNAMENT_ID_RE.test(normalized)) return normalized;
    if (!/^\d+$/i.test(normalized)) return null;
    return `ras-league-${normalized}`;
}

function toEspnTournamentId(value: unknown): string | null {
    const normalized = normalizeString(value);
    if (!normalized) return null;
    if (ESPN_TOURNAMENT_ID_RE.test(normalized)) return normalized;
    if (parseEspnAmericanFootballTournamentId(normalized)) return normalized;
    return null;
}

function toEspnMotorsportId(value: unknown): string | null {
    const normalized = normalizeString(value);
    if (!normalized) return null;
    if (ESPN_MOTORSPORT_TOURNAMENT_ID_RE.test(normalized)) return normalized;
    if (parseEspnMotorsportTournamentId(normalized)) return normalized;
    return null;
}

export function isExternalTournamentId(value: unknown): boolean {
    const normalized = normalizeString(value);
    if (!normalized) return false;
    return (
        FLASHSCORE_TOURNAMENT_ID_RE.test(normalized) ||
        RUGBY_API_SPORTS_TOURNAMENT_ID_RE.test(normalized) ||
        ESPN_TOURNAMENT_ID_RE.test(normalized) ||
        ESPN_MOTORSPORT_TOURNAMENT_ID_RE.test(normalized)
    );
}

export function resolveExternalTournamentId(input: ResolveExternalTournamentIdInput): string | null {
    const routeId = normalizeString(input.routeId);
    if (isExternalTournamentId(routeId)) return routeId;

    const externalId = normalizeString(input.externalId);
    if (isExternalTournamentId(externalId)) return externalId;

    const rugbyConfig = getTournamentRugbyApiSportsConfig({
        sport_id: input.sportId,
        ruleset: input.ruleset,
    });
    const rugbyTournamentId = toRugbyApiTournamentId(rugbyConfig?.league_id);
    if (rugbyTournamentId) return rugbyTournamentId;

    if (isRugbySport(input.sportId)) {
        const rugbyExternalId = toRugbyApiTournamentId(externalId);
        if (rugbyExternalId) return rugbyExternalId;
    }

    const espnConfig = getTournamentEspnAmericanFootballConfig({
        sport_id: input.sportId,
        ruleset: input.ruleset,
    });
    const espnTournamentId = espnConfig?.league_slug
        ? toEspnAmericanFootballTournamentId(espnConfig.league_slug as any)
        : null;
    if (espnTournamentId) return espnTournamentId;

    if (isAmericanFootballSport(input.sportId)) {
        const espnExternalId = toEspnTournamentId(externalId);
        if (espnExternalId) return espnExternalId;
    }

    const espnMotorsportConfig = getTournamentEspnMotorsportConfig({
        sport_id: input.sportId,
        ruleset: input.ruleset,
    });
    const espnMotorsportTournamentId = espnMotorsportConfig?.league_slug
        ? toEspnMotorsportTournamentId(espnMotorsportConfig.league_slug as any)
        : null;
    if (espnMotorsportTournamentId) return espnMotorsportTournamentId;

    if (isMotorsportSport(input.sportId)) {
        const espnExternalId = toEspnMotorsportId(externalId);
        if (espnExternalId) return espnExternalId;
    }

    const flashScoreConfig = getTournamentFlashScoreConfig({
        sport_id: input.sportId,
        ruleset: input.ruleset,
    });
    const flashScoreTournamentId = toFlashScoreTournamentId(
        input.flashScoreIds?.tournamentId ??
        input.flashScoreIds?.tournamentStageId ??
        input.flashScoreIds?.tournamentTemplateId ??
        flashScoreConfig?.tournament_id ??
        flashScoreConfig?.tournament_stage_id ??
        flashScoreConfig?.tournament_template_id,
    );
    if (flashScoreTournamentId) return flashScoreTournamentId;

    return toFlashScoreTournamentId(externalId);
}
