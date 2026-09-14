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

export type OdesurAgendaItemView = {
    key: string;
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
};

export type OdesurAgendaView = {
    day: string;
    items: OdesurAgendaItemView[];
};
