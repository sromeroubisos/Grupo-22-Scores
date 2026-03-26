const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

const YOUTH_PATTERNS = [
  /\bjuv(?:enil(?:es)?)?\b/i,
  /\b(?:u|m)\s*-?\s*\d{1,2}\b/i,
  /\bsub\s*-?\s*\d{1,2}\b/i,
  /\binfantil(?:es)?\b/i,
  /\bcadete(?:s)?\b/i,
  /\bmenores?\b/i,
  /\bformativas?\b/i,
];

const ADULT_PATTERNS = [
  /\bmayores?\b/i,
  /\badult(?:s)?\b/i,
  /\bsenior(?:es)?\b/i,
  /\bprimera\b/i,
  /\breserva\b/i,
  /\bveteran(?:o|os|a|as)\b/i,
  /\bsuperior\b/i,
];

const VARIANT_CATEGORY_PREFIXES = ['gender:', 'age_grade:', 'audience:', 'variant:', 'sport:'];

const SPORT_NAME_MAP = {
  rugby: 'Rugby',
  hockey: 'Hockey',
  basketball: 'Basquet',
  handball: 'Handball',
  volleyball: 'Voley',
  futsal: 'Futsal',
  football: 'Futbol',
  soccer: 'Futbol',
  tennis: 'Tenis',
};

function parseArgs(argv) {
  const options = {
    apply: false,
    clubFilter: null,
    tournamentId: null,
    limit: null,
    scope: 'sport',
  };

  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (arg.startsWith('--club=')) {
      options.clubFilter = arg.slice('--club='.length).trim() || null;
      continue;
    }

    if (arg.startsWith('--tournament=')) {
      options.tournamentId = arg.slice('--tournament='.length).trim() || null;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const parsed = Number(arg.slice('--limit='.length));
      options.limit = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      continue;
    }

    if (arg.startsWith('--scope=')) {
      const scope = arg.slice('--scope='.length).trim().toLowerCase();
      options.scope = scope === 'all' ? 'all' : 'sport';
    }
  }

  return options;
}

function normalizeSlug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function canonicalizeSportId(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return null;
  if (value === 'field-hockey') return 'hockey';
  return value;
}

function getSportDisplayName(raw) {
  const canonical = canonicalizeSportId(raw);
  if (!canonical) return '';
  return SPORT_NAME_MAP[canonical] || canonical;
}

function getCategoryValue(categories, prefix) {
  const normalizedPrefix = `${String(prefix).trim().toLowerCase()}:`;
  const entry = (Array.isArray(categories) ? categories : []).find((category) =>
    String(category).trim().toLowerCase().startsWith(normalizedPrefix),
  );

  if (!entry) {
    return null;
  }

  return entry.slice(entry.indexOf(':') + 1).trim() || null;
}

function isMissingClubDerivativesTableError(error) {
  const message = String(error?.message || '');
  return message.includes('club_derivatives') && (
    message.includes('schema cache') ||
    message.includes('does not exist') ||
    message.includes('Could not find the table')
  );
}

function isMissingClubCategoriesColumnError(error) {
  const message = String(error?.message || '');
  return message.includes('categories') && (
    message.includes('does not exist') ||
    message.includes('schema cache')
  );
}

function getClubSportValue(club) {
  return canonicalizeSportId(
    club?.sport_id ||
      club?.sport ||
      getCategoryValue(club?.categories, 'sport'),
  );
}

function normalizeGenderValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (MIXED_PATTERNS.some((pattern) => pattern.test(text))) return 'Mixto';
  if (FEMALE_PATTERNS.some((pattern) => pattern.test(text))) return 'Femenino';
  if (MALE_PATTERNS.some((pattern) => pattern.test(text))) return 'Masculino';
  return null;
}

function inferTournamentGender(tournament) {
  const hints = [tournament?.display_name, tournament?.name, tournament?.category]
    .filter((value) => typeof value === 'string' && value.trim().length > 0);

  for (const hint of hints) {
    const gender = normalizeGenderValue(hint);
    if (gender) return gender;
  }

  return null;
}

function resolveTournamentAudience(input) {
  const hints = [
    input?.ageGrade,
    input?.category,
    input?.name,
    input?.displayName,
    input?.originalName,
    ...(Array.isArray(input?.categories) ? input.categories : []),
  ].filter((value) => typeof value === 'string' && value.trim().length > 0);

  if (hints.some((hint) => YOUTH_PATTERNS.some((pattern) => pattern.test(hint)))) {
    return 'juveniles';
  }

  if (hints.some((hint) => ADULT_PATTERNS.some((pattern) => pattern.test(hint)))) {
    return 'mayores';
  }

  return 'mayores';
}

