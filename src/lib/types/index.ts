// ===== SPORT TYPES =====
export type SportId =
    | 'football'
    | 'tennis'
    | 'basketball'
    | 'hockey'
    | 'american-football'
    | 'baseball'
    | 'handball'
    | 'rugby'
    | 'rugby-union'
    | 'rugby-league'
    | 'floorball'
    | 'bandy'
    | 'futsal'
    | 'volleyball'
    | 'cricket'
    | 'darts'
    | 'snooker'
    | 'boxing'
    | 'beach-volleyball'
    | 'aussie-rules'
    | 'field-hockey'
    | 'badminton'
    | 'water-polo'
    | 'golf'
    | 'table-tennis'
    | 'beach-soccer'
    | 'mma'
    | 'netball'
    | 'pesapallo'
    | 'motorsport'
    | 'cycling'
    | 'horse-racing'
    | 'esports'
    | 'winter-sports'
    | 'kabaddi';

export interface Sport {
    id: SportId;
    name: string;
    nameEs: string;
    icon: string;
    isActive: boolean;
    priority: number;
    groupLabel?: string; // e.g., 'Countries', 'Categories'
    groupLabelEs?: string; // e.g., 'Países', 'Categorías'
}

// ===== COUNTRY TYPES =====
export interface Country {
    id: string;
    name: string;
    nameEs: string;
    code: string; // ISO 3166-1 alpha-2
    flagEmoji?: string;
    region?: 'international' | 'africa' | 'asia' | 'europe' | 'north-america' | 'south-america' | 'oceania';
}

// ===== TOURNAMENT TYPES =====
export type TournamentType = 'international' | 'local' | 'cup' | 'friendly' | 'youth';
export type TournamentFormat = 'league' | 'knockout' | 'group-knockout' | 'round-robin';
export type TournamentCategory = 'men' | 'women' | 'u23' | 'u21' | 'u20' | 'u19' | 'u18' | 'u17' | 'u16' | 'sevens';

export interface TournamentSeason {
    seasonId: string;
    year?: number;
    startDate?: string;
    endDate?: string;
    teamsCount: number;
    isActive: boolean;
}

export interface Tournament {
    id: string;
    name: string;
    nameEs?: string;
    url: string;
    type: TournamentType;
    format?: TournamentFormat;
    sportId: SportId;
    countryId: string;
    priority: number;
    logoUrl?: string | null;
    categories: TournamentCategory[];
    seasons?: TournamentSeason[];
    isWomen?: boolean;
    isYouth?: boolean;
    ageGroup?: string;
}

// ===== TEAM TYPES =====
export interface Team {
    id: string;
    name: string;
    shortName?: string;
    logoUrl?: string | null;
    countryId: string;
    sportId: SportId;
    foundedYear?: number;
    stadium?: string;
    city?: string;
    colors?: string[];
}

// ===== MATCH TYPES =====
export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled' | 'abandoned';

export interface MatchScore {
    home: number;
    away: number;
    halftime?: { home: number; away: number };
    extratime?: { home: number; away: number };
    penalties?: { home: number; away: number };
}

export interface Match {
    id: string;
    tournamentId: string;
    homeTeamId: string;
    awayTeamId: string;
    date: string;
    time?: string;
    status: MatchStatus;
    venue?: string;
    score?: MatchScore;
    minute?: number;
    roundOrMatchday?: string;
}

// ===== PLAYER TYPES =====
export type PlayerPosition = 'goalkeeper' | 'defender' | 'midfielder' | 'forward' | 'utility';

export interface Player {
    id: string;
    firstName: string;
    lastName: string;
    displayName: string;
    nationality: string;
    dateOfBirth?: string;
    position?: PlayerPosition;
    teamId?: string;
    number?: number;
    photoUrl?: string | null;
}

// ===== STANDINGS TYPES =====
export interface StandingsRow {
    position: number;
    teamId: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    points: number;
    form?: ('W' | 'D' | 'L')[];
}

export interface Standings {
    tournamentId: string;
    seasonId: string;
    groupName?: string;
    rows: StandingsRow[];
    updatedAt: string;
}

// ===== STATISTICS TYPES =====
export interface PlayerStatistics {
    playerId: string;
    tournamentId: string;
    seasonId: string;
    appearances: number;
    goals?: number;
    assists?: number;
    yellowCards?: number;
    redCards?: number;
    minutesPlayed?: number;
    // Rugby specific
    tries?: number;
    conversions?: number;
    penalties?: number;
    dropGoals?: number;
}
