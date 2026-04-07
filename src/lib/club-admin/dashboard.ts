import { createClient } from '@/lib/supabase/server';
import {
    EMPTY_CLUB_DASHBOARD_OVERVIEW,
    type ClubDashboardClubRef,
    type ClubDashboardMatch,
    type ClubDashboardOverview,
    type ClubDashboardStanding,
} from '@/lib/club-admin/dashboard-types';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const FINAL_MATCH_STATUSES = ['final', 'finished', 'ft'] as const;

type ClubRow = {
    id: string | null;
    name: string | null;
    short_name: string | null;
    logo_url: string | null;
    slug: string | null;
};

type TournamentRow = {
    id: string;
    name: string | null;
    slug: string | null;
};

type MatchScoreRow =
    | {
        home?: number | null;
        away?: number | null;
        home_score?: number | null;
        away_score?: number | null;
    }
    | null
    | undefined;

type MatchRow = {
    id: string;
    date_time: string | null;
    status: string | null;
    venue: string | null;
    score: MatchScoreRow;
    home_club_id: string | null;
    away_club_id: string | null;
    home: ClubRow | ClubRow[] | null;
    away: ClubRow | ClubRow[] | null;
    tournament: TournamentRow | TournamentRow[] | null;
};

type StandingStatsRow =
    | {
        difference?: number;
    }
    | null
    | undefined;

type StandingRow = {
    tournament_id: string;
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
    stats: StandingStatsRow;
    phase_id: string | null;
    group_id: string | null;
    last_updated: string | null;
    tournament: TournamentRow | TournamentRow[] | null;
};

function unwrapRelationRow<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) {
        return value[0] ?? null;
    }

    return value ?? null;
}

function normalizeClub(row: ClubRow | null | undefined): ClubDashboardClubRef {
    return {
        id: row?.id ?? null,
        name: row?.name ?? 'Club',
        shortName: row?.short_name ?? null,
        logoUrl: row?.logo_url ?? null,
        slug: row?.slug ?? null,
    };
}

function normalizeMatchScore(score: MatchScoreRow) {
    if (!score || typeof score !== 'object') {
        return null;
    }

    return {
        home: typeof score.home === 'number'
            ? score.home
            : typeof score.home_score === 'number'
                ? score.home_score
                : null,
        away: typeof score.away === 'number'
            ? score.away
            : typeof score.away_score === 'number'
                ? score.away_score
                : null,
    };
}

function normalizeMatch(row: MatchRow, clubId: string): ClubDashboardMatch {
    const isHome = row.home_club_id === clubId;
    const home = normalizeClub(unwrapRelationRow(row.home));
    const away = normalizeClub(unwrapRelationRow(row.away));
    const tournament = unwrapRelationRow(row.tournament);
    const opponent = isHome ? away : home;

    return {
        id: row.id,
        dateTime: row.date_time,
        status: row.status ?? 'scheduled',
        venue: row.venue ?? null,
        score: normalizeMatchScore(row.score),
        isHome,
        opponentName: opponent.name,
        opponentShortName: opponent.shortName,
        opponentLogoUrl: opponent.logoUrl,
        home,
        away,
        tournament: tournament
            ? {
                id: tournament.id,
                name: tournament.name ?? 'Torneo',
                slug: tournament.slug ?? null,
            }
            : null,
    };
}

function normalizeStanding(row: StandingRow): ClubDashboardStanding {
    const tournament = unwrapRelationRow(row.tournament);
    const scored = row.scored ?? 0;
    const conceded = row.conceded ?? 0;
    const derivedDifference = scored - conceded;

    return {
        tournamentId: row.tournament_id,
        tournamentName: tournament?.name ?? 'Torneo',
        tournamentSlug: tournament?.slug ?? null,
        position: row.position ?? null,
        played: row.played ?? 0,
        points: row.points ?? 0,
        won: row.won ?? 0,
        drawn: row.drawn ?? 0,
        lost: row.lost ?? 0,
        scored,
        conceded,
        bonusPoints: row.bonus_points ?? 0,
        goalDifference: typeof row.stats?.difference === 'number' ? row.stats.difference : derivedDifference,
        form: row.form ?? null,
        phaseId: row.phase_id ?? null,
        groupId: row.group_id ?? null,
        updatedAt: row.last_updated ?? null,
    };
}