function readClubVariantMetadata(club, relationType) {
  const genderValue = getCategoryValue(club?.categories, 'gender');
  const ageGradeValue = getCategoryValue(club?.categories, 'age_grade');
  const audienceValue = getCategoryValue(club?.categories, 'audience');

  const gender = genderValue
    ? normalizeGenderValue(genderValue)
    : relationType === 'women'
      ? 'Femenino'
      : null;

  const ageGrade = ageGradeValue ? ageGradeValue.toUpperCase() : null;
  const audience = audienceValue === 'juveniles' || audienceValue === 'mayores'
    ? audienceValue
    : ageGrade
      ? resolveTournamentAudience({ ageGrade })
      : relationType === 'youth'
        ? 'juveniles'
        : null;

  return {
    gender,
    ageGrade,
    audience,
  };
}

function inferRelationTypeFromCategories(club, baseClub) {
  if (!club || !baseClub || club.id === baseClub.id) {
    return null;
  }

  const sport = getClubSportValue(club);
  const baseSport = getClubSportValue(baseClub);
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

function normalizeClubFamilyStem(name) {
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

function isLikelySameClubFamily(referenceClub, candidateClub) {
  if (!referenceClub || !candidateClub) {
    return false;
  }

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

function pickHeuristicBaseClub(clubs) {
  return [...clubs]
    .sort((left, right) => {
      const leftHasSuffix = normalizeClubFamilyStem(left.name) !== normalizeSlug(left.name);
      const rightHasSuffix = normalizeClubFamilyStem(right.name) !== normalizeSlug(right.name);

      if (leftHasSuffix !== rightHasSuffix) {
        return leftHasSuffix ? 1 : -1;
      }

      return normalizeSlug(left.name).length - normalizeSlug(right.name).length;
    })[0] || null;
}

async function loadHeuristicFamilyCandidates(supabaseClient, currentClub) {
  let query = supabaseClient
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

  return (Array.isArray(data) ? data : []).filter((candidateClub) => isLikelySameClubFamily(currentClub, candidateClub));
}

function buildTournamentRequirements(tournament) {
  return {
    sport: canonicalizeSportId(tournament?.sport_id),
    gender: inferTournamentGender(tournament),
    ageGrade: String(tournament?.age_grade ?? '').trim() || null,
    audience: resolveTournamentAudience({
      ageGrade: tournament?.age_grade,
      category: tournament?.category,
      name: tournament?.name,
      displayName: tournament?.display_name,
    }),
  };
}

function getCandidateScore(club, relationType, requirements) {
  const metadata = readClubVariantMetadata(club, relationType);
  const sport = getClubSportValue(club);

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

function buildVariantCategories(baseCategories, requirements, targetSport, baseClubId) {
  const preserved = (Array.isArray(baseCategories) ? baseCategories : []).filter((category) => {
    const normalized = String(category).trim().toLowerCase();
    return !VARIANT_CATEGORY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  });

  const tokens = new Set(preserved);
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

  if (baseClubId) {
    tokens.add(`base_club:${baseClubId}`);
  }

  return Array.from(tokens);
}

function asSingleRecord(value) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value || null;
}

async function ensureUniqueClubId(supabaseClient, baseLabel) {
  const normalizedBase = normalizeSlug(baseLabel) || `club-${Date.now()}`;
  let candidate = normalizedBase;

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const { data, error } = await supabaseClient
      .from('clubs')
      .select('id, slug')
      .or(`id.eq.${candidate},slug.eq.${candidate}`)
      .limit(1);

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      return candidate;
    }

    candidate = `${normalizedBase}-${attempt + 2}`;
  }

  return `${normalizedBase}-${Date.now()}`;
}

async function loadClubFamily(supabaseClient, clubId) {
  const { data: currentClubData, error: currentClubError } = await supabaseClient
    .from('clubs')
    .select('*')
    .eq('id', clubId)
    .single();

  if (currentClubError || !currentClubData) {
    throw new Error(currentClubError?.message || `Club ${clubId} not found`);
  }

  const currentClub = currentClubData;
  let baseClubId = getCategoryValue(currentClub.categories, 'base_club') || clubId;
  let relationRows = [];

  const { data: incomingRelation, error: incomingError } = await supabaseClient
    .from('club_derivatives')
    .select('base_club_id')
    .eq('derived_club_id', clubId)
    .maybeSingle();

  if (!incomingError && incomingRelation?.base_club_id) {
    baseClubId = incomingRelation.base_club_id;
  } else if (incomingError && !isMissingClubDerivativesTableError(incomingError)) {
    throw new Error(incomingError.message);
  }

  const { data: outgoingRelations, error: outgoingError } = await supabaseClient
    .from('club_derivatives')
    .select('base_club_id, derived_club_id, derivative_type')
    .eq('base_club_id', baseClubId);

  if (!outgoingError) {
    relationRows = Array.isArray(outgoingRelations) ? outgoingRelations : [];
  } else if (!isMissingClubDerivativesTableError(outgoingError)) {
    throw new Error(outgoingError.message);
  }

  let categoryDerivedRows = [];
  const { data: categoryDerivedClubs, error: categoryDerivedError } = await supabaseClient
    .from('clubs')
    .select('*')
    .contains('categories', [`base_club:${baseClubId}`]);

  if (!categoryDerivedError) {
    categoryDerivedRows = Array.isArray(categoryDerivedClubs) ? categoryDerivedClubs : [];
  } else if (!isMissingClubCategoriesColumnError(categoryDerivedError)) {
    throw new Error(categoryDerivedError.message);
  }

  const heuristicCandidates = relationRows.length === 0 && categoryDerivedRows.length === 0
    ? await loadHeuristicFamilyCandidates(supabaseClient, currentClub)
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

  const { data: candidateClubs, error: clubsError } = await supabaseClient
    .from('clubs')
    .select('*')
    .in('id', candidateIds);

  if (clubsError) {
    throw new Error(clubsError.message);
  }

  const clubs = Array.isArray(candidateClubs) ? candidateClubs : [];
  const relationByDerivedId = new Map(relationRows.map((row) => [row.derived_club_id, row.derivative_type]));
  const baseClub = clubs.find((club) => club.id === baseClubId);

  if (!baseClub) {
    throw new Error(`Base club not found for ${clubId}`);
  }

  return {
    baseClub,
    candidates: clubs.map((club) => ({
      club,
      relationType: club.id === baseClubId
        ? null
        : relationByDerivedId.get(club.id) || inferRelationTypeFromCategories(club, baseClub),
    })),
  };
}

async function createDerivedClub(supabaseClient, baseClub, tournament, requirements, targetSport, derivativeType) {
  const suffixes = [
    targetSport !== getClubSportValue(baseClub) ? getSportDisplayName(targetSport) : null,
    requirements.gender && requirements.gender !== 'Masculino' ? requirements.gender : null,
    requirements.audience === 'juveniles' ? (requirements.ageGrade || 'Juvenil') : null,
  ].filter((value) => typeof value === 'string' && value.trim().length > 0);

  const dedupedSuffixes = suffixes.filter((suffix, index) => {
    const normalized = normalizeSlug(suffix);
    return index === suffixes.findIndex((candidate) => normalizeSlug(candidate) === normalized);
  });

  const derivedName = [baseClub.name, ...dedupedSuffixes].join(' ').trim();
  const derivedId = await ensureUniqueClubId(supabaseClient, derivedName);
  const categories = buildVariantCategories(baseClub.categories, requirements, targetSport, baseClub.id);

  const insertPayload = {
    id: derivedId,
    slug: derivedId,
    name: derivedName,
    short_name: baseClub.short_name || null,
    country: baseClub.country || tournament.country || 'ARG',
    region: baseClub.region || null,
    city: baseClub.city || null,
    union_id: tournament.union_id || baseClub.union_id || null,
    logo_url: baseClub.logo_url || null,
    primary_color: baseClub.primary_color || null,
    is_visible: baseClub.is_visible !== false,
    categories,
    sport: targetSport,
    sport_id: targetSport,
  };

  let insertResult = await supabaseClient
    .from('clubs')
    .insert(insertPayload)
    .select('*')
    .single();

  if (
    insertResult.error &&
    (
      insertResult.error.message.includes('column "categories"') ||
      (insertResult.error.message.includes('categories') && insertResult.error.message.includes('does not exist')) ||
      insertResult.error.message.includes('column "sport_id"') ||
      insertResult.error.message.includes('column "sport"') ||
      insertResult.error.message.includes('schema cache')
    )
  ) {
    const fallbackPayload = { ...insertPayload };
    delete fallbackPayload.categories;
    delete fallbackPayload.sport_id;
    delete fallbackPayload.sport;

    insertResult = await supabaseClient
      .from('clubs')
      .insert(fallbackPayload)
      .select('*')
      .single();
  }

  if (insertResult.error || !insertResult.data) {
    throw new Error(insertResult.error?.message || `Could not create derived club for ${baseClub.id}`);
  }

  const relationResult = await supabaseClient
    .from('club_derivatives')
    .upsert(
      {
        base_club_id: baseClub.id,
        derived_club_id: insertResult.data.id,
        derivative_type: derivativeType,
      },
      { onConflict: 'base_club_id,derived_club_id' },
    );

  if (relationResult.error && !isMissingClubDerivativesTableError(relationResult.error)) {
    throw new Error(relationResult.error.message);
  }

  return {
    ...insertResult.data,
    sport: targetSport,
    sport_id: targetSport,
    categories,
  };
}

async function resolveParticipantClubForTournament(supabaseClient, tournament, clubId) {
  const requirements = buildTournamentRequirements(tournament);
  const { baseClub, candidates } = await loadClubFamily(supabaseClient, clubId);

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
      baseClub,
      requirements,
    };
  }

  const baseSport = getClubSportValue(baseClub);
  const targetSport = requirements.sport || baseSport || 'rugby';
  const derivativeType = targetSport !== baseSport
    ? 'other_sport'
    : requirements.gender === 'Femenino'
      ? 'women'
      : 'youth';

  const derivedClub = await createDerivedClub(
    supabaseClient,
    baseClub,
    tournament,
    requirements,
    targetSport,
    derivativeType,
  );

  return {
    club: derivedClub,
    mode: 'created',
    derivativeType,
    baseClub,
    requirements,
  };
}

