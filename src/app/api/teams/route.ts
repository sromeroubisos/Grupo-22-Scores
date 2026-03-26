import { getReadClient } from '@/lib/supabase/read';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import {
    getTeamDetails,
    getTeamSquad,
    getTeamResults,
    getTeamFixtures,
    getTeamTransfers,
} from '@/lib/services/flashscore';
import { canonicalizeSportId, getClubSportValue } from '@/lib/clubDerivatives';

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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function stripFsTeamPrefix(val: string): string {
    if (val.toLowerCase().startsWith('fs-team-')) return val.slice(8);
    if (val.toLowerCase().startsWith('fs-')) return val.slice(3);
    return val;
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
    const skipSquad = searchParams.get('skip_squad') === 'true';
    const debugMode = searchParams.get('_debug') === '1';

    if (!rawTeamId) {
        return Response.json({ ok: false, error: 'team_id is required' }, { status: 400 });
    }

    // 1. Check Supabase for internal club info first
    let details: TeamDetailsPayload | null = null;
    const internalResults: NormalizedInternalMatch[] = [];
    const internalFixtures: NormalizedInternalMatch[] = [];
    let internalExternalId: string | null = null;
    let internalClubName: string = '';
    let resolvedClubId: string | null = null;

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
                is_internal: true
            };
            internalExternalId = effectiveClub.external_id || null;
            internalClubName = effectiveClub.name || '';

            // Query internal matches from Supabase
            const { data: matchRows } = await readClient
                .from('matches')
                .select(`
                    id, date_time, status, score,
                    home_club_id, away_club_id, tournament_id,
                    home_club:clubs!matches_home_club_id_fkey(name, logo_url),
                    away_club:clubs!matches_away_club_id_fkey(name, logo_url),
                    tournament:tournaments(name, sport_id)
                `)
                .or(`home_club_id.eq.${effectiveClub.id},away_club_id.eq.${effectiveClub.id}`)
                .order('date_time', { ascending: false });

            const typedMatchRows = (matchRows ?? []) as InternalMatchRow[];
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
    if (effectiveExternalId) {
        try {
            const readClient = await getReadClient();
            const { data: extTeam } = await (readClient as any)
                .from('external_teams')
                .select('team_url')
                .eq('id', effectiveExternalId)
                .maybeSingle();
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

        let squad: unknown = null;
        let fsResults: NormalizedInternalMatch[] = [];
        let fsFixtures: NormalizedInternalMatch[] = [];
        let transfers: unknown[] = [];

        if (resolvedExternalId) {
            const needFsResults = internalResults.length === 0;
            const needFsFixtures = internalFixtures.length === 0;

            const [detailsRes, squadRes, transfersRes, fsResultsRes, fsFixturesRes] =
                await Promise.allSettled([
                    teamUrl ? getTeamDetails(teamUrl) : Promise.resolve(null),
                    teamUrl && !skipSquad ? getTeamSquad(teamUrl) : Promise.resolve(null),
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
            squad = normalize(squadRes);

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
                details = { ...(details ?? {}), ...remoteDetails };
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
                skipSquad ? Promise.resolve(null) : getTeamSquad(teamUrl),
            ]);
            const remoteDetails = normalize(detailsRes);
            squad = normalize(squadRes);
            if (isRecord(remoteDetails) && !Array.isArray(remoteDetails)) {
                details = { ...(details ?? {}), ...remoteDetails };
            }
        }

        const finalResults = internalResults.length > 0 ? internalResults : fsResults;
        const finalFixtures = internalFixtures.length > 0 ? internalFixtures : fsFixtures;

        return Response.json({
            ok: true,
            resolvedClubId,
            details,
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
