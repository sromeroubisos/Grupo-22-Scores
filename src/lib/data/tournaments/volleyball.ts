import type { Tournament } from '@/lib/types';

// International Volleyball Tournaments
export const VOLLEYBALL_TOURNAMENTS_INTERNATIONAL: Tournament[] = [
    // World
    { id: 'vb-world-championship', name: 'World Championship', url: '/volleyball/world/world-championship/', type: 'international', sportId: 'volleyball', countryId: 'international', priority: 100, categories: ['men'] },
    { id: 'vb-world-championship-women', name: 'World Championship Women', url: '/volleyball/world/world-championship-women/', type: 'international', sportId: 'volleyball', countryId: 'international', priority: 99, categories: ['women'], isWomen: true },
    { id: 'vb-world-cup', name: 'World Cup', url: '/volleyball/world/world-cup/', type: 'international', sportId: 'volleyball', countryId: 'international', priority: 98, categories: ['men'] },
    { id: 'vb-world-cup-women', name: 'World Cup Women', url: '/volleyball/world/world-cup-women/', type: 'international', sportId: 'volleyball', countryId: 'international', priority: 97, categories: ['women'], isWomen: true },
    { id: 'vb-olympic-games', name: 'Olympic Games', url: '/volleyball/world/olympic-games/', type: 'international', sportId: 'volleyball', countryId: 'international', priority: 100, categories: ['men'] },
    { id: 'vb-olympic-games-women', name: 'Olympic Games Women', url: '/volleyball/world/olympic-games-women/', type: 'international', sportId: 'volleyball', countryId: 'international', priority: 99, categories: ['women'], isWomen: true },
    { id: 'vb-nations-league', name: 'Nations League', url: '/volleyball/world/nations-league/', type: 'international', sportId: 'volleyball', countryId: 'international', priority: 95, categories: ['men'] },
    { id: 'vb-nations-league-women', name: 'Nations League Women', url: '/volleyball/world/nations-league-women/', type: 'international', sportId: 'volleyball', countryId: 'international', priority: 94, categories: ['women'], isWomen: true },
    { id: 'vb-club-world-championship', name: 'Club World Championship', url: '/volleyball/world/club-world-championship/', type: 'international', sportId: 'volleyball', countryId: 'international', priority: 90, categories: ['men'] },
    { id: 'vb-club-world-championship-women', name: 'Club World Championship Women', url: '/volleyball/world/club-world-championship-women/', type: 'international', sportId: 'volleyball', countryId: 'international', priority: 89, categories: ['women'], isWomen: true },

    // Europe
    { id: 'vb-euro-championship', name: 'European Championships', url: '/volleyball/europe/european-championships/', type: 'international', sportId: 'volleyball', countryId: 'europe', priority: 92, categories: ['men'] },
    { id: 'vb-euro-championship-women', name: 'European Championships Women', url: '/volleyball/europe/european-championships-women/', type: 'international', sportId: 'volleyball', countryId: 'europe', priority: 91, categories: ['women'], isWomen: true },
    { id: 'vb-champions-league', name: 'Champions League', url: '/volleyball/europe/champions-league/', type: 'international', sportId: 'volleyball', countryId: 'europe', priority: 93, categories: ['men'] },
    { id: 'vb-champions-league-women', name: 'Champions League Women', url: '/volleyball/europe/champions-league-women/', type: 'international', sportId: 'volleyball', countryId: 'europe', priority: 92, categories: ['women'], isWomen: true },
    { id: 'vb-cev-cup', name: 'CEV Cup', url: '/volleyball/europe/cev-cup/', type: 'international', sportId: 'volleyball', countryId: 'europe', priority: 85, categories: ['men'] },
    { id: 'vb-cev-cup-women', name: 'CEV Cup Women', url: '/volleyball/europe/cev-cup-women/', type: 'international', sportId: 'volleyball', countryId: 'europe', priority: 84, categories: ['women'], isWomen: true },
    { id: 'vb-challenge-cup', name: 'Challenge Cup', url: '/volleyball/europe/challenge-cup/', type: 'international', sportId: 'volleyball', countryId: 'europe', priority: 80, categories: ['men'] },
    { id: 'vb-challenge-cup-women', name: 'Challenge Cup Women', url: '/volleyball/europe/challenge-cup-women/', type: 'international', sportId: 'volleyball', countryId: 'europe', priority: 79, categories: ['women'], isWomen: true },
    { id: 'vb-golden-european-league', name: 'Golden European League', url: '/volleyball/europe/golden-european-league/', type: 'international', sportId: 'volleyball', countryId: 'europe', priority: 78, categories: ['men'] },
    { id: 'vb-golden-european-league-women', name: 'Golden European League Women', url: '/volleyball/europe/golden-european-league-women/', type: 'international', sportId: 'volleyball', countryId: 'europe', priority: 77, categories: ['women'], isWomen: true },

    // Americas
    { id: 'vb-south-american-championship', name: 'South American Championship', url: '/volleyball/south-america/south-american-championship/', type: 'international', sportId: 'volleyball', countryId: 'south-america', priority: 85, categories: ['men'] },
    { id: 'vb-south-american-championship-women', name: 'South American Championship Women', url: '/volleyball/south-america/south-american-championship-women/', type: 'international', sportId: 'volleyball', countryId: 'south-america', priority: 84, categories: ['women'], isWomen: true },
    { id: 'vb-norceca-championship', name: 'NORCECA Championship', url: '/volleyball/north-central-america/norceca-championship/', type: 'international', sportId: 'volleyball', countryId: 'north-central-america', priority: 82, categories: ['men'] },
    { id: 'vb-norceca-championship-women', name: 'NORCECA Championship Women', url: '/volleyball/north-central-america/norceca-championship-women/', type: 'international', sportId: 'volleyball', countryId: 'north-central-america', priority: 81, categories: ['women'], isWomen: true },
    { id: 'vb-pan-american-games', name: 'Pan American Games', url: '/volleyball/north-central-america/pan-american-games/', type: 'international', sportId: 'volleyball', countryId: 'international', priority: 88, categories: ['men'] },
    { id: 'vb-pan-american-games-women', name: 'Pan American Games Women', url: '/volleyball/north-central-america/pan-american-games-women/', type: 'international', sportId: 'volleyball', countryId: 'international', priority: 87, categories: ['women'], isWomen: true },

    // Asia
    { id: 'vb-asian-championship', name: 'Asian Championship', url: '/volleyball/asia/asian-championship/', type: 'international', sportId: 'volleyball', countryId: 'asia', priority: 82, categories: ['men'] },
    { id: 'vb-asian-championship-women', name: 'Asian Championship Women', url: '/volleyball/asia/asian-championship-women/', type: 'international', sportId: 'volleyball', countryId: 'asia', priority: 81, categories: ['women'], isWomen: true },
    { id: 'vb-asian-games', name: 'Asian Games', url: '/volleyball/asia/asian-games/', type: 'international', sportId: 'volleyball', countryId: 'asia', priority: 85, categories: ['men'] },
    { id: 'vb-asian-games-women', name: 'Asian Games Women', url: '/volleyball/asia/asian-games-women/', type: 'international', sportId: 'volleyball', countryId: 'asia', priority: 84, categories: ['women'], isWomen: true },
    { id: 'vb-avc-champions-league', name: 'AVC Champions League', url: '/avc-champions-league/', type: 'international', sportId: 'volleyball', countryId: 'asia', priority: 80, categories: ['men'] },
    { id: 'vb-avc-champions-league-women', name: 'AVC Champions League Women', url: '/avc-champions-league-women/', type: 'international', sportId: 'volleyball', countryId: 'asia', priority: 79, categories: ['women'], isWomen: true },

    // Africa
    { id: 'vb-african-championship', name: 'African Championship', url: '/african-championship/', type: 'international', sportId: 'volleyball', countryId: 'africa', priority: 75, categories: ['men'] },
    { id: 'vb-african-championship-women', name: 'African Championship Women', url: '/african-championship-women/', type: 'international', sportId: 'volleyball', countryId: 'africa', priority: 74, categories: ['women'], isWomen: true },

    // Friendlies
    { id: 'vb-friendly-international', name: 'Friendly International', url: '/friendly-international/', type: 'friendly', sportId: 'volleyball', countryId: 'international', priority: 50, categories: ['men'] },
    { id: 'vb-friendly-international-women', name: 'Friendly International Women', url: '/friendly-international-women/', type: 'friendly', sportId: 'volleyball', countryId: 'international', priority: 49, categories: ['women'], isWomen: true },
];