async function findMultiSportClubIds(supabaseClient) {
  const pageSize = 1000;
  const byClub = new Map();

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseClient
      .from('tournament_participants')
      .select(`
        club_id,
        tournaments:tournament_id (
          sport_id
        )
      `)
      .not('club_id', 'is', null)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      const tournament = asSingleRecord(row.tournaments);
      const clubId = row.club_id ? String(row.club_id) : null;
      const sport = canonicalizeSportId(tournament?.sport_id || null);

      if (!clubId || !sport) {
        continue;
      }

      const entry = byClub.get(clubId) || new Set();
      entry.add(sport);
      byClub.set(clubId, entry);
    }

    if (data.length < pageSize) {
      break;
    }
  }

  return new Set(
    [...byClub.entries()]
      .filter(([, sports]) => sports.size > 1)
      .map(([clubId]) => clubId),
  );
}

async function fetchAllParticipants(supabaseClient, options, candidateClubIds) {
  const pageSize = 500;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabaseClient
      .from('tournament_participants')
      .select(`
        id,
        tournament_id,
        club_id,
        name,
        short_code,
        status,
        group_id,
        tournaments:tournament_id (
          id,
          name,
          display_name,
          category,
          age_grade,
          sport_id,
          union_id,
          country
        ),
        clubs:club_id (
          *
        )
      `)
      .not('club_id', 'is', null)
      .order('tournament_id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (options.tournamentId) {
      query = query.eq('tournament_id', options.tournamentId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);

    if (data.length < pageSize) {
      break;
    }
  }

  const clubFilterSlug = options.clubFilter ? normalizeSlug(options.clubFilter) : null;

  return rows.filter((participant) => {
    const club = asSingleRecord(participant.clubs);
    const tournament = asSingleRecord(participant.tournaments);

    if (!club || !tournament || !participant.club_id) {
      return false;
    }

    if (candidateClubIds && candidateClubIds.size > 0 && !candidateClubIds.has(String(participant.club_id))) {
      return false;
    }

    if (!clubFilterSlug) {
      return true;
    }

    const haystack = [
      participant.club_id,
      club.id,
      club.name,
      club.short_name,
      participant.name,
      tournament.name,
      tournament.display_name,
    ]
      .map((value) => normalizeSlug(value))
      .filter(Boolean);

    return haystack.some((value) => value.includes(clubFilterSlug));
  });
}

