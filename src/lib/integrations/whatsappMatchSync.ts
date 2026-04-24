import type { SupabaseClient } from '@supabase/supabase-js';

type SupabaseLike = Pick<SupabaseClient, 'from'>;

type ClubCatalogRow = {
  id: string;
  name: string;
  short_name: string | null;
  slug: string | null;
};

type ClubAliasRow = {
  club_id: string;
  alias: string;
};

type MatchCandidateRow = {
  id: string;
  date_time: string | null;
  status: string | null;
  home_club_id: string | null;
  away_club_id: string | null;
  tournament_id: string | null;
};

type CatalogClub = {
  id: string;
  name: string;
  shortName: string | null;
  slug: string | null;
  aliases: string[];
  normalizedName: string;
  normalizedAliases: string[];
};

export type ClubNameResolution = {
  input: string;
  matchedClubId: string | null;
  matchedClubName: string | null;
  matchedClubShortName: string | null;
  score: number;
  confidence: 'alta' | 'media' | 'baja' | 'sin_match';
  ambiguous: boolean;
  alternatives: Array<{ id: string; name: string }>;
};

export type ResolvedMatchCandidate = {
  matchId: string;
  homeClubId: string;
  awayClubId: string;
  tournamentId: string | null;
  dateTime: string | null;
  status: string | null;
  matchedBy: 'exact_order' | 'swapped_order';
  ambiguous: boolean;
  alternatives: Array<{
    matchId: string;
    dateTime: string | null;
    status: string | null;
    matchedBy: 'exact_order' | 'swapped_order';
  }>;
};

const GENERIC_CLUB_TOKENS = new Set([
  'club',
  'rc',
  'rugby',
  'athletic',
  'atletico',
  'deportivo',
  'deportiva',
  'association',
  'asociacion',
]);

const CONNECTOR_TOKENS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'the', 'y']);

function readText(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\u00a0/g, ' ').trim();
}

function normalizeNameKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\./g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildReducedAlias(value: string) {
  const normalized = normalizeNameKey(value);
  if (!normalized) return null;

  const tokens = normalized.split(' ').filter(Boolean);
  const reduced = tokens.filter((token) => !GENERIC_CLUB_TOKENS.has(token));

  if (!reduced.length || reduced.length === tokens.length) {
    return null;
  }

  return reduced.join(' ');
}

function buildAcronymAlias(value: string) {
  const normalized = normalizeNameKey(value);
  if (!normalized) return null;

  const tokens = normalized
    .split(' ')
    .filter(Boolean)
    .filter((token) => !CONNECTOR_TOKENS.has(token));

  if (tokens.length < 2) return null;

  const acronym = tokens.map((token) => token[0]).join('');
  return acronym.length >= 2 ? acronym : null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => readText(value)).filter(Boolean)));
}

function bigramSimilarity(left: string, right: string) {
  if (left === right) return 1;
  if (!left || !right) return 0;
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0;

  const toPairs = (value: string) =>
    Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2));

  const leftPairs = toPairs(left);
  const rightPairs = toPairs(right);
  const bag = new Map<string, number>();

  rightPairs.forEach((pair) => bag.set(pair, (bag.get(pair) || 0) + 1));

  let overlap = 0;
  leftPairs.forEach((pair) => {
    const count = bag.get(pair) || 0;
    if (count > 0) {
      overlap += 1;
      bag.set(pair, count - 1);
    }
  });

  return leftPairs.length + rightPairs.length === 0
    ? 0
    : (2 * overlap) / (leftPairs.length + rightPairs.length);
}

function containmentScore(left: string, right: string) {
  if (!left || !right) return 0;

  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;

  if (shorter.length < 4) return 0;

  if (!` ${longer} `.includes(` ${shorter} `)) return 0;

  const coverage = shorter.length / longer.length;
  return Math.max(0.88, Math.min(0.97, 0.82 + coverage * 0.2));
}

function tokenOverlapScore(left: string, right: string) {
  if (!left || !right) return 0;

  const leftTokens = left.split(' ').filter(Boolean);
  const rightTokens = right.split(' ').filter(Boolean);
  if (!leftTokens.length || !rightTokens.length) return 0;

  const [smaller, larger] = leftTokens.length <= rightTokens.length
    ? [leftTokens, rightTokens]
    : [rightTokens, leftTokens];

  const largerSet = new Set(larger);
  const overlap = smaller.filter((token) => largerSet.has(token)).length;
  if (overlap === 0) return 0;

  const smallerRatio = overlap / smaller.length;
  const largerRatio = overlap / larger.length;

  if (smallerRatio === 1) {
    return Math.max(0.82, Math.min(0.96, 0.76 + largerRatio * 0.2));
  }

  return (smallerRatio + largerRatio) / 2;
}

