/**
 * Identidad de torneos y equipos de la Confederación Argentina de Hockey.
 *
 * La comparten el importador (`src/scripts/hockey-importar-2026.ts`) y el cron
 * (`/api/cron/cahockey-sync`): si los dos derivaran el id de un club por su
 * cuenta, alcanzaría con que uno cambie una letra para que el cron cree un
 * segundo "Federación Cordobesa" al lado del que ya tiene partidos.
 *
 * - Torneo: `cahockey:<id numérico del sitio>` en `tournaments.external_id`.
 * - Partido: `cahockey:<torneo>:<nro>` — el número de partido que SICAH imprime
 *   en el encabezado del modal ("Partido 13"). Es estable dentro del torneo y
 *   sobrevive a que un cruce por definir ("1° Zona A") se convierta en un
 *   equipo real: el partido sigue siendo el 13.
 * - Club: nombre + ámbito + deporte, ver `idDeClub`.
 */

import { claveDeNombre } from '../fedhockeycba/nombres.ts';

export const CAHOCKEY_PROVIDER = 'cahockey';
export const CAHOCKEY_ID_PREFIX = 'cahockey:';

/** El ámbito con el que entran a `clubs` los equipos que juegan torneos de la CAH. */
export const AMBITO_CAH = 'cah';

export { claveDeNombre };

/**
 * El id lleva el ÁMBITO de la federación, y no es cosmético.
 *
 * Medido sobre la cosecha de 2026: "Universitario Blanco" y "Universitario
 * Azul" de Tucumán caen exactos sobre los homónimos de Córdoba que ya están en
 * la base, y "Jockey D" sobre el de Rosario. Matchear por nombre suelto entre
 * federaciones distintas le atribuye los partidos de una provincia a un club de
 * otra —el mismo error que en URBA metió a San Andrés bajo el id de San
 * Albano— y una vez escrito no hay forma barata de separarlos.
 *
 * Por eso: nombre + ámbito + deporte. La fusión con un club ya cargado se hace
 * después, con evidencia, por `club_external_ids`; nunca por homonimia.
 */
export function idDeClub(nombre: string, ambito: string): string {
  const base = claveDeNombre(nombre).replace(/ /g, '-');
  // "Atlético Tucumán" ya dice de dónde es: no hace falta `-tucuman-tucuman-`
  const conAmbito = base.includes(ambito) ? base : `${base}-${ambito}`;
  return `${conAmbito}-hockey`;
}

/**
 * Un partido sin jugar trae un guión donde va el marcador y el nombre llega
 * como "Federación Cordobesa -". La fuente se corrigió, pero nadie puede
 * confiar en que venga limpia: se normaliza igual.
 */
export function nombreLimpio(nombre: string): string {
  return String(nombre ?? '').replace(/\s*[-–—]\s*$/, '').trim();
}

/**
 * Lo que la fuente escribe en el lugar de un equipo pero NO es un equipo.
 *
 * Son dos casos. ATA pone "SIN CLUB" cuando una zona tiene un lugar vacante. Y
 * el Argentino de Selecciones publica la llave completa antes de jugarse, con
 * los cruces por definir escritos como "1° Zona A", "Ganador N°13" o "Perdedor
 * N°16". Darlos de alta llenaría el catálogo de clubes fantasma y les
 * inventaría partidos; el proyecto ya trata esos cruces como placeholders.
 */
const NO_SON_CLUBES = new Set(['sin club', 'libre', 'a designar', 'sin equipo']);
const PLACEHOLDER_DE_LLAVE = /^(\d+\s*°?\s*(zona|puesto)|ganador|perdedor|ganadora|perdedora)\b/;
export function esClubReal(nombre: string): boolean {
  const limpio = nombreLimpio(nombre);
  if (!limpio) return false;
  const clave = claveDeNombre(limpio);
  return !NO_SON_CLUBES.has(clave) && !PLACEHOLDER_DE_LLAVE.test(clave);
}

/** `external_id` de un partido de la CAH: el torneo y el número de partido de SICAH. */
export function buildMatchExternalId(torneoExternalId: string, nro: string): string {
  return `${torneoExternalId}:${nro}`;
}

/** El alias de un equipo dentro de un torneo, como lo guarda el importador en `club_external_ids`. */
export function buildTeamAlias(torneoExternalId: string, nombreEquipo: string): string {
  return `${torneoExternalId}|${claveDeNombre(nombreEquipo)}`;
}
