import { SPORTS, getSportById } from '@/lib/data/sports';
import type { SportId } from '@/lib/types';
import { mapExternalSportToInternalSport } from '@/lib/sports';

export type ClubDerivativeType = 'youth' | 'women' | 'other_sport';

export const CLUB_DERIVATIVE_LABELS: Record<ClubDerivativeType, string> = {
  youth: 'Plantel juvenil',
  women: 'Rama',
  other_sport: 'Otro deporte',
};

export const CLUB_DERIVATIVE_DESCRIPTIONS: Record<ClubDerivativeType, string> = {
  youth: 'Mantiene la identidad del club base, pero queda listo para una categoria formativa.',
  women: 'Arranca con la identidad del club base para que luego definas si la rama sera femenina o masculina.',
  other_sport: 'Crea una variante deportiva del mismo club para que la vista publica pueda resolverla por deporte.',
};

function isSportId(value: string): value is SportId {
  return Object.prototype.hasOwnProperty.call(SPORTS, value);
}

export function canonicalizeSportId(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return null;

  const looksExternal = /^\d+$/.test(value) || value.startsWith('/');
  let normalized = looksExternal ? mapExternalSportToInternalSport(value) : value;

  if (normalized === 'field-hockey') {
    normalized = 'hockey';
  }

  const sport = isSportId(normalized) ? getSportById(normalized) : null;
  if (sport?.groupKey) {
    return sport.groupKey;
  }

  return normalized;
}

export function getSportDisplayName(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return '';

  const sport = isSportId(value) ? getSportById(value) : null;
  if (sport?.nameEs) return sport.nameEs;

  const canonical = canonicalizeSportId(value);
  const canonicalSport = canonical && isSportId(canonical) ? getSportById(canonical) : null;
  if (canonicalSport?.nameEs) return canonicalSport.nameEs;

  return raw ?? '';
}

export function getClubSportValue(
  club: { sport?: string | null; sport_id?: string | null; categories?: string[] | null } | null | undefined,
): string | null {
  const directSport = club?.sport_id || club?.sport;
  if (directSport) {
    return directSport;
  }

  const categories = Array.isArray(club?.categories) ? club.categories : [];
  const sportCategory = categories.find((category) => category.trim().toLowerCase().startsWith('sport:'));

  if (!sportCategory) {
    return null;
  }

  return sportCategory.slice(sportCategory.indexOf(':') + 1).trim() || null;
}
