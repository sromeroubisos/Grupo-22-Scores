import type { Tournament } from '@/lib/types';
import {
    ESPN_SOCCER_LEAGUE_PREFIX,
    SUPPORTED_ESPN_FOOTBALL_LEAGUES,
} from '@/lib/services/espnFootball';

// ESPN countryName → app countryId.
// "International" buckets (FIFA / UEFA / CONMEBOL / etc.) use region IDs so the
// sidebar groups them under the correct continent / supranational header.
const COUNTRY_ID_BY_ESPN_NAME: Record<string, string> = {
    // Continental / supranational
    'FIFA': 'international',
    'Sudamérica': 'south-america',
    'Europa': 'europe',
    'CONCACAF': 'north-central-america',
    'África': 'africa',
    'Asia': 'asia',
    // National
    'Argentina': 'argentina',
    'Brasil': 'brazil',
    'Chile': 'chile',
    'Colombia': 'colombia',
    'Uruguay': 'uruguay',
    'Paraguay': 'paraguay',
    'Perú': 'peru',
    'Ecuador': 'ecuador',
    'Venezuela': 'venezuela',
    'Bolivia': 'bolivia',
    'Inglaterra': 'england',
    'España': 'spain',
    'Italia': 'italy',
    'Alemania': 'germany',
    'Francia': 'france',
    'Países Bajos': 'netherlands',
    'Portugal': 'portugal',
    'Turquía': 'turkey',
    'Bélgica': 'belgium',
    'Escocia': 'scotland',
    'Grecia': 'greece',
    'Suiza': 'switzerland',
    'Austria': 'austria',
    'Rusia': 'russia',
    'Ucrania': 'ukraine',
    'USA': 'usa',
    'México': 'mexico',
};

const INTERNATIONAL_COUNTRY_IDS = new Set([
    'international',
    'south-america',
    'europe',
    'north-central-america',
    'africa',
    'asia',
    'oceania',
]);

// Curated priority and type per slug. Anything not listed gets a sensible default.
type LeagueMeta = { priority: number; type: Tournament['type']; categories?: string[]; isWomen?: boolean };
const LEAGUE_META: Record<string, LeagueMeta> = {
    // FIFA / world
    'fifa.world': { priority: 100, type: 'international' },
    'fifa.cwc': { priority: 98, type: 'international' },
    'fifa.olympics': { priority: 99, type: 'international' },
    'fifa.confederations': { priority: 70, type: 'international' },
    'fifa.friendly': { priority: 50, type: 'friendly' },
    // UEFA
    'uefa.champions': { priority: 100, type: 'international' },
    'uefa.europa': { priority: 95, type: 'international' },
    'uefa.europa.conf': { priority: 90, type: 'international' },
    'uefa.nations': { priority: 92, type: 'international' },
    'uefa.super_cup': { priority: 88, type: 'international' },
    'uefa.euro': { priority: 98, type: 'international' },
    'uefa.euro_q': { priority: 80, type: 'international' },
    // CONMEBOL
    'conmebol.libertadores': { priority: 100, type: 'international' },
    'conmebol.sudamericana': { priority: 92, type: 'international' },
    'conmebol.recopa': { priority: 88, type: 'international' },
    'conmebol.america': { priority: 98, type: 'international' },
    'conmebol.fifa.worldq': { priority: 90, type: 'international' },
    // CONCACAF
    'concacaf.gold': { priority: 95, type: 'international' },
    'concacaf.champions': { priority: 92, type: 'international' },
    'concacaf.nations.league': { priority: 88, type: 'international' },
    // CAF
    'caf.nations': { priority: 95, type: 'international' },
    'caf.champions': { priority: 92, type: 'international' },
    'caf.confederation': { priority: 88, type: 'international' },
    // AFC
    'afc.asian': { priority: 95, type: 'international' },
    'afc.champions': { priority: 92, type: 'international' },
    // National leagues — top tier defaults to 100, second tier to 80, cups to 85.
    'arg.1': { priority: 100, type: 'local' },
    'arg.2': { priority: 80, type: 'local' },
    'arg.copa': { priority: 90, type: 'cup' },
    'bra.1': { priority: 100, type: 'local' },
    'bra.2': { priority: 80, type: 'local' },
    'bra.copa_do_brazil': { priority: 90, type: 'cup' },
    'chi.1': { priority: 100, type: 'local' },
    'col.1': { priority: 100, type: 'local' },
    'uru.1': { priority: 100, type: 'local' },
    'par.1': { priority: 100, type: 'local' },
    'per.1': { priority: 100, type: 'local' },
    'ecu.1': { priority: 100, type: 'local' },
    'ven.1': { priority: 100, type: 'local' },
    'bol.1': { priority: 100, type: 'local' },
    'eng.1': { priority: 100, type: 'local' },
    'eng.2': { priority: 85, type: 'local' },
    'eng.3': { priority: 70, type: 'local' },
    'eng.4': { priority: 65, type: 'local' },
    'eng.fa': { priority: 92, type: 'cup' },
    'eng.league_cup': { priority: 88, type: 'cup' },
    'esp.1': { priority: 100, type: 'local' },
    'esp.2': { priority: 80, type: 'local' },
    'esp.copa_del_rey': { priority: 90, type: 'cup' },
    'esp.super_cup': { priority: 80, type: 'cup' },
    'ita.1': { priority: 100, type: 'local' },
    'ita.2': { priority: 80, type: 'local' },
    'ita.coppa_italia': { priority: 90, type: 'cup' },
    'ita.super_cup': { priority: 80, type: 'cup' },
    'ger.1': { priority: 100, type: 'local' },
    'ger.2': { priority: 80, type: 'local' },
    'ger.dfb_pokal': { priority: 90, type: 'cup' },
    'fra.1': { priority: 100, type: 'local' },
    'fra.2': { priority: 80, type: 'local' },
    'fra.coupe_de_france': { priority: 90, type: 'cup' },
    'ned.1': { priority: 100, type: 'local' },
    'ned.2': { priority: 80, type: 'local' },
    'por.1': { priority: 100, type: 'local' },
    'tur.1': { priority: 100, type: 'local' },
    'bel.1': { priority: 100, type: 'local' },
    'sco.1': { priority: 100, type: 'local' },
    'gre.1': { priority: 100, type: 'local' },
    'sui.1': { priority: 100, type: 'local' },
    'aut.1': { priority: 100, type: 'local' },
    'rus.1': { priority: 100, type: 'local' },
    'ukr.1': { priority: 100, type: 'local' },
    'usa.1': { priority: 100, type: 'local' },
    'usa.usl.1': { priority: 75, type: 'local' },
    'mex.1': { priority: 100, type: 'local' },
    'mex.2': { priority: 75, type: 'local' },
};

