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

export type ClubDashboardMode = 'summary' | 'operational';

export interface ClubDashboardMatch {
    id: string;
    dateTime: string | null;
    status: string;
    venue: string | null;
    score: ClubDashboardScore | null;
    notes: string | null;
    lineups: unknown;
    events: unknown;
    lineupCount: number;
    statsCount: number;
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
    groupName: string | null;
    updatedAt: string | null;
}

export interface ClubDashboardCompetition {
    tournamentId: string;
    tournamentName: string;
    tournamentSlug: string | null;
    clubNames: string[];
    position: number | null;
    played: number;
    points: number;
    goalDifference: number;
    updatedAt: string | null;
    nextMatchAt: string | null;
    recentMatchAt: string | null;
    divisionNames: string[];
    phaseId: string | null;
    phaseName: string | null;
    phaseType: string | null;
    groupId: string | null;
    groupName: string | null;
    groupNames: string[];
    groupCount: number;
    sourceKinds: Array<'participant' | 'standing' | 'match'>;
}

export interface ClubDashboardStats {
    upcomingMatches: number;
    playedMatches: number;
    tournaments: number;
    bestPosition: number | null;
}

export interface ClubDashboardHealthIssue {
    key: string;
    label: string;
    severity: 'error' | 'warning';
}

export interface ClubDashboardHealth {
    status: 'ok' | 'warning' | 'error';
    completeness: number;
    issues: ClubDashboardHealthIssue[];
}

export interface ClubDashboardOverview {
    stats: ClubDashboardStats;
    health: ClubDashboardHealth;
    upcomingMatches: ClubDashboardMatch[];
    recentMatches: ClubDashboardMatch[];
    pastMatches: ClubDashboardMatch[];
    standings: ClubDashboardStanding[];
    competitions: ClubDashboardCompetition[];
    matches: ClubDashboardMatch[];
}

export const EMPTY_CLUB_DASHBOARD_OVERVIEW: ClubDashboardOverview = {
    stats: {
        upcomingMatches: 0,
        playedMatches: 0,
        tournaments: 0,
        bestPosition: null,
    },
    health: {
        status: 'warning',
        completeness: 0,
        issues: [],
    },
    upcomingMatches: [],
    recentMatches: [],
    pastMatches: [],
    standings: [],
    competitions: [],
    matches: [],
};
