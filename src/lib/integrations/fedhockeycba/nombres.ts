/**
 * Identidad de equipos y torneos de la Federación Cordobesa de Hockey.
 *
 * La web (fedhockeycba.com.ar, un WordPress) no tiene IDs de nada: la única
 * identidad estable es el NOMBRE con el que la federación escribe cada cosa.
 * De ahí salen dos claves:
 *
 * - Torneo: la clave del encabezado del fixture ("TORNEO OFICIAL DAMAS «A»
 *   2026" → `torneo-oficial-damas-a-2026`) es el `tournaments.external_id`
 *   con el prefijo del provider.
 * - Equipo: la clave del nombre, CON el torneo como alcance. El mismo nombre
 *   ("JOCKEY CLUB") nombra a un club distinto según el torneo —la rama damas
 *   y la de caballeros son filas distintas de `clubs`, a propósito—, igual
 *   que en URBA la categoría formaba parte del triple. El alias es
 *   `{slugDelTorneo}|{claveDelNombre}` en `club_external_ids`.
 *
 * Un club puede tener varios alias dentro del mismo torneo: la federación
 * escribe "ATHLETIC «NEGRO»" en el fixture y "Córdoba Athletic «Negro»" en la
 * crónica. Agregar un alias es agregar una fila, nunca tocar el resolvedor.
 */

export const FEDHOCKEYCBA_PROVIDER = 'fedhockeycba';
export const FEDHOCKEYCBA_ID_PREFIX = 'fedhockeycba:';

/**
 * Normaliza un nombre tal como lo escribe la federación a una clave estable:
 * minúsculas, sin acentos, sin comillas (« » " " ' ') ni puntuación, espacios
 * simples. "LA TABLADA «ROJO»" y "La Tablada 'Rojo'" dan la misma clave.
 */
export function claveDeNombre(nombre: string): string {
  return String(nombre ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** La clave de torneo, apta para `external_id`: la clave del nombre con guiones. */
export function slugDeTorneo(encabezado: string): string {
  return claveDeNombre(encabezado).replace(/ /g, '-');
}

export function buildTournamentExternalId(encabezado: string): string {
  return `${FEDHOCKEYCBA_ID_PREFIX}${slugDeTorneo(encabezado)}`;
}

/** El alias de un equipo dentro de un torneo: lo que se guarda en `club_external_ids.external_id`. */
export function buildTeamAlias(slugTorneo: string, nombreEquipo: string): string {
  return `${slugTorneo}|${claveDeNombre(nombreEquipo)}`;
}

/**
 * Par de clubes sin orden + día: la identidad con la que un partido del
 * fixture se empareja con una fila ya cargada a mano en el gestor (esas filas
 * tienen `external_id` NULL, así que el emparejamiento es por contenido).
 */
export function claveDePar(clubA: string, clubB: string, diaIso: string): string {
  const [x, y] = [clubA, clubB].sort();
  return `${diaIso}|${x}|${y}`;
}

/** `external_id` de un partido creado por el conector. Determinista por aparición en el fixture. */
export function buildMatchExternalId(slugTorneo: string, diaIso: string, localId: string, visitanteId: string): string {
  return `${FEDHOCKEYCBA_ID_PREFIX}${slugTorneo}:${diaIso}:${localId}~${visitanteId}`;
}
