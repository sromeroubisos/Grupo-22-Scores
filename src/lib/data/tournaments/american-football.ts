import type { Tournament } from '@/lib/types';

export const AMERICAN_FOOTBALL_TOURNAMENTS_INTERNATIONAL: Tournament[] = [
    { id: 'amfoot-world-championship', name: 'World Championship', url: '/american-football/world/world-championship/', type: 'international', sportId: 'american-football', countryId: 'international', priority: 100, categories: ['men'] },
    { id: 'amfoot-european-championship', name: 'European Championship', url: '/american-football/europe/european-championship/', type: 'international', sportId: 'american-football', countryId: 'europe', priority: 95, categories: ['men'] },
    { id: 'amfoot-elf', name: 'European League of Football', url: '/american-football/europe/european-league-of-football/', type: 'international', sportId: 'american-football', countryId: 'europe', priority: 90, categories: ['men'], format: 'league' },
];

export const AMERICAN_FOOTBALL_TOURNAMENTS_BY_COUNTRY: Record<string, Tournament[]> = {
    'austria': [{ id: 'amfoot-austria-afl', name: 'AFL', url: '/american-football/austria/afl/', type: 'local', sportId: 'american-football', countryId: 'austria', priority: 100, categories: ['men'] }],
    'brazil': [{ id: 'amfoot-brazil-bfa', name: 'BFA', url: '/american-football/brazil/bfa/', type: 'local', sportId: 'american-football', countryId: 'brazil', priority: 100, categories: ['men'] }],
    'canada': [{ id: 'amfoot-canada-cfl', name: 'CFL', url: '/american-football/canada/cfl/', type: 'local', sportId: 'american-football', countryId: 'canada', priority: 100, categories: ['men'] }],
    'czech-republic': [{ id: 'amfoot-czech-claf', name: 'CLAF', url: '/american-football/czech-republic/claf/', type: 'local', sportId: 'american-football', countryId: 'czech-republic', priority: 100, categories: ['men'] }],
    'denmark': [{ id: 'amfoot-denmark-national-ligaen', name: 'National Ligaen', url: '/american-football/denmark/national-ligaen/', type: 'local', sportId: 'american-football', countryId: 'denmark', priority: 100, categories: ['men'] }],
    'finland': [{ id: 'amfoot-finland-vaahteraliiga', name: 'Vaahteraliiga', url: '/american-football/finland/vaahteraliiga/', type: 'local', sportId: 'american-football', countryId: 'finland', priority: 100, categories: ['men'] }],
    'france': [{ id: 'amfoot-france-elite', name: 'Championnat Elite', url: '/american-football/france/championnat-elite/', type: 'local', sportId: 'american-football', countryId: 'france', priority: 100, categories: ['men'] }],
    'germany': [
        { id: 'amfoot-germany-gfl', name: 'GFL', url: '/american-football/germany/gfl/', type: 'local', sportId: 'american-football', countryId: 'germany', priority: 100, categories: ['men'] },
        { id: 'amfoot-germany-gfl-2', name: 'GFL 2', url: '/american-football/germany/gfl-2/', type: 'local', sportId: 'american-football', countryId: 'germany', priority: 80, categories: ['men'] },
    ],
    'hungary': [{ id: 'amfoot-hungary-hfl', name: 'HFL', url: '/american-football/hungary/hfl/', type: 'local', sportId: 'american-football', countryId: 'hungary', priority: 100, categories: ['men'] }],
    'italy': [{ id: 'amfoot-italy-ifl', name: 'IFL', url: '/american-football/italy/ifl/', type: 'local', sportId: 'american-football', countryId: 'italy', priority: 100, categories: ['men'] }],
    'japan': [{ id: 'amfoot-japan-x-league', name: 'X League', url: '/american-football/japan/x-league/', type: 'local', sportId: 'american-football', countryId: 'japan', priority: 100, categories: ['men'] }],
    'mexico': [{ id: 'amfoot-mexico-lfa', name: 'LFA', url: '/american-football/mexico/lfa/', type: 'local', sportId: 'american-football', countryId: 'mexico', priority: 100, categories: ['men'] }],
    'netherlands': [{ id: 'amfoot-nl-eredivisie', name: 'Eredivisie', url: '/american-football/netherlands/eredivisie/', type: 'local', sportId: 'american-football', countryId: 'netherlands', priority: 100, categories: ['men'] }],
    'norway': [{ id: 'amfoot-norway-eliteserien', name: 'Eliteserien', url: '/american-football/norway/eliteserien/', type: 'local', sportId: 'american-football', countryId: 'norway', priority: 100, categories: ['men'] }],
    'poland': [{ id: 'amfoot-poland-pfl-1', name: 'PFL 1', url: '/american-football/poland/pfl-1/', type: 'local', sportId: 'american-football', countryId: 'poland', priority: 100, categories: ['men'] }],
    'russia': [{ id: 'amfoot-russia-superleague', name: 'Superleague', url: '/american-football/russia/superleague/', type: 'local', sportId: 'american-football', countryId: 'russia', priority: 100, categories: ['men'] }],
    'spain': [{ id: 'amfoot-spain-lnfa', name: 'LNFA Serie A', url: '/american-football/spain/lnfa-serie-a/', type: 'local', sportId: 'american-football', countryId: 'spain', priority: 100, categories: ['men'] }],
    'sweden': [{ id: 'amfoot-sweden-superserien', name: 'Superserien', url: '/american-football/sweden/superserien/', type: 'local', sportId: 'american-football', countryId: 'sweden', priority: 100, categories: ['men'] }],
    'switzerland': [{ id: 'amfoot-ch-nla', name: 'NLA', url: '/american-football/switzerland/nla/', type: 'local', sportId: 'american-football', countryId: 'switzerland', priority: 100, categories: ['men'] }],
    'usa': [
        { id: 'amfoot-usa-nfl', name: 'NFL', url: '/american-football/usa/nfl/', type: 'local', sportId: 'american-football', countryId: 'usa', priority: 100, categories: ['men'] },
        { id: 'amfoot-usa-ncaa', name: 'NCAA', url: '/american-football/usa/ncaa/', type: 'local', sportId: 'american-football', countryId: 'usa', priority: 95, categories: ['men'] },
        { id: 'amfoot-usa-ufl', name: 'UFL', url: '/american-football/usa/ufl/', type: 'local', sportId: 'american-football', countryId: 'usa', priority: 85, categories: ['men'] },
        { id: 'amfoot-usa-af1', name: 'AF1', url: '/american-football/usa/af1/', type: 'local', sportId: 'american-football', countryId: 'usa', priority: 80, categories: ['men'] },
    ],
};

export const getAllAmericanFootballTournaments = (): Tournament[] => {
    return [...AMERICAN_FOOTBALL_TOURNAMENTS_INTERNATIONAL, ...Object.values(AMERICAN_FOOTBALL_TOURNAMENTS_BY_COUNTRY).flat()];
};

export const getAmericanFootballTournamentsByCountry = (countryId: string): Tournament[] => {
    return AMERICAN_FOOTBALL_TOURNAMENTS_BY_COUNTRY[countryId] || [];
};

export const getInternationalAmericanFootballTournaments = (): Tournament[] => {
    return AMERICAN_FOOTBALL_TOURNAMENTS_INTERNATIONAL;
};
