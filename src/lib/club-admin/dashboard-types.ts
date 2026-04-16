export interface ClubDashboardClubRef {
    id: string | null;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    slug: string | null;
}

export interface ClubDashboardTournamentRef {
    id: string;
    name: string;
    slug: string | null;
}

export interface ClubDashboardScore {
    home: number | null;
    away: number | null;
}

export interface ClubDashboardMatch {
    id: string;
    dateTime: string | null;
    status: string;
    venue: string | null;
    score: ClubDashboardScore | null;
    isHome: boolean;
    homeDivisionId: string | null;
    awayDivisionId: string | null;
    homeDivisionName: string | null;
    awayDivisionName: string | null;
    opponentName: string;
    opponentShortName: string | null;
    opponentLogoUrl: string | null;
    home: ClubDashboardClubRef;
    away: ClubDashboardClubRef;
    tournament: ClubDashboardTournamentRef | null;
}

export interface ClubDashboardStanding {
    tournamentId: string;
    tournamentName: string;
    tournamentSlug: string | null;
    position: number | null;
    played: number;
    points: number;
    won: number;
    drawn: number;
    lost: number;
    scored: number;
    conceded: number;
    bonusPoints: number;
    goalDifference: number;
    form: string | null;
    phaseId: string | null;
    groupId: string | null;
    updatedAt: string | null;
}

export interface ClubDashboardStats {
    upcomingMatches: number;
    playedMatches: number;
    tournaments: number;
    bestPosition: number | null;
}

export interface ClubDashboardOverview {
    stats: ClubDashboardStats;
    upcomingMatches: ClubDashboardMatch[];
    recentMatches: ClubDashboardMatch[];
    standings: ClubDashboardStanding[];
    matches: ClubDashboardMatch[];
}

export const EMPTY_CLUB_DASHBOARD_OVERVIEW: ClubDashboardOverview = {
    stats: {
        upcomingMatches: 0,
        playedMatches: 0,
        tournaments: 0,
        bestPosition: null,
    },
    upcomingMatches: [],
    recentMatches: [],
    standings: [],
    matches: [],
};
