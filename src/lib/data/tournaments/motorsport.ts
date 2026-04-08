import type { Tournament } from '@/lib/types';

const buildMotorsportHref = (leagueId: string, name: string) =>
    `/tournaments/${leagueId}?sport=motorsport&name=${encodeURIComponent(name)}`;

export const MOTORSPORT_TOURNAMENTS_INTERNATIONAL: Tournament[] = [
    {
        id: 'espn-racing-league-f1',
        name: 'Formula 1',
        url: buildMotorsportHref('espn-racing-league-f1', 'Formula 1'),
        type: 'international',
        sportId: 'motorsport',
        countryId: 'international',
        priority: 100,
        categories: ['men'],
        format: 'league',
    },
];

export const MOTORSPORT_TOURNAMENTS_BY_COUNTRY: Record<string, Tournament[]> = {
    usa: [
        {
            id: 'espn-racing-league-irl',
            name: 'IndyCar',
            url: buildMotorsportHref('espn-racing-league-irl', 'IndyCar'),
            type: 'local',
            sportId: 'motorsport',
            countryId: 'usa',
            priority: 95,
            categories: ['men'],
            format: 'league',
        },
        {
            id: 'espn-racing-league-nascar-premier',
            name: 'NASCAR Cup Series',
            url: buildMotorsportHref('espn-racing-league-nascar-premier', 'NASCAR Cup Series'),
            type: 'local',
            sportId: 'motorsport',
            countryId: 'usa',
            priority: 92,
            categories: ['men'],
            format: 'league',
        },
        {
            id: 'espn-racing-league-nascar-secondary',
            name: 'NASCAR Xfinity Series',
            url: buildMotorsportHref('espn-racing-league-nascar-secondary', 'NASCAR Xfinity Series'),
            type: 'local',
            sportId: 'motorsport',
            countryId: 'usa',
            priority: 88,
            categories: ['men'],
            format: 'league',
        },
        {
            id: 'espn-racing-league-nascar-truck',
            name: 'NASCAR Truck Series',
            url: buildMotorsportHref('espn-racing-league-nascar-truck', 'NASCAR Truck Series'),
            type: 'local',
            sportId: 'motorsport',
            countryId: 'usa',
            priority: 84,
            categories: ['men'],
            format: 'league',
        },
    ],
};

export const getAllMotorsportTournaments = (): Tournament[] => {
    return [...MOTORSPORT_TOURNAMENTS_INTERNATIONAL, ...Object.values(MOTORSPORT_TOURNAMENTS_BY_COUNTRY).flat()];
};

export const getMotorsportTournamentsByCountry = (countryId: string): Tournament[] => {
    return MOTORSPORT_TOURNAMENTS_BY_COUNTRY[countryId] || [];
};

export const getInternationalMotorsportTournaments = (): Tournament[] => {
    return MOTORSPORT_TOURNAMENTS_INTERNATIONAL;
};
