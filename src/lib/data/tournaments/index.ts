// Re-export all tournament data
export * from './rugby';
export * from './hockey';
export * from './basketball';
export * from './american-football';
export * from './volleyball';
export * from './football';
export * from './tennis';

import type { Tournament, SportId } from '@/lib/types';
import { getAllRugbyTournaments, getRugbyTournamentsByCountry, getInternationalRugbyTournaments } from './rugby';
import { getAllHockeyTournaments, getHockeyTournamentsByCountry, getInternationalHockeyTournaments } from './hockey';
import { getAllBasketballTournaments, getBasketballTournamentsByCountry, getInternationalBasketballTournaments } from './basketball';
import { getAllAmericanFootballTournaments, getAmericanFootballTournamentsByCountry, getInternationalAmericanFootballTournaments } from './american-football';
import { getAllVolleyballTournaments, getVolleyballTournamentsByCountry, getInternationalVolleyballTournaments } from './volleyball';
import { getAllFootballTournaments, getFootballTournamentsByCountry, getInternationalFootballTournaments } from './football';
import { getAllTennisTournaments, getTennisTournamentsByCountry, getInternationalTennisTournaments } from './tennis';

// ===== UNIFIED TOURNAMENT ACCESS =====

export const getTournamentsBySport = (sportId: SportId): Tournament[] => {
    switch (sportId) {
        case 'rugby': return getAllRugbyTournaments();
        case 'hockey': return getAllHockeyTournaments();
        case 'field-hockey': return getAllHockeyTournaments();
        case 'basketball': return getAllBasketballTournaments();
        case 'american-football': return getAllAmericanFootballTournaments();
        case 'volleyball': return getAllVolleyballTournaments();
        case 'football': return getAllFootballTournaments();
        case 'tennis': return getAllTennisTournaments();
        default: return [];
    }
};

export const getTournamentsBySportAndCountry = (sportId: SportId, countryId: string): Tournament[] => {
    switch (sportId) {
        case 'rugby': return getRugbyTournamentsByCountry(countryId);
        case 'hockey': return getHockeyTournamentsByCountry(countryId);
        case 'field-hockey': return getHockeyTournamentsByCountry(countryId);
        case 'basketball': return getBasketballTournamentsByCountry(countryId);
        case 'american-football': return getAmericanFootballTournamentsByCountry(countryId);
        case 'volleyball': return getVolleyballTournamentsByCountry(countryId);
        case 'football': return getFootballTournamentsByCountry(countryId);
        case 'tennis': return getTennisTournamentsByCountry(countryId);
        default: return [];
    }
};

export const getInternationalTournamentsBySport = (sportId: SportId): Tournament[] => {
    switch (sportId) {
        case 'rugby': return getInternationalRugbyTournaments();
        case 'hockey': return getInternationalHockeyTournaments();
        case 'field-hockey': return getInternationalHockeyTournaments();
        case 'basketball': return getInternationalBasketballTournaments();
        case 'american-football': return getInternationalAmericanFootballTournaments();
        case 'volleyball': return getInternationalVolleyballTournaments();
        case 'football': return getInternationalFootballTournaments();
        case 'tennis': return getInternationalTennisTournaments();
        default: return [];
    }
};

export const getAllTournaments = (): Tournament[] => {
    return [
        ...getAllRugbyTournaments(),
        ...getAllHockeyTournaments(),
        ...getAllBasketballTournaments(),
        ...getAllAmericanFootballTournaments(),
        ...getAllVolleyballTournaments(),
        ...getAllFootballTournaments(),
        ...getAllTennisTournaments(),
    ];
};

export const getTournamentById = (id: string): Tournament | undefined => {
    return getAllTournaments().find(t => t.id === id);
};

export const getCountriesWithTournaments = (sportId: SportId): string[] => {
    const tournaments = getTournamentsBySport(sportId);
    const countries = new Set(tournaments.map(t => t.countryId));
    return Array.from(countries).sort();
};

export const getTournamentCountBySport = (): Partial<Record<SportId, number>> => {
    return {
        'rugby': getAllRugbyTournaments().length,
        'hockey': getAllHockeyTournaments().length,
        'field-hockey': getAllHockeyTournaments().length,
        'basketball': getAllBasketballTournaments().length,
        'american-football': getAllAmericanFootballTournaments().length,
        'volleyball': getAllVolleyballTournaments().length,
        'football': getAllFootballTournaments().length,
        'tennis': getAllTennisTournaments().length,
    };
};

