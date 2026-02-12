import type { Tournament } from '@/lib/types';

// ===== BASKETBALL TOURNAMENTS =====

export const BASKETBALL_TOURNAMENTS_INTERNATIONAL: Tournament[] = [
    // Major International
    { id: 'basketball-fiba-world-cup', name: 'FIBA World Cup', url: '/basketball/world/world-cup/', type: 'international', sportId: 'basketball', countryId: 'international', priority: 100, categories: ['men'], format: 'group-knockout' },
    { id: 'basketball-olympic-games', name: 'Olympic Games', url: '/basketball/world/olympic-games/', type: 'international', sportId: 'basketball', countryId: 'international', priority: 100, categories: ['men'] },
    { id: 'basketball-eurobasket', name: 'EuroBasket', url: '/basketball/europe/eurobasket/', type: 'international', sportId: 'basketball', countryId: 'europe', priority: 95, categories: ['men'] },
    { id: 'basketball-euroleague', name: 'EuroLeague', url: '/basketball/europe/euroleague/', type: 'international', sportId: 'basketball', countryId: 'europe', priority: 98, categories: ['men'], format: 'league' },
    { id: 'basketball-eurocup', name: 'EuroCup', url: '/basketball/europe/eurocup/', type: 'international', sportId: 'basketball', countryId: 'europe', priority: 90, categories: ['men'] },
    { id: 'basketball-basketball-champions-league', name: 'Basketball Champions League', url: '/basketball/europe/champions-league/', type: 'international', sportId: 'basketball', countryId: 'europe', priority: 88, categories: ['men'] },
    { id: 'basketball-fiba-americas', name: 'FIBA Americas', url: '/basketball/south-america/americup/', type: 'international', sportId: 'basketball', countryId: 'south-america', priority: 85, categories: ['men'] },
    { id: 'basketball-fiba-asia-cup', name: 'FIBA Asia Cup', url: '/basketball/asia/asia-cup/', type: 'international', sportId: 'basketball', countryId: 'asia', priority: 85, categories: ['men'] },

    // Women's International
    { id: 'basketball-fiba-world-cup-women', name: 'FIBA World Cup Women', url: '/fiba-world-cup-women/', type: 'international', sportId: 'basketball', countryId: 'international', priority: 99, categories: ['women'], isWomen: true },
    { id: 'basketball-olympic-games-women', name: 'Olympic Games Women', url: '/olympic-games-women/', type: 'international', sportId: 'basketball', countryId: 'international', priority: 99, categories: ['women'], isWomen: true },
    { id: 'basketball-eurobasket-women', name: 'EuroBasket Women', url: '/eurobasket-women/', type: 'international', sportId: 'basketball', countryId: 'europe', priority: 94, categories: ['women'], isWomen: true },
    { id: 'basketball-euroleague-women', name: 'EuroLeague Women', url: '/euroleague-women/', type: 'international', sportId: 'basketball', countryId: 'europe', priority: 92, categories: ['women'], isWomen: true },
];

