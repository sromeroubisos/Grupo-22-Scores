// EL CAPITÁN — ASCENSO Y DESCENSO.
//
// Si tu club sale primero en segunda, sube; si sale último en primera, baja — y
// vos jugás la temporada que viene en la división nueva, sin haberte movido de
// club.
//
// ── No hay ninguna regla nueva acá: el grafo ya existía ─────────────────────
// `MOVEMENTS` declara desde el primer día quién sube adónde, con cuántas plazas
// y si es directo o por promoción. Estaba escrito, versionado y testeado en su
// forma… y El Capitán no lo leía. Este módulo es el consumidor que faltaba.
//
// Se mueven las ESCALERAS VERTICALES declaradas —Top 14 ↔ Pro D2 ↔ Nationale,
// Premiership ↔ Championship, las españolas, las japonesas, la italiana— y,
// desde el sistema argentino de dos ramas, las divisiones de la URBA y la
// primera y segunda de cada región del interior. Lo que NUNCA se cruza es de
// rama: `MOVEMENTS` no conecta la URBA con el interior ni una región con otra.
//
// Las competiciones PARALELAS no ascienden a nada. El NPC, el Super Rugby, la
// URC y la SRA no son "primera y segunda" de nada, y el TDI tampoco: sus plazas
// pertenecen a la REGIÓN y no al club, así que un campeón del A puede terminar
// jugando el B.
//
// ── EL CLUB QUE SE MUEVE SIGUE SIENDO EL MISMO CLUB ────────────────────────
// Conserva `rating`, prestigio y plantel. Lo único que cambia es en qué torneo
// juega — y de ahí salen SOLAS las consecuencias que importan, porque todas se
// derivan de la competición:
//
//   la banda deportiva  → el premio al XV ideal deja de estar fuera de alcance
//   el nivel del club   → `growth.ts` te entrena mejor, y el sueldo sube
//   el campeonato       → peleás otra copa, contra otra gente
//
// Que el ascendido pelee abajo en su división nueva no hay que escribirlo:
// ya está en la resta `media − rating del club` que reparte los minutos.
//
// ── POR QUÉ EL MOVIMIENTO VIVE EN EL ESTADO Y NO EN EL CATÁLOGO ────────────
// El catálogo es un dato congelado y versionado que comparten todas las partidas
// cargadas en la misma pestaña. Un club que ascendió en tu carrera no ascendió
// en la mía. Por eso `CaptainState.divisions` guarda `clubId → competición` y el
// club se resuelve al leerlo, nunca mutando `CLUBS`.

import type { ClubDef } from '../data/catalogs.ts';
import type { DivisionMap } from './clubs.ts';
import { MOVEMENTS, PARALLEL_COMPETITIONS, arDivisionOf, getClub } from '../data/catalogs.ts';
import { MIN_LEAGUE_FIELD } from './clubs.ts';

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
 * `slots` es cuántos suben o bajan, y sale del dato: en Francia bajan dos del
 * Top 14 y sube uno de Nationale, así que no hay un "último" universal.
 *
 * La promoción por playoff se lee igual que la directa: las plazas son las
 * plazas, y el que las ocupa es el que terminó arriba. Modelar el playoff aparte
 * sería inventar un torneo que este juego no simula, para llegar a la misma
 * lista de ascendidos.
 */
export function divisionMoveFor(competitionId: string, position: number, teams: number): DivisionMove | null {
    // Un "torneo" de un solo club no corona ni desciende a nadie: es el mismo
    // corte que usa el título de liga, y sale del mismo lugar.
    if (teams < MIN_LEAGUE_FIELD || position <= 0) return null;
    if (PARALLEL_COMPETITIONS.has(competitionId)) return null;

    // El ascenso primero: salir primero es la noticia, y con dos equipos en la
    // tabla el primero no puede ser además el último.
    const arriba = MOVEMENTS.find((m) => m.from === competitionId && m.direction === 'promotion');
    if (arriba && position <= arriba.slots) {
        return { direction: 'promotion', from: competitionId, to: arriba.to };
    }

    const abajo = MOVEMENTS.find((m) => m.from === competitionId && m.direction === 'relegation');
    if (abajo && position > teams - abajo.slots) {
        return { direction: 'relegation', from: competitionId, to: abajo.to };
    }

    return null;
}

/**
 * EL CLUB COMO LO VIVE ESTA CARRERA: el del catálogo, con la división que le
 * dejó su último movimiento.
 *
 * Si el destino es una división argentina viajan también el NOMBRE y el nivel:
 * son campos del club, y un ascendido que sigue diciendo "Primera B de la URBA"
 * miente en la cabecera. Para el resto del catálogo esos campos no están
 * poblados y no hay nada que sincronizar.
 *
 * `divisions` se lee con `?.` a propósito: un estado viejo puede no tenerlo, y
 * tiene que llegar entero hasta el chequeo de versión que lo declare
 * desactualizado en vez de reventar antes.
 */
export function resolveClub(divisions: DivisionMap | undefined, clubId: string): ClubDef {
    const club = getClub(clubId);
    const division = divisions?.[clubId];
    if (division === undefined || division === club.competitionId) return club;

    const destino = arDivisionOf(division);
    if (destino) {
        return {
            ...club,
            competitionId: division,
            divisionName: destino.label,
            divisionTier: destino.canonLevel,
        };
    }
    return { ...club, competitionId: division };
}

/**
 * La competición que tu club disputa ESTA temporada. Es lo mismo que
 * `resolveClub(...).competitionId`, escrito corto para los llamadores que solo
 * quieren eso y no el club entero.
 */
export function competitionOf(divisions: DivisionMap | undefined, clubId: string | null): string | null {
    if (!clubId) return null;
    return resolveClub(divisions, clubId).competitionId;
}

/**
 * Registra el movimiento, si la posición final lo produce. Devuelve el
 * movimiento para que la temporada lo pueda contar.
 *
 * Se llama con la temporada YA jugada: el ascenso se gana en la última fecha y
 * se cobra en la pretemporada siguiente. La fila del historial conserva la
 * competición en la que se jugó, que es la verdad de esa temporada.
 */
export function applyDivisionMove(
    divisions: Record<string, string>,
    clubId: string,
    competitionId: string,
    position: number,
    teams: number,
): DivisionMove | null {
    const move = divisionMoveFor(competitionId, position, teams);
    if (move === null) return null;
    divisions[clubId] = move.to;
    return move;
}
