/**
 * Cómo conviven ESPN y FlashScore en el feed de fútbol americano.
 *
 * ESPN es la fuente de las ligas norteamericanas que sigue publicando (NFL,
 * NCAA, UFL): trae más y mejores datos —tabla por división, boxscore, drives,
 * jugadas de anotación— y no cuesta cuota. FlashScore aporta lo que ESPN no
 * tiene: la CFL (muerta en ESPN desde 2022), las ligas europeas (ELF, Alemania,
 * Austria), México, Japón. Lo único que hay que descartar es la copia de
 * FlashScore de una liga que ESPN ya cubre, porque si no el mismo partido entra
 * dos veces.
 *
 * La decisión es por URL de la liga (`/american-football/usa/nfl/`), la misma
 * convención que usan los dos proveedores; el nombre solo decide cuando no hay
 * URL. Si ESPN deja de publicar una liga, se apaga en `LEAGUES` y FlashScore la
 * cubre sola sin tocar esto.
 *
 * Módulo puro: entra data, sale data. Los imports de valor van relativos y con
 * extensión porque `node --test` corre sin el resolver de alias de Next.
 */

import type { Match } from '../../types/match.ts';
import { inferEspnAmericanFootballLeague } from './espnAmericanFootballParser.ts';

/** ¿Esta liga de FlashScore ya la sirve ESPN? Solo cuenta si ESPN la tiene ACTIVA. */
export function isAmericanFootballLeagueCoveredByEspn(match: Pick<Match, 'leagueUrl' | 'leagueName'>): boolean {
    return inferEspnAmericanFootballLeague({
        tournamentUrl: match.leagueUrl || undefined,
        name: match.leagueUrl ? undefined : match.leagueName,
    }) !== null;
}

/**
 * ESPN entero más lo de FlashScore que ESPN no cubre. El orden se conserva:
 * ESPN primero, después FlashScore tal como llegó.
 */
export function mergeAmericanFootballProviders(espn: Match[], flashScore: Match[]): Match[] {
    const rest = flashScore.filter((match) => !isAmericanFootballLeagueCoveredByEspn(match));
    return [...espn, ...rest];
}