function shouldHandleResolvedChange(result, options) {
  if (options.scope === 'all') {
    return true;
  }

  return result.derivativeType === 'other_sport';
}

async function countRows(queryPromise) {
  const { count, error } = await queryPromise;
  if (error) {
    throw new Error(error.message);
  }

  return count || 0;
}

async function buildMigrationPlan(supabaseClient, participant, resolved) {
  const sourceClubId = String(participant.club_id);
  const targetClubId = String(resolved.club.id);
  const tournamentId = String(participant.tournament_id);

  const [
    targetParticipantRes,
    sourceStandingsRes,
    targetStandingsRes,
    conflictingMatchesRes,
    homeMatchCount,
    awayMatchCount,
    incidentsCount,
  ] = await Promise.all([
    supabaseClient
      .from('tournament_participants')
      .select('id, club_id')
      .eq('tournament_id', tournamentId)
      .eq('club_id', targetClubId)
      .neq('id', participant.id),
    supabaseClient
      .from('tournament_standings')
      .select('id, phase_id, group_id')
      .eq('tournament_id', tournamentId)
      .eq('club_id', sourceClubId),
    supabaseClient
      .from('tournament_standings')
      .select('id, phase_id, group_id')
      .eq('tournament_id', tournamentId)
      .eq('club_id', targetClubId),
    supabaseClient
      .from('matches')
      .select('id')
      .eq('tournament_id', tournamentId)
      .or(`and(home_club_id.eq.${sourceClubId},away_club_id.eq.${targetClubId}),and(home_club_id.eq.${targetClubId},away_club_id.eq.${sourceClubId})`),
    countRows(
      supabaseClient
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .eq('home_club_id', sourceClubId),
    ),
    countRows(
      supabaseClient
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .eq('away_club_id', sourceClubId),
    ),
    countRows(
      supabaseClient
        .from('discipline_incidents')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .eq('club_id', sourceClubId),
    ),
  ]);

  if (targetParticipantRes.error) {
    throw new Error(targetParticipantRes.error.message);
  }

  if (sourceStandingsRes.error) {
    throw new Error(sourceStandingsRes.error.message);
  }

  if (targetStandingsRes.error) {
    throw new Error(targetStandingsRes.error.message);
  }

  if (conflictingMatchesRes.error) {
    throw new Error(conflictingMatchesRes.error.message);
  }

  const targetParticipant = (targetParticipantRes.data || [])[0] || null;
  const sourceStandings = Array.isArray(sourceStandingsRes.data) ? sourceStandingsRes.data : [];
  const targetStandings = Array.isArray(targetStandingsRes.data) ? targetStandingsRes.data : [];
  const conflictingMatches = Array.isArray(conflictingMatchesRes.data) ? conflictingMatchesRes.data : [];

  const targetStandingsKeys = new Set(
    targetStandings.map((row) => `${row.phase_id || ''}::${row.group_id || ''}`),
  );

  const standingsConflict = sourceStandings.some((row) =>
    targetStandingsKeys.has(`${row.phase_id || ''}::${row.group_id || ''}`),
  );

  const conflicts = [];

  if (targetParticipant) {
    conflicts.push('existing_participant');
  }

  if (standingsConflict) {
    conflicts.push('existing_standings');
  }

  if (conflictingMatches.length > 0) {
    conflicts.push('source_target_match_collision');
  }

  return {
    participant,
    resolved,
    conflicts,
    counts: {
      homeMatches: homeMatchCount,
      awayMatches: awayMatchCount,
      standings: sourceStandings.length,
      incidents: incidentsCount,
    },
  };
}