function dedupeStandings(rows: StandingRow[]) {
    const uniqueByTournament = new Map<string, StandingRow>();

    for (const row of rows) {
        if (!uniqueByTournament.has(row.tournament_id)) {
            uniqueByTournament.set(row.tournament_id, row);
        }
    }

    return Array.from(uniqueByTournament.values())
        .map(normalizeStanding)
        .sort((left, right) => {
            const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER;
            const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER;

            if (leftPosition !== rightPosition) {
                return leftPosition - rightPosition;
            }

            return left.tournamentName.localeCompare(right.tournamentName);
        });
}

export async function getClubDashboardOverview(
    supabase: SupabaseServerClient,
    clubId: string
): Promise<ClubDashboardOverview> {
    if (!clubId) {
        return EMPTY_CLUB_DASHBOARD_OVERVIEW;
    }

    const nowIso = new Date().toISOString();
    const matchSelect = `
        id, date_time, status, venue, score, home_club_id, away_club_id,
        home:clubs!matches_home_club_id_fkey(id, name, short_name, logo_url, slug),
        away:clubs!matches_away_club_id_fkey(id, name, short_name, logo_url, slug),
        tournament:tournaments(id, name, slug)
    `;
    const matchFilter = `home_club_id.eq.${clubId},away_club_id.eq.${clubId}`;

    const [
        upcomingMatchesResult,
        recentMatchesResult,
        upcomingMatchesCountResult,
        playedMatchesCountResult,
        standingsResult,
    ] = await Promise.all([
        supabase
            .from('matches')
            .select(matchSelect)
            .or(matchFilter)
            .gte('date_time', nowIso)
            .order('date_time', { ascending: true })
            .limit(5),
        supabase
            .from('matches')
            .select(matchSelect)
            .or(matchFilter)
            .in('status', [...FINAL_MATCH_STATUSES])
            .order('date_time', { ascending: false })
            .limit(5),
        supabase
            .from('matches')
            .select('id', { count: 'exact', head: true })
            .or(matchFilter)
            .gte('date_time', nowIso),
        supabase
            .from('matches')
            .select('id', { count: 'exact', head: true })
            .or(matchFilter)
            .in('status', [...FINAL_MATCH_STATUSES]),
        supabase
            .from('tournament_standings')
            .select(`
                tournament_id, position, played, won, drawn, lost, points, scored, conceded,
                bonus_points, form, stats, phase_id, group_id, last_updated,
                tournament:tournaments(id, name, slug)
            `)
            .eq('club_id', clubId)
            .order('last_updated', { ascending: false })
            .order('position', { ascending: true }),
    ]);

    if (upcomingMatchesResult.error) throw upcomingMatchesResult.error;
    if (recentMatchesResult.error) throw recentMatchesResult.error;
    if (upcomingMatchesCountResult.error) throw upcomingMatchesCountResult.error;
    if (playedMatchesCountResult.error) throw playedMatchesCountResult.error;
    if (standingsResult.error) throw standingsResult.error;

    const upcomingMatches = ((upcomingMatchesResult.data ?? []) as unknown as MatchRow[]).map((row) => normalizeMatch(row, clubId));
    const recentMatches = ((recentMatchesResult.data ?? []) as unknown as MatchRow[]).map((row) => normalizeMatch(row, clubId));
    const standings = dedupeStandings((standingsResult.data ?? []) as unknown as StandingRow[]);
    const bestPosition = standings.reduce<number | null>((best, standing) => {
        if (standing.position == null) return best;
        if (best == null) return standing.position;
        return Math.min(best, standing.position);
    }, null);

    return {
        stats: {
            upcomingMatches: upcomingMatchesCountResult.count ?? upcomingMatches.length,
            playedMatches: playedMatchesCountResult.count ?? recentMatches.length,
            tournaments: standings.length,
            bestPosition,
        },
        upcomingMatches,
        recentMatches,
        standings,
        matches: upcomingMatches,
    };
}
