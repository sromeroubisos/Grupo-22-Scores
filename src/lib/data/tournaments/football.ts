import type { Tournament } from '@/lib/types';

// International Football Tournaments
export const FOOTBALL_TOURNAMENTS_INTERNATIONAL: Tournament[] = [
    // World/International
    { id: 'fb-world-cup', name: 'World Cup', url: '/football/world/world-cup/', type: 'international', sportId: 'football', countryId: 'international', priority: 100, categories: ['men'] },
    { id: 'fb-olympic-games', name: 'Olympic Games', url: '/football/world/olympic-games/', type: 'international', sportId: 'football', countryId: 'international', priority: 99, categories: ['men'] },
    { id: 'fb-club-world-cup', name: 'FIFA Club World Cup', url: '/football/world/fifa-club-world-cup/', type: 'international', sportId: 'football', countryId: 'international', priority: 98, categories: ['men'] },
    { id: 'fb-intercontinental', name: 'FIFA Intercontinental Cup', url: '/football/world/fifa-intercontinental-cup/', type: 'international', sportId: 'football', countryId: 'international', priority: 97, categories: ['men'] },
    { id: 'fb-wc-u20', name: 'World Cup U20', url: '/football/world/world-cup-u20/', type: 'international', sportId: 'football', countryId: 'international', priority: 85, categories: ['men'], isYouth: true },
    { id: 'fb-wc-u17', name: 'World Cup U17', url: '/football/world/world-cup-u17/', type: 'international', sportId: 'football', countryId: 'international', priority: 84, categories: ['men'], isYouth: true },
    { id: 'fb-finalissima', name: 'Finalissima', url: '/football/world/finalissima/', type: 'international', sportId: 'football', countryId: 'international', priority: 95, categories: ['men'] },
    { id: 'fb-friendly', name: 'Friendly International', url: '/football/world/friendly-international/', type: 'friendly', sportId: 'football', countryId: 'international', priority: 50, categories: ['men'] },
    { id: 'fb-wc-women', name: 'World Cup Women', url: '/football/world/world-cup-women/', type: 'international', sportId: 'football', countryId: 'international', priority: 99, categories: ['women'], isWomen: true },
    { id: 'fb-oly-women', name: 'Olympic Games Women', url: '/football/world/olympic-games-women/', type: 'international', sportId: 'football', countryId: 'international', priority: 98, categories: ['women'], isWomen: true },
    // Europe
    { id: 'fb-euro', name: 'Euro', url: '/football/europe/euro/', type: 'international', sportId: 'football', countryId: 'europe', priority: 98, categories: ['men'] },
    { id: 'fb-ucl', name: 'Champions League', url: '/football/europe/champions-league/', type: 'international', sportId: 'football', countryId: 'europe', priority: 100, categories: ['men'] },
    { id: 'fb-uel', name: 'Europa League', url: '/football/europe/europa-league/', type: 'international', sportId: 'football', countryId: 'europe', priority: 95, categories: ['men'] },
    { id: 'fb-uecl', name: 'Conference League', url: '/football/europe/conference-league/', type: 'international', sportId: 'football', countryId: 'europe', priority: 90, categories: ['men'] },
    { id: 'fb-unl', name: 'UEFA Nations League', url: '/football/europe/uefa-nations-league/', type: 'international', sportId: 'football', countryId: 'europe', priority: 92, categories: ['men'] },
    { id: 'fb-usc', name: 'UEFA Super Cup', url: '/football/europe/uefa-super-cup/', type: 'international', sportId: 'football', countryId: 'europe', priority: 88, categories: ['men'] },
    { id: 'fb-uwcl', name: 'Champions League Women', url: '/football/europe/champions-league-women/', type: 'international', sportId: 'football', countryId: 'europe', priority: 95, categories: ['women'], isWomen: true },
    // South America
    { id: 'fb-copa-am', name: 'Copa América', url: '/football/south-america/copa-america/', type: 'international', sportId: 'football', countryId: 'south-america', priority: 98, categories: ['men'], logoUrl: 'https://static.flashscore.com/res/image/data/S8pYvF7k-vFbuS0z4.png' },
    { id: 'fb-lib', name: 'Copa Libertadores', url: '/football/south-america/copa-libertadores/', type: 'international', sportId: 'football', countryId: 'south-america', priority: 100, categories: ['men'], logoUrl: 'https://static.flashscore.com/res/image/data/M9pGf49k-S67pE71B.png' },
    { id: 'fb-sud', name: 'Copa Sudamericana', url: '/football/south-america/copa-sudamericana/', type: 'international', sportId: 'football', countryId: 'south-america', priority: 92, categories: ['men'], logoUrl: 'https://static.flashscore.com/res/image/data/vJpGf49k-S67pE71B.png' },
    { id: 'fb-recopa', name: 'Recopa Sudamericana', url: '/football/south-america/recopa-sudamericana/', type: 'international', sportId: 'football', countryId: 'south-america', priority: 88, categories: ['men'] },
    // CONCACAF
    { id: 'fb-gold', name: 'Gold Cup', url: '/football/north-central-america/gold-cup/', type: 'international', sportId: 'football', countryId: 'north-central-america', priority: 95, categories: ['men'] },
    { id: 'fb-ccc', name: 'CONCACAF Champions Cup', url: '/football/north-central-america/concacaf-champions-cup/', type: 'international', sportId: 'football', countryId: 'north-central-america', priority: 92, categories: ['men'] },
    { id: 'fb-cnl', name: 'CONCACAF Nations League', url: '/football/north-central-america/concacaf-nations-league/', type: 'international', sportId: 'football', countryId: 'north-central-america', priority: 88, categories: ['men'] },
    { id: 'fb-leagues', name: 'Leagues Cup', url: '/football/north-central-america/leagues-cup/', type: 'international', sportId: 'football', countryId: 'north-central-america', priority: 85, categories: ['men'] },
    // Africa
    { id: 'fb-afcon', name: 'Africa Cup of Nations', url: '/football/africa/africa-cup-of-nations/', type: 'international', sportId: 'football', countryId: 'africa', priority: 95, categories: ['men'] },
    { id: 'fb-cafcl', name: 'CAF Champions League', url: '/football/africa/caf-champions-league/', type: 'international', sportId: 'football', countryId: 'africa', priority: 92, categories: ['men'] },
    { id: 'fb-cafcc', name: 'CAF Confederation Cup', url: '/football/africa/caf-confederation-cup/', type: 'international', sportId: 'football', countryId: 'africa', priority: 88, categories: ['men'] },
    // Asia
    { id: 'fb-afc', name: 'Asian Cup', url: '/football/asia/asian-cup/', type: 'international', sportId: 'football', countryId: 'asia', priority: 95, categories: ['men'] },
    { id: 'fb-afccl', name: 'AFC Champions League', url: '/football/asia/afc-champions-league/', type: 'international', sportId: 'football', countryId: 'asia', priority: 92, categories: ['men'] },
    // Oceania
    { id: 'fb-ofc', name: 'OFC Nations Cup', url: '/football/oceania/ofc-nations-cup/', type: 'international', sportId: 'football', countryId: 'oceania', priority: 90, categories: ['men'] },
];

