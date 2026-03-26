import { createClub, linkDerivedClub } from '@/lib/services/clubService';
import {
  canonicalizeSportId,
  getClubSportValue,
  getSportDisplayName,
  type ClubDerivativeType,
} from '@/lib/clubDerivatives';
import { resolveTournamentAudience, type TournamentAudience } from '@/lib/utils/tournamentAudience';
import { normalizeSlug } from '@/lib/utils/normalize';

export type TournamentContextRow = {
  id: string;
  name: string;
  display_name?: string | null;
  category?: string | null;
  age_grade?: string | null;
  sport_id?: string | null;
  union_id?: string | null;
  country?: string | null;
};

export type ClubContextRow = {
  id: string;
  name: string;
  short_name?: string | null;
  slug?: string | null;
  union_id?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  sport?: string | null;
  sport_id?: string | null;
  categories?: string[] | null;
  is_visible?: boolean | null;
};

type ClubDerivativeRelationRow = {
  base_club_id: string;
  derived_club_id: string;
  derivative_type: ClubDerivativeType;
};

type VariantGender = 'Masculino' | 'Femenino' | 'Mixto';

type ClubVariantMetadata = {
  gender: VariantGender | null;
  ageGrade: string | null;
  audience: TournamentAudience | null;
};

type TournamentClubRequirements = {
  sport: string | null;
  gender: VariantGender | null;
  ageGrade: string | null;
  audience: TournamentAudience;
};

type ResolveResult = {
  club: ClubContextRow;
  mode: 'existing' | 'created';
  derivativeType: ClubDerivativeType | null;
};

const FEMALE_PATTERNS = [
  /\bfemen(?:ino|ina|il)?s?\b/i,
  /\bwom[ae]n'?s?\b/i,
  /\bfemale\b/i,
  /\blad(?:y|ies)\b/i,
  /\bgirls?\b/i,
];

const MIXED_PATTERNS = [
  /\bmixt[oa]s?\b/i,
  /\bmixed\b/i,
  /\bcoed\b/i,
];

const MALE_PATTERNS = [
  /\bmasculin[oa]s?\b/i,
  /\bmen'?s?\b/i,
  /\bmale\b/i,
  /\bvarones?\b/i,
  /\bcaballeros?\b/i,
];

const VARIANT_CATEGORY_PREFIXES = ['gender:', 'age_grade:', 'audience:', 'variant:', 'sport:'];

function normalizeGenderValue(value: string | null | undefined): VariantGender | null {
  const text = String(value ?? '').trim();
  if (!text) return null;

  if (MIXED_PATTERNS.some((pattern) => pattern.test(text))) return 'Mixto';
  if (FEMALE_PATTERNS.some((pattern) => pattern.test(text))) return 'Femenino';
  if (MALE_PATTERNS.some((pattern) => pattern.test(text))) return 'Masculino';
  return null;
}

function inferTournamentGender(tournament: TournamentContextRow): VariantGender | null {
  const hints = [tournament.display_name, tournament.name, tournament.category]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  for (const hint of hints) {
    const normalized = normalizeGenderValue(hint);
    if (normalized) return normalized;
  }

  return null;
}

