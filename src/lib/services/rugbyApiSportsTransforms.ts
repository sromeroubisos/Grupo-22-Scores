import type {
    ExternalMatchWithMapping,
    ExternalStandingsRow,
    MatchConfidence,
} from '@/lib/types/flashscore-integration';
import {
    mapRugbyApiSportsStatus,
    toRugbyApiSportsMatchId,
    toRugbyApiSportsTeamId,
    toRugbyApiSportsTournamentId,
    type RugbyApiSportsGame,
    type RugbyApiSportsStandingsRow,
    type RugbyApiSportsTeamStatistics,
} from '@/lib/services/rugbyApiSports';

type DbParticipant = {
    club_id: string;
    clubs: {
        id: string;
        name: string;
        short_name: string | null;
    };
};

export function matchParticipantTeamName(
    name: string,
    participants: DbParticipant[]
): { club_id: string | null; confidence: MatchConfidence } {
    const lower = name.toLowerCase().trim();

    for (const participant of participants) {
        const clubName = participant.clubs.name.toLowerCase().trim();
        const shortName = (participant.clubs.short_name ?? '').toLowerCase().trim();

        if (clubName === lower || (shortName.length >= 2 && shortName === lower)) {
            return { club_id: participant.club_id, confidence: 'exact' };
        }
    }

    for (const participant of participants) {
        const clubName = participant.clubs.name.toLowerCase().trim();
        const shortName = (participant.clubs.short_name ?? '').toLowerCase().trim();

        if (clubName.length >= 3 && (lower.includes(clubName) || clubName.includes(lower))) {
            return { club_id: participant.club_id, confidence: 'partial' };
        }
        if (shortName.length >= 3 && (lower.includes(shortName) || shortName.includes(lower))) {
            return { club_id: participant.club_id, confidence: 'partial' };
        }
    }

    return { club_id: null, confidence: 'none' };
}

export function flattenRugbyApiSportsStandings(
    standings: RugbyApiSportsStandingsRow[][] | RugbyApiSportsStandingsRow[]
) {
    if (!Array.isArray(standings)) return [];
    if (standings.length === 0) return [];
    if (Array.isArray(standings[0])) {
        return (standings as RugbyApiSportsStandingsRow[][]).flat();
    }
    return standings as RugbyApiSportsStandingsRow[];
}

export function normalizeRugbyStandingsRows(
    standings: RugbyApiSportsStandingsRow[][] | RugbyApiSportsStandingsRow[]
): ExternalStandingsRow[] {
    return flattenRugbyApiSportsStandings(standings).map((row, index) => ({
        position: row.position ?? index + 1,
        team_name: row.team?.name || 'Unknown',
        team_id: row.team?.id ? toRugbyApiSportsTeamId(row.team.id) : null,
        team_logo: row.team?.logo || null,
        team_url: null,
        played: row.games?.played ?? 0,
        won: row.games?.win?.total ?? 0,
        drawn: row.games?.draw?.total ?? 0,
        lost: row.games?.lose?.total ?? 0,
        points: row.points ?? 0,
        scored: row.goals?.for ?? undefined,
        conceded: row.goals?.against ?? undefined,
    }));
}

export function normalizeRugbyGameForSyncPreview(
    game: RugbyApiSportsGame,
    participants: DbParticipant[]
): ExternalMatchWithMapping {
    const homeName = game.teams?.home?.name || 'Local';
    const awayName = game.teams?.away?.name || 'Visitante';
    const homeMatch = matchParticipantTeamName(homeName, participants);
    const awayMatch = matchParticipantTeamName(awayName, participants);

    return {
        external_match_id: toRugbyApiSportsMatchId(game.id),
        home_team_name: homeName,
        away_team_name: awayName,
        timestamp: game.timestamp,
        date_time: game.date,
        venue: undefined,
        status: mapRugbyApiSportsStatus(game.status),
        score: game.scores?.home != null && game.scores?.away != null
            ? { home: game.scores.home, away: game.scores.away }
            : undefined,
        home_club_id: homeMatch.club_id,
        away_club_id: awayMatch.club_id,
        home_match_confidence: homeMatch.confidence,
        away_match_confidence: awayMatch.confidence,
    };
}

