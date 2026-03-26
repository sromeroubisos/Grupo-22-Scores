import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClub, linkDerivedClub } from '@/lib/services/clubService';
import { getTournamentStandings } from '@/lib/services/flashscore';
import { resolveParticipantClubForTournament as resolveParticipantClubForTournamentViaService } from '@/lib/services/tournamentClubDerivationService';
import {
  canonicalizeSportId,
  getClubSportValue,
  getSportDisplayName,
  type ClubDerivativeType,
} from '@/lib/clubDerivatives';
import { resolveTournamentAudience, type TournamentAudience } from '@/lib/utils/tournamentAudience';
import { normalizeSlug } from '@/lib/utils/normalize';

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
  try {
    const supabase = await createClient();
    const tournamentId = (await params).id;

    // Check if query param 'full' is set to return full participant data
    const { searchParams } = new URL(request.url);
    const full = searchParams.get('full') === 'true';

    // ─── FLASH SCORE SUPPORT ──────────────────────────────────────────────────
    if (tournamentId.toLowerCase().startsWith('fs-')) {
      const fsId = tournamentId.slice(3); // Remove 'fs-' prefix
      // Use the ID as stageId, which is commonly what's stored
      const stageId = searchParams.get('stageId') || fsId;
      const tournamentFsId = searchParams.get('tournamentId') || fsId;

      console.log(`[Participants API] Fetching FS participants for stage ${stageId}`);

      const standingsRes = await getTournamentStandings(tournamentFsId, stageId);
      const standings = standingsRes?.DATA || [];

      // Extract all team names from standings
      const teamNames: string[] = [];
      const teamIdMap: Record<string, string> = {}; // Name -> FS ID

      const processStandings = (rows: any[]) => {
        rows.forEach(row => {
          const team = row.team || row.participant || row;
          if (team?.name) {
            teamNames.push(team.name);
            if (team.id || team.team_id) {
              teamIdMap[team.name] = String(team.id || team.team_id);
            }
          }
        });
      };

      if (Array.isArray(standings)) {
        if (standings[0]?.rows) {
          // Grouped standings
          standings.forEach((g: any) => processStandings(g.rows || []));
        } else {
          // Flat standings
          processStandings(standings);
        }
      }

      if (teamNames.length === 0) {
        return NextResponse.json([]);
      }

      // ─── SEARCH IN DATABASE ───────────────────────────────────────────────
      // We look for clubs that match either name OR the external_id
      const { data: dbClubs, error: dbError } = await supabase
        .from('clubs')
        .select('id, name, short_name, logo_url')
        .or(`name.in.(${teamNames.map(n => `"${n.replace(/"/g, '""')}"`).join(',')})`);

      if (dbError) {
        console.error('[Participants API] Error searching clubs:', dbError);
        return NextResponse.json({ error: 'Database search failed' }, { status: 500 });
      }

      const clubs = (dbClubs || []).map(club => ({
        id: club.id,
        name: club.name,
        short_name: club.short_name,
        logo: club.logo_url,
        externalId: null
      }));

      // In participants route, we return the same structure as before
      if (full) {
        // Mock the participant structure for compatibility
        return NextResponse.json(clubs.map(c => ({
          id: `fs-link-${c.id}`,
          club_id: c.id,
          status: 'active',
          clubs: {
            id: c.id,
            name: c.name,
            short_name: c.short_name,
            logo: c.logo
          }
        })));
      }

      return NextResponse.json(clubs);
    }

    // ─── REGULAR SUPABASE SUPPORT ─────────────────────────────────────────────
    const { data: participants, error } = await supabase
      .from('tournament_participants')
      .select(`
        id,
        tournament_id,
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
      `)
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching participants:', error);
      return NextResponse.json(
        { error: 'Error fetching participants' },
        { status: 500 }
      );
    }

    // Return full participant data if requested, otherwise just club info
    if (full) {
      return NextResponse.json(participants || []);
    } else {
      const clubs = (participants || [])
        .filter((p: any) => p.status === 'active' && p.clubs)
        .map((p: any) => ({
          id: p.clubs.id,
          name: p.clubs.name,
          short_name: p.clubs.short_name,
          logo: p.clubs.logo_url,
        }));

      return NextResponse.json(clubs);
    }
  } catch (error: any) {
    console.error('Error in GET /api/tournaments/[id]/participants:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const tournamentId = (await params).id;
    const body = await request.json();

    // Validate required fields
    if (!body.name && !body.club_id) {
      console.error('[Participants API] Validation error: Either name or club_id is required');
      return NextResponse.json(
        { error: 'Se requiere un nombre o un club vinculado' },
        { status: 400 }
      );
    }

    let resolvedClub: ClubContextRow | null = null;

    if (body.club_id) {
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
        String(body.club_id),
      )).club;
    }

    // Log the data being inserted for debugging
    const insertData = {
      tournament_id: tournamentId,
      club_id: resolvedClub?.id || body.club_id || null,
      name: resolvedClub?.name || body.name,
      type: body.type || 'club',
      status: body.status || 'active',
      seed: body.seed || null,
      group_id: body.group_id || null,
      short_code: resolvedClub?.short_name || body.short_code || null,
      notes: body.notes || null,
    };
    console.log('[Participants API] Inserting participant:', insertData);

    const { data, error } = await supabase
      .from('tournament_participants')
      .insert(insertData)
      .select(`
        id,
        tournament_id,
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
      `)
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

    console.log('[Participants API] Participant created successfully:', data.id);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[Participants API] Unexpected error in POST:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const participantId = searchParams.get('id');

    if (!participantId) {
      return NextResponse.json({ error: 'Missing participant ID' }, { status: 400 });
    }

    const body = await request.json();

    // Build update object with only provided fields
    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.club_id !== undefined) updateData.club_id = body.club_id;
    if (body.seed !== undefined) updateData.seed = body.seed;
    if (body.group_id !== undefined) updateData.group_id = body.group_id;
    if (body.short_code !== undefined) updateData.short_code = body.short_code;
    if (body.notes !== undefined) updateData.notes = body.notes;

    const { data, error } = await supabase
      .from('tournament_participants')
      .update(updateData)
      .eq('id', participantId)
      .select(`
        id,
        tournament_id,
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
      `)
      .single();

    if (error) {
      console.error('Error updating participant:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing participant ID' }, { status: 400 });
    }

    const { error } = await supabase
      .from('tournament_participants')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
