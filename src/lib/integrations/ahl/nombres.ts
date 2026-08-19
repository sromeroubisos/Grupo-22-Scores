/**
 * Identidad AHL (Asociación de Hockey del Litoral). Mismo esquema que
 * fedhockeycba —la web tampoco tiene IDs—, con su propio provider y prefijo.
 * Las funciones de normalización son las mismas: dos federaciones, un idioma.
 */
export { claveDeNombre, claveDePar, slugDeTorneo } from '../fedhockeycba/nombres.ts';
import { claveDeNombre, slugDeTorneo } from '../fedhockeycba/nombres.ts';

export const AHL_PROVIDER = 'ahl';
export const AHL_ID_PREFIX = 'ahl:';

export function buildTournamentExternalId(encabezado: string): string {
  return `${AHL_ID_PREFIX}${slugDeTorneo(encabezado)}`;
}

export function buildTeamAlias(slugTorneo: string, nombreEquipo: string): string {
  return `${slugTorneo}|${claveDeNombre(nombreEquipo)}`;
}

export function buildMatchExternalId(slugTorneo: string, diaIso: string, localId: string, visitanteId: string): string {
  return `${AHL_ID_PREFIX}${slugTorneo}:${diaIso}:${localId}~${visitanteId}`;
}
