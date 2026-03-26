import { getReadClient } from '@/lib/supabase/read';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_LOOKUP_TIMEOUT_MS = 5000;
const PREFETCH_TIMEOUT_MS = 5000;
const MATCHES_TIMEOUT_MS = 12000;
const STANDINGS_TIMEOUT_MS = 12000;
const TOURNAMENT_SELECT_WITH_LEGACY_SPORT = 'id, name, display_name, sport_id, legacy_sport:sport, country, country_id, country_ref:countries(name), logo_url, banner_url, status, is_visible, slug, ruleset, url, external_id';
const TOURNAMENT_SELECT_WITHOUT_LEGACY_SPORT = 'id, name, display_name, sport_id, country, country_id, country_ref:countries(name), logo_url, banner_url, status, is_visible, slug, ruleset, url, external_id';

export type TournamentQueryErrors = {
    tournament: string | null;
    participants: string | null;
    matches: string | null;
    standings: string | null;
    phases: string | null;
    groups: string | null;
    teamLabels: string | null;
};

export type TournamentInitialData = {
    ok: boolean;
    partial?: boolean;
    error?: string;
    tournament: Record<string, unknown> | null;
    participants: unknown[];
    matches: unknown[];
    standings: unknown[];
    phases: unknown[];
    groups: unknown[];
    teamLabels: unknown[];
    queryErrors?: TournamentQueryErrors;
};

type SupabaseQueryResult<T> = {
    data: T | null;
    error: { code?: string | null; message?: string | null; details?: string | null } | null;
};

type SettledQuery<T> = {
    data: T;
    error: string | null;
};

type TournamentGroupWithPhaseFilter = {
    id: string;
    name: string;
    phase_id: string;
    order_index: number | null;
    tournament_phases: Array<{ tournament_id: string | null }>;
};

type TournamentClubLookup = {
    id: string;
    name: string | null;
    logo_url: string | null;
    short_name: string | null;
    slug: string | null;
};

type SlugLookupRow = {
    id: string;
};

type TournamentRow = {
    id: string;
    name: string | null;
    display_name: string | null;
    sport_id: string | null;
    legacy_sport?: string | null;
    country: string | null;
    country_id: string | null;
    country_ref: { name?: string } | null;
    logo_url: string | null;
    banner_url?: string | null;
    status: string | null;
    is_visible: boolean | null;
    slug: string | null;
    ruleset: Record<string, unknown> | null;
    url?: string | null;
    external_id?: string | null;
};

type TournamentClubSource = {
    id: string | null;
    name: string | null;
    logo_url: string | null;
    short_name: string | null;
    slug: string | null;
};

type TournamentParticipantRow = {
    id: string | null;
    club_id: string | null;
    name: string | null;
    seed: number | null;
    status: string | null;
    type: string | null;
    group_id: string | null;
    clubs: TournamentClubSource[];
};

type TournamentMatchRow = Record<string, unknown> & {
    id: string | null;
    date_time: string | null;
    status: string | null;
    score: unknown;
    venue: string | null;
    round_label: string | null;
    notes: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    phase_id: string | null;
    group_id: string | null;
    round_uuid: string | null;
    home_base_points: number | null;
    away_base_points: number | null;
    home_bonus_points: number | null;
    away_bonus_points: number | null;
    points_autocalculated: boolean | null;
    points_override_reason: string | null;
};

type TournamentStandingRow = Record<string, unknown> & {
    id: string | null;
    position: number | null;
    played: number | null;
    won: number | null;
    drawn: number | null;
    lost: number | null;
    points: number | null;
    scored: number | null;
    conceded: number | null;
    bonus_points: number | null;
    form: string | null;
    stats: Record<string, unknown> | null;
    club_id: string | null;
    phase_id: string | null;
    group_id: string | null;
};

