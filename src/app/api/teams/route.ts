import { getReadClient } from '@/lib/supabase/read';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/database.types';
import {
    getEspnAmericanFootballTeamBundle,
    parseEspnAmericanFootballTeamId,
} from '@/lib/services/espnAmericanFootball';
import {
    getEspnFootballTeamBundle,
    getEspnFootballTeamSquad,
    parseEspnFootballTeamId,
} from '@/lib/services/espnFootball';
import {
    getTeamDetails,
    getTeamSquad,
    getTeamResults,
    getTeamFixtures,
    getTeamTransfers,
} from '@/lib/services/flashscore';
import {
    getSofaScoreTeamBundle,
    isSofaScoreServiceConfigured,
    SOFASCORE_TEAM_PREFIX,
} from '@/lib/services/sofascore';
import { canonicalizeSportId, getClubSportValue } from '@/lib/clubDerivatives';
import { fetchPeopleByClub, type PersonWithRole } from '@/lib/services/personService';
import { sortMatchesByDate } from '@/lib/utils/matchOrdering';
import { buildTeamLogoProxyUrl, clubLogoVersion } from '@/lib/utils/logoUrl';
import { applyExternalTeamLogoOverride } from '@/lib/utils/teamLogoOverrides';
import { isMissingColumnError, isMissingTableError } from '@/lib/utils/supabaseSchema';

type ReadClient = Awaited<ReturnType<typeof getReadClient>>;
type InternalClubRow = Database['public']['Tables']['clubs']['Row'] & {
    sport?: string | null;
    sport_id?: string | null;
    external_id?: string | null;
};
type ClubDerivativeIncoming = {
    base_club_id: string;
};
type ClubDerivativeOutgoing = {
    derived_club_id: string;
    derivative_type: string | null;
};
type ClubDerivativesReadClient = {
    from(table: 'club_derivatives'): {
        select(columns: 'base_club_id'): {
            eq(column: 'derived_club_id', value: string): {
                maybeSingle(): Promise<{ data: ClubDerivativeIncoming | null }>;
            };
        };
        select(columns: 'derived_club_id, derivative_type'): {
            eq(column: 'base_club_id', value: string): Promise<{ data: ClubDerivativeOutgoing[] | null }>;
        };
    };
};
type MatchScore = {
    home?: number | null;
    home_score?: number | null;
    away?: number | null;
    away_score?: number | null;
};
type InternalMatchSource = {
    id: string;
    date_time: string | null;
    score: MatchScore | null;
    status: string | null;
    home_name?: string | null;
    home_logo?: string | null;
    home_logo_updated_at?: string | null;
    home_club_id?: string | null;
    away_name?: string | null;
    away_logo?: string | null;
    away_logo_updated_at?: string | null;
    away_club_id?: string | null;
    tournament_name?: string | null;
    sport_id?: string | null;
};
type ClubMatchRelation = {
    name: string | null;
};
type TournamentMatchRelation = {
    name: string | null;
    sport_id: string | null;
};
type InternalMatchRow = {
    id: string;
    date_time: string | null;
    status: string | null;
    score: MatchScore | null;
    home_club_id: string | null;
    away_club_id: string | null;
    tournament_id: string | null;
    round_label: string | null;
    // El deporte del propio partido. Hace falta porque un AMISTOSO no tiene
    // torneo, y sin esto se quedaba sin deporte (ver más abajo).
    sport_id: string | null;
    sport: string | null;
    home_club: ClubMatchRelation | ClubMatchRelation[] | null;
    away_club: ClubMatchRelation | ClubMatchRelation[] | null;
    tournament: TournamentMatchRelation | TournamentMatchRelation[] | null;
};
type NormalizedInternalMatch = {
    match_id: string;
    home_team: {
        name: string;
        small_image_path: string;
        team_id: string;
        logo_updated_at?: string;
    };
    away_team: {
        name: string;
        small_image_path: string;
        team_id: string;
        logo_updated_at?: string;
    };
    scores: {
        home: number | null;
        away: number | null;
    };
    match_status: string;
    timestamp: number;
    tournament_name: string;
    sport_id: string | null;
};
type InternalSquadState = {
    squad: unknown[];
    hasSquad: boolean;
    source: 'internal' | 'legacy' | 'none';
};
type TeamDetailsPayload = {
    id?: string;
    name?: string;
    image_path?: string | null;
    logo?: string | null;
    logo_url?: string | null;
    country?: string | null;
    city?: string | null;
    region?: string | null;
    sport?: string | null;
    is_internal?: boolean;
} & Record<string, unknown>;
type PublicRelatedClub = {
    id: string;
    name: string;
    short_name: string | null;
    logo_url: string | null;
    sport: string | null;
    sport_id: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    is_base: boolean;
    is_current: boolean;
};
type ExternalTeamCacheRow = {
    id: string;
    source?: string | null;
    name?: string | null;
    short_name?: string | null;
    logo_url?: string | null;
    sport?: string | null;
    country?: string | null;
    team_url?: string | null;
    updated_at?: string | null;
};

const EXTERNAL_TEAM_CACHE_WRITE_BACKOFF_MS = 10 * 60 * 1000;
const externalTeamCacheWriteLocks = new Map<string, Promise<void>>();
const externalTeamCacheWriteNextAllowedAt = new Map<string, number>();