function buildEspnTournament(league: { slug: string; name: string; tournamentUrl: string; countryName: string }): Tournament | null {
    const countryId = COUNTRY_ID_BY_ESPN_NAME[league.countryName];
    if (!countryId) return null;
    const meta = LEAGUE_META[league.slug] ?? { priority: 50, type: 'local' as const };
    return {
        id: `${ESPN_SOCCER_LEAGUE_PREFIX}${league.slug}`,
        name: league.name,
        url: league.tournamentUrl,
        type: meta.type,
        sportId: 'football',
        countryId,
        priority: meta.priority,
        categories: meta.categories ?? ['men'],
        ...(meta.isWomen ? { isWomen: true } : {}),
    };
}

const ALL_FOOTBALL_TOURNAMENTS: Tournament[] = SUPPORTED_ESPN_FOOTBALL_LEAGUES
    .map((league) => buildEspnTournament(league))
    .filter((t): t is Tournament => t !== null);

export const FOOTBALL_TOURNAMENTS_INTERNATIONAL: Tournament[] = ALL_FOOTBALL_TOURNAMENTS
    .filter((t) => INTERNATIONAL_COUNTRY_IDS.has(t.countryId ?? ''));

export const FOOTBALL_TOURNAMENTS_BY_COUNTRY: Record<string, Tournament[]> = ALL_FOOTBALL_TOURNAMENTS
    .filter((t) => !INTERNATIONAL_COUNTRY_IDS.has(t.countryId ?? ''))
    .reduce<Record<string, Tournament[]>>((acc, tournament) => {
        const countryId = tournament.countryId ?? '';
        if (!countryId) return acc;
        if (!acc[countryId]) acc[countryId] = [];
        acc[countryId].push(tournament);
        return acc;
    }, {});

export const getAllFootballTournaments = (): Tournament[] => ALL_FOOTBALL_TOURNAMENTS;

export const getFootballTournamentsByCountry = (countryId: string): Tournament[] => {
    return FOOTBALL_TOURNAMENTS_BY_COUNTRY[countryId] || [];
};

export const getInternationalFootballTournaments = (): Tournament[] => {
    return FOOTBALL_TOURNAMENTS_INTERNATIONAL;
};