export const BASKETBALL_TOURNAMENTS_BY_COUNTRY: Record<string, Tournament[]> = {
    'albania': [
        { id: 'basketball-albania-superliga', name: 'Superliga', url: '/basketball/albania/superliga/', type: 'local', sportId: 'basketball', countryId: 'albania', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-albania-liga-e-pare', name: 'Liga e Pare', url: '/basketball/albania/liga-e-pare/', type: 'local', sportId: 'basketball', countryId: 'albania', priority: 80, categories: ['men'], format: 'league' },
        { id: 'basketball-albania-supercup', name: 'Supercup', url: '/basketball/albania/supercup/', type: 'cup', sportId: 'basketball', countryId: 'albania', priority: 85, categories: ['men'] },
        { id: 'basketball-albania-superliga-women', name: 'Superliga Women', url: '/basketball/albania/superliga-women/', type: 'local', sportId: 'basketball', countryId: 'albania', priority: 90, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'argentina': [
        { id: 'basketball-argentina-lnb', name: 'LNB', url: '/basketball/argentina/lnb/', type: 'local', sportId: 'basketball', countryId: 'argentina', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-argentina-la-liga', name: 'La Liga Argentina', url: '/basketball/argentina/la-liga/', type: 'local', sportId: 'basketball', countryId: 'argentina', priority: 90, categories: ['men'], format: 'league' },
        { id: 'basketball-argentina-liga-federal', name: 'Liga Federal', url: '/basketball/argentina/liga-federal/', type: 'local', sportId: 'basketball', countryId: 'argentina', priority: 80, categories: ['men'], format: 'league' },
    ],

    'australia': [
        { id: 'basketball-australia-nbl', name: 'NBL', url: '/basketball/australia/nbl/', type: 'local', sportId: 'basketball', countryId: 'australia', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-australia-nbl1-west', name: 'NBL1 West', url: '/basketball/australia/nbl1-west/', type: 'local', sportId: 'basketball', countryId: 'australia', priority: 70, categories: ['men'], format: 'league' },
        { id: 'basketball-australia-nbl1-south', name: 'NBL1 South', url: '/basketball/australia/nbl1-south/', type: 'local', sportId: 'basketball', countryId: 'australia', priority: 70, categories: ['men'], format: 'league' },
        { id: 'basketball-australia-nbl1-north', name: 'NBL1 North', url: '/basketball/australia/nbl1-north/', type: 'local', sportId: 'basketball', countryId: 'australia', priority: 70, categories: ['men'], format: 'league' },
        { id: 'basketball-australia-nbl1-east', name: 'NBL1 East', url: '/basketball/australia/nbl1-east/', type: 'local', sportId: 'basketball', countryId: 'australia', priority: 70, categories: ['men'], format: 'league' },
        { id: 'basketball-australia-nbl1-central', name: 'NBL1 Central', url: '/basketball/australia/nbl1-central/', type: 'local', sportId: 'basketball', countryId: 'australia', priority: 70, categories: ['men'], format: 'league' },
        { id: 'basketball-australia-wnbl', name: 'WNBL', url: '/basketball/australia/wnbl/', type: 'local', sportId: 'basketball', countryId: 'australia', priority: 95, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'austria': [
        { id: 'basketball-austria-superliga', name: 'Superliga', url: '/basketball/austria/superliga/', type: 'local', sportId: 'basketball', countryId: 'austria', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-austria-b2l', name: 'B2L', url: '/basketball/austria/b2l/', type: 'local', sportId: 'basketball', countryId: 'austria', priority: 80, categories: ['men'], format: 'league' },
        { id: 'basketball-austria-austrian-cup', name: 'Austrian Cup', url: '/basketball/austria/austrian-cup/', type: 'cup', sportId: 'basketball', countryId: 'austria', priority: 85, categories: ['men'], format: 'knockout' },
    ],

    'brazil': [
        { id: 'basketball-brazil-nbb', name: 'NBB', url: '/basketball/brazil/nbb/', type: 'local', sportId: 'basketball', countryId: 'brazil', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-brazil-lbf-women', name: 'LBF Women', url: '/basketball/brazil/lbf-women/', type: 'local', sportId: 'basketball', countryId: 'brazil', priority: 95, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'canada': [
        { id: 'basketball-canada-cebl', name: 'CEBL', url: '/basketball/canada/cebl/', type: 'local', sportId: 'basketball', countryId: 'canada', priority: 100, categories: ['men'], format: 'league' },
    ],

    'china': [
        { id: 'basketball-china-cba', name: 'CBA', url: '/basketball/china/cba/', type: 'local', sportId: 'basketball', countryId: 'china', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-china-wcba-women', name: 'WCBA Women', url: '/basketball/china/wcba-women/', type: 'local', sportId: 'basketball', countryId: 'china', priority: 95, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'croatia': [
        { id: 'basketball-croatia-premijer-liga', name: 'Premijer liga', url: '/basketball/croatia/premijer-liga/', type: 'local', sportId: 'basketball', countryId: 'croatia', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-croatia-prva-liga', name: 'Prva liga', url: '/basketball/croatia/prva-liga/', type: 'local', sportId: 'basketball', countryId: 'croatia', priority: 80, categories: ['men'], format: 'league' },
        { id: 'basketball-croatia-croatian-cup', name: 'Croatian Cup', url: '/basketball/croatia/croatian-cup/', type: 'cup', sportId: 'basketball', countryId: 'croatia', priority: 85, categories: ['men'], format: 'knockout' },
    ],

    'czech-republic': [
        { id: 'basketball-czech-nbl', name: 'NBL', url: '/basketball/czech-republic/nbl/', type: 'local', sportId: 'basketball', countryId: 'czech-republic', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-czech-1-liga', name: '1. Liga', url: '/basketball/czech-republic/1-liga/', type: 'local', sportId: 'basketball', countryId: 'czech-republic', priority: 80, categories: ['men'], format: 'league' },
        { id: 'basketball-czech-czech-cup', name: 'Czech Cup', url: '/basketball/czech-republic/czech-cup/', type: 'cup', sportId: 'basketball', countryId: 'czech-republic', priority: 85, categories: ['men'], format: 'knockout' },
        { id: 'basketball-czech-zbl-women', name: 'ZBL Women', url: '/basketball/czech-republic/zbl-women/', type: 'local', sportId: 'basketball', countryId: 'czech-republic', priority: 90, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'finland': [
        { id: 'basketball-finland-korisliiga', name: 'Korisliiga', url: '/basketball/finland/korisliiga/', type: 'local', sportId: 'basketball', countryId: 'finland', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-finland-korisliiga-women', name: 'Korisliiga Women', url: '/basketball/finland/korisliiga-women/', type: 'local', sportId: 'basketball', countryId: 'finland', priority: 95, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'france': [
        { id: 'basketball-france-lnb', name: 'LNB', url: '/basketball/france/lnb/', type: 'local', sportId: 'basketball', countryId: 'france', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-france-pro-b', name: 'Pro B', url: '/basketball/france/pro-b/', type: 'local', sportId: 'basketball', countryId: 'france', priority: 85, categories: ['men'], format: 'league' },
        { id: 'basketball-france-french-cup', name: 'French Cup', url: '/basketball/france/french-cup/', type: 'cup', sportId: 'basketball', countryId: 'france', priority: 88, categories: ['men'], format: 'knockout' },
        { id: 'basketball-france-leaders-cup', name: 'Leaders Cup', url: '/basketball/france/leaders-cup/', type: 'cup', sportId: 'basketball', countryId: 'france', priority: 80, categories: ['men'] },
        { id: 'basketball-france-lfb-women', name: 'LFB Women', url: '/basketball/france/lfb-women/', type: 'local', sportId: 'basketball', countryId: 'france', priority: 95, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'germany': [
        { id: 'basketball-germany-bbl', name: 'BBL', url: '/basketball/germany/bbl/', type: 'local', sportId: 'basketball', countryId: 'germany', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-germany-pro-a', name: 'Pro A', url: '/basketball/germany/pro-a/', type: 'local', sportId: 'basketball', countryId: 'germany', priority: 85, categories: ['men'], format: 'league' },
        { id: 'basketball-germany-german-cup', name: 'German Cup', url: '/basketball/germany/german-cup/', type: 'cup', sportId: 'basketball', countryId: 'germany', priority: 90, categories: ['men'], format: 'knockout' },
        { id: 'basketball-germany-dbbl-women', name: 'DBBL Women', url: '/basketball/germany/dbbl-women/', type: 'local', sportId: 'basketball', countryId: 'germany', priority: 95, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'greece': [
        { id: 'basketball-greece-basket-league', name: 'Basket League', url: '/basketball/greece/basket-league/', type: 'local', sportId: 'basketball', countryId: 'greece', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-greece-elite-league', name: 'Elite League', url: '/basketball/greece/elite-league/', type: 'local', sportId: 'basketball', countryId: 'greece', priority: 75, categories: ['men'], format: 'league' },
        { id: 'basketball-greece-greek-cup', name: 'Greek Cup', url: '/basketball/greece/greek-cup/', type: 'cup', sportId: 'basketball', countryId: 'greece', priority: 90, categories: ['men'], format: 'knockout' },
    ],

    'israel': [
        { id: 'basketball-israel-super-league', name: 'Super League', url: '/basketball/israel/super-league/', type: 'local', sportId: 'basketball', countryId: 'israel', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-israel-liga-leumit', name: 'Liga Leumit', url: '/basketball/israel/liga-leumit/', type: 'local', sportId: 'basketball', countryId: 'israel', priority: 80, categories: ['men'], format: 'league' },
        { id: 'basketball-israel-state-cup', name: 'State Cup', url: '/basketball/israel/state-cup/', type: 'cup', sportId: 'basketball', countryId: 'israel', priority: 85, categories: ['men'], format: 'knockout' },
    ],

    'italy': [
        { id: 'basketball-italy-lega-a', name: 'Lega A', url: '/basketball/italy/lega-a/', type: 'local', sportId: 'basketball', countryId: 'italy', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-italy-serie-a2', name: 'Serie A2', url: '/basketball/italy/serie-a2/', type: 'local', sportId: 'basketball', countryId: 'italy', priority: 85, categories: ['men'], format: 'league' },
        { id: 'basketball-italy-italian-cup', name: 'Italian Cup', url: '/basketball/italy/italian-cup/', type: 'cup', sportId: 'basketball', countryId: 'italy', priority: 90, categories: ['men'], format: 'knockout' },
        { id: 'basketball-italy-serie-a1-women', name: 'Serie A1 Women', url: '/basketball/italy/serie-a1-women/', type: 'local', sportId: 'basketball', countryId: 'italy', priority: 95, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'japan': [
        { id: 'basketball-japan-b-league', name: 'B.League', url: '/basketball/japan/b-league/', type: 'local', sportId: 'basketball', countryId: 'japan', priority: 100, categories: ['men'], format: 'league' },
    ],

    'lithuania': [
        { id: 'basketball-lithuania-lkl', name: 'LKL', url: '/basketball/lithuania/lkl/', type: 'local', sportId: 'basketball', countryId: 'lithuania', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-lithuania-nkl', name: 'NKL', url: '/basketball/lithuania/nkl/', type: 'local', sportId: 'basketball', countryId: 'lithuania', priority: 80, categories: ['men'], format: 'league' },
        { id: 'basketball-lithuania-king-mindaugas-cup', name: 'King Mindaugas Cup', url: '/basketball/lithuania/king-mindaugas-cup/', type: 'cup', sportId: 'basketball', countryId: 'lithuania', priority: 85, categories: ['men'], format: 'knockout' },
    ],

    'mexico': [
        { id: 'basketball-mexico-lnbp', name: 'LNBP', url: '/basketball/mexico/lnbp/', type: 'local', sportId: 'basketball', countryId: 'mexico', priority: 100, categories: ['men'], format: 'league' },
    ],

    'netherlands': [
        { id: 'basketball-netherlands-bnxt-league', name: 'BNXT League', url: '/basketball/netherlands/bnxt-league/', type: 'local', sportId: 'basketball', countryId: 'netherlands', priority: 100, categories: ['men'], format: 'league' },
    ],

    'new-zealand': [
        { id: 'basketball-nz-nbl', name: 'NBL', url: '/basketball/new-zealand/nbl/', type: 'local', sportId: 'basketball', countryId: 'new-zealand', priority: 100, categories: ['men'], format: 'league' },
    ],

    'philippines': [
        { id: 'basketball-philippines-pba-philippine-cup', name: 'PBA, Philippine Cup', url: '/basketball/philippines/pba-philippine-cup/', type: 'local', sportId: 'basketball', countryId: 'philippines', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-philippines-pba-commissioner-cup', name: "PBA, Commissioner's Cup", url: '/basketball/philippines/pba-commissioner-s-cup/', type: 'local', sportId: 'basketball', countryId: 'philippines', priority: 95, categories: ['men'], format: 'league' },
        { id: 'basketball-philippines-uaap', name: 'UAAP', url: '/basketball/philippines/uaap/', type: 'local', sportId: 'basketball', countryId: 'philippines', priority: 85, categories: ['men'], format: 'league' },
    ],

    'poland': [
        { id: 'basketball-poland-plk', name: 'PLK', url: '/basketball/poland/plk/', type: 'local', sportId: 'basketball', countryId: 'poland', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-poland-polish-cup', name: 'Polish Cup', url: '/basketball/poland/polish-cup/', type: 'cup', sportId: 'basketball', countryId: 'poland', priority: 85, categories: ['men'], format: 'knockout' },
        { id: 'basketball-poland-super-cup', name: 'Super Cup', url: '/basketball/poland/super-cup/', type: 'cup', sportId: 'basketball', countryId: 'poland', priority: 80, categories: ['men'] },
        { id: 'basketball-poland-pbk-women', name: 'PBK Women', url: '/basketball/poland/pbk-women/', type: 'local', sportId: 'basketball', countryId: 'poland', priority: 90, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'portugal': [
        { id: 'basketball-portugal-lpb', name: 'LPB', url: '/basketball/portugal/lpb/', type: 'local', sportId: 'basketball', countryId: 'portugal', priority: 100, categories: ['men'], format: 'league' },
    ],

    'puerto-rico': [
        { id: 'basketball-puerto-rico-bsn', name: 'BSN', url: '/basketball/puerto-rico/bsn/', type: 'local', sportId: 'basketball', countryId: 'puerto-rico', priority: 100, categories: ['men'], format: 'league' },
    ],

    'russia': [
        { id: 'basketball-russia-vtb-united-league', name: 'VTB United League', url: '/basketball/russia/vtb-united-league/', type: 'local', sportId: 'basketball', countryId: 'russia', priority: 100, categories: ['men'], format: 'league' },
    ],

    'serbia': [
        { id: 'basketball-serbia-kls', name: 'KLS', url: '/basketball/serbia/kls/', type: 'local', sportId: 'basketball', countryId: 'serbia', priority: 100, categories: ['men'], format: 'league' },
    ],

    'slovenia': [
        { id: 'basketball-slovenia-liga-nova-kbm', name: 'Liga Nova KBM', url: '/basketball/slovenia/liga-nova-kbm/', type: 'local', sportId: 'basketball', countryId: 'slovenia', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-slovenia-slovenian-cup', name: 'Slovenian Cup', url: '/basketball/slovenia/slovenian-cup/', type: 'cup', sportId: 'basketball', countryId: 'slovenia', priority: 85, categories: ['men'], format: 'knockout' },
    ],

    'spain': [
        { id: 'basketball-spain-acb', name: 'ACB', url: '/basketball/spain/acb/', type: 'local', sportId: 'basketball', countryId: 'spain', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-spain-leb-oro', name: 'LEB Oro', url: '/basketball/spain/leb-oro/', type: 'local', sportId: 'basketball', countryId: 'spain', priority: 85, categories: ['men'], format: 'league' },
        { id: 'basketball-spain-spanish-cup', name: 'Spanish Cup', url: '/basketball/spain/spanish-cup/', type: 'cup', sportId: 'basketball', countryId: 'spain', priority: 95, categories: ['men'], format: 'knockout' },
        { id: 'basketball-spain-liga-femenina-women', name: 'Liga Femenina Women', url: '/basketball/spain/liga-femenina-women/', type: 'local', sportId: 'basketball', countryId: 'spain', priority: 90, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'turkey': [
        { id: 'basketball-turkey-super-lig', name: 'Super Lig', url: '/basketball/turkey/super-lig/', type: 'local', sportId: 'basketball', countryId: 'turkey', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-turkey-tbl', name: 'TBL', url: '/basketball/turkey/tbl/', type: 'local', sportId: 'basketball', countryId: 'turkey', priority: 85, categories: ['men'], format: 'league' },
        { id: 'basketball-turkey-turkish-cup', name: 'Turkish Cup', url: '/basketball/turkey/turkish-cup/', type: 'cup', sportId: 'basketball', countryId: 'turkey', priority: 90, categories: ['men'], format: 'knockout' },
        { id: 'basketball-turkey-kbsl-women', name: 'KBSL Women', url: '/basketball/turkey/kbsl-women/', type: 'local', sportId: 'basketball', countryId: 'turkey', priority: 90, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'uruguay': [
        { id: 'basketball-uruguay-lnb', name: 'LNB', url: '/basketball/uruguay/lnb/', type: 'local', sportId: 'basketball', countryId: 'uruguay', priority: 100, categories: ['men'], format: 'league' },
    ],

    'usa': [
        { id: 'basketball-usa-nba', name: 'NBA', url: '/basketball/usa/nba/', type: 'local', sportId: 'basketball', countryId: 'usa', priority: 100, categories: ['men'], format: 'league' },
        { id: 'basketball-usa-nba-summer-league', name: 'NBA Summer League - Las Vegas', url: '/basketball/usa/nba-summer-league-las-vegas/', type: 'local', sportId: 'basketball', countryId: 'usa', priority: 70, categories: ['men'] },
        { id: 'basketball-usa-nba-g-league', name: 'NBA G League', url: '/basketball/usa/nba-g-league/', type: 'local', sportId: 'basketball', countryId: 'usa', priority: 80, categories: ['men'], format: 'league' },
        { id: 'basketball-usa-ncaa', name: 'NCAA', url: '/basketball/usa/ncaa/', type: 'local', sportId: 'basketball', countryId: 'usa', priority: 90, categories: ['men'], format: 'group-knockout' },
        { id: 'basketball-usa-wnba', name: 'WNBA', url: '/basketball/usa/wnba/', type: 'local', sportId: 'basketball', countryId: 'usa', priority: 95, categories: ['women'], isWomen: true, format: 'league' },
    ],

    'venezuela': [
        { id: 'basketball-venezuela-spb', name: 'SPB', url: '/basketball/venezuela/spb/', type: 'local', sportId: 'basketball', countryId: 'venezuela', priority: 100, categories: ['men'], format: 'league' },
    ],
};

// Helper functions
export const getAllBasketballTournaments = (): Tournament[] => {
    const localTournaments = Object.values(BASKETBALL_TOURNAMENTS_BY_COUNTRY).flat();
    return [...BASKETBALL_TOURNAMENTS_INTERNATIONAL, ...localTournaments];
};

export const getBasketballTournamentsByCountry = (countryId: string): Tournament[] => {
    return BASKETBALL_TOURNAMENTS_BY_COUNTRY[countryId] || [];
};

export const getInternationalBasketballTournaments = (): Tournament[] => {
    return BASKETBALL_TOURNAMENTS_INTERNATIONAL;
};

export const getBasketballTournamentById = (id: string): Tournament | undefined => {
    return getAllBasketballTournaments().find(t => t.id === id);
};
