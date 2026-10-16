import { esGradoSubordinado } from './tournamentNavigation.ts';
import { agruparEnFamilias, type ConFamilia, type TorneoDeLista } from './leagueFamilies.ts';
import type { GrupoDeTipo } from './leagueRegions.ts';
import { resolveTournamentAudience } from './utils/tournamentAudience.ts';

/**
 * Las tres secciones con que se lee la lista de una unión (o de un país sin uniones):
 *
 *   Competiciones   lo de mayores; los regionales primero
 *   Reserva         Intermedia y Preintermedia
 *   Juveniles       M15, M16, M17, M19 y demás
 *
 * Es lo que antes hacían las pestañas Mayores / Juveniles-Reserva, pero adentro de
 * cada unión: quien entra a la URBA ve las tres cosas separadas, sin cambiar de
 * pestaña ni perder dónde está.
 *
 * ── El ORDEN importa: primero se parte, después se agrupa en familias ──────────
 * Con la reserva todavía adentro, el Top 14 sería UNA familia de ocho grados
 * (Superior, Intermedia, Preintermedia A…) y la sección Reserva quedaría vacía.
 * Partiendo antes, el Top 14 queda con su Superior, y la reserva forma su propia
 * familia ("Reserva · Top 14") con sus grados.
 */

export type TipoDeLista = 'competiciones' | 'reserva' | 'juveniles';

export interface TorneoClasificable extends TorneoDeLista {
  scope?: string | null;
}

const TITULOS: Record<TipoDeLista, string> = {
  competiciones: 'Competiciones',
  reserva: 'Reserva',
  juveniles: 'Juveniles',
};

const ORDEN: TipoDeLista[] = ['competiciones', 'reserva', 'juveniles'];

/** La reserva también viaja en el nombre ("… M15 Reserva", "… - Intermedia"). */
const RESERVA = /\b(?:pre[\s-]?)?intermedias?\b|\breservas?\b/i;

const categoriaDe = (t: TorneoDeLista): string | null => {
  const c = t.categories?.[0];
  return typeof c === 'string' && c.trim() ? c : null;
};

export function tipoDeLista(t: TorneoClasificable): TipoDeLista {
  if (esGradoSubordinado(t.subcategory) || RESERVA.test(t.name)) return 'reserva';
  const audiencia = resolveTournamentAudience({
    ageGrade: t.ageGroup,
    category: categoriaDe(t),
    subcategory: t.subcategory,
    name: t.name,
  });
  return audiencia === 'juveniles' ? 'juveniles' : 'competiciones';
}

/**
 * Parte la lista en sus secciones y agrupa cada una en familias.
 *
 * Devuelve sólo las secciones que tienen algo. El orden de entrada se respeta
 * adentro de cada una, salvo que en Competiciones los regionales van primero.
 */
export function gruposPorTipo<T extends TorneoClasificable>(lista: T[]): Array<GrupoDeTipo<ConFamilia<T>>> {
  const partes: Record<TipoDeLista, T[]> = { competiciones: [], reserva: [], juveniles: [] };
  for (const t of lista) partes[tipoDeLista(t)].push(t);

  partes.competiciones = [
    ...partes.competiciones.filter((t) => t.scope === 'regional'),
    ...partes.competiciones.filter((t) => t.scope !== 'regional'),
  ];

  return ORDEN
    .map((tipo) => ({ key: tipo, title: TITULOS[tipo], tournaments: agruparEnFamilias(partes[tipo]) }))
    .filter((grupo) => grupo.tournaments.length > 0);
}
