import { findCountryRecord } from '@/lib/data/countries';
import { SUPPORTED_ESPN_FOOTBALL_LEAGUES, toEspnFootballTournamentId } from '@/lib/services/espnFootball';
import type { Tournament } from '@/lib/types';

const ESPN_INTERNATIONAL_COUNTRY_MAP: Record<string, string> = {
    'Sudamérica': 'south-america',
    'Europa': 'europe',
    'CONCACAF': 'north-central-america',
    'África': 'africa',
    'Asia': 'asia',
    'FIFA': 'international',
};

const ESPN_PRIORITY_OVERRIDES: Record<string, number> = {
    'fifa.world': 100,
    'fifa.cwc': 98,
    'fifa.olympics': 95,
    'fifa.friendly': 60,
    'uefa.champions': 100,
    'uefa.europa': 92,
    'uefa.europa.conf': 88,
    'uefa.nations': 90,
    'uefa.euro': 95,
    'uefa.euro_q': 80,
    'uefa.super_cup': 85,
    'conmebol.libertadores': 100,
    'conmebol.sudamericana': 92,
    'conmebol.recopa': 85,
    'conmebol.america': 95,
    'conmebol.fifa.worldq': 90,
    'concacaf.champions': 90,
    'concacaf.gold': 92,
    'concacaf.nations.league': 85,
    'caf.champions': 88,
    'caf.confederation': 82,
    'caf.nations': 92,
    'afc.champions': 88,
    'afc.asian': 92,
};

let cached: Tournament[] | null = null;

export function buildEspnFootballTournaments(): Tournament[] {
    if (cached) return cached;
    cached = SUPPORTED_ESPN_FOOTBALL_LEAGUES.map((league) => {
        const internationalCountryId = ESPN_INTERNATIONAL_COUNTRY_MAP[league.countryName];
        const priority = ESPN_PRIORITY_OVERRIDES[league.slug] ?? (internationalCountryId ? 70 : 50);
        if (internationalCountryId) {
            return {
                id: toEspnFootballTournamentId(league.slug),
                name: league.name,
                url: league.tournamentUrl,
                type: 'international',
                sportId: 'football',
                countryId: internationalCountryId,
                priority,
                categories: ['men'],
            } as Tournament;
        }
        const country = findCountryRecord(undefined, league.countryName);
        return {
            id: toEspnFootballTournamentId(league.slug),
            name: league.name,
            url: league.tournamentUrl,
            type: 'local',
            sportId: 'football',
            countryId: country?.id || league.countryName.toLowerCase(),
            priority,
            categories: ['men'],
        } as Tournament;
    });
    return cached;
}

export function getEspnFootballInternationalTournaments(): Tournament[] {
    return buildEspnFootballTournaments().filter((t) => t.type === 'international');
}

export function getEspnFootballAllTournaments(): Tournament[] {
    return buildEspnFootballTournaments();
}