function getExternalTeamCacheWriteClient() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return null;
    }

    try {
        return createAdminClient();
    } catch (error) {
        console.warn('[teams] External team cache write skipped: admin client unavailable.', {
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

function buildExternalTeamCacheWriteKey(input: {
    id: string;
    teamUrl: string;
    source: string;
}) {
    return [input.source, input.id, input.teamUrl]
        .map((value) => value.trim().toLowerCase())
        .join('|');
}

async function runExternalTeamUrlCacheWrite(input: {
    id: string;
    teamUrl: string;
    name: string;
    source: string;
}) {
    const writeClient = getExternalTeamCacheWriteClient();
    if (!writeClient) return;

    const payload = {
        id: input.id,
        team_url: input.teamUrl,
        source: input.source,
        name: input.name,
    };

    let { error } = await (writeClient as any)
        .from('external_teams')
        .upsert(payload, { onConflict: 'id' });

    if (error && isMissingColumnError(error, 'team_url')) {
        const legacyPayload = {
            id: payload.id,
            source: payload.source,
            name: payload.name,
        };
        const legacyResult = await (writeClient as any)
            .from('external_teams')
            .upsert(legacyPayload, { onConflict: 'id' });
        error = legacyResult.error;
    }

    if (error && !isMissingTableError(error, 'external_teams')) {
        console.warn('[teams] External team cache write failed.', {
            code: error.code,
            message: error.message,
        });
    }
}

async function persistExternalTeamUrlCache(input: {
    id: string;
    teamUrl: string;
    name: string;
    source: string;
}) {
    const writeKey = buildExternalTeamCacheWriteKey(input);
    const now = Date.now();
    const nextAllowedAt = externalTeamCacheWriteNextAllowedAt.get(writeKey) || 0;
    if (nextAllowedAt > now) return;

    const existing = externalTeamCacheWriteLocks.get(writeKey);
    if (existing) {
        await existing;
        return;
    }

    const writePromise = (async () => {
        try {
            externalTeamCacheWriteNextAllowedAt.set(writeKey, Date.now() + EXTERNAL_TEAM_CACHE_WRITE_BACKOFF_MS);
            await runExternalTeamUrlCacheWrite(input);
        } finally {
            externalTeamCacheWriteLocks.delete(writeKey);
        }
    })();

    externalTeamCacheWriteLocks.set(writeKey, writePromise);
    await writePromise;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function stripFsTeamPrefix(val: string): string {
    if (val.toLowerCase().startsWith('fs-team-')) return val.slice(8);
    if (val.toLowerCase().startsWith('fs-')) return val.slice(3);
    return val;
}

function buildExternalTeamLookupKeys(value: unknown): string[] {
    const raw = String(value ?? '').trim();
    if (!raw) return [];

    const normalized = raw.toLowerCase();
    const keys = new Set<string>([raw, normalized]);

    if (normalized.startsWith('fs-team-')) {
        const stripped = raw.slice(8);
        const strippedNormalized = normalized.slice(8);
        if (stripped) {
            keys.add(stripped);
            keys.add(strippedNormalized);
            keys.add(`fs-${stripped}`);
            keys.add(`fs-${strippedNormalized}`);
        }
        return Array.from(keys);
    }

    if (normalized.startsWith('fs-')) {
        const stripped = raw.slice(3);
        const strippedNormalized = normalized.slice(3);
        if (stripped) {
            keys.add(stripped);
            keys.add(strippedNormalized);
            keys.add(`fs-team-${stripped}`);
            keys.add(`fs-team-${strippedNormalized}`);
        }
        return Array.from(keys);
    }

    if (normalized.startsWith('ras-team-')) {
        const stripped = raw.slice(9);
        const strippedNormalized = normalized.slice(9);
        if (stripped) {
            keys.add(stripped);
            keys.add(strippedNormalized);
        }
        return Array.from(keys);
    }

    if (normalized.startsWith('espn-team-')) {
        const stripped = raw.slice(10);
        const strippedNormalized = normalized.slice(10);
        if (stripped) {
            keys.add(stripped);
            keys.add(strippedNormalized);
        }
        return Array.from(keys);
    }

    if (/^[a-z0-9]+$/i.test(raw)) {
        keys.add(`fs-team-${raw}`);
        keys.add(`fs-team-${normalized}`);
        keys.add(`fs-${raw}`);
        keys.add(`fs-${normalized}`);
        keys.add(`ras-team-${raw}`);
        keys.add(`ras-team-${normalized}`);
        keys.add(`espn-team-${raw}`);
        keys.add(`espn-team-${normalized}`);
    }

    return Array.from(keys);
}

function buildExternalTeamCacheMap(rows: ExternalTeamCacheRow[]): Map<string, ExternalTeamCacheRow> {
    const map = new Map<string, ExternalTeamCacheRow>();

    rows.forEach((row) => {
        [
            ...buildExternalTeamLookupKeys(row.id),
            ...buildExternalTeamLookupKeys(row.team_url),
            ...buildExternalTeamLookupKeys(row.name),
            ...buildExternalTeamLookupKeys(row.short_name),
        ].forEach((key) => map.set(key, row));
    });

    return map;
}

function findExternalTeamCacheRecord(
    cacheMap: Map<string, ExternalTeamCacheRow>,
    ...values: unknown[]
): ExternalTeamCacheRow | null {
    for (const value of values) {
        for (const key of buildExternalTeamLookupKeys(value)) {
            const match = cacheMap.get(key);
            if (match) return match;
        }
    }

    return null;
}

function enrichExternalTeamSource<T extends Record<string, unknown>>(source: T, cached: ExternalTeamCacheRow | null): T {
    if (!cached) return source;

    const nextTeamUrl = typeof source.team_url === 'string' && source.team_url.trim()
        ? source.team_url
        : cached.team_url ?? undefined;
    const nextUpdatedAt = typeof source.updated_at === 'string' && source.updated_at.trim()
        ? source.updated_at
        : cached.updated_at ?? undefined;
    const nextLogoUpdatedAt = typeof source.logo_updated_at === 'string' && source.logo_updated_at.trim()
        ? source.logo_updated_at
        : cached.updated_at ?? undefined;

    return {
        ...source,
        team_url: nextTeamUrl,
        updated_at: nextUpdatedAt,
        logo_updated_at: nextLogoUpdatedAt,
    } as T;
}

function enrichMatchesWithExternalTeamCache(
    matches: NormalizedInternalMatch[],
    cacheMap: Map<string, ExternalTeamCacheRow>,
): NormalizedInternalMatch[] {
    if (matches.length === 0 || cacheMap.size === 0) return matches;

    return matches.map((match) => ({
        ...match,
        home_team: enrichExternalTeamSource(
            match.home_team,
            findExternalTeamCacheRecord(cacheMap, match.home_team?.team_id, match.home_team?.name),
        ),
        away_team: enrichExternalTeamSource(
            match.away_team,
            findExternalTeamCacheRecord(cacheMap, match.away_team?.team_id, match.away_team?.name),
        ),
    }));
}

function parseRugbyApiSportsTeamId(val: string): string | null {
    const match = /^ras-team-(\d+)$/i.exec(val.trim());
    return match?.[1] || null;
}

function parseSofaScoreTeamId(val: string): string | null {
    const trimmed = val.trim();
    if (!trimmed.toLowerCase().startsWith(SOFASCORE_TEAM_PREFIX)) return null;
    const id = trimmed.slice(SOFASCORE_TEAM_PREFIX.length);
    return /^\d+$/.test(id) ? id : null;
}

function slugify(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

const normalize = (res: PromiseSettledResult<unknown>) => {
    if (res.status !== 'fulfilled' || !res.value) return null;
    const value = res.value;
    if (!isRecord(value)) {
        return value;
    }

    return value.DATA ?? value.data ?? value;
};

function parseScoreParts(result: string): { home: number | null; away: number | null } {
    if (!result) return { home: null, away: null };
    const parts = result.split(/\s*[-–]\s*/);
    if (parts.length < 2) return { home: null, away: null };
    const home = parseInt(parts[0].trim(), 10);
    const away = parseInt(parts[parts.length - 1].trim(), 10);
    return {
        home: isNaN(home) ? null : home,
        away: isNaN(away) ? null : away,
    };
}

function normalizeFsTeamMatch(m: Record<string, unknown>): NormalizedInternalMatch {
    const homeTeam = isRecord(m.home_team) ? m.home_team : {};
    const awayTeam = isRecord(m.away_team) ? m.away_team : {};
    const scores = parseScoreParts(
        String(m.event_final_result || m.score || m.result || ''),
    );
    return {
        match_id: String(m.match_id || m.event_key || m.id || ''),
        home_team: {
            name: String(homeTeam.name || m.event_home_team || ''),
            small_image_path: String(
                homeTeam.small_image_path ?? homeTeam.image_path ?? homeTeam.logo ?? ''
            ),
            team_id: String(homeTeam.team_id || homeTeam.id || ''),
        },
        away_team: {
            name: String(awayTeam.name || m.event_away_team || ''),
            small_image_path: String(
                awayTeam.small_image_path ?? awayTeam.image_path ?? awayTeam.logo ?? ''
            ),
            team_id: String(awayTeam.team_id || awayTeam.id || ''),
        },
        scores,
        match_status: String(m.event_status || m.match_status || m.status || 'FT'),
        timestamp: Number(m.timestamp || m.start_time || 0),
        tournament_name: String(
            (isRecord(m.tournament) ? m.tournament.name : null) ||
            m.tournament_name || m.league_name || ''
        ),
        sport_id: m.sport_id ? String(m.sport_id) : null,
    };
}

function flattenFsMatches(raw: unknown): NormalizedInternalMatch[] {
    if (!raw) return [];
    const data = isRecord(raw) ? (raw.DATA ?? raw.data ?? raw) : raw;
    const items = Array.isArray(data) ? data : [];
    return items
        .map((item: unknown) => {
            if (!isRecord(item)) return null;
            // Flatten grouped format (tournament → matches)
            if (Array.isArray(item.matches)) {
                return (item.matches as unknown[]).map((m) =>
                    isRecord(m) ? normalizeFsTeamMatch(m) : null,
                );
            }
            return normalizeFsTeamMatch(item);
        })
        .flat()
        .filter((m): m is NormalizedInternalMatch => m !== null);
}

function normalizeInternalMatch(m: InternalMatchSource): NormalizedInternalMatch {
    const dt = m.date_time ? new Date(m.date_time) : null;
    const timestamp = dt ? dt.getTime() / 1000 : 0;
    const scoreHome = m.score?.home ?? m.score?.home_score ?? null;
    const scoreAway = m.score?.away ?? m.score?.away_score ?? null;
    return {
        match_id: m.id,
        home_team: {
            name: m.home_name || m.home_club_id || '',
            small_image_path: m.home_logo || '',
            team_id: m.home_club_id || '',
            logo_updated_at: m.home_logo_updated_at || '',
        },
        away_team: {
            name: m.away_name || m.away_club_id || '',
            small_image_path: m.away_logo || '',
            team_id: m.away_club_id || '',
            logo_updated_at: m.away_logo_updated_at || '',
        },
        scores: { home: scoreHome, away: scoreAway },
        match_status: m.status || 'NS',
        timestamp,
        tournament_name: m.tournament_name || '',
        sport_id: m.sport_id || null,
    };
}

const MISSING_RELATION_CODES = new Set(['PGRST204', '42P01']);
const BASE_TEAM_TABS = ['summary', 'results', 'fixtures'] as const;

function isMissingRelationError(error: unknown) {
    return isRecord(error) && typeof error.code === 'string' && MISSING_RELATION_CODES.has(error.code);
}

function mergeInternalMatchRows(...rowGroups: Array<InternalMatchRow[] | null | undefined>): InternalMatchRow[] {
    const rowsById = new Map<string, InternalMatchRow>();

    for (const group of rowGroups) {
        for (const row of group ?? []) {
            if (row?.id && !rowsById.has(row.id)) {
                rowsById.set(row.id, row);
            }
        }
    }

    return Array.from(rowsById.values()).sort((left, right) => {
        const leftTime = left.date_time ? new Date(left.date_time).getTime() : 0;
        const rightTime = right.date_time ? new Date(right.date_time).getTime() : 0;
        return rightTime - leftTime;
    });
}

function calculateAge(birthDate?: string | null) {
    if (!birthDate) return null;

    const birth = new Date(birthDate);
    if (Number.isNaN(birth.getTime())) return null;

    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const hasBirthdayPassed =
        now.getMonth() > birth.getMonth()
        || (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());

    if (!hasBirthdayPassed) {
        age -= 1;
    }

    return age >= 0 ? age : null;
}

function isPlayerRosterRole(role: string | null | undefined) {
    const normalized = String(role || '').trim().toLowerCase();
    return normalized === 'player' || normalized === 'jugador';
}

function mapClubRosterPersonToSquad(person: PersonWithRole, clubId: string) {
    const name = person.full_name || `${person.first_name || ''} ${person.last_name || ''}`.trim() || 'Jugador';
    const tabName = person.division_name?.trim() || 'Club';

    return {
        id: person.id,
        player_id: person.id,
        name,
        player_name: name,
        image_path: person.photo_url || person.avatar_url || '',
        photo: person.photo_url || person.avatar_url || '',
        jersey_number: null,
        shirt_number: null,
        number: null,
        position: person.position || null,
        age: calculateAge(person.birth_date),
        birth_date: person.birth_date || null,
        id_number: person.id_number || null,
        weight: person.weight ?? null,
        height: person.height ?? null,
        status: person.status || 'active',
        role: person.role,
        division_id: person.division_id || null,
        division_name: person.division_name || null,
        team_id: person.division_id || clubId,
        team_name: tabName,
        tab_name: tabName,
    };
}

async function fetchClubRosterFallback(
    readClient: ReadClient,
    clubId: string,
    includePlayers: boolean,
): Promise<InternalSquadState | null> {
    const rosterPeople = await fetchPeopleByClub(clubId, readClient as never);
    const players = rosterPeople.filter((person) => isPlayerRosterRole(person.role));

    if (players.length === 0) {
        return null;
    }

    if (!includePlayers) {
        return { squad: [], hasSquad: true, source: 'legacy' as const };
    }

    const squad = players
        .map((person) => mapClubRosterPersonToSquad(person, clubId))
        .sort((left, right) => {
            const teamCompare = String(left.tab_name || '').localeCompare(String(right.tab_name || ''));
            if (teamCompare !== 0) return teamCompare;
            return String(left.name || '').localeCompare(String(right.name || ''));
        });

    return {
        squad,
        hasSquad: squad.length > 0,
        source: 'legacy' as const,
    };
}

function buildSupportedTabs(options: {
    supportedTabs?: unknown;
    hasSquad: boolean;
    hasTransfers: boolean;
}) {
    const tabs = new Set<string>(
        Array.isArray(options.supportedTabs)
            ? options.supportedTabs.filter((tab): tab is string => typeof tab === 'string')
            : BASE_TEAM_TABS
    );

    BASE_TEAM_TABS.forEach((tab) => tabs.add(tab));

    if (options.hasSquad) {
        tabs.add('squad');
    } else {
        tabs.delete('squad');
    }

    if (options.hasTransfers) {
        tabs.add('transfers');
    } else {
        tabs.delete('transfers');
    }

    return Array.from(tabs).filter((tab) =>
        ['summary', 'results', 'fixtures', 'squad', 'transfers'].includes(tab)
    );
}

// For national teams mapped to a FIFA / CONMEBOL league, the team's schedule
// in ESPN is split across multiple competitions (Mundial, Eliminatorias, Amistosos).
// We fetch each one so the fixture list isn't truncated to a single tournament.
function computeEspnSoccerExtraScheduleLeagues(primarySlug: string | null | undefined) {
    if (!primarySlug) return [] as string[];
    const slug = primarySlug.toLowerCase();
    const nationalTeamSlugs = new Set([
        'fifa.world',
        'fifa.cwc',
        'fifa.confederations',
        'fifa.friendly',
        'fifa.olympics',
        'conmebol.america',
        'conmebol.fifa.worldq',
        'uefa.euro',
        'uefa.euro_q',
        'uefa.nations',
        'concacaf.gold',
        'concacaf.nations.league',
        'caf.nations',
        'afc.asian',
    ]);
    if (!nationalTeamSlugs.has(slug)) return [];
    return ['fifa.world', 'conmebol.fifa.worldq', 'fifa.friendly'].filter((s) => s !== slug);
}

async function fetchInternalClubSquad(
    readClient: ReadClient,
    clubId: string,
    options?: { includePlayers?: boolean; allowFamilyFallback?: boolean }
): Promise<InternalSquadState> {
    const includePlayers = options?.includePlayers ?? true;
    const allowFamilyFallback = options?.allowFamilyFallback ?? true;
    const db = readClient as any;
    const resolveFamilyBaseClubId = async () => {
        try {
            const { data, error } = await db
                .from('club_derivatives')
                .select('base_club_id')
                .eq('derived_club_id', clubId)
                .maybeSingle();

            if (error) {
                if (isMissingRelationError(error)) return null;
                throw error;
            }

            return typeof data?.base_club_id === 'string' && data.base_club_id !== clubId
                ? data.base_club_id
                : null;
        } catch {
            return null;
        }
    };
    const fallbackToFamilyBase = async (): Promise<InternalSquadState> => {
        if (!allowFamilyFallback) {
            return { squad: [], hasSquad: false, source: 'none' as const };
        }

        const familyBaseClubId = await resolveFamilyBaseClubId();
        if (!familyBaseClubId) {
            return { squad: [], hasSquad: false, source: 'none' as const };
        }

        return fetchInternalClubSquad(readClient, familyBaseClubId, {
            includePlayers,
            allowFamilyFallback: false,
        });
    };

    try {
        const teamsBaseQuery = () => db
            .from('club_teams')
            .select('id, legacy_division_id, name')
            .eq('club_id', clubId);
        let { data: teams, error: teamsError } = await teamsBaseQuery()
            .order('featured', { ascending: false })
            .order('name');

        if (teamsError && isMissingColumnError(teamsError, 'featured')) {
            const fallback = await teamsBaseQuery().order('name');
            teams = fallback.data;
            teamsError = fallback.error;
        }

        if (teamsError && !isMissingRelationError(teamsError)) {
            throw teamsError;
        }

        const teamRows = Array.isArray(teams) ? teams : [];

        if (teamRows.length > 0) {
            const { data: memberships, error: membershipsError } = await db
                .from('team_memberships')
                .select('team_id, person_id, role, status, position')
                .eq('club_id', clubId);

            if (membershipsError && !isMissingRelationError(membershipsError)) {
                throw membershipsError;
            }

            const playerMemberships = Array.isArray(memberships)
                ? memberships.filter((membership: any) => membership.role === 'player' && membership.person_id && membership.team_id)
                : [];

            if (playerMemberships.length > 0) {
                if (!includePlayers) {
                    return { squad: [], hasSquad: true, source: 'internal' as const };
                }

                const personIds = Array.from(
                    new Set(playerMemberships.map((membership: any) => String(membership.person_id)))
                );
                const legacyDivisionIds = Array.from(
                    new Set(
                        teamRows
                            .map((team: any) => team.legacy_division_id)
                            .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
                    )
                );

                const [peopleRes, squadMembersRes] = await Promise.all([
                    readClient
                        .from('people')
                        .select('id, first_name, last_name, full_name, photo_url, avatar_url, birth_date, position')
                        .in('id', personIds),
                    legacyDivisionIds.length > 0
                        ? db
                            .from('squad_members')
                            .select('division_id, person_id, jersey_number, position')
                            .in('division_id', legacyDivisionIds)
                        : Promise.resolve({ data: [], error: null }),
                ]);

                if (peopleRes.error) {
                    throw peopleRes.error;
                }

                if (squadMembersRes.error && !isMissingRelationError(squadMembersRes.error)) {
                    throw squadMembersRes.error;
                }

                const teamById = new Map(
                    teamRows.map((team: any) => [String(team.id), team])
                );
                const peopleById = new Map(
                    ((peopleRes.data ?? []) as any[]).map((person) => [String(person.id), person])
                );
                const squadMemberByKey = new Map(
                    (((squadMembersRes.data ?? []) as any[])).map((member) => [
                        `${String(member.division_id)}:${String(member.person_id)}`,
                        member,
                    ])
                );

                const squad = playerMemberships
                    .map((membership: any) => {
                        const team = teamById.get(String(membership.team_id));
                        const person = peopleById.get(String(membership.person_id));
                        if (!team || !person) return null;

                        const squadMember = team.legacy_division_id
                            ? squadMemberByKey.get(`${String(team.legacy_division_id)}:${String(membership.person_id)}`)
                            : null;
                        const name = person.full_name || `${person.first_name || ''} ${person.last_name || ''}`.trim();
                        const jerseyNumber = typeof squadMember?.jersey_number === 'number'
                            ? squadMember.jersey_number
                            : null;

                        return {
                            id: String(person.id),
                            player_id: String(person.id),
                            name,
                            player_name: name,
                            image_path: person.photo_url || person.avatar_url || '',
                            photo: person.photo_url || person.avatar_url || '',
                            jersey_number: jerseyNumber,
                            shirt_number: jerseyNumber,
                            number: jerseyNumber,
                            position: membership.position || squadMember?.position || person.position || null,
                            age: calculateAge(person.birth_date),
                            status: membership.status || 'active',
                            role: membership.role,
                            team_id: String(team.id),
                            team_name: team.name || 'Plantel',
                            tab_name: team.name || 'Plantel',
                        };
                    })
                    .filter(Boolean)
                    .sort((left: any, right: any) => {
                        const teamCompare = String(left.tab_name || '').localeCompare(String(right.tab_name || ''));
                        if (teamCompare !== 0) return teamCompare;
                        const leftNumber = typeof left.jersey_number === 'number' ? left.jersey_number : Number.MAX_SAFE_INTEGER;
                        const rightNumber = typeof right.jersey_number === 'number' ? right.jersey_number : Number.MAX_SAFE_INTEGER;
                        if (leftNumber !== rightNumber) return leftNumber - rightNumber;
                        return String(left.name || '').localeCompare(String(right.name || ''));
                    });

                return {
                    squad,
                    hasSquad: squad.length > 0,
                    source: 'internal' as const,
                };
            }
        }
    } catch (error) {
        console.error('Teams API internal squad error (new layer):', error);
    }

    try {
        const { data: divisions, error: divisionsError } = await db
            .from('club_divisions')
            .select('id, name')
            .eq('club_id', clubId)
            .order('name');

        if (divisionsError && !isMissingRelationError(divisionsError)) {
            throw divisionsError;
        }

        const divisionRows = Array.isArray(divisions) ? divisions : [];
        if (divisionRows.length === 0) {
            const clubRosterFallback = await fetchClubRosterFallback(readClient, clubId, includePlayers);
            if (clubRosterFallback) return clubRosterFallback;
            return fallbackToFamilyBase();
        }

        const { data: roles, error: rolesError } = await db
            .from('club_person_roles')
            .select('person_id, division_id, role, status, position')
            .eq('club_id', clubId)
            .eq('role', 'player');

        if (rolesError && !isMissingRelationError(rolesError)) {
            throw rolesError;
        }

        const playerRoles = Array.isArray(roles)
            ? roles.filter((role: any) => role.person_id && role.division_id)
            : [];

        if (playerRoles.length === 0) {
            const clubRosterFallback = await fetchClubRosterFallback(readClient, clubId, includePlayers);
            if (clubRosterFallback) return clubRosterFallback;
            return fallbackToFamilyBase();
        }

        if (!includePlayers) {
            return { squad: [], hasSquad: true, source: 'legacy' as const };
        }

        const personIds = Array.from(new Set(playerRoles.map((role: any) => String(role.person_id))));
        const divisionIds = Array.from(new Set(playerRoles.map((role: any) => String(role.division_id))));

        const [peopleRes, squadMembersRes] = await Promise.all([
            readClient
                .from('people')
                .select('id, first_name, last_name, full_name, photo_url, avatar_url, birth_date, position')
                .in('id', personIds),
            db
                .from('squad_members')
                .select('division_id, person_id, jersey_number, position')
                .in('division_id', divisionIds),
        ]);

        if (peopleRes.error) {
            throw peopleRes.error;
        }

        if (squadMembersRes.error && !isMissingRelationError(squadMembersRes.error)) {
            throw squadMembersRes.error;
        }

        const divisionById = new Map(
            divisionRows.map((division: any) => [String(division.id), division])
        );
        const peopleById = new Map(
            ((peopleRes.data ?? []) as any[]).map((person) => [String(person.id), person])
        );
        const squadMemberByKey = new Map(
            (((squadMembersRes.data ?? []) as any[])).map((member) => [
                `${String(member.division_id)}:${String(member.person_id)}`,
                member,
            ])
        );

        const squad = playerRoles
            .map((role: any) => {
                const division = divisionById.get(String(role.division_id));
                const person = peopleById.get(String(role.person_id));
                if (!division || !person) return null;

                const squadMember = squadMemberByKey.get(`${String(role.division_id)}:${String(role.person_id)}`);
                const name = person.full_name || `${person.first_name || ''} ${person.last_name || ''}`.trim();
                const jerseyNumber = typeof squadMember?.jersey_number === 'number'
                    ? squadMember.jersey_number
                    : null;

                return {
                    id: String(person.id),
                    player_id: String(person.id),
                    name,
                    player_name: name,
                    image_path: person.photo_url || person.avatar_url || '',
                    photo: person.photo_url || person.avatar_url || '',
                    jersey_number: jerseyNumber,
                    shirt_number: jerseyNumber,
                    number: jerseyNumber,
                    position: role.position || squadMember?.position || person.position || null,
                    age: calculateAge(person.birth_date),
                    status: role.status || 'active',
                    role: role.role,
                    team_id: String(division.id),
                    team_name: division.name || 'Plantel',
                    tab_name: division.name || 'Plantel',
                };
            })
            .filter(Boolean)
            .sort((left: any, right: any) => {
                const teamCompare = String(left.tab_name || '').localeCompare(String(right.tab_name || ''));
                if (teamCompare !== 0) return teamCompare;
                const leftNumber = typeof left.jersey_number === 'number' ? left.jersey_number : Number.MAX_SAFE_INTEGER;
                const rightNumber = typeof right.jersey_number === 'number' ? right.jersey_number : Number.MAX_SAFE_INTEGER;
                if (leftNumber !== rightNumber) return leftNumber - rightNumber;
                return String(left.name || '').localeCompare(String(right.name || ''));
            });

        return {
            squad,
            hasSquad: squad.length > 0,
            source: 'legacy' as const,
        };
    } catch (error) {
        console.error('Teams API internal squad error (legacy):', error);
        const clubRosterFallback = await fetchClubRosterFallback(readClient, clubId, includePlayers).catch(() => null);
        if (clubRosterFallback) return clubRosterFallback;
        return fallbackToFamilyBase();
    }

    return fallbackToFamilyBase();
}

async function fetchInternalClubFamily(readClient: ReadClient, clubId: string): Promise<PublicRelatedClub[]> {
    const db = readClient as any;

    try {
        let familyBaseClubId = clubId;
        const { data: incomingRelation, error: incomingError } = await db
            .from('club_derivatives')
            .select('base_club_id')
            .eq('derived_club_id', clubId)
            .maybeSingle();

        if (incomingError) {
            if (isMissingRelationError(incomingError)) return [];
            throw incomingError;
        }

        familyBaseClubId = incomingRelation?.base_club_id || clubId;

        const { data: outgoingRelations, error: outgoingError } = await db
            .from('club_derivatives')
            .select('derived_club_id')
            .eq('base_club_id', familyBaseClubId);

        if (outgoingError) {
            if (isMissingRelationError(outgoingError)) return [];
            throw outgoingError;
        }

        const familyClubIds = Array.from(new Set([
            familyBaseClubId,
            ...((outgoingRelations ?? []) as Array<{ derived_club_id?: string | null }>)
                .map((relation) => relation.derived_club_id)
                .filter((value): value is string => typeof value === 'string' && value.length > 0),
        ]));

        if (familyClubIds.length <= 1) return [];

        // Los escudos no se traen de la base: un logo_url puede ser un base64 de
        // cientos de KB por filial (la respuesta llegaba a 5 MB). El proxy resuelve
        // cualquier origen a partir del id del club.
        const { data: familyClubs, error: clubsError } = await db
            .from('clubs')
            .select('id, name, short_name, sport, sport_id, city, region, country')
            .in('id', familyClubIds);

        if (clubsError) {
            throw clubsError;
        }

        return ((familyClubs ?? []) as Array<{
            id: string;
            name: string | null;
            short_name: string | null;
            sport: string | null;
            sport_id: string | null;
            city: string | null;
            region: string | null;
            country: string | null;
        }>)
            .filter((club) => club.id && club.name)
            .map((club) => ({
                id: club.id,
                name: club.name || club.id,
                short_name: club.short_name,
                logo_url: buildTeamLogoProxyUrl({ key: club.id, name: club.name }),
                sport: club.sport,
                sport_id: club.sport_id,
                city: club.city,
                region: club.region,
                country: club.country,
                is_base: club.id === familyBaseClubId,
                is_current: club.id === clubId,
            }))
            .sort((left, right) => {
                if (left.is_base) return -1;
                if (right.is_base) return 1;
                return left.name.localeCompare(right.name);
            });
    } catch (error) {
        console.error('Teams API internal family error:', error);
        return [];
    }
}

async function resolveInternalClubBySport(
    readClient: ReadClient,
    club: InternalClubRow,
    preferredSportRaw: string | null,
): Promise<InternalClubRow> {
    const preferredSport = canonicalizeSportId(preferredSportRaw);
    if (!club || !preferredSport) return club;

    const currentSport = canonicalizeSportId(getClubSportValue(club));
    if (currentSport === preferredSport) return club;

    const baseClubCategory = Array.isArray(club.categories)
        ? club.categories.find((category) => category.trim().toLowerCase().startsWith('base_club:'))
        : null;
    let baseClubId = baseClubCategory
        ? baseClubCategory.slice(baseClubCategory.indexOf(':') + 1).trim()
        : club.id;
    const relatedIds = new Set<string>([club.id]);

    try {
        const relationClient = readClient as unknown as ClubDerivativesReadClient;
        const { data: incomingRelation } = await relationClient
            .from('club_derivatives')
            .select('base_club_id')
            .eq('derived_club_id', club.id)
            .maybeSingle();

        baseClubId = incomingRelation?.base_club_id || baseClubId;
        const { data: outgoingRelations } = await relationClient
            .from('club_derivatives')
            .select('derived_club_id, derivative_type')
            .eq('base_club_id', baseClubId);

        const siblingRows = Array.isArray(outgoingRelations) ? outgoingRelations : [];
        siblingRows
            .filter((row) => row.derivative_type === 'other_sport')
            .forEach((row) => relatedIds.add(row.derived_club_id));
    } catch {
        // Fall through to the categories-based family lookup.
    }

    relatedIds.add(baseClubId);

    const shouldQueryLegacyCategories = Array.isArray(club.categories) && club.categories.length > 0;

    if (shouldQueryLegacyCategories) {
        try {
            const { data: categoryCandidates } = await readClient
                .from('clubs')
                .select('*')
                .contains('categories', [`base_club:${baseClubId}`]);

            (categoryCandidates ?? []).forEach((candidate: any) => {
                if (candidate?.id) {
                    relatedIds.add(String(candidate.id));
                }
            });
        } catch {
            // Ignore and keep the current club.
        }
    }

    const candidateIds = Array.from(relatedIds);
    if (candidateIds.length === 0) return club;

    try {
        const { data: candidateClubs } = await readClient
            .from('clubs')
            .select('*')
            .in('id', candidateIds);

        const typedCandidateClubs = (candidateClubs ?? []) as InternalClubRow[];
        const match = typedCandidateClubs.find((candidate) => {
            return canonicalizeSportId(getClubSportValue(candidate)) === preferredSport;
        });

        return match || club;
    } catch {
        return club;
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const rawTeamId = searchParams.get('team_id') || '';
    const teamName = searchParams.get('team_name') || '';
    const teamUrlParam = searchParams.get('team_url') || '';
    const preferredSport = searchParams.get('preferred_sport') || searchParams.get('sport') || '';
    const leagueHint = searchParams.get('league') || '';
    const skipSquad = searchParams.get('skip_squad') === 'true';
    const onlySquad = searchParams.get('only') === 'squad';
    const debugMode = searchParams.get('_debug') === '1';

    if (!rawTeamId) {
        return Response.json({ ok: false, error: 'team_id is required' }, { status: 400 });
    }

    const espnFootballTeamId = parseEspnFootballTeamId(rawTeamId);
    if (espnFootballTeamId) {
        try {
            // Fast path used when the client opens the "Plantilla" tab: skip the
            // schedule/scoreboard/standings work and only hit the roster endpoints.
            if (onlySquad) {
                const squad = await getEspnFootballTeamSquad(
                    espnFootballTeamId.teamId,
                    espnFootballTeamId.leagueSlug || leagueHint || null,
                );
                return Response.json({
                    ok: true,
                    resolvedClubId: null,
                    details: null,
                    results: [],
                    fixtures: [],
                    squad,
                    transfers: [],
                });
            }

            const primarySlug = espnFootballTeamId.leagueSlug || leagueHint || null;
            // National teams split their calendar across Mundial + Eliminatorias + Amistosos;
            // pass them as extras so the page shows the full team agenda, not just one comp.
            const extraSlugs = computeEspnSoccerExtraScheduleLeagues(primarySlug);
            const bundle = await getEspnFootballTeamBundle(
                espnFootballTeamId.teamId,
                primarySlug,
                extraSlugs,
                { skipSquad },
            );
            if (!bundle) {
                return Response.json({ ok: false, error: 'Team not found' }, { status: 404 });
            }

            const details = {
                ...bundle.details,
                supported_tabs: buildSupportedTabs({
                    supportedTabs: bundle.details?.supported_tabs,
                    // On the initial load the squad fetch is skipped (lazy-loaded via
                    // `only=squad`), so bundle.squad is empty. ESPN soccer teams always
                    // expose a roster, so keep advertising the tab instead of dropping it.
                    hasSquad: skipSquad ? true : (Array.isArray(bundle.squad) && bundle.squad.length > 0),
                    hasTransfers: false,
                }),
            };

            return Response.json({
                ok: true,
                resolvedClubId: null,
                details,
                results: bundle.results,
                fixtures: bundle.fixtures,
                squad: skipSquad ? [] : bundle.squad,
                transfers: [],
            });
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            console.error('Teams API ESPN Soccer error', e);
            return Response.json(
                { ok: false, error: 'Failed to load ESPN soccer team data', details: message },
                { status: 500 }
            );
        }
    }

    const espnTeamId = parseEspnAmericanFootballTeamId(rawTeamId);
    if (espnTeamId) {
        try {
            const bundle = await getEspnAmericanFootballTeamBundle(espnTeamId, leagueHint || null);
            if (!bundle) {
                return Response.json({ ok: false, error: 'Team not found' }, { status: 404 });
            }

            const details = {
                ...bundle.details,
                supported_tabs: buildSupportedTabs({
                    supportedTabs: bundle.details?.supported_tabs,
                    hasSquad: Array.isArray(bundle.squad) && bundle.squad.length > 0,
                    hasTransfers: Array.isArray(bundle.transfers) && bundle.transfers.length > 0,
                }),
            };

            return Response.json({
                ok: true,
                resolvedClubId: null,
                details,
                results: bundle.results,
                fixtures: bundle.fixtures,
                squad: skipSquad ? [] : bundle.squad,
                transfers: bundle.transfers,
            });
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            console.error('Teams API ESPN error', e);
            return Response.json(
                { ok: false, error: 'Failed to load ESPN team data', details: message },
                { status: 500 }
            );
        }
    }

    const rugbyTeamId =
        parseRugbyApiSportsTeamId(rawTeamId) ||
        (canonicalizeSportId(preferredSport) === 'rugby' && /^\d+$/.test(rawTeamId) ? rawTeamId : null);
    if (rugbyTeamId) {
        return Response.json({ ok: false, error: 'Team not found' }, { status: 404 });
    }

    if (parseSofaScoreTeamId(rawTeamId) && isSofaScoreServiceConfigured()) {
        try {
            const bundle = await getSofaScoreTeamBundle(rawTeamId) as {
                details?: { DATA?: TeamDetailsPayload | null } | null;
                squad?: { DATA?: unknown } | null;
                results?: unknown;
                fixtures?: unknown;
            } | null;

            if (!bundle) {
                return Response.json({ ok: false, error: 'Team not found' }, { status: 404 });
            }

            const remoteDetails = bundle.details?.DATA ?? null;
            const squadData = bundle.squad?.DATA ?? [];
            const flatResults = flattenFsMatches(bundle.results);
            const flatFixtures = flattenFsMatches(bundle.fixtures);
            const finalResults = sortMatchesByDate(flatResults, 'desc');
            const finalFixtures = sortMatchesByDate(flatFixtures, 'asc');

            const detailsWithTabs = remoteDetails
                ? {
                    ...remoteDetails,
                    supported_tabs: buildSupportedTabs({
                        supportedTabs: (remoteDetails as Record<string, unknown>).supported_tabs,
                        hasSquad: Array.isArray(squadData)
                            ? squadData.length > 0
                            : Boolean(squadData),
                        hasTransfers: false,
                    }),
                }
                : null;

            return Response.json({
                ok: true,
                resolvedClubId: null,
                details: detailsWithTabs,
                results: finalResults,
                fixtures: finalFixtures,
                squad: skipSquad ? [] : squadData,
                transfers: [],
            });
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            console.error('Teams API SofaScore error', e);
            return Response.json(
                { ok: false, error: 'Failed to load SofaScore team data', details: message },
                { status: 502 },
            );
        }
    }

    // 1. Check Supabase for internal club info first
    let details: TeamDetailsPayload | null = null;
    const internalResults: NormalizedInternalMatch[] = [];
    const internalFixtures: NormalizedInternalMatch[] = [];
    let internalExternalId: string | null = null;
    let internalClubName: string = '';
    let resolvedClubId: string | null = null;
    let internalSquad: unknown = [];
    let hasInternalSquad = false;
    let internalClubFamily: PublicRelatedClub[] = [];

    try {
        const readClient = await getReadClient();
        // El logo_url NO entra en este select: para cientos de clubes es un base64
        // de ~800 KB que viajaba desde la base en cada carga; el proxy lo sirve por
        // id. Si el esquema no tiene alguna de estas columnas, se reintenta con *.
        let internalClubQuery = await readClient
            .from('clubs')
            .select('id, name, short_name, sport, sport_id, external_id, country, city, region, categories, updated_at')
            .eq('id', rawTeamId)
            .single();
        if (internalClubQuery.error && (internalClubQuery.error.code === '42703' || internalClubQuery.error.code === 'PGRST204')) {
            internalClubQuery = await readClient
                .from('clubs')
                .select('*')
                .eq('id', rawTeamId)
                .single() as unknown as typeof internalClubQuery;
        }
        const internalClub = internalClubQuery.data as InternalClubRow | null;

        if (internalClub) {
            const effectiveClub = await resolveInternalClubBySport(readClient, internalClub as InternalClubRow, preferredSport);
            resolvedClubId = effectiveClub.id;

            // Query internal matches from Supabase.
            // Los escudos NO viajan embebidos en cada fila: un logo_url puede ser un
            // base64 de cientos de KB y multiplicado por 600 filas la consulta muere
            // por statement timeout (57014) — mismo aprendizaje que
            // /api/clubs/[id]/history. Se resuelven una vez por club más abajo.
            const internalMatchesBaseQuery = () => readClient
                .from('matches')
                .select(`
                    id, date_time, status, score, sport_id, sport, round_label,
                    home_club_id, away_club_id, tournament_id,
                    home_club:clubs!matches_home_club_id_fkey(name),
                    away_club:clubs!matches_away_club_id_fkey(name),
                    tournament:tournaments!matches_tournament_id_fkey(name, sport_id)
                `);

            // Plantel, familia y partidos no dependen entre sí: viajan juntos, porque
            // contra una base cross-region cada ida y vuelta secuencial son segundos.
            const [internalSquadState, familyClubs, homeMatchesResult, awayMatchesResult, ownCrestProbe] = await Promise.all([
                fetchInternalClubSquad(readClient, effectiveClub.id, { includePlayers: !skipSquad }),
                onlySquad ? Promise.resolve<PublicRelatedClub[]>([]) : fetchInternalClubFamily(readClient, effectiveClub.id),
                onlySquad ? Promise.resolve(null) : internalMatchesBaseQuery()
                    .eq('home_club_id', effectiveClub.id)
                    .order('date_time', { ascending: false })
                    .limit(300),
                onlySquad ? Promise.resolve(null) : internalMatchesBaseQuery()
                    .eq('away_club_id', effectiveClub.id)
                    .order('date_time', { ascending: false })
                    .limit(300),
                // Solo la PREGUNTA "¿tiene escudo propio?", nunca el escudo: el
                // filtro corre en Postgres y lo que vuelve es el id o nada. Hace
                // falta para no ponerle token de cache inmutable al escudo que una
                // categoría hereda de su club madre — ver `clubLogoVersion`.
                readClient
                    .from('clubs')
                    .select('id')
                    .eq('id', effectiveClub.id)
                    .not('logo_url', 'is', null)
                    .maybeSingle(),
            ]);
            internalSquad = internalSquadState.squad;
            hasInternalSquad = internalSquadState.hasSquad;

            // Fast path para el fetch perezoso del plantel (`only=squad`): la pestaña
            // Plantilla no necesita ni la familia de clubes ni los 600 partidos. Si el
            // club tampoco tiene vínculo externo, no hay plantel remoto que buscar.
            if (onlySquad && (hasInternalSquad || !effectiveClub.external_id)) {
                return Response.json({
                    ok: true,
                    resolvedClubId,
                    details: null,
                    results: [],
                    fixtures: [],
                    squad: internalSquad,
                    transfers: [],
                });
            }

            internalClubFamily = familyClubs;
            // El escudo propio también sale por el proxy: el select liviano de arriba
            // ya no trae logo_url (y si viene de resolveInternalClubBySport, puede ser
            // un base64 enorme que no tiene por qué viajar al cliente).
            const hasOwnCrest = Boolean((ownCrestProbe as { data?: { id?: string } | null } | null)?.data?.id);
            const clubLogoUrl = buildTeamLogoProxyUrl({
                key: effectiveClub.id,
                name: effectiveClub.name,
                version: clubLogoVersion({
                    logo_url: hasOwnCrest ? 'own' : null,
                    updated_at: (effectiveClub as { updated_at?: string | null }).updated_at ?? null,
                }),
            });
            details = {
                id: effectiveClub.id,
                name: effectiveClub.name,
                image_path: clubLogoUrl,
                logo: clubLogoUrl,
                logo_url: clubLogoUrl,
                country: effectiveClub.country,
                city: effectiveClub.city,
                region: effectiveClub.region,
                sport: effectiveClub.sport || effectiveClub.sport_id || null,
                is_internal: true,
                related_clubs: internalClubFamily,
                supported_tabs: buildSupportedTabs({
                    hasSquad: hasInternalSquad,
                    hasTransfers: false,
                }),
            };
            internalExternalId = effectiveClub.external_id || null;
            internalClubName = effectiveClub.name || '';

            if (homeMatchesResult?.error) throw homeMatchesResult.error;
            if (awayMatchesResult?.error) throw awayMatchesResult.error;

            const typedMatchRows = mergeInternalMatchRows(
                (homeMatchesResult?.data ?? null) as InternalMatchRow[] | null,
                (awayMatchesResult?.data ?? null) as InternalMatchRow[] | null,
            );
            // Un escudo por club, una sola vez y por el proxy: traer los logo_url
            // crudos de 30 rivales son varios MB de base64 desde la base.
            const matchClubIds = Array.from(new Set(
                typedMatchRows
                    .flatMap((row) => [row.home_club_id, row.away_club_id])
                    .filter((value): value is string => Boolean(value))
            ));
            const matchClubLogos = new Map<string, { logo: string; updatedAt: string }>();
            if (matchClubIds.length > 0) {
                try {
                    // La segunda consulta pregunta cuáles tienen escudo PROPIO y
                    // devuelve solo ids: el filtro corre en Postgres y ningún base64
                    // cruza la red — el `logo_url` crudo de 30 rivales es lo que
                    // tumbó esta ruta con un 57014. Hace falta porque una categoría
                    // no tiene `logo_url` y muestra el escudo de su club madre, así
                    // que su `updated_at` no versiona nada. Ver `clubLogoVersion`.
                    const [{ data: matchClubs }, { data: crestRows }] = await Promise.all([
                        readClient.from('clubs').select('id, name, updated_at').in('id', matchClubIds),
                        readClient.from('clubs').select('id').in('id', matchClubIds).not('logo_url', 'is', null),
                    ]);

                    const withOwnCrest = new Set(
                        ((crestRows ?? []) as Array<{ id?: string | null }>)
                            .map((row) => row.id)
                            .filter((value): value is string => Boolean(value))
                    );

                    for (const club of (matchClubs ?? []) as Array<{ id: string; name: string | null; updated_at: string | null }>) {
                        const version = clubLogoVersion({
                            logo_url: withOwnCrest.has(club.id) ? 'own' : null,
                            updated_at: club.updated_at,
                        });
                        matchClubLogos.set(club.id, {
                            logo: buildTeamLogoProxyUrl({ key: club.id, name: club.name, version }) ?? '',
                            updatedAt: version ?? '',
                        });
                    }
                } catch {
                    // Sin escudos la lista de partidos sigue sirviendo.
                }
            }
            if (typedMatchRows.length > 0) {
                // 'final' es el estado que usa ESTA base: los 88.196 partidos de
                // `matches` lo escriben así. Faltaba en la lista, y por eso un
                // partido terminado dependía de que la fecha lo delatara.
                const FINISHED_STATUSES = new Set([
                    'final', 'finished', 'completed', 'scored', 'ft', 'aet', 'pen', 'awarded',
                    'finalizado', 'jugado', 'played', 'result'
                ]);
                const SCHEDULED_STATUSES = new Set([
                    'scheduled', 'ns', 'not started', 'pendiente', 'programado', 'upcoming'
                ]);
                const now = Date.now();
                for (const row of typedMatchRows) {
                    const homeClub = Array.isArray(row.home_club) ? row.home_club[0] : row.home_club;
                    const awayClub = Array.isArray(row.away_club) ? row.away_club[0] : row.away_club;
                    const tournament = Array.isArray(row.tournament) ? row.tournament[0] : row.tournament;
                    const homeLogo = row.home_club_id ? matchClubLogos.get(row.home_club_id) : null;
                    const awayLogo = row.away_club_id ? matchClubLogos.get(row.away_club_id) : null;
                    const normalized = normalizeInternalMatch({
                        ...row,
                        home_name: homeClub?.name,
                        home_logo: homeLogo?.logo,
                        home_logo_updated_at: homeLogo?.updatedAt,
                        away_name: awayClub?.name,
                        away_logo: awayLogo?.logo,
                        away_logo_updated_at: awayLogo?.updatedAt,
                        // Un partido histórico puede no tener torneo en la base sin
                        // ser un amistoso: el clásico Bayonne–Biarritz reparte 85
                        // partidos en 15 competencias, de las que solo dos existen
                        // como fila. Para esas trece el nombre viaja en
                        // `round_label`, y sin esta caída la ficha las mostraba en
                        // blanco, como si el club hubiera jugado sueltos partidos
                        // sin nombre desde 1930.
                        tournament_name: tournament?.name || row.round_label || null,
                        // El deporte salía SOLO del torneo, y un amistoso no tiene
                        // torneo: quedaba en null y la ficha del club lo tiraba a la
                        // basura, porque su filtro de deporte compara `sport_id`
                        // contra el elegido. Un partido que no se ve porque le falta
                        // una etiqueta que el propio partido sí trae. Se cae al
                        // deporte del partido y, si tampoco está, al del club.
                        sport_id: tournament?.sport_id
                            || row.sport_id
                            || row.sport
                            || effectiveClub.sport_id
                            || effectiveClub.sport
                            || null,
                    });
                    const st = (row.status || '').toLowerCase();
                    const matchDate = row.date_time ? new Date(row.date_time).getTime() : NaN;
                    // `matchDate > 0` parecía "tiene fecha", pero el epoch de
                    // cualquier partido anterior a 1970 es NEGATIVO: los 23 del
                    // clásico Bayonne–Biarritz jugados entre 1930 y 1969 daban
                    // "sin fecha" y la ficha los listaba como PRÓXIMOS. Lo que hay
                    // que preguntar es si la fecha es válida, no si es positiva.
                    const isPast = Number.isFinite(matchDate) && matchDate < now;
                    const isFinished = FINISHED_STATUSES.has(st) || (isPast && !SCHEDULED_STATUSES.has(st));
                    if (isFinished) {
                        internalResults.push(normalized);
                    } else {
                        internalFixtures.push(normalized);
                    }
                }
            }
        }
    } catch (error) {
        // Que el club no exista localmente es esperado (equipo externo puro), pero un
        // error real acá dejaba la página sin resultados ni fixtures y sin rastro:
        // así se escondió durante semanas un statement timeout de Supabase.
        console.error('Teams API internal club/matches error:', error);
    }

    // If the local club is mapped to an ESPN soccer team via external_id
    // (format: espn-soccer-team-{leagueSlug}-{id}), surface ESPN fixtures/results/squad
    // alongside the local club identity (keeps "Editar logo" + local matches working).
    if (details && internalExternalId) {
        const espnSoccerRef = parseEspnFootballTeamId(internalExternalId);
        if (espnSoccerRef && espnSoccerRef.teamId) {
            try {
                if (onlySquad) {
                    const squadOnly = await getEspnFootballTeamSquad(
                        espnSoccerRef.teamId,
                        espnSoccerRef.leagueSlug || leagueHint || null,
                    );
                    return Response.json({
                        ok: true,
                        resolvedClubId,
                        details: null,
                        results: [],
                        fixtures: [],
                        squad: hasInternalSquad ? internalSquad : squadOnly,
                        transfers: [],
                    });
                }

                const primarySlug = espnSoccerRef.leagueSlug || leagueHint || null;
                const extraSlugs = computeEspnSoccerExtraScheduleLeagues(primarySlug);
                const bundle = await getEspnFootballTeamBundle(
                    espnSoccerRef.teamId,
                    primarySlug,
                    extraSlugs,
                    { skipSquad: skipSquad || hasInternalSquad },
                );
                if (bundle) {
                    const espnSquad = Array.isArray(bundle.squad) ? bundle.squad : [];
                    const espnResults = Array.isArray(bundle.results) ? bundle.results : [];
                    const espnFixtures = Array.isArray(bundle.fixtures) ? bundle.fixtures : [];

                    const mergedResults = internalResults.length > 0
                        ? sortMatchesByDate(internalResults, 'desc')
                        : sortMatchesByDate(espnResults, 'desc');
                    const mergedFixtures = internalFixtures.length > 0
                        ? sortMatchesByDate(internalFixtures, 'asc')
                        : sortMatchesByDate(espnFixtures, 'asc');

                    const squadForResponse = hasInternalSquad
                        ? internalSquad
                        : (skipSquad ? [] : espnSquad);
                    // When skipSquad is set the ESPN roster isn't fetched yet (lazy-loaded
                    // via `only=squad`), so espnSquad is empty. The ESPN mapping still
                    // exposes a roster, so keep the squad tab available in that case.
                    const hasAnySquad = hasInternalSquad || (skipSquad ? true : espnSquad.length > 0);

                    const mergedDetails = applyExternalTeamLogoOverride({
                        ...details,
                        // Prefer local id (UUID) so admin actions and family links work.
                        id: details.id,
                        // Surface ESPN metadata (league, season, standing, etc.) but keep local name/logo.
                        country: details.country || bundle.details?.country || null,
                        venue: details.venue || bundle.details?.venue || null,
                        city: details.city || bundle.details?.city || null,
                        region: details.region || bundle.details?.region || null,
                        short_code: details.short_code || bundle.details?.short_code || null,
                        current_league: bundle.details?.current_league || null,
                        current_league_logo: bundle.details?.current_league_logo || null,
                        current_season: bundle.details?.current_season || null,
                        standing: bundle.details?.standing || null,
                        statistics: bundle.details?.statistics || null,
                        provider: 'espn',
                        external_id: internalExternalId,
                        league_slug: espnSoccerRef.leagueSlug || null,
                        supported_tabs: buildSupportedTabs({
                            hasSquad: hasAnySquad,
                            hasTransfers: false,
                        }),
                    });

                    return Response.json({
                        ok: true,
                        resolvedClubId,
                        details: mergedDetails,
                        results: mergedResults,
                        fixtures: mergedFixtures,
                        squad: squadForResponse,
                        transfers: [],
                    });
                }
            } catch (e: unknown) {
                const message = e instanceof Error ? e.message : String(e);
                console.error('Teams API ESPN soccer (local club mapping) error', e, message);
                // Fall through to the FlashScore path so the page still renders local data.
            }
        }
    }

    const teamId = stripFsTeamPrefix(rawTeamId);
    const isExternalId = /^[a-zA-Z0-9]+$/.test(teamId) && !teamId.includes('-');
    // Also treat internal clubs with external_id as having external data
    const effectiveExternalId = isExternalId ? teamId : (internalExternalId ? stripFsTeamPrefix(internalExternalId) : null);

    // Look up cached team_url from external_teams table to avoid slug mismatches
    let cachedTeamUrl: string | null = null;
    let cachedExternalTeam: ExternalTeamCacheRow | null = null;
    if (effectiveExternalId) {
        try {
            const readClient = await getReadClient();
            const { data: extTeam } = await (readClient as any)
                .from('external_teams')
                .select('id, source, name, short_name, logo_url, sport, country, team_url, updated_at')
                .eq('id', effectiveExternalId)
                .maybeSingle();
            if (extTeam) cachedExternalTeam = extTeam as ExternalTeamCacheRow;
            if (extTeam?.team_url) cachedTeamUrl = extTeam.team_url as string;
        } catch {
            // Ignore — external_teams table may not have team_url column yet
        }
    }

    try {
        // Matches come exclusively from local Supabase DB (internalResults/internalFixtures)
        // FlashScore is only used for team details and squad if external_id is available

        // Prefer: query param > cached from DB > constructed from slugify
        let teamUrl = teamUrlParam || cachedTeamUrl || '';
        const extractedName = teamName || internalClubName;

        if (!teamUrl && extractedName && effectiveExternalId) {
            teamUrl = `/team/${slugify(extractedName)}/${effectiveExternalId}/`;
        }

        // Extract the FlashScore team_id from the URL when not already known.
        // This covers clubs stored in the DB (UUID id) without external_id set but
        // navigated to from a match page that included the team_url query param.
        // Format: /team/slug/ID/ → last non-empty segment is the ID.
        let resolvedExternalId = effectiveExternalId;
        if (!resolvedExternalId && teamUrl) {
            const segments = teamUrl.split('/').filter(Boolean);
            if (segments.length >= 3 && segments[0] === 'team') {
                const maybeId = segments[segments.length - 1];
                if (/^[a-zA-Z0-9]+$/.test(maybeId)) {
                    resolvedExternalId = maybeId;
                }
            }
        }

        let squad: unknown = internalSquad;
        let fsResults: NormalizedInternalMatch[] = [];
        let fsFixtures: NormalizedInternalMatch[] = [];
        let transfers: unknown[] = [];

        if (resolvedExternalId) {
            const needFsResults = internalResults.length === 0;
            const needFsFixtures = internalFixtures.length === 0;

            const [detailsRes, squadRes, transfersRes, fsResultsRes, fsFixturesRes] =
                await Promise.allSettled([
                    teamUrl ? getTeamDetails(teamUrl) : Promise.resolve(null),
                    teamUrl && !skipSquad && !hasInternalSquad ? getTeamSquad(teamUrl) : Promise.resolve(null),
                    getTeamTransfers(resolvedExternalId),
                    needFsResults ? getTeamResults(resolvedExternalId) : Promise.resolve(null),
                    needFsFixtures ? getTeamFixtures(resolvedExternalId) : Promise.resolve(null),
                ]);

            if (debugMode) {
                return Response.json({
                    _debug: true,
                    resolvedExternalId,
                    teamUrl,
                    needFsResults,
                    needFsFixtures,
                    internalResultsCount: internalResults.length,
                    internalFixturesCount: internalFixtures.length,
                    detailsRes: detailsRes.status === 'fulfilled' ? detailsRes.value : { error: (detailsRes as PromiseRejectedResult).reason },
                    transfersRes: transfersRes.status === 'fulfilled' ? transfersRes.value : { error: (transfersRes as PromiseRejectedResult).reason },
                    fsResultsRaw: fsResultsRes.status === 'fulfilled' ? fsResultsRes.value : { error: (fsResultsRes as PromiseRejectedResult).reason },
                    fsFixturesRaw: fsFixturesRes.status === 'fulfilled' ? fsFixturesRes.value : { error: (fsFixturesRes as PromiseRejectedResult).reason },
                    fsResultsParsed: fsResultsRes.status === 'fulfilled' && fsResultsRes.value ? flattenFsMatches(fsResultsRes.value) : [],
                    fsFixturesParsed: fsFixturesRes.status === 'fulfilled' && fsFixturesRes.value ? flattenFsMatches(fsFixturesRes.value) : [],
                });
            }

            const remoteDetails = normalize(detailsRes);
            const remoteSquad = normalize(squadRes);
            if (!hasInternalSquad && remoteSquad) {
                squad = remoteSquad;
            }

            // Persist the working team_url to external_teams cache if not already stored
            if (teamUrl && !cachedTeamUrl && remoteDetails && isRecord(remoteDetails) && !Array.isArray(remoteDetails)) {
                try {
                    await persistExternalTeamUrlCache({
                        id: resolvedExternalId,
                        teamUrl,
                        source: 'flashscore',
                        name: String((remoteDetails as any).name || extractedName || resolvedExternalId),
                    });
                } catch {
                    // Non-critical — ignore write failures
                }
            }
            const rawTransfers = normalize(transfersRes);
            transfers = Array.isArray(rawTransfers) ? rawTransfers : [];

            if (isRecord(remoteDetails) && !Array.isArray(remoteDetails)) {
                details = {
                    ...(details ?? {}),
                    ...remoteDetails,
                };
            }

            if (needFsResults && fsResultsRes.status === 'fulfilled' && fsResultsRes.value) {
                fsResults = flattenFsMatches(fsResultsRes.value);
            }
            if (needFsFixtures && fsFixturesRes.status === 'fulfilled' && fsFixturesRes.value) {
                fsFixtures = flattenFsMatches(fsFixturesRes.value);
            }
        } else if (teamUrl) {
            const [detailsRes, squadRes] = await Promise.allSettled([
                getTeamDetails(teamUrl),
                skipSquad || hasInternalSquad ? Promise.resolve(null) : getTeamSquad(teamUrl),
            ]);
            const remoteDetails = normalize(detailsRes);
            const remoteSquad = normalize(squadRes);
            if (!hasInternalSquad && remoteSquad) {
                squad = remoteSquad;
            }
            if (isRecord(remoteDetails) && !Array.isArray(remoteDetails)) {
                details = {
                    ...(details ?? {}),
                    ...remoteDetails,
                };
            }
        }

        const baseResults = sortMatchesByDate(internalResults.length > 0 ? internalResults : fsResults, 'desc');
        const baseFixtures = sortMatchesByDate(internalFixtures.length > 0 ? internalFixtures : fsFixtures, 'asc');
        const matchExternalTeamIds = Array.from(new Set(
            [...baseResults, ...baseFixtures]
                .flatMap((match) => [match.home_team?.team_id, match.away_team?.team_id])
                .flatMap((teamId) => buildExternalTeamLookupKeys(teamId))
                .filter((teamId) => /^[a-z0-9-]+$/i.test(teamId))
        ));
        let externalTeamCacheMap = new Map<string, ExternalTeamCacheRow>();

        if (cachedExternalTeam) {
            externalTeamCacheMap = buildExternalTeamCacheMap([cachedExternalTeam]);
        }

        if (matchExternalTeamIds.length > 0) {
            try {
                const readClient = await getReadClient();
                const { data: externalTeams } = await (readClient as any)
                    .from('external_teams')
                    .select('id, source, name, short_name, logo_url, sport, country, team_url, updated_at')
                    .in('id', matchExternalTeamIds);

                if (Array.isArray(externalTeams) && externalTeams.length > 0) {
                    externalTeamCacheMap = buildExternalTeamCacheMap([
                        ...Array.from(new Set(externalTeamCacheMap.values())),
                        ...(externalTeams as ExternalTeamCacheRow[]),
                    ]);
                }
            } catch {
                // Ignore missing table/schema issues and keep rendering with proxy fallback URLs.
            }
        }

        const enrichedDetails = isRecord(details)
            ? enrichExternalTeamSource(
                details,
                findExternalTeamCacheRecord(
                    externalTeamCacheMap,
                    effectiveExternalId,
                    resolvedExternalId,
                    details.id,
                    details.external_id,
                    details.team_url,
                    details.name,
                    teamName,
                ),
            )
            : details;
        const finalResults = enrichMatchesWithExternalTeamCache(baseResults, externalTeamCacheMap);
        const finalFixtures = enrichMatchesWithExternalTeamCache(baseFixtures, externalTeamCacheMap);
        const detailsWithOverride = applyExternalTeamLogoOverride(enrichedDetails);
        const hasExternalSquadSupport = Boolean(effectiveExternalId || teamUrlParam || cachedTeamUrl);
        const detailsForResponse = isRecord(detailsWithOverride)
            ? {
                ...detailsWithOverride,
                supported_tabs: buildSupportedTabs({
                    supportedTabs: detailsWithOverride.supported_tabs,
                    hasSquad: hasInternalSquad || hasExternalSquadSupport,
                    hasTransfers: transfers.length > 0,
                }),
            }
            : detailsWithOverride;

        return Response.json({
            ok: true,
            resolvedClubId,
            details: detailsForResponse,
            results: finalResults,
            fixtures: finalFixtures,
            squad: squad || [],
            transfers,
        });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('Teams API error', e);
        return Response.json(
            { ok: false, error: 'Failed to load team data', details: message },
            { status: 500 }
        );
    }
}
