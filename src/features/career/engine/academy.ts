// ⚠ ESCRITO Y SIN CABLEAR (ver el informe de la sesión).
//
// La academia se implementó entera y se REVIRTIÓ el cableado: arrancar a los 16
// agrega dos temporadas de crecimiento y el jugador toca su techo dos años
// antes, con lo que se rompen tres invariantes medidos del motor —el 8% de las
// carreras se pasaba del techo y la meseta mediana saltaba de 3 a 5 temporadas—.
// Landearla exige recalibrar la curva de progresión (docs §11), no un retoque.
//
// Este archivo queda como punto de partida de esa pasada. No lo importa nadie.

import type { Player } from '../types/player.ts';

/**
 * LA ACADEMIA: los dos años que faltaban.
 *
 * Hasta 1.15.0 la carrera empezaba cuando caía —18, 19 o 20 según el origen y la
 * ruta— y eso hacía que dos partidas no se pudieran comparar: una corría del 19
 * al 34 y otra del 18 al 39, y la diferencia no era una decisión de nadie.
 *
 * Ahora TODAS las carreras arrancan a los 16 en la academia del club que te
 * formó y debutan en primera a los 18. Esos dos años se juegan, no son un
 * prólogo salteable, pero son de otra naturaleza:
 *
 *   · siempre amateur, sin excepción, sin importar el país ni la ruta elegida;
 *   · sin mercado de pases ni contratos;
 *   · sin selección mayor;
 *   · con su propio pool de eventos (`aca-`) y con pocos partidos.
 *
 * El OVR sí crece —con el perfil de desarrollo de siempre— porque justamente
 * esos son los años en que más crece.
 *
 * A los 18 aparece la primera decisión grande de la carrera: qué club de primera
 * te lleva. Ahí se aplica la ruta elegida al crear el jugador, y recién ahí.
 */
export const ACADEMY_START_AGE = 16;
export const SENIOR_DEBUT_AGE = 18;

/** Bandera que marca que el jugador ya debutó en primera. Vive en `player.flags`. */
export const DEBUT_FLAG = 'debuto_en_primera';

/** ¿El jugador está en los años de academia? */
export function inAcademy(player: Player): boolean {
    return player.age < SENIOR_DEBUT_AGE && !hasDebuted(player);
}

export function hasDebuted(player: Player): boolean {
    return (player.flags[DEBUT_FLAG] ?? 0) > 0;
}

/**
 * ¿Toca la decisión de debut? Es una sola vez en la carrera, en la temporada en
 * la que el jugador cumple 18. Se mira la bandera y no la edad sola: si una
 * lesión o un evento raro corriera un año, el debut no puede perderse.
 */
export function debutIsDue(player: Player): boolean {
    return player.age >= SENIOR_DEBUT_AGE && !hasDebuted(player);
}

/**
 * Partidos de una temporada de academia, como fracción de los de un senior.
 * Se juega, pero poco: son partidos de juveniles, no de primera.
 */
export const ACADEMY_MATCH_FACTOR = 0.45;

// Había acá un `ROUTE_AT_DEBUT` que fijaba vínculo y plantel según la ruta
// elegida, para aplicarlo a los 18 en vez de a los 16. Se fue con la unificación
// de 1.26.0: el debut es amateur/senior para las dos ramas, así que la tabla
// tendría dos filas idénticas. Lo que la rama fija es la banda de OVR, y eso ya
// vive en `BRANCH_OVR_AT_18` (engine/create-player.ts).
//
// Cuando esta pasada se retome, el punto de partida cambió a favor: los 18 de
// `SENIOR_DEBUT_AGE` ya son la edad de debut REAL del motor (antes eran 18, 19 o
// 20 según origen y ruta), así que la academia es exactamente "dos temporadas por
// debajo del arranque actual" y el criterio de aceptación se puede escribir
// derecho: que el reparto de OVR a los 18 con academia sea el mismo que el
// reparto de `BRANCH_OVR_AT_18` de hoy.
