import { getReadClient } from '@/lib/supabase/read';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import {
    getEspnAmericanFootballTeamBundle,
    parseEspnAmericanFootballTeamId,
} from '@/lib/services/espnAmericanFootball';
import {
    getTeamDetails,
    getTeamSquad,
    getTeamResults,
    getTeamFixtures,
    getTeamTransfers,
} from '@/lib/services/flashscore';
import { canonicalizeSportId, getClubSportValue } from '@/lib/clubDerivatives';
import {
    getRugbyApiSportsGames,
    getRugbyApiSportsLeagues,
    getRugbyApiSportsSeasons,
    getRugbyApiSportsStandings,
    getRugbyApiSportsTeamStatistics,
    getRugbyApiSportsTeams,
    mapRugbyApiSportsStatus,
} from '@/lib/services/rugbyApiSports';
import {
    buildRugbyTeamDetailsPayload,
    normalizeRugbyGameForTournamentViews,
    normalizeRugbyStandingsRows,
} from '@/lib/services/rugbyApiSportsTransforms';
import { fetchPeopleByClub, type PersonWithRole } from '@/lib/services/personService';
import { sortMatchesByDate } from '@/lib/utils/matchOrdering';
import { applyExternalTeamLogoOverride } from '@/lib/utils/teamLogoOverrides';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';

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
    home_club_id?: string | null;
    away_name?: string | null;
    away_logo?: string | null;
    away_club_id?: string | null;
    tournament_name?: string | null;
    sport_id?: string | null;
};
type ClubMatchRelation = {
    name: string | null;
    logo_url: string | null;
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
    };
    away_team: {
        name: string;
        small_image_path: string;
        team_id: string;
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

function slugify(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function normalizeRugbyTeamMatch(match: any) {
    return {
        ...normalizeRugbyGameForTournamentViews(match),
        sport_id: 'rugby',
        status: mapRugbyApiSportsStatus(match.status),
    };
}

async function resolveRugbyTeamSeasonContext(teamId: string) {
    const seasons = await getRugbyApiSportsSeasons().catch(() => []);
    const candidateSeasons = Array.from(new Set(
        seasons
            .map((season) => Number(season))
            .filter((season) => Number.isFinite(season))
            .sort((left, right) => right - left)
            .slice(0, 6)
    ));

    if (candidateSeasons.length === 0) {
        return {
            season: null as number | null,
            games: [] as any[],
            primaryLeagueId: null as number | null,
            league: null as any,
            standingRow: null as any,
        };
    }

    const seasonResults = await Promise.all(candidateSeasons.map(async (season) => ({
        season,
        games: await getRugbyApiSportsGames({
            team: teamId,
            season,
            timezone: 'America/Argentina/Buenos_Aires',
        }).catch(() => []),
    })));

    const resolvedSeasonResult = seasonResults.find((entry) => entry.games.length > 0) || seasonResults[0];
    const season = resolvedSeasonResult?.season ?? null;
    const games = resolvedSeasonResult?.games ?? [];

    const leagueUsage = new Map<number, { count: number; latestTimestamp: number }>();
    for (const game of games) {
        const leagueId = Number(game?.league?.id);
        if (!Number.isFinite(leagueId)) continue;
        const current = leagueUsage.get(leagueId) || { count: 0, latestTimestamp: 0 };
        leagueUsage.set(leagueId, {
            count: current.count + 1,
            latestTimestamp: Math.max(current.latestTimestamp, Number(game?.timestamp || 0)),
        });
    }

    const primaryLeagueId = Array.from(leagueUsage.entries())
        .sort((left, right) => {
            if (right[1].count !== left[1].count) return right[1].count - left[1].count;
            return right[1].latestTimestamp - left[1].latestTimestamp;
        })[0]?.[0] ?? null;

    const [league, standingsRaw] = await Promise.all([
        primaryLeagueId && season
            ? getRugbyApiSportsLeagues({ id: primaryLeagueId, season }).then((response) => response[0] || null).catch(() => null)
            : Promise.resolve(null),
        primaryLeagueId && season
            ? getRugbyApiSportsStandings({ league: primaryLeagueId, season }).catch(() => [])
            : Promise.resolve([]),
    ]);

    const standingRow = normalizeRugbyStandingsRows(standingsRaw).find((row) => row.team_id === `ras-team-${teamId}`) || null;

    return {
        season,
        games,
        primaryLeagueId,
        league,
        standingRow,
    };
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
        },
        away_team: {
            name: m.away_name || m.away_club_id || '',
            small_image_path: m.away_logo || '',
            team_id: m.away_club_id || '',
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

        const { data: familyClubs, error: clubsError } = await db
            .from('clubs')
            .select('id, name, short_name, logo_url, sport, sport_id, city, region, country')
            .in('id', familyClubIds);

        if (clubsError) {
            throw clubsError;
        }

        return ((familyClubs ?? []) as Array<{
            id: string;
            name: string | null;
            short_name: string | null;
            logo_url: string | null;
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
                logo_url: club.logo_url,
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
    const debugMode = searchParams.get('_debug') === '1';

    if (!rawTeamId) {
        return Response.json({ ok: false, error: 'team_id is required' }, { status: 400 });
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
        try {
            const [teamsResult, context] = await Promise.all([
                getRugbyApiSportsTeams({ id: rugbyTeamId }).catch(() => []),
                resolveRugbyTeamSeasonContext(rugbyTeamId),
            ]);
            const games = context.games;
            const derivedTeamFromGames = games
                .flatMap((game: any) => [game?.teams?.home, game?.teams?.away])
                .find((team: any) => String(team?.id || '') === String(rugbyTeamId));
            const team = teamsResult[0] || derivedTeamFromGames || null;
            if (!team) {
                return Response.json({ ok: false, error: 'Team not found' }, { status: 404 });
            }

            const normalizedGames = games.map(normalizeRugbyTeamMatch);
            const statistics = context.primaryLeagueId && context.season
                ? await getRugbyApiSportsTeamStatistics({
                    league: context.primaryLeagueId,
                    season: context.season,
                    team: rugbyTeamId,
                }).catch(() => null)
                : null;

            const details = {
                ...buildRugbyTeamDetailsPayload(team, statistics),
                current_league: context.league?.name || games[0]?.league?.name || '',
                current_league_logo: context.league?.logo || games[0]?.league?.logo || '',
                current_season: context.season,
                standing: context.standingRow ? {
                    position: context.standingRow.position,
                    points: context.standingRow.points,
                    played: context.standingRow.played,
                    won: context.standingRow.won,
                    drawn: context.standingRow.drawn,
                    lost: context.standingRow.lost,
                } : null,
            };
            const detailsWithTabs = {
                ...details,
                supported_tabs: buildSupportedTabs({
                    supportedTabs: (details as any).supported_tabs,
                    hasSquad: false,
                    hasTransfers: false,
                }),
            };
            const results = sortMatchesByDate(
                normalizedGames.filter((match) => match.status === 'final'),
                'desc',
            );
            const fixtures = sortMatchesByDate(
                normalizedGames.filter((match) => match.status !== 'final'),
                'asc',
            );

            return Response.json({
                ok: true,
                resolvedClubId: null,
                details: detailsWithTabs,
                results,
                fixtures,
                squad: [],
                transfers: [],
            });
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            console.error('Teams API rugby error', e);
            return Response.json(
                { ok: false, error: 'Failed to load rugby team data', details: message },
                { status: 500 }
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
        const { data: internalClub } = await readClient
            .from('clubs')
            .select('*')
            .eq('id', rawTeamId)
            .single();

        if (internalClub) {
            const effectiveClub = await resolveInternalClubBySport(readClient, internalClub as InternalClubRow, preferredSport);
            resolvedClubId = effectiveClub.id;
            const internalSquadState = await fetchInternalClubSquad(readClient, effectiveClub.id, {
                includePlayers: !skipSquad,
            });
            internalSquad = internalSquadState.squad;
            hasInternalSquad = internalSquadState.hasSquad;
            internalClubFamily = await fetchInternalClubFamily(readClient, effectiveClub.id);
            details = {
                id: effectiveClub.id,
                name: effectiveClub.name,
                image_path: effectiveClub.logo_url,
                logo: effectiveClub.logo_url,
                logo_url: effectiveClub.logo_url,
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

            // Query internal matches from Supabase
            const internalMatchesBaseQuery = () => readClient
                .from('matches')
                .select(`
                    id, date_time, status, score,
                    home_club_id, away_club_id, tournament_id,
                    home_club:clubs!matches_home_club_id_fkey(name, logo_url),
                    away_club:clubs!matches_away_club_id_fkey(name, logo_url),
                    tournament:tournaments(name, sport_id)
                `);
            const [homeMatchesResult, awayMatchesResult] = await Promise.all([
                internalMatchesBaseQuery()
                    .eq('home_club_id', effectiveClub.id)
                    .order('date_time', { ascending: false })
                    .limit(300),
                internalMatchesBaseQuery()
                    .eq('away_club_id', effectiveClub.id)
                    .order('date_time', { ascending: false })
                    .limit(300),
            ]);

            if (homeMatchesResult.error) throw homeMatchesResult.error;
            if (awayMatchesResult.error) throw awayMatchesResult.error;

            const typedMatchRows = mergeInternalMatchRows(
                homeMatchesResult.data as InternalMatchRow[] | null,
                awayMatchesResult.data as InternalMatchRow[] | null,
            );
            if (typedMatchRows.length > 0) {
                const FINISHED_STATUSES = new Set([
                    'finished', 'completed', 'scored', 'ft', 'aet', 'pen', 'awarded',
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
                    const normalized = normalizeInternalMatch({
                        ...row,
                        home_name: homeClub?.name,
                        home_logo: homeClub?.logo_url,
                        away_name: awayClub?.name,
                        away_logo: awayClub?.logo_url,
                        tournament_name: tournament?.name,
                        sport_id: tournament?.sport_id,
                    });
                    const st = (row.status || '').toLowerCase();
                    const matchDate = row.date_time ? new Date(row.date_time).getTime() : 0;
                    const isPast = matchDate > 0 && matchDate < now;
                    const isFinished = FINISHED_STATUSES.has(st) || (isPast && !SCHEDULED_STATUSES.has(st));
                    if (isFinished) {
                        internalResults.push(normalized);
                    } else {
                        internalFixtures.push(normalized);
                    }
                }
            }
        }
    } catch {
        // Silently continue if not found or DB error
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
                    const writeClient = await createClient();
                    await writeClient
                        .from('external_teams' as any)
                        .upsert({ id: resolvedExternalId, team_url: teamUrl, source: 'flashscore', name: String((remoteDetails as any).name || extractedName || resolvedExternalId) }, { onConflict: 'id' });
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