export function normalizeRugbyGameForTournamentViews(game: RugbyApiSportsGame) {
    const home = game.teams?.home;
    const away = game.teams?.away;
    const status = mapRugbyApiSportsStatus(game.status);

    return {
        match_id: toRugbyApiSportsMatchId(game.id),
        event_key: toRugbyApiSportsMatchId(game.id),
        timestamp: game.timestamp,
        date: game.date,
        match_status: game.status?.short || (status === 'final' ? 'FT' : status === 'live' ? 'LIVE' : 'NS'),
        status,
        week: game.week || null,
        tournament_id: toRugbyApiSportsTournamentId(game.league?.id || 'unknown'),
        tournament_name: game.league?.name || 'Liga',
        country_name: game.country?.name || 'Internacional',
        home_team: {
            id: home?.id ? toRugbyApiSportsTeamId(home.id) : null,
            team_id: home?.id ? toRugbyApiSportsTeamId(home.id) : null,
            name: home?.name || 'Local',
            logo: home?.logo || '',
            image_path: home?.logo || '',
            small_image_path: home?.logo || '',
        },
        away_team: {
            id: away?.id ? toRugbyApiSportsTeamId(away.id) : null,
            team_id: away?.id ? toRugbyApiSportsTeamId(away.id) : null,
            name: away?.name || 'Visitante',
            logo: away?.logo || '',
            image_path: away?.logo || '',
            small_image_path: away?.logo || '',
        },
        home_team_name: home?.name || 'Local',
        away_team_name: away?.name || 'Visitante',
        home_team_logo: home?.logo || '',
        away_team_logo: away?.logo || '',
        scores: {
            home: game.scores?.home ?? null,
            away: game.scores?.away ?? null,
        },
        score: {
            home: game.scores?.home ?? null,
            away: game.scores?.away ?? null,
        },
    };
}

export function normalizeRugbyGameForMatchDetail(game: RugbyApiSportsGame) {
    const base = normalizeRugbyGameForTournamentViews(game);

    return {
        id: base.match_id,
        externalProvider: 'rugby-api-sports',
        sportId: 'rugby',
        status: base.status,
        date: game.date,
        time: new Date(game.date).toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'America/Argentina/Buenos_Aires',
        }),
        tournament: game.league?.name || 'Liga',
        tournamentLogo: game.league?.logo || '',
        tournamentId: base.tournament_id,
        tournamentSeason: game.league?.season || null,
        category: game.country?.name || 'Internacional',
        round: game.week || 'General',
        venue: '',
        referee: null,
        home: {
            id: base.home_team.id,
            name: base.home_team.name,
            logo: base.home_team.logo,
            score: game.scores?.home ?? null,
            teamUrl: '',
        },
        away: {
            id: base.away_team.id,
            name: base.away_team.name,
            logo: base.away_team.logo,
            score: game.scores?.away ?? null,
            teamUrl: '',
        },
        lineups: null,
        standings: [] as any[],
        h2h: [] as any[],
        draw: [] as any[],
        form: [] as any[],
        topScorers: [] as any[],
    };
}

export function buildRugbyTeamDetailsPayload(
    team: { id?: number | null; name?: string | null; logo?: string | null; founded?: number | null; arena?: { name?: string | null; location?: string | null } | null; country?: { name?: string | null; flag?: string | null } | null },
    statistics: RugbyApiSportsTeamStatistics | null
) {
    const played = statistics?.games?.played?.all ?? null;
    const wins = statistics?.games?.wins?.all?.total ?? null;
    const draws = statistics?.games?.draws?.all?.total ?? null;
    const losses = statistics?.games?.loses?.all?.total ?? null;
    const pointsFor = statistics?.goals?.for?.total?.all ?? null;
    const pointsAgainst = statistics?.goals?.against?.total?.all ?? null;

    return {
        id: team.id ? toRugbyApiSportsTeamId(team.id) : null,
        name: team.name || 'Equipo',
        image_path: team.logo || '',
        logo: team.logo || '',
        logo_url: team.logo || '',
        country: team.country?.name || '',
        country_flag: team.country?.flag || '',
        venue: team.arena?.name || '',
        city: team.arena?.location || '',
        founded: team.founded || null,
        provider: 'rugby-api-sports',
        supported_tabs: ['summary', 'results', 'fixtures'],
        statistics: {
            played,
            wins,
            draws,
            losses,
            pointsFor,
            pointsAgainst,
        },
    };
}
