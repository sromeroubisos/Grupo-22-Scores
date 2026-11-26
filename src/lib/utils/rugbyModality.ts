import type { MatchPeriodRules } from '../americanFootballRules.ts';

/**
 * Modalidad de un torneo de rugby: 15 o 7. Vive en `tournaments.ruleset`
 * (jsonb), asi que no hace falta una columna nueva: el torneo de seven nace con
 * `ruleset.rugbyModality = 'sevens'`.
 */
export type RugbyModality = 'fifteens' | 'sevens';

/**
 * Lo que cambia el reglamento de una modalidad a la otra. Se DERIVA de la
 * modalidad y no se guarda: un torneo de seven no tiene que acordarse de
 * escribir sus tiempos, y un cambio de reglamento se corrige aca una vez para
 * todos los torneos.
 */
export interface RugbyModalityRules {
  /** Titulares en cancha. */
  starters: number;
  /** Suplentes en el banco. */
  bench: number;
  /** Planilla completa: titulares + suplentes. */
  lineupSize: number;
  /** Minutos de cada tiempo (son dos). */
  periodDurationMinutes: number;
  /** Minutos de cada tiempo suplementario. */
  overtimeDurationMinutes: number;
  /** Minutos que un amonestado pasa afuera (sin-bin). */
  sinBinMinutes: number;
}

export const RUGBY_MODALITY_RULES: Record<RugbyModality, RugbyModalityRules> = {
  fifteens: {
    starters: 15,
    bench: 8,
    lineupSize: 23,
    periodDurationMinutes: 40,
    overtimeDurationMinutes: 10,
    sinBinMinutes: 10,
  },
  // Seven: 7 en cancha, 5 en el banco, dos tiempos de 7', suplementario de 5'
  // a muerte subita y amarilla de 2'.
  sevens: {
    starters: 7,
    bench: 5,
    lineupSize: 12,
    periodDurationMinutes: 7,
    overtimeDurationMinutes: 5,
    sinBinMinutes: 2,
  },
};

export function getRugbyModalityRules(modality: RugbyModality | null | undefined): RugbyModalityRules {
  return RUGBY_MODALITY_RULES[modality ?? 'fifteens'];
}

/**
 * Periodos del seven para el reloj (`PeriodSportRef`). El 15 devuelve null a
 * proposito: sin reglas de periodo el reloj usa la tabla de rugby de siempre,
 * asi que ningun partido de 15 cambia.
 */
export function rugbyModalityPeriodRules(modality: RugbyModality | null | undefined): MatchPeriodRules | null {
  if (modality !== 'sevens') return null;
  const rules = RUGBY_MODALITY_RULES.sevens;
  return {
    periods: 2,
    periodDurationMinutes: rules.periodDurationMinutes,
    overtimeDurationMinutes: rules.overtimeDurationMinutes,
    // El rugby cuenta para arriba: 05:12 son los minutos jugados del tiempo.
    countdown: false,
  };
}

/** Texto corto del reglamento: "7 en cancha + 5 suplentes · 2×7′ · amarilla 2′". */
export function describeRugbyModalityRules(modality: RugbyModality | null | undefined): string {
  const rules = getRugbyModalityRules(modality);
  return `${rules.starters} en cancha + ${rules.bench} suplentes · 2×${rules.periodDurationMinutes}′ · amarilla ${rules.sinBinMinutes}′`;
}

export const RUGBY_MODALITY_RULESET_KEY = 'rugbyModality';

/** Marca que lleva en `clubs.categories` la version 7 de un club. */
export const SEVENS_CLUB_CATEGORY = 'modality:7s';

/** Sufijo con el que se nombra la version 7 de un club ("Olivos R.C. 7s"). */
export const SEVENS_CLUB_NAME_SUFFIX = '7s';

const SEVENS_NAME_PATTERN = /(?:^|[\s-])7['’]?s\b|\bseven(?:s)?\b/i;

export function normalizeRugbyModality(value: unknown): RugbyModality | null {
  const text = String(value ?? '').trim().toLowerCase();
  if (['sevens', 'seven', '7', '7s', 'rugby-7s', 'rugby7s'].includes(text)) return 'sevens';
  if (['fifteens', 'fifteen', '15', '15s', 'xv', 'union'].includes(text)) return 'fifteens';
  return null;
}

export function readRugbyModality(
  ruleset: Record<string, unknown> | null | undefined,
): RugbyModality | null {
  if (!ruleset || typeof ruleset !== 'object') return null;
  return normalizeRugbyModality(ruleset[RUGBY_MODALITY_RULESET_KEY]);
}

export function isSevensTournament(
  tournament: { ruleset?: Record<string, unknown> | null } | null | undefined,
): boolean {
  return readRugbyModality(tournament?.ruleset) === 'sevens';
}

/** Solo la marca explicita: la que escribe el alta automatica. */
export function hasSevensClubMark(
  club: { categories?: string[] | null } | null | undefined,
): boolean {
  return (club?.categories ?? []).some(
    (category) => category.trim().toLowerCase() === SEVENS_CLUB_CATEGORY,
  );
}

/** Un club es "de 7" si lo dice su marca, o (clubes viejos) si el nombre lo dice. */
export function isSevensClub(
  club: { name?: string | null; categories?: string[] | null } | null | undefined,
): boolean {
  return hasSevensClubMark(club) || SEVENS_NAME_PATTERN.test(String(club?.name ?? ''));
}
