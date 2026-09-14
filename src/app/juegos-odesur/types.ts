/**
 * Lo que viaja del servidor al apartado de los Juegos Suramericanos. Solo
 * tipos: el cliente los importa sin arrastrar el servicio (que hace fetch y
 * tiene caché de servidor).
 */

export type OdesurMatchState = 'scheduled' | 'live' | 'final' | 'postponed' | 'cancelled' | string;

export type OdesurMatchSideView = {
    name: string;
    logo: string;
    score: number | null;
};

export type OdesurMatchView = {
    id: string;
    startsAt: string | null;
    status: OdesurMatchState;
    minute: string | null;
    stage: string;
    venue: string;
    home: OdesurMatchSideView;
    away: OdesurMatchSideView;
};

export type OdesurStandingView = {
    position: number | null;
    code: string | null;
    name: string;
    flag: string;
    played: number | null;
    won: number | null;
    lost: number | null;
    tied: number | null;
    pointsFor: number | null;
    pointsAgainst: number | null;
    diff: number | null;
    points: number | null;
};

export type OdesurGroupView = {
    name: string;
    rows: OdesurStandingView[];
};

export type OdesurCompetitionView = {
    tournamentId: string;
    name: string;
    matches: OdesurMatchView[];
    standings: OdesurGroupView[];
};

export type OdesurMedalRowView = {
    code: string;
    name: string;
    gold: number;
    silver: number;
    bronze: number;
    total: number;
    position: number;
};

export type OdesurMedalTableView = {
    discipline: string;
    disciplineName: string;
    rows: OdesurMedalRowView[];
    fetchedAt: string;
};

export type OdesurMedallistView = {
    metal: 'gold' | 'silver' | 'bronze';
    orgCode: string | null;
    orgName: string;
    name: string;
    isTeam: boolean;
    discipline: string;
    disciplineName: string;
    eventName: string;
    awardedAtIso: string | null;
    flag?: string;
};

export type OdesurMedalsView = {
    general: OdesurMedalTableView;
    byDiscipline: OdesurMedalTableView[];
    latest: OdesurMedallistView[];
};

/** Un lado de un cruce: el país (equipo) o el atleta con su país. */
export type OdesurEntrantView = {
    org: string | null;
    name: string;
    result: string;
    winner: boolean;
};

export type OdesurAgendaItemView = {
    key: string;
    resCode: string;
    discipline: string;
    disciplineName: string;
    eventName: string;
    phaseName: string;
    unitName: string;
    startsAtIso: string | null;
    status: string;
    state: OdesurMatchState;
    venue: string;
    medal: boolean;
    matchId: string | null;
    isH2H: boolean;
    orgs: string[];
    home: OdesurEntrantView | null;
    away: OdesurEntrantView | null;
    hasResults: boolean;
    /** Los tres primeros de una prueba terminada que no es un cruce. */
    podium: OdesurPodiumEntryView[];
    participants: number | null;
};

export type OdesurPodiumEntryView = {
    rank: number | null;
    org: string | null;
    name: string;
    result: string;
    metal: 'gold' | 'silver' | 'bronze' | null;
};

export type OdesurAgendaView = {
    day: string;
    items: OdesurAgendaItemView[];
    /** Algún deporte llegó sin competidores: hay que volver a pedir el día. */
    partial?: boolean;
};

export type OdesurSportDayView = {
    units: number;
    finals: number;
    live: number;
};

export type OdesurSportIndexRowView = {
    code: string;
    name: string;
    days: Record<string, OdesurSportDayView>;
};

export type OdesurSportsIndexView = {
    sports: OdesurSportIndexRowView[];
    missingDays: string[];
};

export type OdesurSportView = {
    code: string;
    name: string;
    days: string[];
    day: string;
    items: OdesurAgendaItemView[];
    medals: OdesurMedalTableView | null;
    medallists: OdesurMedallistView[];
};

export type OdesurRankingRowView = {
    rank: number | null;
    org: string | null;
    name: string;
    result: string;
    note: string;
    qualified: boolean;
};