function emptyTournamentData(error?: string): TournamentInitialData {
    return {
        ok: false,
        error,
        tournament: null,
        participants: [],
        matches: [],
        standings: [],
        phases: [],
        groups: [],
        teamLabels: [],
        queryErrors: {
            tournament: null,
            participants: null,
            matches: null,
            standings: null,
            phases: null,
            groups: null,
            teamLabels: null,
        },
    };
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

function normalizeParticipantClub(participant: TournamentParticipantRow): TournamentClubLookup | null {
    const club = Array.isArray(participant.clubs) ? participant.clubs[0] : participant.clubs;
    const id = participant.club_id || club?.id;

    if (!id) return null;

    return {
        id: String(id),
        name: club?.name ?? participant?.name ?? null,
        logo_url: club?.logo_url ?? null,
        short_name: club?.short_name ?? null,
        slug: club?.slug ?? null,
    };
}

function buildClubLookup(participants: TournamentParticipantRow[]): Map<string, TournamentClubLookup> {
    const clubsById = new Map<string, TournamentClubLookup>();

    participants.forEach((participant) => {
        const normalizedClub = normalizeParticipantClub(participant);
        if (!normalizedClub) return;
        clubsById.set(normalizedClub.id, normalizedClub);
    });

    return clubsById;
}

function hydrateMatches(matches: TournamentMatchRow[], clubsById: Map<string, TournamentClubLookup>) {
    return matches.map((match) => ({
        ...match,
        home: match.home_club_id ? clubsById.get(String(match.home_club_id)) ?? null : null,
        away: match.away_club_id ? clubsById.get(String(match.away_club_id)) ?? null : null,
    }));
}

function hydrateStandingsRows(rows: TournamentStandingRow[], clubsById: Map<string, TournamentClubLookup>) {
    return rows.map((row) => ({
        ...row,
        club: row.club_id ? clubsById.get(String(row.club_id)) ?? null : null,
    }));
}

async function settleSupabaseQuery<T>(
    label: string,
    query: PromiseLike<SupabaseQueryResult<T>>,
    fallback: T,
    timeoutMs: number = PREFETCH_TIMEOUT_MS,
): Promise<SettledQuery<T>> {
    try {
        const result = await withTimeout(Promise.resolve(query), timeoutMs, label);

        return {
            data: result.data ?? fallback,
            error: result.error?.message ?? null,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[fetchTournamentData] ${message}`);

        return {
            data: fallback,
            error: message,
        };
    }
}

async function getTournamentByIdWithSportFallback(
    supabase: Awaited<ReturnType<typeof getReadClient>>,
    tournamentId: string,
): Promise<SupabaseQueryResult<TournamentRow | null>> {
    let result: SupabaseQueryResult<TournamentRow | null> = await supabase
        .from('tournaments')
        .select(TOURNAMENT_SELECT_WITH_LEGACY_SPORT)
        .eq('id', tournamentId)
        .maybeSingle();

    if (isMissingColumnError(result.error, 'sport')) {
        result = await supabase
            .from('tournaments')
            .select(TOURNAMENT_SELECT_WITHOUT_LEGACY_SPORT)
            .eq('id', tournamentId)
            .maybeSingle();
    }

    return result;
}

/** Same columns as `GET /api/db/tournaments/[id]` — proven to work without joins. */
const TOURNAMENT_SELECT_MINIMAL_WITH_LEGACY =
    'id, name, display_name, logo_url, sport_id, legacy_sport:sport, country_id, slug, is_visible, status';
const TOURNAMENT_SELECT_MINIMAL_NO_LEGACY =
    'id, name, display_name, logo_url, sport_id, country_id, slug, is_visible, status';

async function getTournamentByIdMinimalFallback(
    supabase: Awaited<ReturnType<typeof getReadClient>>,
    tournamentId: string,
): Promise<SupabaseQueryResult<TournamentRow | null>> {
    let result: SupabaseQueryResult<TournamentRow | null> = await supabase
        .from('tournaments')
        .select(TOURNAMENT_SELECT_MINIMAL_WITH_LEGACY)
        .eq('id', tournamentId)
        .maybeSingle();

    if (isMissingColumnError(result.error, 'sport')) {
        result = await supabase
            .from('tournaments')
            .select(TOURNAMENT_SELECT_MINIMAL_NO_LEGACY)
            .eq('id', tournamentId)
            .maybeSingle();
    }

    return result;
}

/** Last resort: core columns only (avoids failures from optional columns on older DBs). */
async function getTournamentByIdBareFallback(
    supabase: Awaited<ReturnType<typeof getReadClient>>,
    tournamentId: string,
): Promise<SupabaseQueryResult<TournamentRow | null>> {
    let result: SupabaseQueryResult<TournamentRow | null> = await supabase
        .from('tournaments')
        .select('id, name, display_name, logo_url, banner_url, sport_id, country_id, slug, url')
        .eq('id', tournamentId)
        .maybeSingle();

    if (isMissingColumnError(result.error, 'banner_url')) {
        result = await supabase
            .from('tournaments')
            .select('id, name, display_name, logo_url, sport_id, country_id, slug, url')
            .eq('id', tournamentId)
            .maybeSingle();
    }

    return result;
}

export async function fetchTournamentData(id: string): Promise<TournamentInitialData | null> {
    try {
        const supabase = await getReadClient();

        let tournamentId = id;
        if (!UUID_RE.test(id)) {
            const slugLookup = await settleSupabaseQuery(
                'slug',
                supabase
                    .from('tournaments')
                    .select('id')
                    .eq('slug', id)
                    .single(),
                null as SlugLookupRow | null,
                SLUG_LOOKUP_TIMEOUT_MS,
            );

            if (!slugLookup.data?.id) {
                return slugLookup.error ? null : emptyTournamentData('Tournament not found');
            }

            tournamentId = slugLookup.data.id;
        }

        const [
            tournamentRes,
            participantsRes,
            matchesRes,
            standingsRes,
            phasesRes,
            groupsRes,
            teamLabelsRes,
        ] = await Promise.all([
            settleSupabaseQuery(
                'tournament',
                getTournamentByIdWithSportFallback(supabase, tournamentId),
                null as TournamentRow | null,
            ),
            settleSupabaseQuery(
                'participants',
                supabase
                    .from('tournament_participants')
                    .select(`
                        id, club_id, name, seed, status, type, group_id,
                        clubs:clubs!tournament_participants_club_id_fkey(
                            id, name, logo_url, short_name, slug
                        )
                    `)
                    .eq('tournament_id', tournamentId)
                    .not('status', 'in', '("withdrawn","disqualified")')
                    .order('seed', { ascending: true, nullsFirst: false }),
                [] as TournamentParticipantRow[],
            ),
            settleSupabaseQuery(
                'matches',
                supabase
                    .from('matches')
                    .select(`
                        id, date_time, status, score, venue, round_label, notes,
                        home_club_id, away_club_id,
                        phase_id, group_id, round_uuid,
                        home_base_points, away_base_points,
                        home_bonus_points, away_bonus_points,
                        points_autocalculated, points_override_reason
                    `)
                    .eq('tournament_id', tournamentId)
                    .order('date_time', { ascending: true }),
                [] as TournamentMatchRow[],
                MATCHES_TIMEOUT_MS,
            ),
            settleSupabaseQuery(
                'standings',
                supabase
                    .from('tournament_standings')
                    .select(`
                        id, position, played, won, drawn, lost, points, scored, conceded,
                        bonus_points, form, stats, club_id, phase_id, group_id
                    `)
                    .eq('tournament_id', tournamentId)
                    .order('position', { ascending: true }),
                [] as TournamentStandingRow[],
                STANDINGS_TIMEOUT_MS,
            ),
            settleSupabaseQuery(
                'phases',
                supabase
                    .from('tournament_phases')
                    .select('*')
                    .eq('tournament_id', tournamentId)
                    .order('order_index', { ascending: true }),
                [] as unknown[],
            ),
            settleSupabaseQuery(
                'groups',
                supabase
                    .from('tournament_groups')
                    .select('id, name, phase_id, order_index, tournament_phases!inner(tournament_id)')
                    .eq('tournament_phases.tournament_id', tournamentId)
                    .order('order_index', { ascending: true }),
                [] as TournamentGroupWithPhaseFilter[],
            ),
            settleSupabaseQuery(
                'teamLabels',
                supabase
                    .from('team_labels')
                    .select('id, label_id, club_id, position, tournament_id, phase_id, group_id, created_at, label:ui_labels(id, name, color, scope)')
                    .eq('tournament_id', tournamentId),
                [] as unknown[],
            ),
        ]);

        let tournamentRow = tournamentRes.data;
        let tournamentError = tournamentRes.error;

        // Full select joins `country_ref:countries(name)`; if that fails, we still need name/logo for the UI.
        if (!tournamentRow && tournamentId) {
            const minimalRes = await settleSupabaseQuery(
                'tournament-minimal',
                getTournamentByIdMinimalFallback(supabase, tournamentId),
                null as TournamentRow | null,
            );
            if (minimalRes.data) {
                tournamentRow = minimalRes.data;
                tournamentError = null;
            }
        }

        if (!tournamentRow && tournamentId) {
            const bareRes = await settleSupabaseQuery(
                'tournament-bare',
                getTournamentByIdBareFallback(supabase, tournamentId),
                null as TournamentRow | null,
            );
            if (bareRes.data) {
                tournamentRow = bareRes.data;
                tournamentError = null;
            }
        }

        const queryErrors: TournamentQueryErrors = {
            tournament: tournamentError,
            participants: participantsRes.error,
            matches: matchesRes.error,
            standings: standingsRes.error,
            phases: phasesRes.error,
            groups: groupsRes.error,
            teamLabels: teamLabelsRes.error,
        };

        const hasAnyData = Boolean(
            tournamentRow ||
            participantsRes.data.length ||
            matchesRes.data.length ||
            standingsRes.data.length ||
            phasesRes.data.length ||
            groupsRes.data.length ||
            teamLabelsRes.data.length,
        );

        if (!hasAnyData) {
            return null;
        }

        const clubsById = buildClubLookup(participantsRes.data);
        const hydratedMatches = hydrateMatches(matchesRes.data, clubsById);
        const hydratedStandings = hydrateStandingsRows(standingsRes.data, clubsById);

        return {
            ok: true,
            partial: Object.values(queryErrors).some(Boolean),
            tournament: tournamentRow ? {
                ...tournamentRow,
                sport_id: tournamentRow.sport_id || tournamentRow.legacy_sport || 'rugby',
                country_name: tournamentRow.country || (tournamentRow.country_ref as { name?: string } | null)?.name || null,
            } : null,
            participants: participantsRes.data,
            matches: hydratedMatches,
            standings: hydratedStandings,
            phases: phasesRes.data,
            groups: groupsRes.data.map((group) => {
                const normalizedGroup = group as TournamentGroupWithPhaseFilter;
                return {
                    id: normalizedGroup.id,
                    name: normalizedGroup.name,
                    phase_id: normalizedGroup.phase_id,
                    order_index: normalizedGroup.order_index,
                };
            }),
            teamLabels: teamLabelsRes.data,
            queryErrors,
        };
    } catch (error) {
        console.warn('[fetchTournamentData] Unexpected failure:', error);
        return null;
    }
}
