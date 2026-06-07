import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { createClub, linkDerivedClub } from '@/lib/services/clubService';
import { getTournamentStandings } from '@/lib/services/flashscore';
import {
  getEspnAmericanFootballLeagueStandings,
  parseEspnAmericanFootballTournamentId,
} from '@/lib/services/espnAmericanFootball';
import { resolveParticipantClubForTournament as resolveParticipantClubForTournamentViaService } from '@/lib/services/tournamentClubDerivationService';
import {
  canonicalizeSportId,
  getClubSportValue,
  getSportDisplayName,
  type ClubDerivativeType,
} from '@/lib/clubDerivatives';
import { resolveTournamentAudience, type TournamentAudience } from '@/lib/utils/tournamentAudience';
import { normalizeSlug } from '@/lib/utils/normalize';
import { resolveSerializableLogoUrl } from '@/lib/utils/logoUrl';
import { isMissingColumnError, isMissingTableError } from '@/lib/utils/supabaseSchema';
import { createApiPerfTracker } from '@/lib/perf/api';
import { logOverfetchWarning } from '@/lib/perf/measure';

type TournamentContextRow = {
  id: string;
  name: string;
  display_name?: string | null;
  category?: string | null;
  age_grade?: string | null;
  sport_id?: string | null;
  union_id?: string | null;
  country?: string | null;
};

type DivisionContextRow = {
  id: string;
  club_id: string;
  name?: string | null;
  sport?: string | null;
  gender?: string | null;
  category?: string | null;
  season?: string | null;
  status?: string | null;
};

