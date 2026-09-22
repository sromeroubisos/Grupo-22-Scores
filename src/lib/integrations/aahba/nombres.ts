/**
 * Identidad de la AAHBA dentro del proyecto.
 *
 * El tracker numera todo, así que la identidad es exacta y no hay que
 * reconstruirla por nombre + día como en Córdoba:
 *
 *   torneo   `/torneos/{id}`   → `tournaments.external_id = aahba:2026:00000401`
 *   partido  `partido.id`      → `matches.external_id = aahba:m00204173`
 *
 * El id del partido es único en todo el tracker, no solo dentro del torneo.
 * Eso significa que una reprogramación es un UPDATE de `date_time` y nunca un
 * duplicado, y que la ida y la vuelta del mismo par jamás se confunden.
 *
 * ## El id de CLUB de la fuente no sirve, y esto está medido
 *
 * En Caballeros A, el id `00000009` aparece con DOS nombres distintos:
 * "CIUDAD" y "CIUDAD B", 26 partidos cada uno. Son dos equipos distintos que
 * juegan el mismo torneo y la asociación les dio el mismo número de club. Si
 * el conector resolviera por id, les daría todos los partidos a la misma
 * ficha y la tabla tendría 13 equipos en vez de 14. Por eso el alias se
 * resuelve por NOMBRE —que sí los distingue— y el id de la fuente no se usa
 * para nada. Es el mismo golpe que ya nos había dado URBA con su club_id 14.
 *
 * ## Por qué el alcance del alias es el TORNEO
 *
 * En la AAMH alcanzó con el género, porque allá una ficha por rama cubre todo.
 * Acá no: nuestras fichas son por equipo, no por club —`ciudad-caballeros` y
 * `ciudad-b-caballeros` conviven, y `olivos-r-c-damas-a` lleva la división en
 * el nombre—. Un alias por género le daría los partidos de Damas B a la ficha
 * de Damas A el día que entre Damas B, que es exactamente el tipo de error que
 * nadie mira porque la tabla "anda". El alcance es el torneo de la fuente: son
 * catorce filas por torneo y agregar uno nuevo es un INSERT, no un deploy.
 */

export { claveDeNombre, claveDePar } from '../fedhockeycba/nombres.ts';
import { claveDeNombre } from '../fedhockeycba/nombres.ts';

export const AAHBA_PROVIDER = 'aahba';
export const AAHBA_ID_PREFIX = 'aahba:';

export interface ClaveDeTorneo {
  anio: number;
  /** El id del torneo en el tracker, con sus ceros: `00000401`. */
  torneoId: string;
}

/** `tournaments.external_id`: `aahba:2026:00000401`. */
export function buildTournamentExternalId({ anio, torneoId }: ClaveDeTorneo): string {
  return `${AAHBA_ID_PREFIX}${anio}:${torneoId}`;
}

/** La vuelta. `null` si no es un torneo de la AAHBA. */
export function parseTournamentExternalId(externalId: string | null): ClaveDeTorneo | null {
  const m = /^aahba:(\d{4}):(\d+)$/.exec(externalId ?? '');
  if (!m) return null;
  return { anio: Number(m[1]), torneoId: m[2] };
}

/**
 * `matches.external_id`. Lleva SOLO el id del partido: es único en todo el
 * tracker, así que un partido que la AAHBA mueva de torneo se sigue
 * reconociendo.
 */
export function buildMatchExternalId(partidoId: string): string {
  return `${AAHBA_ID_PREFIX}m${partidoId}`;
}

/**
 * El alias de un equipo en `club_external_ids.external_id`:
 * `{torneoId}|{clave del nombre}`. Ver arriba por qué el alcance es el torneo
 * y por qué la clave es el nombre y no el id de club de la fuente.
 */
export function buildTeamAlias(torneoId: string, nombreEquipo: string): string {
  return `${torneoId}|${claveDeNombre(nombreEquipo)}`;
}
