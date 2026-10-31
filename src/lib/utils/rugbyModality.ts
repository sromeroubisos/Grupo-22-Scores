/**
 * Modalidad de un torneo de rugby: 15 o 7. Vive en `tournaments.ruleset`
 * (jsonb), asi que no hace falta una columna nueva: el torneo de seven nace con
 * `ruleset.rugbyModality = 'sevens'`.
 */
export type RugbyModality = 'fifteens' | 'sevens';

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