export const FOOTBALL_TOURNAMENTS_BY_COUNTRY: Record<string, Tournament[]> = {
    'albania': [
        { id: 'fb-alb-sup', name: 'Abissnet Superiore', url: '/football/albania/abissnet-superiore/', type: 'local', sportId: 'football', countryId: 'albania', priority: 100, categories: ['men'] },
        { id: 'fb-alb-cup', name: 'Albanian Cup', url: '/football/albania/albanian-cup/', type: 'cup', sportId: 'football', countryId: 'albania', priority: 80, categories: ['men'] },
    ],
    'algeria': [
        { id: 'fb-alg-1', name: 'Ligue 1', url: '/football/algeria/ligue-1/', type: 'local', sportId: 'football', countryId: 'algeria', priority: 100, categories: ['men'] },
        { id: 'fb-alg-cup', name: 'Algeria Cup', url: '/football/algeria/algeria-cup/', type: 'cup', sportId: 'football', countryId: 'algeria', priority: 80, categories: ['men'] },
    ],
    'argentina': [
        { id: 'fb-arg-lp', name: 'Liga Profesional', url: '/football/argentina/liga-profesional/', type: 'local', sportId: 'football', countryId: 'argentina', priority: 100, categories: ['men'], logoUrl: 'https://www.ligaprofesional.ar/wp-content/uploads/2021/04/LPF.png' },
        { id: 'fb-arg-clp', name: 'Copa de la Liga Profesional', url: '/football/argentina/copa-de-la-liga-profesional/', type: 'cup', sportId: 'football', countryId: 'argentina', priority: 95, categories: ['men'], logoUrl: 'https://www.ligaprofesional.ar/wp-content/uploads/2021/04/LPF.png' },
        { id: 'fb-arg-pn', name: 'Primera Nacional', url: '/football/argentina/primera-nacional/', type: 'local', sportId: 'football', countryId: 'argentina', priority: 80, categories: ['men'] },
        { id: 'fb-arg-tf', name: 'Torneo Federal', url: '/football/argentina/torneo-federal/', type: 'local', sportId: 'football', countryId: 'argentina', priority: 70, categories: ['men'] },
        { id: 'fb-arg-pb', name: 'Primera B', url: '/football/argentina/primera-b/', type: 'local', sportId: 'football', countryId: 'argentina', priority: 65, categories: ['men'] },
        { id: 'fb-arg-pc', name: 'Primera C', url: '/football/argentina/primera-c/', type: 'local', sportId: 'football', countryId: 'argentina', priority: 60, categories: ['men'] },
        { id: 'fb-arg-ca', name: 'Copa Argentina', url: '/football/argentina/copa-argentina/', type: 'cup', sportId: 'football', countryId: 'argentina', priority: 90, categories: ['men'], logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Copa_Argentina_Logo.svg/1200px-Copa_Argentina_Logo.svg.png' },
        { id: 'fb-arg-tc', name: 'Trofeo de Campeones', url: '/football/argentina/trofeo-de-campeones/', type: 'cup', sportId: 'football', countryId: 'argentina', priority: 85, categories: ['men'] },
        { id: 'fb-arg-w', name: 'Primera A Women', url: '/football/argentina/primera-a-women/', type: 'local', sportId: 'football', countryId: 'argentina', priority: 75, categories: ['women'], isWomen: true },
    ],
    'australia': [
        { id: 'fb-aus-al', name: 'A-League', url: '/football/australia/a-league/', type: 'local', sportId: 'football', countryId: 'australia', priority: 100, categories: ['men'] },
        { id: 'fb-aus-cup', name: 'Australia Cup', url: '/football/australia/australia-cup/', type: 'cup', sportId: 'football', countryId: 'australia', priority: 85, categories: ['men'] },
        { id: 'fb-aus-w', name: 'A-League Women', url: '/football/australia/a-league-women/', type: 'local', sportId: 'football', countryId: 'australia', priority: 80, categories: ['women'], isWomen: true },
    ],
    'austria': [
        { id: 'fb-aut-bl', name: 'Bundesliga', url: '/football/austria/bundesliga/', type: 'local', sportId: 'football', countryId: 'austria', priority: 100, categories: ['men'] },
        { id: 'fb-aut-2', name: '2. Liga', url: '/football/austria/2-liga/', type: 'local', sportId: 'football', countryId: 'austria', priority: 80, categories: ['men'] },
        { id: 'fb-aut-cup', name: 'OFB Cup', url: '/football/austria/ofb-cup/', type: 'cup', sportId: 'football', countryId: 'austria', priority: 85, categories: ['men'] },
    ],
    'belgium': [
        { id: 'fb-bel-jpl', name: 'Jupiler Pro League', url: '/football/belgium/jupiler-pro-league/', type: 'local', sportId: 'football', countryId: 'belgium', priority: 100, categories: ['men'] },
        { id: 'fb-bel-cpl', name: 'Challenger Pro League', url: '/football/belgium/challenger-pro-league/', type: 'local', sportId: 'football', countryId: 'belgium', priority: 80, categories: ['men'] },
        { id: 'fb-bel-cup', name: 'Belgian Cup', url: '/football/belgium/belgian-cup/', type: 'cup', sportId: 'football', countryId: 'belgium', priority: 85, categories: ['men'] },
        { id: 'fb-bel-w', name: 'Super League Women', url: '/football/belgium/super-league-women/', type: 'local', sportId: 'football', countryId: 'belgium', priority: 75, categories: ['women'], isWomen: true },
    ],
    'brazil': [
        { id: 'fb-bra-a', name: 'Serie A Betano', url: '/football/brazil/serie-a-betano/', type: 'local', sportId: 'football', countryId: 'brazil', priority: 100, categories: ['men'] },
        { id: 'fb-bra-b', name: 'Serie B Superbet', url: '/football/brazil/serie-b-superbet/', type: 'local', sportId: 'football', countryId: 'brazil', priority: 85, categories: ['men'] },
        { id: 'fb-bra-c', name: 'Serie C', url: '/football/brazil/serie-c/', type: 'local', sportId: 'football', countryId: 'brazil', priority: 70, categories: ['men'] },
        { id: 'fb-bra-d', name: 'Serie D', url: '/football/brazil/serie-d/', type: 'local', sportId: 'football', countryId: 'brazil', priority: 60, categories: ['men'] },
        { id: 'fb-bra-cup', name: 'Copa Betano do Brasil', url: '/football/brazil/copa-betano-do-brasil/', type: 'cup', sportId: 'football', countryId: 'brazil', priority: 95, categories: ['men'] },
        { id: 'fb-bra-ne', name: 'Copa do Nordeste', url: '/football/brazil/copa-do-nordeste/', type: 'cup', sportId: 'football', countryId: 'brazil', priority: 75, categories: ['men'] },
        { id: 'fb-bra-sc', name: 'Supercopa do Brasil', url: '/football/brazil/supercopa-do-brasil/', type: 'cup', sportId: 'football', countryId: 'brazil', priority: 88, categories: ['men'] },
        { id: 'fb-bra-w', name: 'Brasileiro Women', url: '/football/brazil/brasileiro-women/', type: 'local', sportId: 'football', countryId: 'brazil', priority: 80, categories: ['women'], isWomen: true },
    ],
    'bulgaria': [
        { id: 'fb-bul-1', name: 'efbet League', url: '/football/bulgaria/efbet-league/', type: 'local', sportId: 'football', countryId: 'bulgaria', priority: 100, categories: ['men'] },
        { id: 'fb-bul-cup', name: 'Bulgarian Cup', url: '/football/bulgaria/bulgarian-cup/', type: 'cup', sportId: 'football', countryId: 'bulgaria', priority: 80, categories: ['men'] },
    ],
    'chile': [
        { id: 'fb-chi-1', name: 'Liga de Primera', url: '/football/chile/liga-de-primera/', type: 'local', sportId: 'football', countryId: 'chile', priority: 100, categories: ['men'] },
        { id: 'fb-chi-2', name: 'Liga de Ascenso', url: '/football/chile/liga-de-ascenso/', type: 'local', sportId: 'football', countryId: 'chile', priority: 75, categories: ['men'] },
        { id: 'fb-chi-cup', name: 'Copa Chile', url: '/football/chile/copa-chile/', type: 'cup', sportId: 'football', countryId: 'chile', priority: 85, categories: ['men'] },
    ],
    'china': [
        { id: 'fb-chn-sl', name: 'Super League', url: '/football/china/super-league/', type: 'local', sportId: 'football', countryId: 'china', priority: 100, categories: ['men'] },
        { id: 'fb-chn-1', name: 'League One', url: '/football/china/league-one/', type: 'local', sportId: 'football', countryId: 'china', priority: 80, categories: ['men'] },
        { id: 'fb-chn-cup', name: 'FA Cup', url: '/football/china/fa-cup/', type: 'cup', sportId: 'football', countryId: 'china', priority: 85, categories: ['men'] },
    ],
    'colombia': [
        { id: 'fb-col-a', name: 'Primera A', url: '/football/colombia/primera-a/', type: 'local', sportId: 'football', countryId: 'colombia', priority: 100, categories: ['men'] },
        { id: 'fb-col-b', name: 'Primera B', url: '/football/colombia/primera-b/', type: 'local', sportId: 'football', countryId: 'colombia', priority: 75, categories: ['men'] },
        { id: 'fb-col-cup', name: 'Copa Colombia', url: '/football/colombia/copa-colombia/', type: 'cup', sportId: 'football', countryId: 'colombia', priority: 85, categories: ['men'] },
        { id: 'fb-col-w', name: 'Liga Women', url: '/football/colombia/liga-women/', type: 'local', sportId: 'football', countryId: 'colombia', priority: 70, categories: ['women'], isWomen: true },
    ],
    'croatia': [
        { id: 'fb-cro-hnl', name: 'HNL', url: '/football/croatia/hnl/', type: 'local', sportId: 'football', countryId: 'croatia', priority: 100, categories: ['men'] },
        { id: 'fb-cro-cup', name: 'Croatian Cup', url: '/football/croatia/croatian-cup/', type: 'cup', sportId: 'football', countryId: 'croatia', priority: 85, categories: ['men'] },
    ],
    'czech-republic': [
        { id: 'fb-cze-cl', name: 'Chance Liga', url: '/football/czech-republic/chance-liga/', type: 'local', sportId: 'football', countryId: 'czech-republic', priority: 100, categories: ['men'] },
        { id: 'fb-cze-cup', name: 'MOL Cup', url: '/football/czech-republic/mol-cup/', type: 'cup', sportId: 'football', countryId: 'czech-republic', priority: 85, categories: ['men'] },
    ],
    'denmark': [
        { id: 'fb-den-sl', name: 'Superliga', url: '/football/denmark/superliga/', type: 'local', sportId: 'football', countryId: 'denmark', priority: 100, categories: ['men'] },
        { id: 'fb-den-1', name: '1st Division', url: '/football/denmark/1st-division/', type: 'local', sportId: 'football', countryId: 'denmark', priority: 80, categories: ['men'] },
        { id: 'fb-den-cup', name: 'Landspokal Cup', url: '/football/denmark/landspokal-cup/', type: 'cup', sportId: 'football', countryId: 'denmark', priority: 85, categories: ['men'] },
    ],
    'ecuador': [
        { id: 'fb-ecu-lp', name: 'Liga Pro', url: '/football/ecuador/liga-pro/', type: 'local', sportId: 'football', countryId: 'ecuador', priority: 100, categories: ['men'] },
        { id: 'fb-ecu-b', name: 'Serie B', url: '/football/ecuador/serie-b/', type: 'local', sportId: 'football', countryId: 'ecuador', priority: 75, categories: ['men'] },
        { id: 'fb-ecu-cup', name: 'Copa Ecuador', url: '/football/ecuador/copa-ecuador/', type: 'cup', sportId: 'football', countryId: 'ecuador', priority: 80, categories: ['men'] },
    ],
    'egypt': [
        { id: 'fb-egy-pl', name: 'Premier League', url: '/football/egypt/premier-league/', type: 'local', sportId: 'football', countryId: 'egypt', priority: 100, categories: ['men'] },
        { id: 'fb-egy-cup', name: 'Egypt Cup', url: '/football/egypt/egypt-cup/', type: 'cup', sportId: 'football', countryId: 'egypt', priority: 85, categories: ['men'] },
    ],
    'england': [
        { id: 'fb-eng-pl', name: 'Premier League', url: '/football/england/premier-league/', type: 'local', sportId: 'football', countryId: 'england', priority: 100, categories: ['men'] },
        { id: 'fb-eng-ch', name: 'Championship', url: '/football/england/championship/', type: 'local', sportId: 'football', countryId: 'england', priority: 85, categories: ['men'] },
        { id: 'fb-eng-l1', name: 'League One', url: '/football/england/league-one/', type: 'local', sportId: 'football', countryId: 'england', priority: 75, categories: ['men'] },
        { id: 'fb-eng-l2', name: 'League Two', url: '/football/england/league-two/', type: 'local', sportId: 'football', countryId: 'england', priority: 70, categories: ['men'] },
        { id: 'fb-eng-nl', name: 'National League', url: '/football/england/national-league/', type: 'local', sportId: 'football', countryId: 'england', priority: 60, categories: ['men'] },
        { id: 'fb-eng-fa', name: 'FA Cup', url: '/football/england/fa-cup/', type: 'cup', sportId: 'football', countryId: 'england', priority: 95, categories: ['men'] },
        { id: 'fb-eng-efl', name: 'EFL Cup', url: '/football/england/efl-cup/', type: 'cup', sportId: 'football', countryId: 'england', priority: 88, categories: ['men'] },
        { id: 'fb-eng-cs', name: 'FA Community Shield', url: '/football/england/fa-community-shield/', type: 'cup', sportId: 'football', countryId: 'england', priority: 82, categories: ['men'] },
        { id: 'fb-eng-wsl', name: 'WSL', url: '/football/england/wsl/', type: 'local', sportId: 'football', countryId: 'england', priority: 85, categories: ['women'], isWomen: true },
        { id: 'fb-eng-wfa', name: "Women's FA Cup", url: '/football/england/women-s-fa-cup/', type: 'cup', sportId: 'football', countryId: 'england', priority: 80, categories: ['women'], isWomen: true },
    ],
    'finland': [
        { id: 'fb-fin-vl', name: 'Veikkausliiga', url: '/football/finland/veikkausliiga/', type: 'local', sportId: 'football', countryId: 'finland', priority: 100, categories: ['men'] },
        { id: 'fb-fin-cup', name: 'Suomen Cup', url: '/football/finland/suomen-cup/', type: 'cup', sportId: 'football', countryId: 'finland', priority: 85, categories: ['men'] },
    ],
    'france': [
        { id: 'fb-fra-l1', name: 'Ligue 1', url: '/football/france/ligue-1/', type: 'local', sportId: 'football', countryId: 'france', priority: 100, categories: ['men'] },
        { id: 'fb-fra-l2', name: 'Ligue 2', url: '/football/france/ligue-2/', type: 'local', sportId: 'football', countryId: 'france', priority: 80, categories: ['men'] },
        { id: 'fb-fra-nat', name: 'National', url: '/football/france/national/', type: 'local', sportId: 'football', countryId: 'france', priority: 65, categories: ['men'] },
        { id: 'fb-fra-cup', name: 'Coupe de France', url: '/football/france/coupe-de-france/', type: 'cup', sportId: 'football', countryId: 'france', priority: 92, categories: ['men'] },
        { id: 'fb-fra-sc', name: 'Super Cup', url: '/football/france/super-cup/', type: 'cup', sportId: 'football', countryId: 'france', priority: 85, categories: ['men'] },
        { id: 'fb-fra-w', name: 'Premiere Ligue Women', url: '/football/france/premiere-ligue-women/', type: 'local', sportId: 'football', countryId: 'france', priority: 82, categories: ['women'], isWomen: true },
    ],
    'germany': [
        { id: 'fb-ger-bl', name: 'Bundesliga', url: '/football/germany/bundesliga/', type: 'local', sportId: 'football', countryId: 'germany', priority: 100, categories: ['men'] },
        { id: 'fb-ger-2bl', name: '2. Bundesliga', url: '/football/germany/2-bundesliga/', type: 'local', sportId: 'football', countryId: 'germany', priority: 85, categories: ['men'] },
        { id: 'fb-ger-3l', name: '3. Liga', url: '/football/germany/3-liga/', type: 'local', sportId: 'football', countryId: 'germany', priority: 70, categories: ['men'] },
        { id: 'fb-ger-dfb', name: 'DFB Pokal', url: '/football/germany/dfb-pokal/', type: 'cup', sportId: 'football', countryId: 'germany', priority: 92, categories: ['men'] },
        { id: 'fb-ger-sc', name: 'Super Cup', url: '/football/germany/super-cup/', type: 'cup', sportId: 'football', countryId: 'germany', priority: 85, categories: ['men'] },
        { id: 'fb-ger-w', name: 'Bundesliga Women', url: '/football/germany/bundesliga-women/', type: 'local', sportId: 'football', countryId: 'germany', priority: 82, categories: ['women'], isWomen: true },
    ],
    'greece': [
        { id: 'fb-gre-sl', name: 'Super League', url: '/football/greece/super-league/', type: 'local', sportId: 'football', countryId: 'greece', priority: 100, categories: ['men'] },
        { id: 'fb-gre-cup', name: 'Greek Cup', url: '/football/greece/greek-cup/', type: 'cup', sportId: 'football', countryId: 'greece', priority: 85, categories: ['men'] },
    ],
    'hungary': [
        { id: 'fb-hun-nb1', name: 'NB I.', url: '/football/hungary/nb-i/', type: 'local', sportId: 'football', countryId: 'hungary', priority: 100, categories: ['men'] },
        { id: 'fb-hun-cup', name: 'Hungarian Cup', url: '/football/hungary/hungarian-cup/', type: 'cup', sportId: 'football', countryId: 'hungary', priority: 85, categories: ['men'] },
    ],
    'india': [
        { id: 'fb-ind-isl', name: 'ISL', url: '/football/india/isl/', type: 'local', sportId: 'football', countryId: 'india', priority: 100, categories: ['men'] },
        { id: 'fb-ind-il', name: 'I-League', url: '/football/india/i-league/', type: 'local', sportId: 'football', countryId: 'india', priority: 80, categories: ['men'] },
        { id: 'fb-ind-dc', name: 'Durand Cup', url: '/football/india/durand-cup/', type: 'cup', sportId: 'football', countryId: 'india', priority: 85, categories: ['men'] },
    ],
    'indonesia': [
        { id: 'fb-idn-sl', name: 'Super League', url: '/football/indonesia/super-league/', type: 'local', sportId: 'football', countryId: 'indonesia', priority: 100, categories: ['men'] },
    ],
    'iran': [
        { id: 'fb-irn-pgpl', name: 'Persian Gulf Pro League', url: '/football/iran/persian-gulf-pro-league/', type: 'local', sportId: 'football', countryId: 'iran', priority: 100, categories: ['men'] },
        { id: 'fb-irn-cup', name: 'Hazfi Cup', url: '/football/iran/hazfi-cup/', type: 'cup', sportId: 'football', countryId: 'iran', priority: 85, categories: ['men'] },
    ],
    'ireland': [
        { id: 'fb-irl-pd', name: 'Premier Division', url: '/football/ireland/premier-division/', type: 'local', sportId: 'football', countryId: 'ireland', priority: 100, categories: ['men'] },
        { id: 'fb-irl-cup', name: 'FAI Cup', url: '/football/ireland/fai-cup/', type: 'cup', sportId: 'football', countryId: 'ireland', priority: 85, categories: ['men'] },
    ],
    'israel': [
        { id: 'fb-isr-lha', name: "Ligat ha'Al", url: '/football/israel/ligat-ha-al/', type: 'local', sportId: 'football', countryId: 'israel', priority: 100, categories: ['men'] },
        { id: 'fb-isr-cup', name: 'State Cup', url: '/football/israel/state-cup/', type: 'cup', sportId: 'football', countryId: 'israel', priority: 85, categories: ['men'] },
    ],
    'italy': [
        { id: 'fb-ita-sa', name: 'Serie A', url: '/football/italy/serie-a/', type: 'local', sportId: 'football', countryId: 'italy', priority: 100, categories: ['men'] },
        { id: 'fb-ita-sb', name: 'Serie B', url: '/football/italy/serie-b/', type: 'local', sportId: 'football', countryId: 'italy', priority: 80, categories: ['men'] },
        { id: 'fb-ita-ci', name: 'Coppa Italia', url: '/football/italy/coppa-italia/', type: 'cup', sportId: 'football', countryId: 'italy', priority: 92, categories: ['men'] },
        { id: 'fb-ita-sc', name: 'Super Cup', url: '/football/italy/super-cup/', type: 'cup', sportId: 'football', countryId: 'italy', priority: 85, categories: ['men'] },
        { id: 'fb-ita-w', name: 'Serie A Women', url: '/football/italy/serie-a-women/', type: 'local', sportId: 'football', countryId: 'italy', priority: 80, categories: ['women'], isWomen: true },
    ],
    'japan': [
        { id: 'fb-jpn-j1', name: 'J1 League', url: '/football/japan/j1-league/', type: 'local', sportId: 'football', countryId: 'japan', priority: 100, categories: ['men'] },
        { id: 'fb-jpn-j2', name: 'J2 League', url: '/football/japan/j2-league/', type: 'local', sportId: 'football', countryId: 'japan', priority: 80, categories: ['men'] },
        { id: 'fb-jpn-j3', name: 'J3 League', url: '/football/japan/j3-league/', type: 'local', sportId: 'football', countryId: 'japan', priority: 65, categories: ['men'] },
        { id: 'fb-jpn-lc', name: 'YBC Levain Cup', url: '/football/japan/ybc-levain-cup/', type: 'cup', sportId: 'football', countryId: 'japan', priority: 85, categories: ['men'] },
        { id: 'fb-jpn-ec', name: 'Emperors Cup', url: '/football/japan/emperors-cup/', type: 'cup', sportId: 'football', countryId: 'japan', priority: 90, categories: ['men'] },
        { id: 'fb-jpn-w', name: 'WE League Women', url: '/football/japan/we-league-women/', type: 'local', sportId: 'football', countryId: 'japan', priority: 80, categories: ['women'], isWomen: true },
    ],
    'south-korea': [
        { id: 'fb-kor-kl', name: 'K League 1', url: '/football/south-korea/k-league-1/', type: 'local', sportId: 'football', countryId: 'south-korea', priority: 100, categories: ['men'] },
        { id: 'fb-kor-kl2', name: 'K League 2', url: '/football/south-korea/k-league-2/', type: 'local', sportId: 'football', countryId: 'south-korea', priority: 80, categories: ['men'] },
        { id: 'fb-kor-cup', name: 'FA Cup', url: '/football/south-korea/fa-cup/', type: 'cup', sportId: 'football', countryId: 'south-korea', priority: 85, categories: ['men'] },
    ],
    'mexico': [
        { id: 'fb-mex-lmx', name: 'Liga MX', url: '/football/mexico/liga-mx/', type: 'local', sportId: 'football', countryId: 'mexico', priority: 100, categories: ['men'] },
        { id: 'fb-mex-exp', name: 'Liga de Expansion MX', url: '/football/mexico/liga-de-expansion-mx/', type: 'local', sportId: 'football', countryId: 'mexico', priority: 75, categories: ['men'] },
        { id: 'fb-mex-cup', name: 'Copa Mexico', url: '/football/mexico/copa-mexico/', type: 'cup', sportId: 'football', countryId: 'mexico', priority: 85, categories: ['men'] },
        { id: 'fb-mex-w', name: 'Liga MX Women', url: '/football/mexico/liga-mx-women/', type: 'local', sportId: 'football', countryId: 'mexico', priority: 80, categories: ['women'], isWomen: true },
    ],
    'netherlands': [
        { id: 'fb-ned-ere', name: 'Eredivisie', url: '/football/netherlands/eredivisie/', type: 'local', sportId: 'football', countryId: 'netherlands', priority: 100, categories: ['men'] },
        { id: 'fb-ned-ek', name: 'Eerste Divisie', url: '/football/netherlands/eerste-divisie/', type: 'local', sportId: 'football', countryId: 'netherlands', priority: 80, categories: ['men'] },
        { id: 'fb-ned-cup', name: 'KNVB Cup', url: '/football/netherlands/knvb-cup/', type: 'cup', sportId: 'football', countryId: 'netherlands', priority: 88, categories: ['men'] },
        { id: 'fb-ned-w', name: 'Eredivisie Women', url: '/football/netherlands/eredivisie-women/', type: 'local', sportId: 'football', countryId: 'netherlands', priority: 80, categories: ['women'], isWomen: true },
    ],
    'norway': [
        { id: 'fb-nor-el', name: 'Eliteserien', url: '/football/norway/eliteserien/', type: 'local', sportId: 'football', countryId: 'norway', priority: 100, categories: ['men'] },
        { id: 'fb-nor-cup', name: 'Norwegian Cup', url: '/football/norway/norwegian-cup/', type: 'cup', sportId: 'football', countryId: 'norway', priority: 85, categories: ['men'] },
        { id: 'fb-nor-w', name: 'Toppserien Women', url: '/football/norway/toppserien-women/', type: 'local', sportId: 'football', countryId: 'norway', priority: 80, categories: ['women'], isWomen: true },
    ],
    'paraguay': [
        { id: 'fb-pry-pd', name: 'Primera Division', url: '/football/paraguay/primera-division/', type: 'local', sportId: 'football', countryId: 'paraguay', priority: 100, categories: ['men'] },
    ],
    'peru': [
        { id: 'fb-per-l1', name: 'Liga 1', url: '/football/peru/liga-1/', type: 'local', sportId: 'football', countryId: 'peru', priority: 100, categories: ['men'] },
    ],
    'poland': [
        { id: 'fb-pol-ek', name: 'Ekstraklasa', url: '/football/poland/ekstraklasa/', type: 'local', sportId: 'football', countryId: 'poland', priority: 100, categories: ['men'] },
        { id: 'fb-pol-cup', name: 'Polish Cup', url: '/football/poland/polish-cup/', type: 'cup', sportId: 'football', countryId: 'poland', priority: 85, categories: ['men'] },
    ],
    'portugal': [
        { id: 'fb-por-lp', name: 'Liga Portugal', url: '/football/portugal/liga-portugal/', type: 'local', sportId: 'football', countryId: 'portugal', priority: 100, categories: ['men'] },
        { id: 'fb-por-2', name: 'Liga Portugal 2', url: '/football/portugal/liga-portugal-2/', type: 'local', sportId: 'football', countryId: 'portugal', priority: 75, categories: ['men'] },
        { id: 'fb-por-cup', name: 'Taça de Portugal', url: '/football/portugal/taca-de-portugal/', type: 'cup', sportId: 'football', countryId: 'portugal', priority: 90, categories: ['men'] },
        { id: 'fb-por-lc', name: 'Taça da Liga', url: '/football/portugal/taca-da-liga/', type: 'cup', sportId: 'football', countryId: 'portugal', priority: 80, categories: ['men'] },
        { id: 'fb-por-sc', name: 'Super Cup', url: '/football/portugal/super-cup/', type: 'cup', sportId: 'football', countryId: 'portugal', priority: 85, categories: ['men'] },
    ],
    'romania': [
        { id: 'fb-rou-sl', name: 'SuperLiga', url: '/football/romania/superliga/', type: 'local', sportId: 'football', countryId: 'romania', priority: 100, categories: ['men'] },
        { id: 'fb-rou-cup', name: 'Romanian Cup', url: '/football/romania/romanian-cup/', type: 'cup', sportId: 'football', countryId: 'romania', priority: 85, categories: ['men'] },
    ],
    'russia': [
        { id: 'fb-rus-rpl', name: 'Premier League', url: '/football/russia/premier-league/', type: 'local', sportId: 'football', countryId: 'russia', priority: 100, categories: ['men'] },
        { id: 'fb-rus-cup', name: 'Russian Cup', url: '/football/russia/russian-cup/', type: 'cup', sportId: 'football', countryId: 'russia', priority: 85, categories: ['men'] },
    ],
    'saudi-arabia': [
        { id: 'fb-sau-spl', name: 'Saudi Pro League', url: '/football/saudi-arabia/saudi-pro-league/', type: 'local', sportId: 'football', countryId: 'saudi-arabia', priority: 100, categories: ['men'] },
        { id: 'fb-sau-cup', name: 'Kings Cup', url: '/football/saudi-arabia/kings-cup/', type: 'cup', sportId: 'football', countryId: 'saudi-arabia', priority: 85, categories: ['men'] },
    ],
    'scotland': [
        { id: 'fb-sco-prem', name: 'Premiership', url: '/football/scotland/premiership/', type: 'local', sportId: 'football', countryId: 'scotland', priority: 100, categories: ['men'] },
        { id: 'fb-sco-cup', name: 'Scottish Cup', url: '/football/scotland/scottish-cup/', type: 'cup', sportId: 'football', countryId: 'scotland', priority: 90, categories: ['men'] },
        { id: 'fb-sco-lc', name: 'League Cup', url: '/football/scotland/league-cup/', type: 'cup', sportId: 'football', countryId: 'scotland', priority: 85, categories: ['men'] },
    ],
    'serbia': [
        { id: 'fb-srb-sl', name: 'Super Liga', url: '/football/serbia/super-liga/', type: 'local', sportId: 'football', countryId: 'serbia', priority: 100, categories: ['men'] },
        { id: 'fb-srb-cup', name: 'Serbian Cup', url: '/football/serbia/serbian-cup/', type: 'cup', sportId: 'football', countryId: 'serbia', priority: 85, categories: ['men'] },
    ],
    'spain': [
        { id: 'fb-esp-ll', name: 'LaLiga', url: '/football/spain/laliga/', type: 'local', sportId: 'football', countryId: 'spain', priority: 100, categories: ['men'] },
        { id: 'fb-esp-ll2', name: 'LaLiga 2', url: '/football/spain/laliga-2/', type: 'local', sportId: 'football', countryId: 'spain', priority: 80, categories: ['men'] },
        { id: 'fb-esp-cdr', name: 'Copa del Rey', url: '/football/spain/copa-del-rey/', type: 'cup', sportId: 'football', countryId: 'spain', priority: 92, categories: ['men'] },
        { id: 'fb-esp-sc', name: 'Super Cup', url: '/football/spain/super-cup/', type: 'cup', sportId: 'football', countryId: 'spain', priority: 88, categories: ['men'] },
        { id: 'fb-esp-lf', name: 'Liga F Women', url: '/football/spain/liga-f-women/', type: 'local', sportId: 'football', countryId: 'spain', priority: 85, categories: ['women'], isWomen: true },
    ],
    'sweden': [
        { id: 'fb-swe-as', name: 'Allsvenskan', url: '/football/sweden/allsvenskan/', type: 'local', sportId: 'football', countryId: 'sweden', priority: 100, categories: ['men'] },
        { id: 'fb-swe-cup', name: 'Svenska Cupen', url: '/football/sweden/svenska-cupen/', type: 'cup', sportId: 'football', countryId: 'sweden', priority: 85, categories: ['men'] },
        { id: 'fb-swe-w', name: 'Damallsvenskan Women', url: '/football/sweden/damallsvenskan-women/', type: 'local', sportId: 'football', countryId: 'sweden', priority: 82, categories: ['women'], isWomen: true },
    ],
    'switzerland': [
        { id: 'fb-sui-sl', name: 'Super League', url: '/football/switzerland/super-league/', type: 'local', sportId: 'football', countryId: 'switzerland', priority: 100, categories: ['men'] },
        { id: 'fb-sui-cup', name: 'Swiss Cup', url: '/football/switzerland/swiss-cup/', type: 'cup', sportId: 'football', countryId: 'switzerland', priority: 85, categories: ['men'] },
    ],
    'turkey': [
        { id: 'fb-tur-sl', name: 'Super Lig', url: '/football/turkey/super-lig/', type: 'local', sportId: 'football', countryId: 'turkey', priority: 100, categories: ['men'] },
        { id: 'fb-tur-1l', name: '1. Lig', url: '/football/turkey/1-lig/', type: 'local', sportId: 'football', countryId: 'turkey', priority: 75, categories: ['men'] },
        { id: 'fb-tur-cup', name: 'Turkish Cup', url: '/football/turkey/turkish-cup/', type: 'cup', sportId: 'football', countryId: 'turkey', priority: 85, categories: ['men'] },
        { id: 'fb-tur-sc', name: 'Super Cup', url: '/football/turkey/super-cup/', type: 'cup', sportId: 'football', countryId: 'turkey', priority: 80, categories: ['men'] },
    ],
    'ukraine': [
        { id: 'fb-ukr-pl', name: 'Premier League', url: '/football/ukraine/premier-league/', type: 'local', sportId: 'football', countryId: 'ukraine', priority: 100, categories: ['men'] },
        { id: 'fb-ukr-cup', name: 'Ukrainian Cup', url: '/football/ukraine/ukrainian-cup/', type: 'cup', sportId: 'football', countryId: 'ukraine', priority: 85, categories: ['men'] },
    ],
    'uruguay': [
        { id: 'fb-uru-pd', name: 'Primera Division', url: '/football/uruguay/primera-division/', type: 'local', sportId: 'football', countryId: 'uruguay', priority: 100, categories: ['men'] },
        { id: 'fb-uru-sd', name: 'Segunda Division', url: '/football/uruguay/segunda-division/', type: 'local', sportId: 'football', countryId: 'uruguay', priority: 70, categories: ['men'] },
    ],
    'usa': [
        { id: 'fb-usa-mls', name: 'MLS', url: '/football/usa/mls/', type: 'local', sportId: 'football', countryId: 'usa', priority: 100, categories: ['men'] },
        { id: 'fb-usa-uslc', name: 'USL Championship', url: '/football/usa/usl-championship/', type: 'local', sportId: 'football', countryId: 'usa', priority: 75, categories: ['men'] },
        { id: 'fb-usa-uoc', name: 'US Open Cup', url: '/football/usa/us-open-cup/', type: 'cup', sportId: 'football', countryId: 'usa', priority: 85, categories: ['men'] },
        { id: 'fb-usa-nwsl', name: 'NWSL', url: '/football/usa/nwsl/', type: 'local', sportId: 'football', countryId: 'usa', priority: 90, categories: ['women'], isWomen: true },
    ],
    'venezuela': [
        { id: 'fb-ven-pd', name: 'Primera Division', url: '/football/venezuela/primera-division/', type: 'local', sportId: 'football', countryId: 'venezuela', priority: 100, categories: ['men'] },
    ],
    'wales': [
        { id: 'fb-wal-cpl', name: 'Cymru Premier', url: '/football/wales/cymru-premier/', type: 'local', sportId: 'football', countryId: 'wales', priority: 100, categories: ['men'] },
        { id: 'fb-wal-cup', name: 'Welsh Cup', url: '/football/wales/welsh-cup/', type: 'cup', sportId: 'football', countryId: 'wales', priority: 85, categories: ['men'] },
    ],
};

export const getAllFootballTournaments = (): Tournament[] => {
    return [...FOOTBALL_TOURNAMENTS_INTERNATIONAL, ...Object.values(FOOTBALL_TOURNAMENTS_BY_COUNTRY).flat()];
};

export const getFootballTournamentsByCountry = (countryId: string): Tournament[] => {
    return FOOTBALL_TOURNAMENTS_BY_COUNTRY[countryId] || [];
};

export const getInternationalFootballTournaments = (): Tournament[] => {
    return FOOTBALL_TOURNAMENTS_INTERNATIONAL;
};
