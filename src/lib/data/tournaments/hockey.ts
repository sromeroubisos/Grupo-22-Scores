import type { Tournament } from '@/lib/types';

// ===== FIELD HOCKEY TOURNAMENTS =====

export const HOCKEY_TOURNAMENTS_INTERNATIONAL: Tournament[] = [
    // Major International Tournaments
    { id: 'hockey-world-cup', name: 'World Cup', url: '/field-hockey/world/world-cup/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 100, categories: ['men'], format: 'group-knockout' },
    { id: 'hockey-world-cup-women', name: 'World Cup Women', url: '/field-hockey/world/world-cup-women/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 99, categories: ['women'], isWomen: true, format: 'group-knockout' },
    { id: 'hockey-olympic-games', name: 'Olympic Games', url: '/field-hockey/world/olympic-games/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 100, categories: ['men'] },
    { id: 'hockey-olympic-games-women', name: 'Olympic Games Women', url: '/field-hockey/world/olympic-games-women/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 99, categories: ['women'], isWomen: true },

    // FIH Pro League
    { id: 'hockey-fih-pro-league', name: 'FIH Pro League', url: '/field-hockey/world/fih-pro-league/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 95, categories: ['men'], format: 'league' },
    { id: 'hockey-fih-pro-league-women', name: 'FIH Pro League Women', url: '/field-hockey/world/fih-pro-league-women/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 94, categories: ['women'], isWomen: true, format: 'league' },

    // FIH Nations Cup
    { id: 'hockey-fih-nations-cup', name: 'FIH Nations Cup', url: '/fih-nations-cup/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 90, categories: ['men'] },
    { id: 'hockey-fih-nations-cup-women', name: 'FIH Nations Cup Women', url: '/fih-nations-cup-women/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 89, categories: ['women'], isWomen: true },

    // Other International
    { id: 'hockey-world-league', name: 'World League', url: '/world-league/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 85, categories: ['men'] },
    { id: 'hockey-world-league-women', name: 'World League Women', url: '/world-league-women/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 84, categories: ['women'], isWomen: true },
    { id: 'hockey-hockey-series', name: 'Hockey Series', url: '/hockey-series/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 80, categories: ['men'] },
    { id: 'hockey-hockey-series-women', name: 'Hockey Series Women', url: '/hockey-series-women/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 79, categories: ['women'], isWomen: true },
    { id: 'hockey-champions-trophy', name: 'Champions Trophy', url: '/champions-trophy/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 88, categories: ['men'] },
    { id: 'hockey-champions-trophy-women', name: 'Champions Trophy Women', url: '/champions-trophy-women/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 87, categories: ['women'], isWomen: true },
    { id: 'hockey-champions-challenge', name: 'Champions Challenge', url: '/champions-challenge/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 75, categories: ['men'] },
    { id: 'hockey-champions-challenge-women', name: 'Champions Challenge Women', url: '/champions-challenge-women/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 74, categories: ['women'], isWomen: true },

    // Indoor
    { id: 'hockey-indoor-world-cup', name: 'Indoor World Cup', url: '/indoor-world-cup/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 82, categories: ['men'] },
    { id: 'hockey-indoor-world-cup-women', name: 'Indoor World Cup Women', url: '/indoor-world-cup-women/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 81, categories: ['women'], isWomen: true },

    // Youth
    { id: 'hockey-world-cup-u21', name: 'World Cup U21', url: '/world-cup-u21/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 78, categories: ['u21'], isYouth: true, ageGroup: 'U21' },
    { id: 'hockey-world-cup-u21-women', name: 'World Cup U21 Women', url: '/world-cup-u21-women/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 77, categories: ['u21', 'women'], isYouth: true, isWomen: true, ageGroup: 'U21' },
    { id: 'hockey-universiade', name: 'Universiade', url: '/universiade/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 70, categories: ['men'] },
    { id: 'hockey-universiade-women', name: 'Universiade Women', url: '/universiade-women/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 69, categories: ['women'], isWomen: true },

    // Multi-sport Games
    { id: 'hockey-commonwealth-games', name: 'Commonwealth Games', url: '/commonwealth-games/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 85, categories: ['men'] },
    { id: 'hockey-commonwealth-games-women', name: 'Commonwealth Games Women', url: '/commonwealth-games-women/', type: 'international', sportId: 'field-hockey', countryId: 'international', priority: 84, categories: ['women'], isWomen: true },
    { id: 'hockey-pan-american-games', name: 'Pan American Games', url: '/pan-american-games/', type: 'international', sportId: 'field-hockey', countryId: 'south-america', priority: 83, categories: ['men'] },
    { id: 'hockey-pan-american-games-women', name: 'Pan American Games Women', url: '/pan-american-games-women/', type: 'international', sportId: 'field-hockey', countryId: 'south-america', priority: 82, categories: ['women'], isWomen: true },
    { id: 'hockey-pan-american-cup', name: 'Pan American Cup', url: '/pan-american-cup/', type: 'international', sportId: 'field-hockey', countryId: 'south-america', priority: 78, categories: ['men'] },
    { id: 'hockey-pan-american-cup-women', name: 'Pan American Cup Women', url: '/pan-american-cup-women/', type: 'international', sportId: 'field-hockey', countryId: 'south-america', priority: 77, categories: ['women'], isWomen: true },

    // Friendlies
    { id: 'hockey-friendly-international', name: 'Friendly International', url: '/friendly-international/', type: 'friendly', sportId: 'field-hockey', countryId: 'international', priority: 50, categories: ['men'] },
    { id: 'hockey-friendly-international-women', name: 'Friendly International Women', url: '/friendly-international-women/', type: 'friendly', sportId: 'field-hockey', countryId: 'international', priority: 49, categories: ['women'], isWomen: true },

    // Regional - Africa
    { id: 'hockey-african-games', name: 'African Games', url: '/african-games/', type: 'international', sportId: 'field-hockey', countryId: 'africa', priority: 75, categories: ['men'] },
    { id: 'hockey-african-games-women', name: 'African Games Women', url: '/african-games-women/', type: 'international', sportId: 'field-hockey', countryId: 'africa', priority: 74, categories: ['women'], isWomen: true },

    // Regional - Central America
    { id: 'hockey-central-american-caribbean-games', name: 'Central American & Caribbean Games', url: '/central-american-caribbean-games/', type: 'international', sportId: 'field-hockey', countryId: 'north-central-america', priority: 72, categories: ['men'] },
    { id: 'hockey-central-american-caribbean-games-women', name: 'Central American & Caribbean Games Women', url: '/central-american-caribbean-games-women/', type: 'international', sportId: 'field-hockey', countryId: 'north-central-america', priority: 71, categories: ['women'], isWomen: true },

    // Regional - Asia
    { id: 'hockey-asian-champions-trophy', name: 'Asian Champions Trophy', url: '/asian-champions-trophy/', type: 'international', sportId: 'field-hockey', countryId: 'asia', priority: 80, categories: ['men'] },
    { id: 'hockey-asian-champions-trophy-women', name: 'Asian Champions Trophy Women', url: '/asian-champions-trophy-women/', type: 'international', sportId: 'field-hockey', countryId: 'asia', priority: 79, categories: ['women'], isWomen: true },
    { id: 'hockey-asian-games', name: 'Asian Games', url: '/asian-games/', type: 'international', sportId: 'field-hockey', countryId: 'asia', priority: 85, categories: ['men'] },
    { id: 'hockey-asian-games-women', name: 'Asian Games Women', url: '/asian-games-women/', type: 'international', sportId: 'field-hockey', countryId: 'asia', priority: 84, categories: ['women'], isWomen: true },
    { id: 'hockey-asia-cup', name: 'Asia Cup', url: '/asia-cup/', type: 'international', sportId: 'field-hockey', countryId: 'asia', priority: 78, categories: ['men'] },
    { id: 'hockey-asia-cup-women', name: 'Asia Cup Women', url: '/asia-cup-women/', type: 'international', sportId: 'field-hockey', countryId: 'asia', priority: 77, categories: ['women'], isWomen: true },
    { id: 'hockey-southeast-asian-games', name: 'Southeast Asian Games', url: '/southeast-asian-games/', type: 'international', sportId: 'field-hockey', countryId: 'asia', priority: 70, categories: ['men'] },
    { id: 'hockey-southeast-asian-games-women', name: 'Southeast Asian Games Women', url: '/southeast-asian-games-women/', type: 'international', sportId: 'field-hockey', countryId: 'asia', priority: 69, categories: ['women'], isWomen: true },

    // Regional - Europe
    { id: 'hockey-eurohockey-championship', name: 'EuroHockey Championship', url: '/eurohockey-championship/', type: 'international', sportId: 'field-hockey', countryId: 'europe', priority: 90, categories: ['men'] },
    { id: 'hockey-eurohockey-championship-women', name: 'EuroHockey Championship Women', url: '/eurohockey-championship-women/', type: 'international', sportId: 'field-hockey', countryId: 'europe', priority: 89, categories: ['women'], isWomen: true },
    { id: 'hockey-euro-hockey-league', name: 'Euro Hockey League', url: '/euro-hockey-league/', type: 'international', sportId: 'field-hockey', countryId: 'europe', priority: 92, categories: ['men'], format: 'knockout' },
    { id: 'hockey-euro-hockey-league-women', name: 'Euro Hockey League Women', url: '/euro-hockey-league-women/', type: 'international', sportId: 'field-hockey', countryId: 'europe', priority: 91, categories: ['women'], isWomen: true, format: 'knockout' },
    { id: 'hockey-eurohockey-club-trophy', name: 'EuroHockey Club Trophy', url: '/eurohockey-club-trophy/', type: 'international', sportId: 'field-hockey', countryId: 'europe', priority: 80, categories: ['men'] },
    { id: 'hockey-eurohockey-club-trophy-women', name: 'EuroHockey Club Trophy Women', url: '/eurohockey-club-trophy-women/', type: 'international', sportId: 'field-hockey', countryId: 'europe', priority: 79, categories: ['women'], isWomen: true },
    { id: 'hockey-eurohockey-club-trophy-ii', name: 'EuroHockey Club Trophy II', url: '/eurohockey-club-trophy-ii/', type: 'international', sportId: 'field-hockey', countryId: 'europe', priority: 75, categories: ['men'] },
    { id: 'hockey-eurohockey-club-trophy-ii-women', name: 'EuroHockey Club Trophy II Women', url: '/eurohockey-club-trophy-ii-women/', type: 'international', sportId: 'field-hockey', countryId: 'europe', priority: 74, categories: ['women'], isWomen: true },
    { id: 'hockey-eurohockey-club-challenge', name: 'EuroHockey Club Challenge', url: '/eurohockey-club-challenge/', type: 'international', sportId: 'field-hockey', countryId: 'europe', priority: 70, categories: ['men'] },
    { id: 'hockey-eurohockey-club-challenge-women', name: 'EuroHockey Club Challenge Women', url: '/eurohockey-club-challenge-women/', type: 'international', sportId: 'field-hockey', countryId: 'europe', priority: 69, categories: ['women'], isWomen: true },
    { id: 'hockey-indoor-eurohockey-championship', name: 'Indoor EuroHockey Championship', url: '/indoor-eurohockey-championship/', type: 'international', sportId: 'field-hockey', countryId: 'europe', priority: 78, categories: ['men'] },
    { id: 'hockey-indoor-eurohockey-championship-women', name: 'Indoor EuroHockey Championship Women', url: '/indoor-eurohockey-championship-women/', type: 'international', sportId: 'field-hockey', countryId: 'europe', priority: 77, categories: ['women'], isWomen: true },
];

export const HOCKEY_TOURNAMENTS_BY_COUNTRY: Record<string, Tournament[]> = {
    'australia': [
        { id: 'hockey-australia-hockey-one', name: 'Hockey One', url: '/field-hockey/australia/hockey-one/', type: 'local', sportId: 'field-hockey', countryId: 'australia', priority: 100, categories: ['men'], format: 'league' },
        { id: 'hockey-australia-hockey-one-women', name: 'Hockey One Women', url: '/field-hockey/australia/hockey-one-women/', type: 'local', sportId: 'field-hockey', countryId: 'australia', priority: 99, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'belgium': [
        { id: 'hockey-belgium-hockey-league', name: 'Hockey League', url: '/field-hockey/belgium/hockey-league/', type: 'local', sportId: 'field-hockey', countryId: 'belgium', priority: 100, categories: ['men'], format: 'league' },
    ],

    'czech-republic': [
        { id: 'hockey-czech-extraliga', name: 'Extraliga', url: '/field-hockey/czech-republic/extraliga/', type: 'local', sportId: 'field-hockey', countryId: 'czech-republic', priority: 100, categories: ['men'], format: 'league' },
        { id: 'hockey-czech-extraliga-women', name: 'Extraliga Women', url: '/field-hockey/czech-republic/extraliga-women/', type: 'local', sportId: 'field-hockey', countryId: 'czech-republic', priority: 99, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'england': [
        { id: 'hockey-england-premier-division', name: 'Premier Division', url: '/field-hockey/england/premier-division/', type: 'local', sportId: 'field-hockey', countryId: 'england', priority: 100, categories: ['men'], format: 'league' },
        { id: 'hockey-england-premier-division-women', name: 'Premier Division Women', url: '/field-hockey/england/premier-division-women/', type: 'local', sportId: 'field-hockey', countryId: 'england', priority: 99, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'france': [
        { id: 'hockey-france-elite-league', name: 'Elite League', url: '/field-hockey/france/elite-league/', type: 'local', sportId: 'field-hockey', countryId: 'france', priority: 100, categories: ['men'], format: 'league' },
    ],

    'germany': [
        { id: 'hockey-germany-bundesliga', name: '1. Bundesliga', url: '/field-hockey/germany/1-bundesliga/', type: 'local', sportId: 'field-hockey', countryId: 'germany', priority: 100, categories: ['men'], format: 'league' },
        { id: 'hockey-germany-bundesliga-women', name: '1. Bundesliga Women', url: '/field-hockey/germany/1-bundesliga-women/', type: 'local', sportId: 'field-hockey', countryId: 'germany', priority: 99, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'india': [
        { id: 'hockey-india-hil', name: 'HIL', url: '/field-hockey/india/hil/', type: 'local', sportId: 'field-hockey', countryId: 'india', priority: 100, categories: ['men'], format: 'league' },
    ],

    'ireland': [
        { id: 'hockey-ireland-eyhl', name: 'EYHL', url: '/field-hockey/ireland/eyhl/', type: 'local', sportId: 'field-hockey', countryId: 'ireland', priority: 100, categories: ['men'], format: 'league' },
        { id: 'hockey-ireland-eyhl-women', name: 'EYHL Women', url: '/field-hockey/ireland/eyhl-women/', type: 'local', sportId: 'field-hockey', countryId: 'ireland', priority: 99, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'italy': [
        { id: 'hockey-italy-serie-a1', name: 'Serie A1', url: '/field-hockey/italy/serie-a1/', type: 'local', sportId: 'field-hockey', countryId: 'italy', priority: 100, categories: ['men'], format: 'league' },
    ],

    'netherlands': [
        { id: 'hockey-netherlands-hoofdklasse', name: 'Hoofdklasse', url: '/field-hockey/netherlands/hoofdklasse/', type: 'local', sportId: 'field-hockey', countryId: 'netherlands', priority: 100, categories: ['men'], format: 'league' },
        { id: 'hockey-netherlands-hoofdklasse-women', name: 'Hoofdklasse Women', url: '/field-hockey/netherlands/hoofdklasse-women/', type: 'local', sportId: 'field-hockey', countryId: 'netherlands', priority: 99, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'poland': [
        { id: 'hockey-poland-hokej-superliga', name: 'Hokej Superliga', url: '/field-hockey/poland/hokej-superliga/', type: 'local', sportId: 'field-hockey', countryId: 'poland', priority: 100, categories: ['men'], format: 'league' },
    ],

    'portugal': [
        { id: 'hockey-portugal-cnhc', name: 'CNHC', url: '/field-hockey/portugal/cnhc/', type: 'local', sportId: 'field-hockey', countryId: 'portugal', priority: 100, categories: ['men'], format: 'league' },
    ],

    'scotland': [
        { id: 'hockey-scotland-division-1', name: 'Division 1', url: '/field-hockey/scotland/division-1/', type: 'local', sportId: 'field-hockey', countryId: 'scotland', priority: 100, categories: ['men'], format: 'league' },
    ],

    'spain': [
        { id: 'hockey-spain-division-de-honor', name: 'Division de Honor', url: '/field-hockey/spain/division-de-honor/', type: 'local', sportId: 'field-hockey', countryId: 'spain', priority: 100, categories: ['men'], format: 'league' },
        { id: 'hockey-spain-liga-iberdrola-women', name: 'Liga Iberdrola Women', url: '/field-hockey/spain/liga-iberdrola-women/', type: 'local', sportId: 'field-hockey', countryId: 'spain', priority: 99, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'switzerland': [
        { id: 'hockey-switzerland-nla', name: 'NLA', url: '/field-hockey/switzerland/nla/', type: 'local', sportId: 'field-hockey', countryId: 'switzerland', priority: 100, categories: ['men'], format: 'league' },
    ],
};

// Helper functions
export const getAllHockeyTournaments = (): Tournament[] => {
    const localTournaments = Object.values(HOCKEY_TOURNAMENTS_BY_COUNTRY).flat();
    return [...HOCKEY_TOURNAMENTS_INTERNATIONAL, ...localTournaments];
};

export const getHockeyTournamentsByCountry = (countryId: string): Tournament[] => {
    return HOCKEY_TOURNAMENTS_BY_COUNTRY[countryId] || [];
};

export const getInternationalHockeyTournaments = (): Tournament[] => {
    return HOCKEY_TOURNAMENTS_INTERNATIONAL;
};

export const getHockeyTournamentById = (id: string): Tournament | undefined => {
    return getAllHockeyTournaments().find(t => t.id === id);
};
