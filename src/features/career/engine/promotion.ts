import type { CareerState } from '../types/career.ts';
import type { LeagueStanding } from '../types/season.ts';
import type { ClubDef } from '../data/clubs.ts';
import { getClub } from '../data/clubs.ts';
import { MOVEMENTS, PARALLEL_COMPETITIONS } from '../data/clubs2026/competitions2026.ts';
import { arDivisionOf } from '../data/clubs2026/arSystem2026.ts';
import { MIN_LEAGUE_FIELD } from './competition-results.ts';

/**
 * ASCENSO Y DESCENSO. Si tu club sale primero en segunda, sube; si sale último en
 * primera, baja — y vos jugás la temporada que viene en la división nueva.
 *
 * EL GRAFO YA EXISTÍA COMO DATO y no lo aplicaba nadie: `MOVEMENTS`
 * (competitions2026.ts) declara desde el primer día quién sube a dónde, con
 * cuántas plazas y si es directo o por promoción. Estaba escrito, testeado en su
 * forma… y ninguna línea del motor lo leía. Este módulo es el consumidor que
 * faltaba, y por eso no hay ninguna regla nueva acá: sólo la lectura del grafo.
 *
 * Sólo se mueven las ESCALERAS VERTICALES declaradas (Top 14 ↔ Pro D2 ↔
 * Nationale, Premiership ↔ Championship, las españolas, las japonesas) y, desde
 * el sistema argentino de dos ramas, las SIETE divisiones de la URBA y la primera
 * y segunda de cada región del interior. Las competiciones PARALELAS no ascienden
 * a nada: el NPC, el Super Rugby, la URC y la SRA no son "primera y segunda" de
 * nada, y tampoco lo son el TDI A y el TDI B —sus plazas pertenecen a la REGIÓN,
 * no al club, así que un campeón del A puede terminar jugando el B.
 *
 * OJO CON LO QUE CAMBIÓ ACÁ: hasta el sistema de dos ramas, terminar primero en la
 * URBA no subía a nadie, porque todo el rugby argentino era una competición
 * paraguas (`sa-ar`) y no había divisiones entre las que moverse. Ahora sí las
 * hay, y el ascenso funciona igual que en Francia. Lo que sigue prohibido es
 * cruzar de RAMA: `MOVEMENTS` nunca conecta la URBA con el interior ni una región
 * con otra (ver `data/clubs2026/arSystem2026.ts`).
 *
 * EL CLUB QUE SE MUEVE SIGUE SIENDO EL MISMO CLUB: conserva su `rating`, su
 * prestigio y su plantel. Lo único que cambia es en qué torneo juega, y de ahí
 * salen solas las consecuencias que importan —banda deportiva, modelo económico,
 * copas a las que entra, techo de contrato—, porque todas se derivan de la
 * competición. Un ascendido pelea abajo en su división nueva: eso no hay que
 * escribirlo, ya está en la resta `valor − rating del club`.
 */

export interface DivisionMove {
    direction: 'promotion' | 'relegation';
    /** Competición que deja. */
    from: string;
    /** Competición a la que pasa. */
    to: string;
}

/**
 * ¿Esa posición final mueve al club de división?
 *
 * `slots` es cuántos suben o bajan, y sale del dato: en Francia bajan dos del Top
 * 14 y sube uno de Nationale, así que no hay un "último" universal. La promoción
 * por playoff se lee igual que la directa —las plazas son las plazas— y el que
 * las ocupa es el que terminó arriba.
 */
export function divisionMoveFor(competitionId: string, position: number, teams: number): DivisionMove | null {
    // Un "torneo" de un solo club no corona ni desciende a nadie: es el mismo
    // corte que usa el título de liga.
    if (teams < MIN_LEAGUE_FIELD) return null;
    if (PARALLEL_COMPETITIONS.has(competitionId)) return null;

    // El ascenso primero: salir primero es la noticia, y con dos equipos en la
    // tabla el primero no puede ser además el último.
    const up = MOVEMENTS.find((m) => m.from === competitionId && m.direction === 'promotion');
    if (up && position <= up.slots) {
        return { direction: 'promotion', from: competitionId, to: up.to };
    }

    const down = MOVEMENTS.find((m) => m.from === competitionId && m.direction === 'relegation');
    if (down && position > teams - down.slots) {
        return { direction: 'relegation', from: competitionId, to: down.to };
    }

    return null;
}

/**
 * El club COMO LO VIVE ESTA CARRERA: el del catálogo, con la división que le dejó
 * su último ascenso o descenso.
 *
 * El catálogo es un dato congelado y versionado (`CLUB_CATALOG_VERSION`) y no
 * puede mutarse: dos partidas comparten el mismo módulo en memoria, y un club que
 * ascendió en una carrera no ascendió en la otra. Por eso el movimiento vive en
 * `CareerState.divisions` —clubId → competición— y se resuelve al leer.
 *
 * `divisions` puede no existir en un estado viejo: se lee con `?.` a propósito
 * para que un guardado anterior no reviente antes de que la persistencia lo
 * declare desactualizado.
 */
export function resolveClub(state: CareerState, clubId: string): ClubDef {
    const club = getClub(clubId);
    const division = state.divisions?.[clubId];
    if (division === undefined || division === club.competitionId) return club;

    // Si el destino es una división argentina, viajan también el NOMBRE y el
    // nivel: son campos del club, y un ascendido que sigue diciendo "Primera B de
    // la URBA" miente en la cabecera. Para el resto del catálogo estos campos no
    // están poblados y no hay nada que sincronizar.
    const target = arDivisionOf(division);
    if (target) {
        return { ...club, competitionId: division, divisionName: target.label, divisionTier: target.canonLevel };
    }
    return { ...club, competitionId: division };
}

/**
 * Registra el movimiento de división del club, si la posición final lo produce.
 * Devuelve el movimiento para que la temporada lo pueda contar.
 *
 * Se llama con la temporada YA jugada: el ascenso se gana en la última fecha y se
 * cobra en la pretemporada siguiente. La entrada histórica de esta temporada
 * conserva la competición en la que se jugó, que es la verdad de esa temporada.
 */
export function applyDivisionMove(state: CareerState, club: ClubDef, standing: LeagueStanding): DivisionMove | null {
    const move = divisionMoveFor(club.competitionId, standing.position, standing.teams);
    if (move === null) return null;
    state.divisions[club.id] = move.to;
    return move;
}