export const VOLLEYBALL_TOURNAMENTS_BY_COUNTRY: Record<string, Tournament[]> = {
    'argentina': [
        { id: 'vb-arg-lva', name: 'LVA', url: '/volleyball/argentina/lva/', type: 'local', sportId: 'volleyball', countryId: 'argentina', priority: 100, categories: ['men'] },
        { id: 'vb-arg-liga-women', name: 'Liga Women', url: '/volleyball/argentina/liga-women/', type: 'local', sportId: 'volleyball', countryId: 'argentina', priority: 95, categories: ['women'], isWomen: true },
    ],
    'australia': [
        { id: 'vb-aus-avl', name: 'AVL', url: '/volleyball/australia/avl/', type: 'local', sportId: 'volleyball', countryId: 'australia', priority: 100, categories: ['men'] },
        { id: 'vb-aus-avl-women', name: 'AVL Women', url: '/volleyball/australia/avl-women/', type: 'local', sportId: 'volleyball', countryId: 'australia', priority: 95, categories: ['women'], isWomen: true },
    ],
    'austria': [
        { id: 'vb-aut-avl', name: 'AVL', url: '/volleyball/austria/avl/', type: 'local', sportId: 'volleyball', countryId: 'austria', priority: 100, categories: ['men'] },
        { id: 'vb-aut-avl-women', name: 'AVL Women', url: '/volleyball/austria/avl-women/', type: 'local', sportId: 'volleyball', countryId: 'austria', priority: 95, categories: ['women'], isWomen: true },
    ],
    'belgium': [
        { id: 'vb-bel-volley-league', name: 'Volley League', url: '/volleyball/belgium/volley-league/', type: 'local', sportId: 'volleyball', countryId: 'belgium', priority: 100, categories: ['men'] },
        { id: 'vb-bel-volley-league-women', name: 'Volley League Women', url: '/volleyball/belgium/volley-league-women/', type: 'local', sportId: 'volleyball', countryId: 'belgium', priority: 95, categories: ['women'], isWomen: true },
    ],
    'brazil': [
        { id: 'vb-bra-superliga', name: 'SuperLiga', url: '/volleyball/brazil/superliga/', type: 'local', sportId: 'volleyball', countryId: 'brazil', priority: 100, categories: ['men'] },
        { id: 'vb-bra-superliga-women', name: 'Superliga Women', url: '/volleyball/brazil/superliga-women/', type: 'local', sportId: 'volleyball', countryId: 'brazil', priority: 95, categories: ['women'], isWomen: true },
    ],
    'bulgaria': [
        { id: 'vb-bul-superliga', name: 'SuperLiga', url: '/volleyball/bulgaria/superliga/', type: 'local', sportId: 'volleyball', countryId: 'bulgaria', priority: 100, categories: ['men'] },
        { id: 'vb-bul-superliga-women', name: 'Superliga Women', url: '/volleyball/bulgaria/superliga-women/', type: 'local', sportId: 'volleyball', countryId: 'bulgaria', priority: 95, categories: ['women'], isWomen: true },
    ],
    'china': [
        { id: 'vb-chn-cvl', name: 'CVL', url: '/volleyball/china/cvl/', type: 'local', sportId: 'volleyball', countryId: 'china', priority: 100, categories: ['men'] },
        { id: 'vb-chn-cvl-women', name: 'CVL Women', url: '/volleyball/china/cvl-women/', type: 'local', sportId: 'volleyball', countryId: 'china', priority: 95, categories: ['women'], isWomen: true },
    ],
    'czech-republic': [
        { id: 'vb-cze-extraliga', name: 'Extraliga', url: '/volleyball/czech-republic/extraliga/', type: 'local', sportId: 'volleyball', countryId: 'czech-republic', priority: 100, categories: ['men'] },
        { id: 'vb-cze-extraliga-women', name: 'Extraliga Women', url: '/volleyball/czech-republic/extraliga-women/', type: 'local', sportId: 'volleyball', countryId: 'czech-republic', priority: 95, categories: ['women'], isWomen: true },
    ],
    'finland': [
        { id: 'vb-fin-mestaruusliiga', name: 'Mestaruusliiga', url: '/volleyball/finland/mestaruusliiga/', type: 'local', sportId: 'volleyball', countryId: 'finland', priority: 100, categories: ['men'] },
        { id: 'vb-fin-mestaruusliiga-women', name: 'Mestaruusliiga Women', url: '/volleyball/finland/mestaruusliiga-women/', type: 'local', sportId: 'volleyball', countryId: 'finland', priority: 95, categories: ['women'], isWomen: true },
    ],
    'france': [
        { id: 'vb-fra-ligue-a', name: 'Ligue A', url: '/volleyball/france/ligue-a/', type: 'local', sportId: 'volleyball', countryId: 'france', priority: 100, categories: ['men'] },
        { id: 'vb-fra-ligue-a-women', name: 'Ligue A Women', url: '/volleyball/france/ligue-a-women/', type: 'local', sportId: 'volleyball', countryId: 'france', priority: 95, categories: ['women'], isWomen: true },
    ],
    'germany': [
        { id: 'vb-ger-bundesliga', name: '1. Bundesliga', url: '/volleyball/germany/1-bundesliga/', type: 'local', sportId: 'volleyball', countryId: 'germany', priority: 100, categories: ['men'] },
        { id: 'vb-ger-bundesliga-women', name: '1. Bundesliga Women', url: '/volleyball/germany/1-bundesliga-women/', type: 'local', sportId: 'volleyball', countryId: 'germany', priority: 95, categories: ['women'], isWomen: true },
    ],
    'greece': [
        { id: 'vb-gre-a1', name: 'A1', url: '/volleyball/greece/a1/', type: 'local', sportId: 'volleyball', countryId: 'greece', priority: 100, categories: ['men'] },
        { id: 'vb-gre-a1-women', name: 'A1 Women', url: '/volleyball/greece/a1-women/', type: 'local', sportId: 'volleyball', countryId: 'greece', priority: 95, categories: ['women'], isWomen: true },
    ],
    'italy': [
        { id: 'vb-ita-superlega', name: 'SuperLega', url: '/volleyball/italy/superlega/', type: 'local', sportId: 'volleyball', countryId: 'italy', priority: 100, categories: ['men'] },
        { id: 'vb-ita-serie-a1-women', name: 'Serie A1 Women', url: '/volleyball/italy/serie-a1-women/', type: 'local', sportId: 'volleyball', countryId: 'italy', priority: 95, categories: ['women'], isWomen: true },
    ],
    'japan': [
        { id: 'vb-jpn-sv-league', name: 'SV.League', url: '/volleyball/japan/sv-league/', type: 'local', sportId: 'volleyball', countryId: 'japan', priority: 100, categories: ['men'] },
        { id: 'vb-jpn-sv-league-women', name: 'SV.League Women', url: '/volleyball/japan/sv-league-women/', type: 'local', sportId: 'volleyball', countryId: 'japan', priority: 95, categories: ['women'], isWomen: true },
    ],
    'netherlands': [
        { id: 'vb-ned-eredivisie', name: 'Eredivisie', url: '/volleyball/netherlands/eredivisie/', type: 'local', sportId: 'volleyball', countryId: 'netherlands', priority: 100, categories: ['men'] },
        { id: 'vb-ned-eredivisie-women', name: 'Eredivisie Women', url: '/volleyball/netherlands/eredivisie-women/', type: 'local', sportId: 'volleyball', countryId: 'netherlands', priority: 95, categories: ['women'], isWomen: true },
    ],
    'poland': [
        { id: 'vb-pol-plusliga', name: 'PlusLiga', url: '/volleyball/poland/plusliga/', type: 'local', sportId: 'volleyball', countryId: 'poland', priority: 100, categories: ['men'] },
        { id: 'vb-pol-tauron-liga-women', name: 'TAURON Liga Women', url: '/volleyball/poland/tauron-liga-women/', type: 'local', sportId: 'volleyball', countryId: 'poland', priority: 95, categories: ['women'], isWomen: true },
    ],
    'russia': [
        { id: 'vb-rus-superleague', name: 'Superleague', url: '/volleyball/russia/superleague/', type: 'local', sportId: 'volleyball', countryId: 'russia', priority: 100, categories: ['men'] },
        { id: 'vb-rus-superleague-women', name: 'Superleague Women', url: '/volleyball/russia/superleague-women/', type: 'local', sportId: 'volleyball', countryId: 'russia', priority: 95, categories: ['women'], isWomen: true },
    ],
    'serbia': [
        { id: 'vb-srb-superliga', name: 'Superliga', url: '/volleyball/serbia/superliga/', type: 'local', sportId: 'volleyball', countryId: 'serbia', priority: 100, categories: ['men'] },
        { id: 'vb-srb-superliga-women', name: 'Superliga Women', url: '/volleyball/serbia/superliga-women/', type: 'local', sportId: 'volleyball', countryId: 'serbia', priority: 95, categories: ['women'], isWomen: true },
    ],
    'spain': [
        { id: 'vb-esp-superliga', name: 'SuperLiga', url: '/volleyball/spain/superliga/', type: 'local', sportId: 'volleyball', countryId: 'spain', priority: 100, categories: ['men'] },
        { id: 'vb-esp-superliga-women', name: 'Superliga Women', url: '/volleyball/spain/superliga-women/', type: 'local', sportId: 'volleyball', countryId: 'spain', priority: 95, categories: ['women'], isWomen: true },
    ],
    'turkey': [
        { id: 'vb-tur-efeler-ligi', name: 'Efeler Ligi', url: '/volleyball/turkey/efeler-ligi/', type: 'local', sportId: 'volleyball', countryId: 'turkey', priority: 100, categories: ['men'] },
        { id: 'vb-tur-sultanlar-ligi-women', name: 'Sultanlar Ligi Women', url: '/volleyball/turkey/sultanlar-ligi-women/', type: 'local', sportId: 'volleyball', countryId: 'turkey', priority: 95, categories: ['women'], isWomen: true },
    ],
    'usa': [
        { id: 'vb-usa-lovb-women', name: 'LOVB Women', url: '/volleyball/usa/lovb-women/', type: 'local', sportId: 'volleyball', countryId: 'usa', priority: 100, categories: ['women'], isWomen: true },
        { id: 'vb-usa-mlv-women', name: 'MLV Women', url: '/volleyball/usa/mlv-women/', type: 'local', sportId: 'volleyball', countryId: 'usa', priority: 90, categories: ['women'], isWomen: true },
    ],
};

export const getAllVolleyballTournaments = (): Tournament[] => {
    return [...VOLLEYBALL_TOURNAMENTS_INTERNATIONAL, ...Object.values(VOLLEYBALL_TOURNAMENTS_BY_COUNTRY).flat()];
};

export const getVolleyballTournamentsByCountry = (countryId: string): Tournament[] => {
    return VOLLEYBALL_TOURNAMENTS_BY_COUNTRY[countryId] || [];
};

export const getInternationalVolleyballTournaments = (): Tournament[] => {
    return VOLLEYBALL_TOURNAMENTS_INTERNATIONAL;
};
