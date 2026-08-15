/**
 * Cómo conviven la FIH y FlashScore en el feed de hockey.
 *
 * El Mundial sale de la FIH —es la fuente oficial, la que carga la mesa— y el
 * RESTO del hockey (ligas de clubes, torneos continentales) sigue viniendo de
 * FlashScore. Lo único que hay que descartar es la copia del Mundial que
 * FlashScore también publica, porque si no el mismo partido entra dos veces.
 *
 * La distinción importa: descartar el hockey de FlashScore entero deja al feed
 * sin todo lo que no sea el Mundial. Por eso la regla vive acá, sola y probada,
 * en vez de estar escrita como un `if` adentro del proveedor.
 *
 * Módulo puro: entra data, sale data. Los imports de valor van relativos y con
 * extensión porque `node --test` corre sin el resolver de alias de Next.
 */

import type { Match } from '@/types/match';
import { formatDateKey } from '../timezone.ts';
import { FIH_COMPETITIONS, fihTeamKey } from './fihHockeyParser.ts';

// FlashScore marca la rama femenina en el NOMBRE del equipo ("Australia W",
// "Japan W"); la FIH la marca en la competencia.
const WOMEN_SUFFIX_RE = /\s+(?:W|Women|Fem|Femenino)$/i;

function genderOf(match: Match): 'w' | 'm' {
    if (match.tournamentId === FIH_COMPETITIONS.w.tournamentId) return 'w';
    if (match.tournamentId === FIH_COMPETITIONS.m.tournamentId) return 'm';
    if (WOMEN_SUFFIX_RE.test(match.homeTeamName || '') || WOMEN_SUFFIX_RE.test(match.awayTeamName || '')) return 'w';
    return /\bwomen\b|\bfemenino\b/i.test(match.leagueName || '') ? 'w' : 'm';
}

/**
 * Identidad de un partido que no depende del proveedor: día, rama y el par de
 * equipos. Ignora el idioma del nombre y el orden local/visitante —dos
 * proveedores rara vez coinciden en los dos— pero NO la rama: un
 * Argentina-Países Bajos masculino y uno femenino el mismo día son dos partidos
 * distintos.
 */
export function hockeyMatchIdentity(match: Match): string {
    const day = match.scheduledAt ? formatDateKey(match.scheduledAt) : 'sin-fecha';
    const teams = [
        fihTeamKey((match.homeTeamName || '').replace(WOMEN_SUFFIX_RE, '')),
        fihTeamKey((match.awayTeamName || '').replace(WOMEN_SUFFIX_RE, '')),
    ].sort();
    return `${day}|${genderOf(match)}|${teams.join('|')}`;
}

/**
 * Une lo que trae la FIH con lo que trae FlashScore. De FlashScore sólo se cae
 * lo que la FIH ya publica: un partido que la FIH no tiene —una liga de clubes,
 * o un partido del Mundial que todavía no cargó— se conserva.
 */
export function mergeHockeyProviders(worldCup: Match[], flashScore: Match[]): Match[] {
    const fromFih = new Set(worldCup.map(hockeyMatchIdentity));
    return [...worldCup, ...flashScore.filter((match) => !fromFih.has(hockeyMatchIdentity(match)))];
}