function normalizeAgeGrade(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeCategoryToken(raw: string): string {
  return raw.trim().toLowerCase();
}

function getCategoryValue(categories: string[] | null | undefined, prefix: string): string | null {
  const normalizedPrefix = `${normalizeCategoryToken(prefix)}:`;
  const entry = (categories ?? []).find((category) => normalizeCategoryToken(category).startsWith(normalizedPrefix));

  if (!entry) {
    return null;
  }

  return entry.slice(entry.indexOf(':') + 1).trim() || null;
}

function isMissingClubDerivativesTableError(error: { message?: string | null } | null | undefined): boolean {
  const message = String(error?.message ?? '');
  return message.includes('club_derivatives') && (
    message.includes('schema cache') ||
    message.includes('does not exist') ||
    message.includes('Could not find the table')
  );
}

function isMissingClubCategoriesColumnError(error: { message?: string | null } | null | undefined): boolean {
  const message = String(error?.message ?? '');
  return message.includes('categories') && (
    message.includes('does not exist') ||
    message.includes('schema cache')
  );
}

function readClubVariantMetadata(club: ClubContextRow, relationType: ClubDerivativeType | null): ClubVariantMetadata {
  const categories = Array.isArray(club.categories) ? club.categories : [];
  const categoryMap = new Map<string, string>();

  for (const category of categories) {
    const normalized = normalizeCategoryToken(category);
    const separatorIndex = normalized.indexOf(':');
    if (separatorIndex <= 0) continue;

    categoryMap.set(normalized.slice(0, separatorIndex), normalized.slice(separatorIndex + 1));
  }

  const categoryGender = categoryMap.get('gender');
  const categoryAgeGrade = categoryMap.get('age_grade');
  const categoryAudience = categoryMap.get('audience');

  const gender = categoryGender
    ? normalizeGenderValue(categoryGender)
    : relationType === 'women'
      ? 'Femenino'
      : null;

  const ageGrade = categoryAgeGrade ? categoryAgeGrade.toUpperCase() : null;
  const audience = categoryAudience === 'juveniles' || categoryAudience === 'mayores'
    ? categoryAudience
    : ageGrade
      ? resolveTournamentAudience({ ageGrade })
      : relationType === 'youth'
        ? 'juveniles'
        : null;

  return { gender, ageGrade, audience };
}

function inferRelationTypeFromCategories(
  club: ClubContextRow,
  baseClub: ClubContextRow,
): ClubDerivativeType | null {
  if (club.id === baseClub.id) {
    return null;
  }

  const sport = canonicalizeSportId(getClubSportValue(club));
  const baseSport = canonicalizeSportId(getClubSportValue(baseClub));
  if (sport && baseSport && sport !== baseSport) {
    return 'other_sport';
  }

  const metadata = readClubVariantMetadata(club, null);
  if (metadata.audience === 'juveniles' || metadata.ageGrade) {
    return 'youth';
  }

  if (metadata.gender && metadata.gender !== 'Masculino') {
    return 'women';
  }

  return null;
}

function normalizeClubFamilyStem(name: string | null | undefined): string {
  let stem = normalizeSlug(name);
  let previous = '';

  while (stem && stem !== previous) {
    previous = stem;
    stem = stem
      .replace(/-(rugby|hockey|field-hockey|basquet|basket|basketball|handball|voley|volley|futbol|football|soccer|futsal|tenis|tennis)$/i, '')
      .replace(/-(femenino|femenina|masculino|masculina|mixto|mixta)$/i, '')
      .replace(/-(juvenil|juveniles|cadete|cadetes|infantil|infantiles|formativas|menores|m\d{1,2}|u\d{1,2}|sub-\d{1,2}|sub\d{1,2})$/i, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  return stem;
}

function isLikelySameClubFamily(referenceClub: ClubContextRow, candidateClub: ClubContextRow): boolean {
  if (referenceClub.id === candidateClub.id) {
    return true;
  }

  if (
    referenceClub.country &&
    candidateClub.country &&
    normalizeSlug(referenceClub.country) !== normalizeSlug(candidateClub.country)
  ) {
    return false;
  }

  if (
    referenceClub.city &&
    candidateClub.city &&
    normalizeSlug(referenceClub.city) !== normalizeSlug(candidateClub.city)
  ) {
    return false;
  }

  const referenceShortName = normalizeSlug(referenceClub.short_name);
  const candidateShortName = normalizeSlug(candidateClub.short_name);
  if (referenceShortName && candidateShortName && referenceShortName === candidateShortName) {
    return true;
  }

  const referenceStem = normalizeClubFamilyStem(referenceClub.name);
  const candidateStem = normalizeClubFamilyStem(candidateClub.name);
  return Boolean(referenceStem) && referenceStem === candidateStem;
}

function pickHeuristicBaseClub(clubs: ClubContextRow[]): ClubContextRow | null {
  const ranked = [...clubs].sort((left, right) => {
    const leftHasSuffix = normalizeClubFamilyStem(left.name) !== normalizeSlug(left.name);
    const rightHasSuffix = normalizeClubFamilyStem(right.name) !== normalizeSlug(right.name);

    if (leftHasSuffix !== rightHasSuffix) {
      return leftHasSuffix ? 1 : -1;
    }

    return normalizeSlug(left.name).length - normalizeSlug(right.name).length;
  });

  return ranked[0] ?? null;
}

async function loadHeuristicFamilyCandidates(
  supabase: any,
  currentClub: ClubContextRow,
): Promise<ClubContextRow[]> {
  let query = supabase
    .from('clubs')
    .select('*')
    .neq('id', currentClub.id)
    .limit(80);

  if (currentClub.short_name) {
    query = query.eq('short_name', currentClub.short_name);
  } else {
    const stem = normalizeClubFamilyStem(currentClub.name).split('-').slice(0, 3).join(' ');
    if (stem) {
      query = query.ilike('name', `%${stem.replace(/-/g, ' ')}%`);
    }
  }

  if (currentClub.country) {
    query = query.eq('country', currentClub.country);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as ClubContextRow[]).filter((candidateClub) => isLikelySameClubFamily(currentClub, candidateClub));
}

function buildTournamentRequirements(tournament: TournamentContextRow): TournamentClubRequirements {
  const gender = inferTournamentGender(tournament);
  const ageGrade = normalizeAgeGrade(tournament.age_grade);
  const audience = resolveTournamentAudience({
    ageGrade: tournament.age_grade,
    category: tournament.category,
    name: tournament.name,
    displayName: tournament.display_name,
  });

  return {
    sport: canonicalizeSportId(tournament.sport_id || null),
    gender,
    ageGrade,
    audience,
  };
}

function getCandidateScore(
  club: ClubContextRow,
  relationType: ClubDerivativeType | null,
  requirements: TournamentClubRequirements,
): number {
  const metadata = readClubVariantMetadata(club, relationType);
  const sport = canonicalizeSportId(getClubSportValue(club));

  if (requirements.sport && sport !== requirements.sport) return -1;
  if (requirements.gender === 'Femenino' && metadata.gender !== 'Femenino') return -1;
  if (requirements.gender === 'Mixto' && metadata.gender !== 'Mixto') return -1;
  if (requirements.gender === 'Masculino' && metadata.gender && metadata.gender !== 'Masculino') return -1;

  if (requirements.audience === 'juveniles') {
    if (metadata.audience !== 'juveniles') return -1;

    if (
      requirements.ageGrade &&
      metadata.ageGrade &&
      normalizeSlug(metadata.ageGrade) !== normalizeSlug(requirements.ageGrade)
    ) {
      return -1;
    }
  } else if (metadata.audience === 'juveniles') {
    return -1;
  }

  let score = 0;
  if (requirements.sport && sport === requirements.sport) score += 20;
  if (requirements.gender && metadata.gender === requirements.gender) score += 10;

  if (requirements.audience === 'juveniles') {
    if (metadata.audience === 'juveniles') score += 5;
    if (
      requirements.ageGrade &&
      metadata.ageGrade &&
      normalizeSlug(metadata.ageGrade) === normalizeSlug(requirements.ageGrade)
    ) {
      score += 5;
    }
  } else if (!metadata.audience) {
    score += 2;
  }

  if (!requirements.gender && !metadata.gender) score += 2;
  if (!relationType) score += 3;
  if (relationType === 'other_sport') score += 2;
  if (relationType === 'women') score += 1;
  if (relationType === 'youth') score += 1;

  return score;
}

function buildVariantCategories(
  baseCategories: string[] | null | undefined,
  requirements: TournamentClubRequirements,
  targetSport: string | null,
  baseClubId?: string | null,
): string[] | null {
  const preserved = (baseCategories ?? []).filter((category) => {
    const normalized = normalizeCategoryToken(category);
    return !VARIANT_CATEGORY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  });

  const tokens = new Set<string>(preserved);
  tokens.add('variant:auto');

  if (requirements.gender) tokens.add(`gender:${normalizeSlug(requirements.gender)}`);
  if (requirements.audience) tokens.add(`audience:${requirements.audience}`);
  if (requirements.ageGrade) tokens.add(`age_grade:${normalizeSlug(requirements.ageGrade)}`);
  if (targetSport) tokens.add(`sport:${targetSport}`);
  if (baseClubId) tokens.add(`base_club:${baseClubId}`);

  return tokens.size > 0 ? Array.from(tokens) : null;
}

async function ensureUniqueClubSlug(supabase: any, baseSlug: string): Promise<string> {
  const normalizedBase = normalizeSlug(baseSlug) || `club-${Date.now()}`;
  let candidate = normalizedBase;

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const { data: existingClub } = await supabase
      .from('clubs')
      .select('id')
      .eq('id', candidate)
      .maybeSingle();

    if (!existingClub) return candidate;
    candidate = `${normalizedBase}-${attempt + 2}`;
  }

  return `${normalizedBase}-${Date.now()}`;
}

async function loadClubFamily(
  supabase: any,
  clubId: string,
): Promise<{ baseClub: ClubContextRow; candidates: Array<{ club: ClubContextRow; relationType: ClubDerivativeType | null }> }> {
  const { data: currentClubData, error: currentClubError } = await supabase
    .from('clubs')
    .select('*')
    .eq('id', clubId)
    .single();

  if (currentClubError || !currentClubData) {
    throw new Error(currentClubError?.message || 'No se encontro el club solicitado.');
  }

  const currentClub = currentClubData as ClubContextRow;
  let baseClubId = getCategoryValue(currentClub.categories, 'base_club') || clubId;
  let relationRows: ClubDerivativeRelationRow[] = [];

  const { data: incomingRelation, error: incomingError } = await supabase
    .from('club_derivatives')
    .select('base_club_id')
    .eq('derived_club_id', clubId)
    .maybeSingle();

  if (!incomingError && incomingRelation?.base_club_id) {
    baseClubId = incomingRelation.base_club_id;
  } else if (incomingError && !isMissingClubDerivativesTableError(incomingError)) {
    throw new Error(incomingError.message);
  }

  const { data: outgoingRelations, error: outgoingError } = await supabase
    .from('club_derivatives')
    .select('base_club_id, derived_club_id, derivative_type')
    .eq('base_club_id', baseClubId);

  if (!outgoingError) {
    relationRows = (outgoingRelations ?? []) as ClubDerivativeRelationRow[];
  } else if (!isMissingClubDerivativesTableError(outgoingError)) {
    throw new Error(outgoingError.message);
  }

  let categoryDerivedRows: ClubContextRow[] = [];
  const { data: categoryDerivedClubs, error: categoryDerivedError } = await supabase
    .from('clubs')
    .select('*')
    .contains('categories', [`base_club:${baseClubId}`]);

  if (!categoryDerivedError) {
    categoryDerivedRows = (categoryDerivedClubs ?? []) as ClubContextRow[];
  } else if (!isMissingClubCategoriesColumnError(categoryDerivedError)) {
    throw new Error(categoryDerivedError.message);
  }

  const heuristicCandidates = relationRows.length === 0 && categoryDerivedRows.length === 0
    ? await loadHeuristicFamilyCandidates(supabase, currentClub)
    : [];

  if (relationRows.length === 0 && categoryDerivedRows.length === 0 && heuristicCandidates.length > 0) {
    const heuristicBaseClub = pickHeuristicBaseClub([currentClub, ...heuristicCandidates]);
    if (heuristicBaseClub) {
      baseClubId = heuristicBaseClub.id;
    }
  }

  const candidateIds = Array.from(new Set([
    baseClubId,
    clubId,
    ...relationRows.map((row) => row.derived_club_id),
    ...categoryDerivedRows.map((club) => club.id),
    ...heuristicCandidates.map((club) => club.id),
  ]));
  const { data: candidateClubs, error: clubsError } = await supabase
    .from('clubs')
    .select('*')
    .in('id', candidateIds);

  if (clubsError) throw new Error(clubsError.message);

  const clubs = (candidateClubs ?? []) as ClubContextRow[];
  const relationByDerivedId = new Map(relationRows.map((row) => [row.derived_club_id, row.derivative_type]));
  const baseClub = clubs.find((club) => club.id === baseClubId);

  if (!baseClub) {
    throw new Error('No se encontró el club base para resolver el participante.');
  }

  return {
    baseClub,
    candidates: clubs.map((club) => ({
      club,
      relationType: club.id === baseClubId
        ? null
        : (relationByDerivedId.get(club.id) ?? inferRelationTypeFromCategories(club, baseClub)),
    })),
  };
}

export async function resolveParticipantClubForTournament(
  supabase: any,
  tournament: TournamentContextRow,
  clubId: string,
): Promise<ResolveResult> {
  const requirements = buildTournamentRequirements(tournament);
  const { baseClub, candidates } = await loadClubFamily(supabase, clubId);

  const bestCandidate = candidates
    .map((candidate) => ({
      ...candidate,
      score: getCandidateScore(candidate.club, candidate.relationType, requirements),
    }))
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => right.score - left.score)[0];

  if (bestCandidate) {
    return {
      club: bestCandidate.club,
      mode: 'existing',
      derivativeType: bestCandidate.relationType,
    };
  }

  const baseSport = canonicalizeSportId(getClubSportValue(baseClub));
  const targetSport = requirements.sport || baseSport || 'rugby';
  const derivativeType: ClubDerivativeType = targetSport !== baseSport
    ? 'other_sport'
    : requirements.gender === 'Femenino'
      ? 'women'
      : 'youth';

  const suffixes = [
    targetSport !== baseSport ? getSportDisplayName(targetSport) : null,
    requirements.gender && requirements.gender !== 'Masculino' ? requirements.gender : null,
    requirements.audience === 'juveniles' ? (requirements.ageGrade || 'Juvenil') : null,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const dedupedSuffixes = suffixes.filter((suffix, index) => {
    const normalized = normalizeSlug(suffix);
    return index === suffixes.findIndex((candidate) => normalizeSlug(candidate) === normalized);
  });

  const derivedName = [baseClub.name, ...dedupedSuffixes].join(' ').trim();
  const slug = await ensureUniqueClubSlug(supabase, derivedName);
  const categories = buildVariantCategories(baseClub.categories, requirements, targetSport, baseClub.id);

  const createResult = await createClub({
    name: derivedName,
    slug,
    entity_type: 'club',
    sport: targetSport,
    country: baseClub.country || tournament.country || 'ARG',
    short_name: baseClub.short_name || null,
    region: baseClub.region || null,
    city: baseClub.city || null,
    union_id: tournament.union_id || baseClub.union_id || null,
    logo_url: baseClub.logo_url || null,
    primary_color: baseClub.primary_color || null,
    visibility: baseClub.is_visible === false ? 'hidden' : 'visible',
    categories,
  }, {
    supabaseClient: supabase,
  });

  if (!createResult.success || !createResult.club?.id) {
    throw new Error(createResult.error || 'No se pudo crear el club derivado automáticamente.');
  }

  const relationResult = await linkDerivedClub({
    baseClubId: baseClub.id,
    derivedClubId: createResult.club.id,
    derivativeType,
  }, {
    supabaseClient: supabase,
  });

  if (!relationResult.success) {
    throw new Error(relationResult.error || 'No se pudo vincular el club derivado.');
  }

  return {
    club: {
      ...baseClub,
      ...createResult.club,
      sport_id: targetSport,
      sport: targetSport,
      categories,
    },
    mode: 'created',
    derivativeType,
  };
}