async function applyMigrationPlan(supabaseClient, plan) {
  const sourceClubId = String(plan.participant.club_id);
  const targetClubId = String(plan.resolved.club.id);
  const tournamentId = String(plan.participant.tournament_id);

  const participantUpdate = await supabaseClient
    .from('tournament_participants')
    .update({
      club_id: targetClubId,
      name: plan.resolved.club.name,
      short_code: plan.resolved.club.short_name || plan.participant.short_code || null,
    })
    .eq('id', plan.participant.id);

  if (participantUpdate.error) {
    throw new Error(participantUpdate.error.message);
  }

  const [homeUpdate, awayUpdate, standingsUpdate, incidentsUpdate] = await Promise.all([
    supabaseClient
      .from('matches')
      .update({ home_club_id: targetClubId })
      .eq('tournament_id', tournamentId)
      .eq('home_club_id', sourceClubId),
    supabaseClient
      .from('matches')
      .update({ away_club_id: targetClubId })
      .eq('tournament_id', tournamentId)
      .eq('away_club_id', sourceClubId),
    supabaseClient
      .from('tournament_standings')
      .update({ club_id: targetClubId })
      .eq('tournament_id', tournamentId)
      .eq('club_id', sourceClubId),
    supabaseClient
      .from('discipline_incidents')
      .update({ club_id: targetClubId })
      .eq('tournament_id', tournamentId)
      .eq('club_id', sourceClubId),
  ]);

  for (const result of [homeUpdate, awayUpdate, standingsUpdate, incidentsUpdate]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }
}