function computeVariationScore(source: string, target: string) {
  if (source === target) {
    return { score: 1 };
  }

  const bigram = bigramSimilarity(source, target);
  const contains = containmentScore(source, target);
  const overlap = tokenOverlapScore(source, target);

  return { score: Math.max(bigram, contains, overlap) };
}

function buildCatalogClubs(clubs: ClubCatalogRow[], aliases: ClubAliasRow[]) {
  const aliasMap = new Map<string, string[]>();

  aliases.forEach((row) => {
    const list = aliasMap.get(row.club_id) ?? [];
    list.push(row.alias);
    aliasMap.set(row.club_id, list);
  });

  return clubs.map((row) => {
    const name = readText(row.name) || row.id;
    const shortName = readText(row.short_name) || null;
    const slug = readText(row.slug) || null;
    const aliasList = uniqueStrings([
      name,
      shortName,
      slug ? slug.replace(/-/g, ' ') : null,
      ...(aliasMap.get(row.id) ?? []),
      buildReducedAlias(name),
      shortName ? buildReducedAlias(shortName) : null,
      buildAcronymAlias(name),
      shortName ? buildAcronymAlias(shortName) : null,
    ]);

    return {
      id: row.id,
      name,
      shortName,
      slug,
      aliases: aliasList,
      normalizedName: normalizeNameKey(name),
      normalizedAliases: uniqueStrings(aliasList.map((alias) => normalizeNameKey(alias))),
    } satisfies CatalogClub;
  });
}

export async function resolveClubName(client: SupabaseLike, input: string): Promise<ClubNameResolution> {
  const [{ data: clubs, error: clubsError }, { data: aliases, error: aliasesError }] = await Promise.all([
    client
      .from('clubs')
      .select('id, name, short_name, slug')
      .order('name'),
    client
      .from('club_aliases')
      .select('club_id, alias'),
  ]);

  if (clubsError) {
    throw new Error(clubsError.message || 'No se pudo cargar el catalogo de clubes.');
  }

  if (aliasesError) {
    throw new Error(aliasesError.message || 'No se pudieron cargar los aliases de clubes.');
  }

  const catalog = buildCatalogClubs((clubs ?? []) as ClubCatalogRow[], (aliases ?? []) as ClubAliasRow[]);
  const normalizedValue = normalizeNameKey(input);

  if (!normalizedValue) {
    return {
      input,
      matchedClubId: null,
      matchedClubName: null,
      matchedClubShortName: null,
      score: 0,
      confidence: 'sin_match',
      ambiguous: false,
      alternatives: [],
    };
  }

  const ranked = catalog
    .map((club) => {
      const exact = club.normalizedName === normalizedValue;
      const aliasExact = club.normalizedAliases.includes(normalizedValue);

      if (exact || aliasExact) {
        return { club, score: 1 };
      }

      const variations = Array.from(new Set([club.normalizedName, ...club.normalizedAliases])).filter(Boolean);
      let bestScore = 0;

      variations.forEach((variation) => {
        const candidate = computeVariationScore(normalizedValue, variation);
        if (candidate.score > bestScore) {
          bestScore = candidate.score;
        }
      });

      return { club, score: bestScore };
    })
    .filter((item) => item.score >= 0.74)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.club.name.localeCompare(right.club.name, 'es');
    });

  const best = ranked[0];
  const second = ranked[1];

  if (!best) {
    return {
      input,
      matchedClubId: null,
      matchedClubName: null,
      matchedClubShortName: null,
      score: 0,
      confidence: 'sin_match',
      ambiguous: false,
      alternatives: [],
    };
  }

  const ambiguous = Boolean(second && best.score - second.score < 0.035 && best.score < 0.99);
  const confidence: ClubNameResolution['confidence'] =
    best.score >= 0.96 && !ambiguous
      ? 'alta'
      : best.score >= 0.86 && !ambiguous
        ? 'media'
        : 'baja';

  return {
    input,
    matchedClubId: best.club.id,
    matchedClubName: best.club.name,
    matchedClubShortName: best.club.shortName,
    score: best.score,
    confidence,
    ambiguous,
    alternatives: ranked.slice(0, 3).map((item) => ({
      id: item.club.id,
      name: item.club.name,
    })),
  };
}

