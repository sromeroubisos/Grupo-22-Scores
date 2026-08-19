export type ProdeSourceType = 'local' | 'external' | 'mixed';
export type ProdeExternalProvider = 'flashscore' | 'rugby-api-sports' | 'espn' | 'manual' | (string & {});
export type ProdeCompetitionStatus = 'draft' | 'published' | 'active' | 'finished' | 'archived';
export type ProdeVisibility = 'public' | 'private' | 'unlisted';
export type ProdeEventStatus = 'scheduled' | 'live' | 'final' | 'postponed' | 'cancelled' | 'scored';

export interface ProdeSourceBinding {
    sourceType: ProdeSourceType;
    localTournamentId: string | null;
    localMatchId: string | null;
    externalProvider: ProdeExternalProvider | null;
    externalTournamentId: string | null;
    externalMatchId: string | null;
}

export interface ProdeCompetitionEventStats {
    total: number;
    open: number;
    live: number;
    finished: number;
    nextLockAt: string | null;
}

export interface ProdeCompetitionMemberStats {
    totalMembers: number;
}

export interface PublicProdeCompetition {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    sportId: string | null;
    status: ProdeCompetitionStatus;
    visibility: ProdeVisibility;
    sourceBinding: ProdeSourceBinding;
    sourceSummary: string;
    predictionLeadMinutes: number;
    startAt: string | null;
    endAt: string | null;
    metadata: Record<string, unknown>;
    /**
     * Logo del torneo base, SIEMPRE como URL del proxy `/api/assets/team-logo`.
     *
     * Nunca viaja la imagen en sí: los logos de los torneos locales están guardados
     * como data: URI de ~70 KB y por eso `stripEmbeddedImages` los saca de `metadata`.
     * El proxy los resuelve del lado del servidor por id de torneo y devuelve bytes
     * cacheables — o el escudo de iniciales estándar del sitio si no hay logo.
     */
    logoUrl: string | null;
    stats: ProdeCompetitionEventStats;
    members: ProdeCompetitionMemberStats;
    /**
     * Si el usuario de la sesion ya esta anotado. Sale de las mismas filas de
     * `prode_competition_members` que ya se leen para contar participantes, asi que
     * no agrega una consulta: solo suma `user_id` al select.
     *
     * Es lo que separa "donde ya juego" de "que puedo explorar" en el lobby. Sin
     * sesion siempre es false.
     */
    viewerIsMember: boolean;
}

export interface PublicProdeEventSummary {
    id: string;
    homeLabel: string;
    awayLabel: string;
    startsAt: string;
    locksAt: string;
    status: ProdeEventStatus;
    scoringStatus: string;
    sourceBinding: ProdeSourceBinding;
    officialResult: Record<string, unknown> | null;
}

export interface PublicProdeCompetitionDetail {
    competition: PublicProdeCompetition;
    events: PublicProdeEventSummary[];
}

export interface ProdeBaseCompetitionOption {
    id: string;
    name: string;
    displayName: string;
    sportId: string | null;
    sportLabel: string | null;
    countryLabel: string | null;
    logoUrl: string | null;
    status: string;
    catalogSource: 'local' | 'api';
    catalogLabel: string;
    isVisible: boolean;
    isApiManaged: boolean;
    dataSource: string | null;
    sourceBinding: ProdeSourceBinding;
}

export interface PublicProdeUserTotal {
    userId: string;
    userName: string;
    avatarUrl: string | null;
    totalPoints: number;
    exactHits: number;
    correctOutcomes: number;
    competitionsJoined: number;
    competitionsScored: number;
    position: number | null;
}

export interface ProdePrivateLeagueSummary {
    id: string;
    slug: string;
    name: string;
    competitionName: string;
    sportLabel: string | null;
    memberCount: number;
    inviteCode: string | null;
    visibility: 'private' | 'public';
    role: string | null;
    canManage: boolean;
}

export type ProdePredictionOutcome = 'home' | 'draw' | 'away';

export interface ProdePlayPrediction {
    id: string;
    outcome: ProdePredictionOutcome | null;
    predictedHomeScore: number | null;
    predictedAwayScore: number | null;
    pointsAwarded: number;
    status: string;
    scoringBreakdown: Record<string, unknown>;
    submittedAt: string | null;
    scoredAt: string | null;
}

export interface ProdePlayOfficialResult {
    homeScore: number | null;
    awayScore: number | null;
    outcome: ProdePredictionOutcome | null;
}

export interface ProdePlayEvent {
    id: string;
    homeLabel: string;
    awayLabel: string;
    homeLogoUrl: string | null;
    awayLogoUrl: string | null;
    startsAt: string;
    locksAt: string;
    status: ProdeEventStatus;
    scoringStatus: string;
    isOpen: boolean;
    prediction: ProdePlayPrediction | null;
    officialResult: ProdePlayOfficialResult | null;
}

export interface ProdePlayLeaderboardEntry {
    userId: string;
    userName: string;
    avatarUrl: string | null;
    totalPoints: number;
    exactHits: number;
    correctOutcomes: number;
    position: number | null;
    isCurrentUser: boolean;
}

export interface ProdePlayPersonalSummary {
    position: number | null;
    totalPoints: number;
    exactHits: number;
    correctOutcomes: number;
    latestPoints: number;
}

export interface ProdePlayRuleItem {
    key: string;
    label: string;
    points: number;
    description?: string;
}

export interface ProdePlayRulesSummary {
    title: string;
    lockMinutes: number | null;
    doubleFinals: boolean;
    items: ProdePlayRuleItem[];
    notes: string[];
}

export interface ProdePlayView {
    scope: 'competition' | 'private_league';
    privateLeagueId: string | null;
    title: string;
    subtitle: string;
    competitionName: string;
    competitionStatus: ProdeCompetitionStatus;
    sportLabel: string | null;
    memberCount: number;
    nextLockAt: string | null;
    inviteCode: string | null;
    shareUrl: string | null;
    canInvite: boolean;
    canManage: boolean;
    canPlay: boolean;
    isFinished: boolean;
    events: ProdePlayEvent[];
    leaderboard: ProdePlayLeaderboardEntry[];
    personalSummary: ProdePlayPersonalSummary;
    rules: ProdePlayRulesSummary;
}
