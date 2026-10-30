// Consultas livianas sobre un mundo, o sobre una vista recortada de él.
//
// Son las que la pantalla necesita para dibujar (el club por id, el plantel, los partidos del
// club, la fuerza del XV). No simulan nada ni traen la partida: dependen de los tipos y de dos
// funciones chicas de `teamRating`. Viven aparte de `game.ts` para que la interfaz las use sin
// arrastrar el motor entero y los catálogos al hilo principal: el motor corre en un Web Worker.
import type { Club, Competition, ID, Match, Player, Tactics, World } from '../types/index.ts';
import { computePlayerOverall, pickStartingXV } from '../engine/teamRating.ts';
import { playersOfClub } from '../engine/indexes.ts';
import type { LeagueChoice } from './game.ts';

const COUNTRY_ORDER = ['Argentina', 'Uruguay', 'Chile'];

/** Países con liga elegible: Argentina primero, después sus vecinos, el resto por orden alfabético. */
export function countriesOf(choices: LeagueChoice[]): string[] {
    const names = [...new Set(choices.map((c) => c.countryName))];
    const rank = (n: string) => (COUNTRY_ORDER.includes(n) ? COUNTRY_ORDER.indexOf(n) : n === 'Internacional' ? 999 : 100);
    return names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'es'));
}

export function clubOf(world: World, clubId: ID): Club | undefined {
    return world.clubs.find((c) => c.id === clubId);
}

/** La liga doméstica del club (la primera competición de formato liga). */
export function leagueOf(world: World, clubId: ID): Competition | undefined {
    return world.competitions.find((c) => c.format === 'league' && c.clubIds.includes(clubId));
}

export function squadOf(world: World, clubId: ID): Player[] {
    return playersOfClub(world.players, clubId)
        .sort((a, b) => a.primaryPosition - b.primaryPosition || b.currentAbility - a.currentAbility);
}

export function overallOf(player: Player): number {
    return computePlayerOverall(player);
}

/** Los partidos del club en la temporada en curso, en orden de fecha. */
export function fixturesOf(world: World, clubId: ID): Match[] {
    return world.matches
        .filter((m) => m.seasonYear === world.seasonYear && (m.homeClubId === clubId || m.awayClubId === clubId))
        .sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round);
}

export function tacticsOf(world: World, clubId: ID): Tactics | undefined {
    return world.tactics[clubId];
}

/** Promedio de valoración del XV que pondría el club hoy. */
export function clubStrength(world: World, clubId: ID): number {
    const xv = pickStartingXV(squadOf(world, clubId));
    if (xv.length === 0) return 0;
    return Math.round(xv.reduce((sum, p) => sum + computePlayerOverall(p), 0) / xv.length);
}