type SupabaseLikeError = {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

type TournamentParticipantRecord = {
  id: string;
  club_id: string | null;
  division_id?: string | null;
  name?: string | null;
  type?: string | null;
  status?: string | null;
  seed?: number | null;
  group_id?: string | null;
  short_code?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  clubs?: {
    id: string;
    name?: string | null;
    short_name?: string | null;
    logo_url?: string | null;
    logo?: string | null;
  } | null;
  division?: DivisionContextRow | null;
};

type TournamentParticipantUpdateContext = {
  id: string;
  tournament_id: string;
  season_id?: string | null;
  club_id: string | null;
  division_id?: string | null;
  name?: string | null;
  short_code?: string | null;
};

type TournamentStandingReplacementRow = {
  id: string;
  phase_id: string | null;
  group_id: string | null;
  stats?: Record<string, unknown> | null;
};

type FlashscoreParticipantLike = {
  name?: string | null;
  id?: string | number | null;
  team_id?: string | number | null;
  team?: FlashscoreParticipantLike | null;
  participant?: FlashscoreParticipantLike | null;
  rows?: FlashscoreParticipantLike[] | null;
};

type TournamentParticipantsTableClient = {
  select(columns: string): {
    eq(column: 'tournament_id' | 'id', value: string): {
      order(
        column: 'created_at',
        options: { ascending: boolean },
      ): Promise<{ data: TournamentParticipantRecord[] | null; error: SupabaseLikeError | null }>;
      single(): Promise<{
        data: { club_id: string | null; division_id?: string | null } | TournamentParticipantRecord | null;
        error: SupabaseLikeError | null;
      }>;
    };
  };
  insert(values: Record<string, unknown>): {
    select(columns: string): {
      single(): Promise<{ data: TournamentParticipantRecord | null; error: SupabaseLikeError | null }>;
    };
  };
  update(values: Record<string, unknown>): {
    eq(column: 'id', value: string): {
      select(columns: string): {
        single(): Promise<{ data: TournamentParticipantRecord | null; error: SupabaseLikeError | null }>;
      };
    };
  };
  delete(): {
    eq(column: 'id', value: string): Promise<{ error: SupabaseLikeError | null }>;
  };
};

type ClubContextRow = {
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
let tournamentParticipantDivisionIdSupport: boolean | null = null;

function serializeClubLogoUrl(input: {
  id?: string | null;
  name?: string | null;
  logo?: string | null;
}) {
  return resolveSerializableLogoUrl(input.logo, {
    key: input.id ?? null,
    name: input.name ?? null,
  });
}

function serializeParticipantRecord(participant: TournamentParticipantRecord): TournamentParticipantRecord {
  const club = participant.clubs;
  if (!club) return participant;

  const logo = serializeClubLogoUrl({
    id: club.id || participant.club_id,
    name: club.name || participant.name,
    logo: club.logo_url || club.logo || null,
  });

  return {
    ...participant,
    clubs: {
      ...club,
      logo_url: logo,
      logo,
    },
  };
}

async function supportsTournamentParticipantDivisionId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
  if (tournamentParticipantDivisionIdSupport !== null) {
    return tournamentParticipantDivisionIdSupport;
  }

  const { error } = await supabase
    .from('tournament_participants')
    .select('division_id')
    .limit(0);

  if (error) {
    if (isMissingColumnError(error, 'division_id')) {
      tournamentParticipantDivisionIdSupport = false;
      return false;
    }

    console.warn('[Participants API] Could not verify division_id support:', error.message);
    tournamentParticipantDivisionIdSupport = false;
    return false;
  }

  tournamentParticipantDivisionIdSupport = true;
  return true;
}

function getTournamentParticipantSelectColumns(supportsDivisionId: boolean) {
  return supportsDivisionId
    ? `
        id,
        tournament_id,
        season_id,
        club_id,
        division_id,
        name,
        type,
        status,
        seed,
        group_id,
        short_code,
        notes,
        created_at,
        updated_at,
        clubs:club_id (
          id,
          name,
          short_name,
          logo_url
        ),
        division:division_id (
          id,
          club_id,
          name,
          sport,
          gender,
          category,
          season,
          status
        )
      `
    : `
        id,
        tournament_id,
        season_id,
        club_id,
        name,
        type,
        status,
        seed,
        group_id,
        short_code,
        notes,
        created_at,
        updated_at,
        clubs:club_id (
          id,
          name,
          short_name,
          logo_url
        )
      `;
}

async function loadDivisionContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  divisionId: string,
): Promise<DivisionContextRow | null> {
  const { data, error } = await supabase
    .from('club_divisions')
    .select('id, club_id, name, sport, gender, category, season, status')
    .eq('id', divisionId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as DivisionContextRow;
}

function normalizeGenderValue(value: string | null | undefined): VariantGender | null {
  const text = String(value ?? '').trim();
  if (!text) return null;

  if (MIXED_PATTERNS.some((pattern) => pattern.test(text))) return 'Mixto';
  if (FEMALE_PATTERNS.some((pattern) => pattern.test(text))) return 'Femenino';
  if (MALE_PATTERNS.some((pattern) => pattern.test(text))) return 'Masculino';
  return null;
}

function inferTournamentGender(tournament: TournamentContextRow): VariantGender | null {
  const hints = [
    tournament.display_name,
    tournament.name,
    tournament.category,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

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

  if (requirements.sport && sport !== requirements.sport) {
    return -1;
  }

  if (requirements.gender === 'Femenino' && metadata.gender !== 'Femenino') {
    return -1;
  }

  if (requirements.gender === 'Mixto' && metadata.gender !== 'Mixto') {
    return -1;
  }

  if (requirements.gender === 'Masculino' && metadata.gender && metadata.gender !== 'Masculino') {
    return -1;
  }

  if (requirements.audience === 'juveniles') {
    if (metadata.audience !== 'juveniles') {
      return -1;
    }

    if (requirements.ageGrade && metadata.ageGrade && normalizeSlug(metadata.ageGrade) !== normalizeSlug(requirements.ageGrade)) {
      return -1;
    }
  } else if (metadata.audience === 'juveniles') {
    return -1;
  }

  let score = 0;

  if (requirements.sport && sport === requirements.sport) score += 20;
  if (requirements.gender && metadata.gender === requirements.gender) score += 10;

  if (requirements.audience === 'juveniles') {
    score += metadata.audience === 'juveniles' ? 5 : 0;

    if (requirements.ageGrade && metadata.ageGrade && normalizeSlug(metadata.ageGrade) === normalizeSlug(requirements.ageGrade)) {
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
): string[] | null {
  const preserved = (baseCategories ?? []).filter((category) => {
    const normalized = normalizeCategoryToken(category);
    return !VARIANT_CATEGORY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  });

  const tokens = new Set<string>(preserved);
  tokens.add('variant:auto');

  if (requirements.gender) {
    tokens.add(`gender:${normalizeSlug(requirements.gender)}`);
  }

  if (requirements.audience) {
    tokens.add(`audience:${requirements.audience}`);
  }

  if (requirements.ageGrade) {
    tokens.add(`age_grade:${normalizeSlug(requirements.ageGrade)}`);
  }

  if (targetSport) {
    tokens.add(`sport:${targetSport}`);
  }

  return tokens.size > 0 ? Array.from(tokens) : null;
}

async function ensureUniqueClubSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  baseSlug: string,
): Promise<string> {
  const normalizedBase = normalizeSlug(baseSlug) || `club-${Date.now()}`;
  let candidate = normalizedBase;

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const { data: existingClub } = await supabase
      .from('clubs')
      .select('id')
      .eq('id', candidate)
      .maybeSingle();

    if (!existingClub) {
      return candidate;
    }

    candidate = `${normalizedBase}-${attempt + 2}`;
  }

  return `${normalizedBase}-${Date.now()}`;
}

async function loadClubFamily(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
): Promise<{ baseClub: ClubContextRow; candidates: Array<{ club: ClubContextRow; relationType: ClubDerivativeType | null }> }> {
  const relationClient = supabase as unknown as {
    from(table: 'club_derivatives'): {
      select(columns: 'base_club_id'): {
        eq(column: 'derived_club_id', value: string): {
          maybeSingle(): Promise<{ data: { base_club_id: string } | null; error: { message: string } | null }>;
        };
      };
      select(columns: 'base_club_id, derived_club_id, derivative_type'): {
        eq(column: 'base_club_id', value: string): Promise<{ data: ClubDerivativeRelationRow[] | null; error: { message: string } | null }>;
      };
    };
  };

  const { data: incomingRelation, error: incomingError } = await relationClient
    .from('club_derivatives')
    .select('base_club_id')
    .eq('derived_club_id', clubId)
    .maybeSingle();

  if (incomingError) {
    throw new Error(incomingError.message);
  }

  const baseClubId = incomingRelation?.base_club_id || clubId;

  const { data: outgoingRelations, error: outgoingError } = await relationClient
    .from('club_derivatives')
    .select('base_club_id, derived_club_id, derivative_type')
    .eq('base_club_id', baseClubId);

  if (outgoingError) {
    throw new Error(outgoingError.message);
  }

  const relationRows = Array.isArray(outgoingRelations) ? outgoingRelations : [];
  const candidateIds = Array.from(new Set([baseClubId, ...relationRows.map((row) => row.derived_club_id)]));

  const { data: candidateClubs, error: clubsError } = await supabase
    .from('clubs')
    .select('*')
    .in('id', candidateIds);

  if (clubsError) {
    throw new Error(clubsError.message);
  }

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
      relationType: club.id === baseClubId ? null : (relationByDerivedId.get(club.id) ?? null),
    })),
  };
}