function formatScope(plan) {
  const sport = canonicalizeSportId(plan.resolved.requirements.sport);
  const gender = plan.resolved.requirements.gender;
  const age = plan.resolved.requirements.ageGrade;

  return [sport, gender, age].filter(Boolean).join(' / ') || 'base';
}

function printPlanEntry(plan) {
  const tournament = asSingleRecord(plan.participant.tournaments);
  const sourceClub = asSingleRecord(plan.participant.clubs);
  const derivativeState = plan.resolved.mode === 'created' ? 'create' : 'reuse';
  const conflictLabel = plan.conflicts.length > 0 ? ` conflicts=${plan.conflicts.join(',')}` : '';

  console.log(
    `- ${tournament?.display_name || tournament?.name || plan.participant.tournament_id}: ` +
    `${sourceClub?.name || plan.participant.name || plan.participant.club_id} -> ${plan.resolved.club.name} ` +
    `[${formatScope(plan)} | ${derivativeState}:${plan.resolved.derivativeType || 'base'}]` +
    ` matches=${plan.counts.homeMatches + plan.counts.awayMatches} standings=${plan.counts.standings}${conflictLabel}`,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log(
    `Backfill mode=${options.apply ? 'apply' : 'dry-run'} scope=${options.scope}` +
      `${options.clubFilter ? ` club=${options.clubFilter}` : ''}` +
      `${options.tournamentId ? ` tournament=${options.tournamentId}` : ''}` +
      `${options.limit ? ` limit=${options.limit}` : ''}`,
  );

  const candidateClubIds = options.scope === 'sport' && !options.clubFilter
    ? await findMultiSportClubIds(supabase)
    : null;
  const participants = await fetchAllParticipants(supabase, options, candidateClubIds);
  console.log(`Loaded ${participants.length} participant rows`);

  const plans = [];
  let processed = 0;

  for (const participant of participants) {
    processed += 1;

    if (processed % 25 === 0) {
      console.log(`Processed ${processed}/${participants.length} participants`);
    }

    const tournament = asSingleRecord(participant.tournaments);
    const club = asSingleRecord(participant.clubs);

    if (!tournament || !club || !participant.club_id) {
      continue;
    }

    const resolved = await resolveParticipantClubForTournament(
      supabase,
      tournament,
      String(participant.club_id),
    );

    if (String(resolved.club.id) === String(participant.club_id)) {
      continue;
    }

    if (!shouldHandleResolvedChange(resolved, options)) {
      continue;
    }

    const plan = await buildMigrationPlan(supabase, participant, resolved);
    plans.push(plan);

    if (options.limit && plans.length >= options.limit) {
      break;
    }
  }

  const actionablePlans = plans.filter((plan) => plan.conflicts.length === 0);
  const skippedPlans = plans.filter((plan) => plan.conflicts.length > 0);

  console.log(`\nPlanned migrations: ${plans.length}`);
  console.log(`Actionable: ${actionablePlans.length}`);
  console.log(`Skipped for conflicts: ${skippedPlans.length}`);

  const preview = plans.slice(0, 50);
  if (preview.length > 0) {
    console.log('\nPreview:');
    preview.forEach(printPlanEntry);
  }

  if (plans.length > preview.length) {
    console.log(`... and ${plans.length - preview.length} more`);
  }

  if (!options.apply) {
    return;
  }

  let applied = 0;

  for (const plan of actionablePlans) {
    await applyMigrationPlan(supabase, plan);
    applied += 1;
    printPlanEntry(plan);
  }

  console.log(`\nApplied migrations: ${applied}`);

  if (skippedPlans.length > 0) {
    console.log('\nSkipped migrations:');
    skippedPlans.forEach(printPlanEntry);
  }
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
