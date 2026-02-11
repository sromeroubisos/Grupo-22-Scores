import type { Tournament } from '@/lib/types';

// ===== RUGBY UNION TOURNAMENTS =====

export const RUGBY_TOURNAMENTS_INTERNATIONAL: Tournament[] = [
    // Major International Tournaments
    { id: 'rugby-world-cup', name: 'World Cup', url: '/rugby-union/world/world-cup/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 100, categories: ['men'], format: 'group-knockout' },
    { id: 'rugby-six-nations', name: 'Six Nations', url: '/rugby-union/europe/six-nations/', type: 'international', sportId: 'rugby', countryId: 'europe', priority: 99, categories: ['men'], format: 'league' },
    { id: 'rugby-nations-championship', name: 'Nations Championship', url: '/rugby-union/world/nations-championship/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 95, categories: ['men'] },
    { id: 'rugby-championship', name: 'Rugby Championship', url: '/rugby-union/world/rugby-championship/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 94, categories: ['men'] },
    { id: 'rugby-tri-nations', name: 'Tri Nations', url: '/rugby-union/world/tri-nations/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 93, categories: ['men'] },
    { id: 'rugby-lions-tour', name: 'Lions Tour', url: '/rugby-union/world/british-irish-lions-tour/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 92, categories: ['men'] },

    // Club Competitions
    // Club Competitions
    { id: 'rugby-united-rugby-championship', name: 'United Rugby Championship', url: '/rugby-union/world/united-rugby-championship/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 90, categories: ['men'], format: 'league' },
    { id: 'rugby-super-rugby', name: 'Super Rugby', url: '/rugby-union/world/super-rugby/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 89, categories: ['men'], format: 'league' },

    // Other International
    { id: 'rugby-nations-cup', name: 'Nations Cup', url: '/rugby-union/world/nations-cup/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 80, categories: ['men'] },
    { id: 'rugby-world-nations-cup', name: 'World Rugby Nations Cup', url: '/rugby-union/world/world-rugby-nations-cup/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 79, categories: ['men'] },
    { id: 'rugby-pro14-rainbow-cup', name: 'Pro14 Rainbow Cup', url: '/rugby-union/world/pro14-rainbow-cup/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 78, categories: ['men'] },
    { id: 'rugby-autumn-nations-cup', name: 'Autumn Nations Cup', url: '/rugby-union/world/autumn-nations-cup/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 77, categories: ['men'] },
    { id: 'rugby-irb-tbilisi-cup', name: 'IRB Tbilisi Cup', url: '/rugby-union/world/irb-tbilisi-cup/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 70, categories: ['men'] },

    // Americas
    { id: 'rugby-americas-championship', name: 'Americas Championship', url: '/rugby-union/south-america/americas-championship/', type: 'international', sportId: 'rugby', countryId: 'south-america', priority: 75, categories: ['men'] },
    { id: 'rugby-americas-pacific-challenge', name: 'Americas Pacific Challenge', url: '/rugby-union/world/americas-pacific-challenge/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 74, categories: ['men'] },

    // Pacific
    { id: 'rugby-pacific-challenge', name: 'Pacific Challenge', url: '/rugby-union/world/pacific-challenge/', type: 'international', sportId: 'rugby', countryId: 'oceania', priority: 73, categories: ['men'] },
    { id: 'rugby-pacific-nations-cup', name: 'Pacific Nations Cup', url: '/rugby-union/world/pacific-nations-cup/', type: 'international', sportId: 'rugby', countryId: 'oceania', priority: 72, categories: ['men'] },

    // Friendlies
    // Friendlies
    { id: 'rugby-friendly-international', name: 'Friendly International', url: '/rugby-union/world/friendly-international/', type: 'friendly', sportId: 'rugby', countryId: 'international', priority: 50, categories: ['men'] },
    { id: 'rugby-club-friendly', name: 'Club Friendly', url: '/rugby-union/world/club-friendly/', type: 'friendly', sportId: 'rugby', countryId: 'international', priority: 49, categories: ['men'] },

    // Youth
    { id: 'rugby-world-championship-u20', name: 'World Championship U20', url: '/rugby-union/world/world-championship-u20/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 85, categories: ['u20'], isYouth: true, ageGroup: 'U20' },
    { id: 'rugby-u20-rugby-championship', name: 'U20 Rugby Championship', url: '/rugby-union/world/u20-rugby-championship/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 84, categories: ['u20'], isYouth: true, ageGroup: 'U20' },
    { id: 'rugby-u20-trophy', name: 'U20 Trophy', url: '/rugby-union/world/u20-trophy/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 83, categories: ['u20'], isYouth: true, ageGroup: 'U20' },

    // Sevens
    { id: 'rugby-sevens-world-cup', name: 'Sevens World Cup', url: '/rugby-sevens/world/world-cup/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 88, categories: ['sevens'] },
    { id: 'rugby-olympic-games-7s', name: "Olympic Games 7's", url: '/rugby-sevens/world/olympic-games/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 99, categories: ['sevens'] },
    { id: 'rugby-world-club-7s', name: "World Club 7's", url: '/rugby-sevens/world/world-club-7-s/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 82, categories: ['sevens'] },
    { id: 'rugby-commonwealth-games-7s', name: "Commonwealth Games 7's", url: '/rugby-sevens/world/commonwealth-games/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 81, categories: ['sevens'] },
    { id: 'rugby-pan-american-games-7s', name: "Pan American Games 7's", url: '/rugby-sevens/world/pan-american-games/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 80, categories: ['sevens'] },
    { id: 'rugby-universiade-7s', name: "Universiade 7's", url: '/rugby-sevens/world/universiade/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 70, categories: ['sevens'] },
    { id: 'rugby-middlesex-7s', name: "Middlesex 7's", url: '/rugby-sevens/england/middlesex-7-s/', type: 'international', sportId: 'rugby', countryId: 'england', priority: 65, categories: ['sevens'] },

    // SVNS Series (World Series)
    { id: 'rugby-svns-australia', name: 'SVNS Australia', url: '/rugby-sevens/world/svns-australia/', type: 'international', sportId: 'rugby', countryId: 'australia', priority: 75, categories: ['sevens'] },
    { id: 'rugby-svns-canada', name: 'SVNS Canada', url: '/rugby-sevens/world/svns-canada/', type: 'international', sportId: 'rugby', countryId: 'canada', priority: 75, categories: ['sevens'] },
    { id: 'rugby-svns-dubai', name: 'SVNS Dubai', url: '/rugby-sevens/world/svns-dubai/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 75, categories: ['sevens'] },
    { id: 'rugby-svns-hong-kong', name: 'SVNS Hong Kong', url: '/rugby-sevens/world/svns-hong-kong/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 75, categories: ['sevens'] },
    { id: 'rugby-svns-singapore', name: 'SVNS Singapore', url: '/rugby-sevens/world/svns-singapore/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 75, categories: ['sevens'] },
    { id: 'rugby-svns-south-africa', name: 'SVNS South Africa', url: '/rugby-sevens/world/svns-south-africa/', type: 'international', sportId: 'rugby', countryId: 'south-africa', priority: 75, categories: ['sevens'] },
    { id: 'rugby-svns-spain', name: 'SVNS Spain', url: '/rugby-sevens/world/svns-spain/', type: 'international', sportId: 'rugby', countryId: 'spain', priority: 75, categories: ['sevens'] },
    { id: 'rugby-svns-usa', name: 'SVNS USA', url: '/rugby-sevens/world/svns-usa/', type: 'international', sportId: 'rugby', countryId: 'usa', priority: 75, categories: ['sevens'] },

    // Women's International
    { id: 'rugby-world-cup-women', name: 'World Cup Women', url: '/rugby-union/world/world-cup-women/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 98, categories: ['women'], isWomen: true },
    { id: 'rugby-wxv-1-women', name: 'WXV 1 Women', url: '/rugby-union/world/wxv-1-women/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 90, categories: ['women'], isWomen: true },
    { id: 'rugby-wxv-2-women', name: 'WXV 2 Women', url: '/rugby-union/world/wxv-2-women/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 89, categories: ['women'], isWomen: true },
    { id: 'rugby-wxv-3-women', name: 'WXV 3 Women', url: '/rugby-union/world/wxv-3-women/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 88, categories: ['women'], isWomen: true },
    { id: 'rugby-friendly-international-women', name: 'Friendly International Women', url: '/rugby-union/world/friendly-international-women/', type: 'friendly', sportId: 'rugby', countryId: 'international', priority: 50, categories: ['women'], isWomen: true },
    { id: 'rugby-olympic-games-7s-women', name: "Olympic Games 7's Women", url: '/rugby-sevens/world/olympic-games-women/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 97, categories: ['sevens', 'women'], isWomen: true },
    { id: 'rugby-sevens-world-cup-women', name: 'Sevens World Cup Women', url: '/rugby-sevens/world/world-cup-women/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 86, categories: ['sevens', 'women'], isWomen: true },
    { id: 'rugby-pacific-four-series-women', name: 'Pacific Four Series Women', url: '/rugby-union/world/pacific-four-series-women/', type: 'international', sportId: 'rugby', countryId: 'oceania', priority: 75, categories: ['women'], isWomen: true },
    { id: 'rugby-super-series-women', name: 'Super Series Women', url: '/rugby-union/world/super-series-women/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 74, categories: ['women'], isWomen: true },
    { id: 'rugby-commonwealth-games-7s-women', name: "Commonwealth Games 7's Women", url: '/rugby-sevens/world/commonwealth-games-women/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 80, categories: ['sevens', 'women'], isWomen: true },
    { id: 'rugby-pan-american-games-7s-women', name: "Pan American Games 7's Women", url: '/rugby-sevens/world/pan-american-games-women/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 79, categories: ['sevens', 'women'], isWomen: true },
    { id: 'rugby-universiade-7s-women', name: "Universiade 7's Women", url: '/rugby-sevens/world/universiade-women/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 68, categories: ['sevens', 'women'], isWomen: true },

    // Women's SVNS Series
    { id: 'rugby-svns-australia-women', name: 'SVNS Australia Women', url: '/rugby-sevens/world/svns-australia-women/', type: 'international', sportId: 'rugby', countryId: 'australia', priority: 73, categories: ['sevens', 'women'], isWomen: true },
    { id: 'rugby-svns-canada-women', name: 'SVNS Canada Women', url: '/rugby-sevens/world/svns-canada-women/', type: 'international', sportId: 'rugby', countryId: 'canada', priority: 73, categories: ['sevens', 'women'], isWomen: true },
    { id: 'rugby-svns-dubai-women', name: 'SVNS Dubai Women', url: '/rugby-sevens/world/svns-dubai-women/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 73, categories: ['sevens', 'women'], isWomen: true },
    { id: 'rugby-svns-hong-kong-women', name: 'SVNS Hong Kong Women', url: '/rugby-sevens/world/svns-hong-kong-women/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 73, categories: ['sevens', 'women'], isWomen: true },
    { id: 'rugby-svns-singapore-women', name: 'SVNS Singapore Women', url: '/rugby-sevens/world/svns-singapore-women/', type: 'international', sportId: 'rugby', countryId: 'international', priority: 73, categories: ['sevens', 'women'], isWomen: true },
    { id: 'rugby-svns-south-africa-women', name: 'SVNS South Africa Women', url: '/rugby-sevens/world/svns-south-africa-women/', type: 'international', sportId: 'rugby', countryId: 'south-africa', priority: 73, categories: ['sevens', 'women'], isWomen: true },
    { id: 'rugby-svns-usa-women', name: 'SVNS USA Women', url: '/rugby-sevens/world/svns-usa-women/', type: 'international', sportId: 'rugby', countryId: 'usa', priority: 73, categories: ['sevens', 'women'], isWomen: true },
];

export const RUGBY_TOURNAMENTS_BY_COUNTRY: Record<string, Tournament[]> = {
    'argentina': [
        {
            id: 'rugby-argentina-top-14',
            name: 'Top 14',
            url: '/rugby-union/argentina/top-14/',
            type: 'local',
            sportId: 'rugby',
            countryId: 'argentina',
            priority: 100,
            categories: ['men'],
            format: 'league',
            seasons: [
                { seasonId: '2026', year: 2026, teamsCount: 12, isActive: true },
                { seasonId: '2025', year: 2025, teamsCount: 12, isActive: false }
            ]
        },
    ],

    'australia': [
        { id: 'rugby-australia-super-rugby-aus', name: 'Super Rugby AUS', url: '/rugby-union/australia/super-rugby-aus/', type: 'local', sportId: 'rugby', countryId: 'australia', priority: 100, categories: ['men'], format: 'league' },
        { id: 'rugby-australia-shute-shield', name: 'Shute Shield', url: '/rugby-union/australia/shute-shield/', type: 'local', sportId: 'rugby', countryId: 'australia', priority: 80, categories: ['men'], format: 'league' },
        { id: 'rugby-australia-super-w-women', name: 'Super W Women', url: '/rugby-union/australia/super-w-women/', type: 'local', sportId: 'rugby', countryId: 'australia', priority: 90, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'czech-republic': [
        { id: 'rugby-czech-extraliga', name: 'Extraliga', url: '/rugby-union/czech-republic/extraliga/', type: 'local', sportId: 'rugby', countryId: 'czech-republic', priority: 100, categories: ['men'], format: 'league' },
    ],

    'england': [
        { id: 'rugby-england-premiership', name: 'Premiership Rugby', url: '/rugby-union/england/premiership-rugby/', type: 'local', sportId: 'rugby', countryId: 'england', priority: 100, categories: ['men'], format: 'league' },
        { id: 'rugby-england-championship', name: 'Championship Rugby', url: '/rugby-union/england/championship-rugby/', type: 'local', sportId: 'rugby', countryId: 'england', priority: 90, categories: ['men'], format: 'league' },
        { id: 'rugby-england-premiership-cup', name: 'Premiership Rugby Cup', url: '/rugby-union/england/premiership-rugby-cup/', type: 'cup', sportId: 'rugby', countryId: 'england', priority: 85, categories: ['men'], format: 'knockout' },
        { id: 'rugby-england-championship-cup', name: 'Championship Cup', url: '/rugby-union/england/championship-cup/', type: 'cup', sportId: 'rugby', countryId: 'england', priority: 80, categories: ['men'], format: 'knockout' },
        { id: 'rugby-england-premiership-women', name: 'Premiership Women', url: '/rugby-union/england/premiership-women/', type: 'local', sportId: 'rugby', countryId: 'england', priority: 95, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'finland': [
        { id: 'rugby-finland-sm-sarja', name: 'SM-sarja', url: '/rugby-union/finland/sm-sarja/', type: 'local', sportId: 'rugby', countryId: 'finland', priority: 100, categories: ['men'], format: 'league' },
    ],

    'france': [
        { id: 'rugby-france-top-14', name: 'Top 14', url: '/rugby-union/france/top-14/', type: 'local', sportId: 'rugby', countryId: 'france', priority: 100, categories: ['men'], format: 'league' },
        { id: 'rugby-france-pro-d2', name: 'Pro D2', url: '/rugby-union/france/pro-d2/', type: 'local', sportId: 'rugby', countryId: 'france', priority: 90, categories: ['men'], format: 'league' },
        { id: 'rugby-france-nationale', name: 'Nationale', url: '/rugby-union/france/nationale/', type: 'local', sportId: 'rugby', countryId: 'france', priority: 80, categories: ['men'], format: 'league' },
        { id: 'rugby-france-supersevens', name: 'Supersevens', url: '/rugby-union/france/supersevens/', type: 'local', sportId: 'rugby', countryId: 'france', priority: 75, categories: ['sevens'] },
        { id: 'rugby-france-elite-1-women', name: 'Elite 1 Women', url: '/rugby-union/france/elite-1-women/', type: 'local', sportId: 'rugby', countryId: 'france', priority: 95, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'georgia': [
        { id: 'rugby-georgia-didi-10', name: 'Didi 10', url: '/rugby-union/georgia/didi-10/', type: 'local', sportId: 'rugby', countryId: 'georgia', priority: 100, categories: ['men'], format: 'league' },
    ],

    'germany': [
        { id: 'rugby-germany-bundesliga', name: '1. Bundesliga', url: '/rugby-union/germany/1-bundesliga/', type: 'local', sportId: 'rugby', countryId: 'germany', priority: 100, categories: ['men'], format: 'league' },
    ],

    'ireland': [
        { id: 'rugby-ireland-all-ireland-league', name: 'All Ireland League', url: '/rugby-union/ireland/all-ireland-league/', type: 'local', sportId: 'rugby', countryId: 'ireland', priority: 100, categories: ['men'], format: 'league' },
    ],

    'italy': [
        { id: 'rugby-italy-serie-a-elite', name: 'Serie A Elite', url: '/rugby-union/italy/serie-a-elite/', type: 'local', sportId: 'rugby', countryId: 'italy', priority: 100, categories: ['men'], format: 'league' },
        { id: 'rugby-italy-coppa-italia', name: 'Coppa Italia', url: '/rugby-union/italy/coppa-italia/', type: 'cup', sportId: 'rugby', countryId: 'italy', priority: 85, categories: ['men'], format: 'knockout' },
    ],

    'japan': [
        { id: 'rugby-japan-league-one', name: 'League One', url: '/rugby-union/japan/league-one/', type: 'local', sportId: 'rugby', countryId: 'japan', priority: 100, categories: ['men'], format: 'league' },
    ],

    'netherlands': [
        { id: 'rugby-netherlands-ereklasse', name: 'Ereklasse', url: '/rugby-union/netherlands/ereklasse/', type: 'local', sportId: 'rugby', countryId: 'netherlands', priority: 100, categories: ['men'], format: 'league' },
    ],

    'new-zealand': [
        { id: 'rugby-nz-bunnings-npc', name: 'Bunnings NPC', url: '/rugby-union/new-zealand/bunnings-npc/', type: 'local', sportId: 'rugby', countryId: 'new-zealand', priority: 100, categories: ['men'], format: 'league' },
        { id: 'rugby-nz-heartland-championships', name: 'Heartland Championships', url: '/rugby-union/new-zealand/heartland-championships/', type: 'local', sportId: 'rugby', countryId: 'new-zealand', priority: 80, categories: ['men'], format: 'league' },
        { id: 'rugby-nz-super-rugby-aupiki-women', name: 'Super Rugby Aupiki Women', url: '/rugby-union/new-zealand/super-rugby-aupiki-women/', type: 'local', sportId: 'rugby', countryId: 'new-zealand', priority: 95, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'poland': [
        { id: 'rugby-poland-ekstraliga', name: 'Ekstraliga', url: '/rugby-union/poland/ekstraliga/', type: 'local', sportId: 'rugby', countryId: 'poland', priority: 100, categories: ['men'], format: 'league' },
    ],

    'portugal': [
        { id: 'rugby-portugal-cn-honra', name: 'CN Honra', url: '/rugby-union/portugal/cn-honra/', type: 'local', sportId: 'rugby', countryId: 'portugal', priority: 100, categories: ['men'], format: 'league' },
    ],

    'romania': [
        { id: 'rugby-romania-liga-nationala', name: 'Liga Nationala', url: '/rugby-union/romania/liga-nationala/', type: 'local', sportId: 'rugby', countryId: 'romania', priority: 100, categories: ['men'], format: 'league' },
    ],

    'russia': [
        { id: 'rugby-russia-premier-league', name: 'Premier League', url: '/rugby-union/russia/premier-league/', type: 'local', sportId: 'rugby', countryId: 'russia', priority: 100, categories: ['men'], format: 'league' },
    ],

    'scotland': [
        { id: 'rugby-scotland-premiership', name: 'Premiership', url: '/rugby-union/scotland/premiership/', type: 'local', sportId: 'rugby', countryId: 'scotland', priority: 100, categories: ['men'], format: 'league' },
        { id: 'rugby-scotland-super-series', name: 'Super Series', url: '/rugby-union/scotland/super-series/', type: 'local', sportId: 'rugby', countryId: 'scotland', priority: 85, categories: ['men'], format: 'league' },
    ],

    'south-africa': [
        { id: 'rugby-sa-currie-cup', name: 'Currie Cup', url: '/rugby-union/south-africa/currie-cup/', type: 'local', sportId: 'rugby', countryId: 'south-africa', priority: 100, categories: ['men'], format: 'league' },
    ],

    'spain': [
        { id: 'rugby-spain-division-de-honor', name: 'Division de Honor', url: '/rugby-union/spain/division-de-honor/', type: 'local', sportId: 'rugby', countryId: 'spain', priority: 100, categories: ['men'], format: 'league' },
    ],

    'usa': [
        { id: 'rugby-usa-major-league-rugby', name: 'Major League Rugby', url: '/rugby-union/usa/major-league-rugby/', type: 'local', sportId: 'rugby', countryId: 'usa', priority: 100, categories: ['men'], format: 'league' },
    ],

    'wales': [
        { id: 'rugby-wales-super-rygbi-cymru', name: 'Super Rygbi Cymru', url: '/rugby-union/wales/super-rygbi-cymru/', type: 'local', sportId: 'rugby', countryId: 'wales', priority: 100, categories: ['men'], format: 'league' },
        { id: 'rugby-wales-premiership', name: 'Premiership', url: '/rugby-union/wales/premiership/', type: 'local', sportId: 'rugby', countryId: 'wales', priority: 90, categories: ['men'], format: 'league' },
        { id: 'rugby-wales-challenge-cup', name: 'Challenge Cup', url: '/rugby-union/wales/challenge-cup/', type: 'cup', sportId: 'rugby', countryId: 'wales', priority: 85, categories: ['men'], format: 'knockout' },
    ],
};

// Helper functions
export const getAllRugbyTournaments = (): Tournament[] => {
    const localTournaments = Object.values(RUGBY_TOURNAMENTS_BY_COUNTRY).flat();
    return [...RUGBY_TOURNAMENTS_INTERNATIONAL, ...localTournaments];
};

export const getRugbyTournamentsByCountry = (countryId: string): Tournament[] => {
    return RUGBY_TOURNAMENTS_BY_COUNTRY[countryId] || [];
};

export const getInternationalRugbyTournaments = (): Tournament[] => {
    return RUGBY_TOURNAMENTS_INTERNATIONAL;
};

export const getRugbyTournamentById = (id: string): Tournament | undefined => {
    return getAllRugbyTournaments().find(t => t.id === id);
};