// Legacy local resolver kept for reference while the shared service handles runtime resolution.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function resolveParticipantClubForTournament(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tournament: TournamentContextRow,
  clubId: string,
): Promise<ClubContextRow> {
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
    return bestCandidate.club;
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
    categories: buildVariantCategories(baseClub.categories, requirements, targetSport),
  });

  if (!createResult.success || !createResult.club?.id) {
    throw new Error(createResult.error || 'No se pudo crear el club derivado automáticamente.');
  }

  const relationResult = await linkDerivedClub({
    baseClubId: baseClub.id,
    derivedClubId: createResult.club.id,
    derivativeType,
  });

  if (!relationResult.success) {
    throw new Error(relationResult.error || 'No se pudo vincular el club derivado.');
  }

  return {
    ...baseClub,
    ...createResult.club,
    sport_id: targetSport,
    sport: targetSport,
    categories: buildVariantCategories(baseClub.categories, requirements, targetSport),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tournamentId = (await params).id;
  const route = `/api/tournaments/${tournamentId}/participants`;
  const perf = createApiPerfTracker(route);
  try {
    const supabase = await perf.measureStep('create_client', () => createClient(), {
      bucket: 'client',
    });

    // Check if query param 'full' is set to return full participant data
    const { searchParams } = new URL(request.url);
    const full = searchParams.get('full') === 'true';
    const requestedSeasonId =
      searchParams.get('seasonId') ||
      searchParams.get('season_id') ||
      searchParams.get('season');
    let scopedSeasonId = requestedSeasonId?.trim() || null;
    if (!scopedSeasonId) {
      const { data: tournamentSeason } = await supabase
        .from('tournaments')
        .select('current_season_id')
        .eq('id', tournamentId)
        .maybeSingle();
      scopedSeasonId = tournamentSeason?.current_season_id ?? null;
    }
    perf.note({ full });

    // ─── FLASH SCORE SUPPORT ──────────────────────────────────────────────────
    const espnLeagueSlug = parseEspnAmericanFootballTournamentId(tournamentId);
    if (espnLeagueSlug) {
      const standings = await perf.measureStep(
        'load_espn_standings',
        async () => getEspnAmericanFootballLeagueStandings(espnLeagueSlug),
        {
          bucket: 'query',
          logQuery: true,
        },
      );
      const teamNames = standings.rows.map((row) => row.team_name).filter(Boolean);

      if (teamNames.length === 0) {
        return perf.json([]);
      }

      const { data: dbClubs, error: dbError } = await perf.measureStep(
        'load_espn_participant_clubs',
        async () => supabase
          .from('clubs')
          .select('id, name, short_name, logo_url')
          .or(`name.in.(${teamNames.map(n => `"${n.replace(/"/g, '""')}"`).join(',')})`),
        {
          bucket: 'query',
          logQuery: true,
        },
      );

      if (dbError) {
        console.error('[Participants API] Error searching clubs for ESPN:', dbError);
        return perf.json({ error: 'Database search failed' }, { status: 500 });
      }

      const clubs = (dbClubs || []).map(club => ({
        id: club.id,
        name: club.name,
        short_name: club.short_name,
        logo: serializeClubLogoUrl({ id: club.id, name: club.name, logo: club.logo_url }),
        externalId: null,
      }));

      if (full) {
        logOverfetchWarning({
          endpoint: route,
          reason: 'full=true returns expanded participant compatibility payload for ESPN',
        }, 'server');
        return perf.json(clubs.map(c => ({
          id: `espn-link-${c.id}`,
          club_id: c.id,
          division_id: null,
          status: 'active',
          clubs: {
            id: c.id,
            name: c.name,
            short_name: c.short_name,
            logo: c.logo,
            logo_url: c.logo,
          },
          division: null,
        })));
      }

      return perf.json(clubs);
    }

    if (tournamentId.toLowerCase().startsWith('fs-')) {
      const fsId = tournamentId.slice(3); // Remove 'fs-' prefix
      // Use the ID as stageId, which is commonly what's stored
      const stageId = searchParams.get('stageId') || fsId;
      const tournamentFsId = searchParams.get('tournamentId') || fsId;

      console.log(`[Participants API] Fetching FS participants for stage ${stageId}`);

      const standingsRes = await perf.measureStep(
        'load_flashscore_standings',
        async () => getTournamentStandings(tournamentFsId, stageId),
        {
          bucket: 'query',
          logQuery: true,
        },
      );
      const standings = Array.isArray(standingsRes?.DATA)
        ? (standingsRes.DATA as FlashscoreParticipantLike[])
        : [];

      // Extract all team names from standings
      const teamNames: string[] = [];
      const processStandings = (rows: FlashscoreParticipantLike[]) => {
        rows.forEach(row => {
          const team = row.team || row.participant || row;
          if (team?.name) {
            teamNames.push(team.name);
          }
        });
      };

      if (Array.isArray(standings)) {
        if (standings[0]?.rows) {
          // Grouped standings
          standings.forEach((group) => processStandings(group.rows || []));
        } else {
          // Flat standings
          processStandings(standings);
        }
      }

      if (teamNames.length === 0) {
        return perf.json([]);
      }

      // ─── SEARCH IN DATABASE ───────────────────────────────────────────────
      // We look for clubs that match either name OR the external_id
      const { data: dbClubs, error: dbError } = await perf.measureStep(
        'load_flashscore_participant_clubs',
        async () => supabase
          .from('clubs')
          .select('id, name, short_name, logo_url')
          .or(`name.in.(${teamNames.map(n => `"${n.replace(/"/g, '""')}"`).join(',')})`),
        {
          bucket: 'query',
          logQuery: true,
        },
      );

      if (dbError) {
        console.error('[Participants API] Error searching clubs:', dbError);
        return perf.json({ error: 'Database search failed' }, { status: 500 });
      }

      const clubs = (dbClubs || []).map(club => ({
        id: club.id,
        name: club.name,
        short_name: club.short_name,
        logo: serializeClubLogoUrl({ id: club.id, name: club.name, logo: club.logo_url }),
        externalId: null
      }));

      // In participants route, we return the same structure as before
      if (full) {
        // Mock the participant structure for compatibility
        logOverfetchWarning({
          endpoint: route,
          reason: 'full=true returns expanded participant compatibility payload for FlashScore',
        }, 'server');
        return perf.json(clubs.map(c => ({
          id: `fs-link-${c.id}`,
          club_id: c.id,
          division_id: null,
          status: 'active',
          clubs: {
            id: c.id,
            name: c.name,
            short_name: c.short_name,
            logo: c.logo,
            logo_url: c.logo
          },
          division: null,
        })));
      }

      return perf.json(clubs);
    }

    // ─── REGULAR SUPABASE SUPPORT ─────────────────────────────────────────────
    const supportsDivisionId = await perf.measureStep(
      'check_division_id_support',
      async () => supportsTournamentParticipantDivisionId(supabase),
      {
        bucket: 'query',
        logQuery: true,
      },
    );
    if (full) {
      logOverfetchWarning({
        endpoint: route,
        reason: 'full=true loads tournament_participants plus clubs and division relations',
      }, 'server');
    }

    // Optional pagination (additive, backward-compatible).
    // If neither `limit` nor `offset` is provided, behavior is unchanged: returns all rows.
    // Pagination only activates when a valid `limit` (positive integer) is present;
    // `offset` defaults to 0. Invalid values are ignored (fall back to returning all).
    const rawLimit = searchParams.get('limit');
    const rawOffset = searchParams.get('offset');
    const parsedLimit = rawLimit !== null ? Number(rawLimit) : null;
    const parsedOffset = rawOffset !== null ? Number(rawOffset) : null;
    const hasValidLimit = parsedLimit !== null && Number.isInteger(parsedLimit) && parsedLimit > 0;
    const paginationOffset =
      parsedOffset !== null && Number.isInteger(parsedOffset) && parsedOffset >= 0
        ? parsedOffset
        : 0;

    let participantListQuery = supabase
      .from('tournament_participants')
      .select(getTournamentParticipantSelectColumns(supportsDivisionId))
      .eq('tournament_id', tournamentId);

    if (scopedSeasonId) {
      participantListQuery = participantListQuery.eq('season_id', scopedSeasonId);
    }

    if (hasValidLimit) {
      participantListQuery = participantListQuery.range(
        paginationOffset,
        paginationOffset + parsedLimit - 1,
      );
    }

    const { data: participants, error } = await perf.measureStep(
      'load_tournament_participants',
      async () => participantListQuery.order('created_at', { ascending: false }),
      {
        bucket: 'query',
        logQuery: true,
      },
    );

    if (error) {
      console.error('Error fetching participants:', error);
      return perf.json(
        { error: 'Error fetching participants' },
        { status: 500 }
      );
    }

    const serializedParticipants = (participants || []).map(serializeParticipantRecord);

    // Return full participant data if requested, otherwise just club info
    if (full) {
      return perf.json(serializedParticipants);
    } else {
      const clubs = serializedParticipants
        .filter((participant) => participant.status === 'active' && participant.clubs)
        .map((participant) => ({
          id: participant.clubs?.id,
          name: participant.clubs?.name,
          short_name: participant.clubs?.short_name,
          logo: participant.clubs?.logo_url,
          division_id: supportsDivisionId ? participant.division_id ?? null : null,
          division_name: supportsDivisionId ? participant.division?.name ?? null : null,
        }));

      return perf.json(clubs);
    }
  } catch (error: unknown) {
    console.error('Error in GET /api/tournaments/[id]/participants:', error);
    return perf.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tournamentId = (await params).id;
    const { writer: supabase } = await requireTournamentMutationContext(tournamentId);
    const body = await request.json();
    const supportsDivisionId = await supportsTournamentParticipantDivisionId(supabase);
    let scopedSeasonId = String(body?.seasonId || body?.season_id || body?.season || '').trim() || null;
    if (!scopedSeasonId) {
      const { data: tournamentSeason } = await supabase
        .from('tournaments')
        .select('current_season_id')
        .eq('id', tournamentId)
        .maybeSingle();
      scopedSeasonId = tournamentSeason?.current_season_id ?? null;
    }

    // Validate required fields
    if (!body.name && !body.club_id) {
      console.error('[Participants API] Validation error: Either name or club_id is required');
      return NextResponse.json(
        { error: 'Se requiere un nombre o un club vinculado' },
        { status: 400 }
      );
    }

    let resolvedClub: ClubContextRow | null = null;
    let resolvedDivision: DivisionContextRow | null = null;
    const shouldResolveClubVariant =
      body.resolve_club_variant === true || body.resolveClubVariant === true;
    const requestedDivisionId = typeof body.division_id === 'string' ? body.division_id.trim() : '';

    if (supportsDivisionId && requestedDivisionId) {
      resolvedDivision = await loadDivisionContext(supabase, requestedDivisionId);

      if (!resolvedDivision) {
        return NextResponse.json(
          { error: 'El plantel seleccionado no existe en la base de datos' },
          { status: 400 }
        );
      }
    }

    const requestedClubId = String(body.club_id ?? resolvedDivision?.club_id ?? '').trim();

    if (requestedClubId) {
      if (shouldResolveClubVariant) {
        const { data: tournamentRow, error: tournamentError } = await supabase
          .from('tournaments')
          .select('*')
          .eq('id', tournamentId)
          .single();

        if (tournamentError || !tournamentRow) {
          return NextResponse.json(
            { error: 'No se pudo resolver el contexto del torneo para vincular el club.' },
            { status: 400 }
          );
        }

        resolvedClub = (await resolveParticipantClubForTournamentViaService(
          supabase,
          tournamentRow as TournamentContextRow,
          requestedClubId,
        )).club;
      } else {
        const { data: clubRow, error: clubError } = await supabase
          .from('clubs')
          .select('*')
          .eq('id', requestedClubId)
          .single();

        if (clubError || !clubRow) {
          return NextResponse.json(
            { error: 'El club seleccionado no existe en la base de datos' },
            { status: 400 }
          );
        }

        resolvedClub = clubRow as ClubContextRow;
      }
    }

    const finalClubId = resolvedClub?.id ?? (requestedClubId || null);

    if (supportsDivisionId && resolvedDivision && finalClubId && resolvedDivision.club_id !== finalClubId) {
      return NextResponse.json(
        { error: 'El plantel seleccionado no pertenece al club indicado' },
        { status: 400 }
      );
    }

    // Log the data being inserted for debugging
    const insertData = {
      tournament_id: tournamentId,
      season_id: scopedSeasonId,
      club_id: finalClubId,
      name: resolvedClub?.name ?? body.name ?? null,
      type: body.type ?? 'club',
      status: body.status ?? 'active',
      seed: body.seed ?? null,
      group_id: body.group_id ?? null,
      short_code: resolvedClub?.short_name ?? body.short_code ?? null,
      notes: body.notes ?? null,
      ...(supportsDivisionId ? { division_id: resolvedDivision?.id ?? null } : {}),
    };
    console.log('[Participants API] Inserting participant:', insertData);

    const participantsTable = supabase
      .from('tournament_participants') as unknown as TournamentParticipantsTableClient;

    const { data, error } = await participantsTable
      .insert(insertData)
      .select(getTournamentParticipantSelectColumns(supportsDivisionId))
      .single();

    if (error) {
      console.error('[Participants API] Error creating participant:', {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });

      // Provide user-friendly error messages
      let userMessage = error.message;
      if (error.code === '23505') {
        userMessage = 'Este participante ya está registrado en el torneo';
      } else if (error.code === '23503') {
        userMessage = 'El club seleccionado no existe en la base de datos';
      } else if (error.code === '23502') {
        userMessage = 'Faltan campos obligatorios. Por favor verifica el formulario';
      }

      return NextResponse.json({ error: userMessage }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json(
        { error: 'No se pudo crear el participante en el torneo' },
        { status: 500 },
      );
    }

    console.log('[Participants API] Participant created successfully:', data.id);
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('[Participants API] Unexpected error in POST:', error);
    return tournamentApiErrorResponse(error, 'Error interno del servidor');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tournamentId = (await params).id;
    const { writer: supabase } = await requireTournamentMutationContext(tournamentId);
    const { searchParams } = new URL(request.url);
    const participantId = searchParams.get('id');

    if (!participantId) {
      return NextResponse.json({ error: 'Missing participant ID' }, { status: 400 });
    }

    const body = await request.json();
    const supportsDivisionId = await supportsTournamentParticipantDivisionId(supabase);
    const shouldReplaceAcrossTournament =
      body.replace_across_tournament === true ||
      body.replaceAcrossTournament === true ||
      body.propagateToFixtureAndStandings === true;

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};
    let existingParticipant: TournamentParticipantUpdateContext | null = null;
    let standingsToReplace: TournamentStandingReplacementRow[] = [];
    let replacementClubForStats: { name: string; logo_url?: string | null } | null = null;

    if (body.division_id !== undefined || body.club_id !== undefined || shouldReplaceAcrossTournament) {
      const participantsTable = supabase
        .from('tournament_participants') as unknown as TournamentParticipantsTableClient;

      const { data: currentParticipant, error: currentParticipantError } = await participantsTable
        .select(supportsDivisionId
          ? 'id, tournament_id, season_id, club_id, division_id, name, short_code'
          : 'id, tournament_id, season_id, club_id, name, short_code')
        .eq('id', participantId)
        .single();

      if (currentParticipantError || !currentParticipant) {
        return NextResponse.json({ error: 'No se pudo cargar el participante actual' }, { status: 400 });
      }

      existingParticipant = currentParticipant as TournamentParticipantUpdateContext;

      if (existingParticipant.tournament_id !== tournamentId) {
        return NextResponse.json({ error: 'El participante no pertenece a este torneo' }, { status: 400 });
      }
    }

    if (body.name !== undefined) updateData.name = body.name;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.club_id !== undefined) updateData.club_id = body.club_id;
    if (body.seed !== undefined) updateData.seed = body.seed;
    if (body.group_id !== undefined) updateData.group_id = body.group_id;
    if (body.short_code !== undefined) updateData.short_code = body.short_code;
    if (body.notes !== undefined) updateData.notes = body.notes;

    if (supportsDivisionId) {
      if (body.division_id !== undefined) {
        const nextDivisionId = typeof body.division_id === 'string' ? body.division_id.trim() : '';

        if (nextDivisionId) {
          const nextDivision = await loadDivisionContext(supabase, nextDivisionId);
          const finalClubId = String(body.club_id ?? existingParticipant?.club_id ?? '').trim();

          if (!nextDivision) {
            return NextResponse.json({ error: 'El plantel seleccionado no existe en la base de datos' }, { status: 400 });
          }

          if (finalClubId && nextDivision.club_id !== finalClubId) {
            return NextResponse.json({ error: 'El plantel seleccionado no pertenece al club indicado' }, { status: 400 });
          }

          updateData.division_id = nextDivision.id;
        } else {
          updateData.division_id = null;
        }
      } else if (body.club_id !== undefined && existingParticipant?.division_id) {
        const currentDivision = await loadDivisionContext(supabase, existingParticipant.division_id);
        const nextClubId = String(body.club_id).trim();

        if (currentDivision && nextClubId && currentDivision.club_id !== nextClubId) {
          return NextResponse.json(
            { error: 'Debes limpiar o cambiar el plantel al modificar el club participante' },
            { status: 400 }
          );
        }
      }
    }

    if (shouldReplaceAcrossTournament) {
      if (!existingParticipant) {
        return NextResponse.json(
          { error: 'No se pudo cargar el participante actual para reemplazarlo en el torneo' },
          { status: 400 },
        );
      }

      const sourceClubId = String(existingParticipant.club_id || '').trim();
      const targetClubId = String(body.club_id || '').trim();

      if (!sourceClubId || !targetClubId) {
        return NextResponse.json(
          { error: 'La opcion de reemplazo completo solo esta disponible entre dos clubes vinculados' },
          { status: 400 },
        );
      }

      if (sourceClubId === targetClubId) {
        return NextResponse.json(
          { error: 'Selecciona un club distinto para reemplazar en todo el torneo' },
          { status: 400 },
        );
      }

      const replacementSeasonId = existingParticipant.season_id ?? null;
      let duplicateParticipantQuery = supabase
        .from('tournament_participants')
        .select('id, name')
        .eq('tournament_id', tournamentId)
        .eq('club_id', targetClubId)
        .neq('id', participantId)
        .limit(1);
      let sourceStandingsQuery = supabase
        .from('tournament_standings')
        .select('id, phase_id, group_id, stats')
        .eq('tournament_id', tournamentId)
        .eq('club_id', sourceClubId);
      let targetStandingsQuery = supabase
        .from('tournament_standings')
        .select('id, phase_id, group_id')
        .eq('tournament_id', tournamentId)
        .eq('club_id', targetClubId);
      let conflictingMatchesQuery = supabase
        .from('matches')
        .select('id')
        .eq('tournament_id', tournamentId)
        .or(`and(home_club_id.eq.${sourceClubId},away_club_id.eq.${targetClubId}),and(home_club_id.eq.${targetClubId},away_club_id.eq.${sourceClubId})`)
        .limit(1);

      if (replacementSeasonId) {
        duplicateParticipantQuery = duplicateParticipantQuery.eq('season_id', replacementSeasonId);
        sourceStandingsQuery = sourceStandingsQuery.eq('season_id', replacementSeasonId);
        targetStandingsQuery = targetStandingsQuery.eq('season_id', replacementSeasonId);
        conflictingMatchesQuery = conflictingMatchesQuery.eq('season_id', replacementSeasonId);
      }

      const [
        targetClubRes,
        duplicateParticipantRes,
        sourceStandingsRes,
        targetStandingsRes,
        conflictingMatchesRes,
      ] = await Promise.all([
        supabase
          .from('clubs')
          .select('id, name, short_name, logo_url')
          .eq('id', targetClubId)
          .single(),
        duplicateParticipantQuery,
        sourceStandingsQuery,
        targetStandingsQuery,
        conflictingMatchesQuery,
      ]);

      if (targetClubRes.error || !targetClubRes.data) {
        return NextResponse.json(
          { error: 'El club nuevo no existe en la base de datos' },
          { status: 400 },
        );
      }

      if (duplicateParticipantRes.error) {
        throw duplicateParticipantRes.error;
      }
      if ((duplicateParticipantRes.data || []).length > 0) {
        return NextResponse.json(
          { error: 'El club nuevo ya esta registrado como participante en este torneo' },
          { status: 409 },
        );
      }

      if (sourceStandingsRes.error) throw sourceStandingsRes.error;
      if (targetStandingsRes.error) throw targetStandingsRes.error;
      if (conflictingMatchesRes.error) throw conflictingMatchesRes.error;

      const targetStandingKeys = new Set(
        (targetStandingsRes.data || []).map((row) => `${row.phase_id || ''}::${row.group_id || ''}`),
      );
      const hasStandingConflict = (sourceStandingsRes.data || []).some((row) =>
        targetStandingKeys.has(`${row.phase_id || ''}::${row.group_id || ''}`),
      );

      if (hasStandingConflict) {
        return NextResponse.json(
          { error: 'No se puede reemplazar porque el club nuevo ya tiene una fila de tabla en la misma fase o grupo' },
          { status: 409 },
        );
      }

      if ((conflictingMatchesRes.data || []).length > 0) {
        return NextResponse.json(
          { error: 'No se puede reemplazar porque ya existe un partido entre el club anterior y el club nuevo en este torneo' },
          { status: 409 },
        );
      }

      standingsToReplace = (sourceStandingsRes.data || []) as TournamentStandingReplacementRow[];
      replacementClubForStats = {
        name: targetClubRes.data.name,
        logo_url: targetClubRes.data.logo_url ?? null,
      };
      updateData.club_id = targetClubId;
      updateData.name = body.name ?? targetClubRes.data.name;
      updateData.short_code = body.short_code ?? targetClubRes.data.short_name ?? existingParticipant.short_code ?? null;
    }

    const participantsTable = supabase
      .from('tournament_participants') as unknown as TournamentParticipantsTableClient;

    const { data, error } = await participantsTable
      .update(updateData)
      .eq('id', participantId)
      .select(getTournamentParticipantSelectColumns(supportsDivisionId))
      .single();

    if (error) {
      console.error('Error updating participant:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (shouldReplaceAcrossTournament && existingParticipant?.club_id && data?.club_id) {
      const sourceClubId = existingParticipant.club_id;
      const targetClubId = data.club_id;
      const replacementSeasonId = existingParticipant.season_id ?? null;
      const replacementTeamName = replacementClubForStats?.name ?? data.name ?? 'Equipo';
      const replacementTeamLogo = replacementClubForStats?.logo_url ?? data.clubs?.logo_url ?? null;
      const standingsUpdates = standingsToReplace.map((row) =>
        supabase
          .from('tournament_standings')
          .update({
            club_id: targetClubId,
            stats: {
              ...(row.stats ?? {}),
              team_name: replacementTeamName,
              team_logo: replacementTeamLogo,
            },
          })
          .eq('id', row.id)
      );

      let homeUpdateQuery = supabase
        .from('matches')
        .update({ home_club_id: targetClubId })
        .eq('tournament_id', tournamentId)
        .eq('home_club_id', sourceClubId);
      let awayUpdateQuery = supabase
        .from('matches')
        .update({ away_club_id: targetClubId })
        .eq('tournament_id', tournamentId)
        .eq('away_club_id', sourceClubId);
      let incidentsUpdateQuery = supabase
        .from('discipline_incidents')
        .update({ club_id: targetClubId })
        .eq('tournament_id', tournamentId)
        .eq('club_id', sourceClubId);

      if (replacementSeasonId) {
        homeUpdateQuery = homeUpdateQuery.eq('season_id', replacementSeasonId);
        awayUpdateQuery = awayUpdateQuery.eq('season_id', replacementSeasonId);
        incidentsUpdateQuery = incidentsUpdateQuery.eq('season_id', replacementSeasonId);
      }

      const [homeUpdate, awayUpdate, incidentsUpdate, ...standingUpdateResults] = await Promise.all([
        homeUpdateQuery,
        awayUpdateQuery,
        incidentsUpdateQuery,
        ...standingsUpdates,
      ]);

      const standingUpdateError = standingUpdateResults.map((result) => result.error).find(Boolean);
      const propagationError = [homeUpdate.error, awayUpdate.error, standingUpdateError].find(Boolean);
      if (propagationError) {
        console.error('[Participants API] Error propagating club replacement:', propagationError);
        return NextResponse.json({ error: propagationError.message }, { status: 500 });
      }

      if (incidentsUpdate.error && !isMissingTableError(incidentsUpdate.error, 'discipline_incidents')) {
        console.error('[Participants API] Error propagating discipline incidents replacement:', incidentsUpdate.error);
        return NextResponse.json({ error: incidentsUpdate.error.message }, { status: 500 });
      }
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    return tournamentApiErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tournamentId = (await params).id;
    const { writer: supabase } = await requireTournamentMutationContext(tournamentId);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing participant ID' }, { status: 400 });
    }

    const { error } = await (supabase as any)
      .from('tournament_participants')
      .delete()
      .eq('id', id)
      .eq('tournament_id', tournamentId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return tournamentApiErrorResponse(error);
  }
}
