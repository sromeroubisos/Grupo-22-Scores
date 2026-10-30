/**
 * Identidad de la AAMH (Asociación Amateur Marplatense de Hockey).
 *
 * La diferencia de fondo con fedhockeycba y con la AHL: esas dos webs no
 * tienen IDs de nada y hay que identificar todo por el nombre con el que la
 * federación lo escribe. La AAMH SÍ los tiene, y son parte de la URL:
 *
 *   /resultados/torneo/{tid}/{cid}   tid = certamen, cid = categoría
 *   /resultados/partido/{mid}        mid = partido
 *
 * Eso cambia dos cosas para bien:
 *
 * 1. Un partido se identifica por SU id (`aamh:m140390`), no por el par de
 *    clubes y el día. No hay ida y vuelta ambigua ni reprogramación que
 *    rompa la identidad: si la AAMH mueve el partido de fecha, sigue siendo
 *    el mismo `mid` y el conector lo ACTUALIZA en vez de crear otro.
 * 2. El par tid/cid es la identidad del torneo. Ojo con el detalle: el mismo
 *    certamen se juega en varias divisiones con el MISMO tid y distinto cid
 *    (108/12 es "Preparación A" de Primera y 108/4 la de Sub 14). Ninguno de
 *    los dos números alcanza solo: la clave es el par.
 *
 * El alcance de los alias de club es el GÉNERO, no el torneo. La AAMH escribe
 * "MAR DEL PLATA CLUB" igual en los 38 certámenes, así que el slug del torneo
 * —como usa Córdoba— sería alcance de más: habría que repetir 38 veces la
 * misma fila. Pero la asociación entera es alcance de MENOS, y esto está
 * medido contra la base: las fichas marplatenses ya cargadas son por rama
 * (`mar-del-plata-club-damas`, `sporting-hockey-damas`, `idra-damas`). Un
 * alias sin género le daría los partidos de Caballeros a la ficha de Damas.
 *
 * Por eso el alias es `{genero}|{clave}`: dos filas por club que juega las dos
 * ramas, una sola para el que juega una. Y agregar una es una fila, nunca un
 * deploy.
 */

export { claveDeNombre, claveDePar } from '../fedhockeycba/nombres.ts';
import { claveDeNombre } from '../fedhockeycba/nombres.ts';

export const AAMH_PROVIDER = 'aamh';
export const AAMH_ID_PREFIX = 'aamh:';

/** El año más viejo que ofrece el selector del sitio. */
export const AAMH_PRIMER_ANIO = 2016;

export interface ClaveDeTorneo {
  anio: number;
  tid: number;
  cid: number;
}

/** `tournaments.external_id` de un torneo de la AAMH: `aamh:2026:108-12`. */
export function buildTournamentExternalId({ anio, tid, cid }: ClaveDeTorneo): string {
  return `${AAMH_ID_PREFIX}${anio}:${tid}-${cid}`;
}

/** La vuelta: de `aamh:2026:108-12` a {anio, tid, cid}. `null` si no es de la AAMH. */
export function parseTournamentExternalId(externalId: string | null): ClaveDeTorneo | null {
  const m = /^aamh:(\d{4}):(\d+)-(\d+)$/.exec(externalId ?? '');
  if (!m) return null;
  return { anio: Number(m[1]), tid: Number(m[2]), cid: Number(m[3]) };
}

/**
 * `matches.external_id`. Lleva SOLO el id del partido: es único en todo el
 * sitio y no depende del torneo, así que un partido que la AAMH mueva de
 * certamen se sigue reconociendo.
 */
export function buildMatchExternalId(mid: number): string {
  return `${AAMH_ID_PREFIX}m${mid}`;
}

/**
 * El alias de un club en `club_external_ids.external_id`: `{genero}|{clave}`.
 * El género sale del torneo (`damas` / `caballeros`), no del nombre del equipo.
 */
export function buildTeamAlias(genero: string, nombreEquipo: string): string {
  return `${claveDeNombre(genero)}|${claveDeNombre(nombreEquipo)}`;
}