function normalizeStatus(value: string | null | undefined) {
  const normalized = readText(value).toLowerCase();
  if (!normalized) return 'scheduled';

  if (['live', 'en vivo', 'playing', 'ongoing', 'in_progress'].includes(normalized)) return 'live';
  if (['final', 'finished', 'completed', 'scored', 'ft'].includes(normalized)) return 'final';
  if (['postponed', 'aplazado'].includes(normalized)) return 'postponed';
  if (['cancelled', 'cancelado'].includes(normalized)) return 'cancelled';

  return normalized;
}

function getStatusWeight(status: string | null | undefined) {
  switch (normalizeStatus(status)) {
    case 'live':
      return 40;
    case 'scheduled':
      return 34;
    case 'final':
      return 28;
    case 'postponed':
      return 10;
    case 'cancelled':
      return 2;
    default:
      return 18;
  }
}

function getDateWeight(dateTime: string | null) {
  if (!dateTime) return 0;

  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) return 0;

  const diffHours = Math.abs(parsed.getTime() - Date.now()) / 36e5;

  if (diffHours <= 6) return 40;
  if (diffHours <= 24) return 36;
  if (diffHours <= 72) return 31;
  if (diffHours <= 168) return 25;
  if (diffHours <= 720) return 18;
  if (diffHours <= 2160) return 10;

  return 3;
}

function rankMatchCandidate(
  row: MatchCandidateRow,
  matchedBy: ResolvedMatchCandidate['matchedBy'],
) {
  const exactOrderWeight = matchedBy === 'exact_order' ? 18 : 6;
  return getStatusWeight(row.status) + getDateWeight(row.date_time) + exactOrderWeight;
}

export async function resolveMatchByTeams(
  client: SupabaseLike,
  input: { homeClubId: string; awayClubId: string },
): Promise<ResolvedMatchCandidate | null> {
  const selectColumns = 'id, date_time, status, home_club_id, away_club_id, tournament_id';

  const [exactResult, swappedResult] = await Promise.all([
    client
      .from('matches')
      .select(selectColumns)
      .eq('home_club_id', input.homeClubId)
      .eq('away_club_id', input.awayClubId)
      .order('date_time', { ascending: false })
      .limit(12),
    client
      .from('matches')
      .select(selectColumns)
      .eq('home_club_id', input.awayClubId)
      .eq('away_club_id', input.homeClubId)
      .order('date_time', { ascending: false })
      .limit(12),
  ]);

  if (exactResult.error) {
    throw new Error(exactResult.error.message || 'No se pudieron buscar partidos exactos.');
  }

  if (swappedResult.error) {
    throw new Error(swappedResult.error.message || 'No se pudieron buscar partidos alternativos.');
  }

  const ranked = [
    ...((exactResult.data ?? []) as MatchCandidateRow[]).map((row) => ({
      row,
      matchedBy: 'exact_order' as const,
      rank: rankMatchCandidate(row, 'exact_order'),
    })),
    ...((swappedResult.data ?? []) as MatchCandidateRow[]).map((row) => ({
      row,
      matchedBy: 'swapped_order' as const,
      rank: rankMatchCandidate(row, 'swapped_order'),
    })),
  ].sort((left, right) => {
    if (right.rank !== left.rank) return right.rank - left.rank;

    const leftDate = left.row.date_time ? new Date(left.row.date_time).getTime() : 0;
    const rightDate = right.row.date_time ? new Date(right.row.date_time).getTime() : 0;
    return rightDate - leftDate;
  });

  const best = ranked[0];
  const second = ranked[1];

  if (!best) {
    return null;
  }

  const ambiguous = Boolean(second && best.rank - second.rank <= 5);

  return {
    matchId: best.row.id,
    homeClubId: best.row.home_club_id || input.homeClubId,
    awayClubId: best.row.away_club_id || input.awayClubId,
    tournamentId: best.row.tournament_id,
    dateTime: best.row.date_time,
    status: best.row.status,
    matchedBy: best.matchedBy,
    ambiguous,
    alternatives: ranked.slice(0, 3).map((item) => ({
      matchId: item.row.id,
      dateTime: item.row.date_time,
      status: item.row.status,
      matchedBy: item.matchedBy,
    })),
  };
}
