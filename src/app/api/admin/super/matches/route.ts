import { NextRequest, NextResponse } from 'next/server';
import { getApiErrorStatus, requireGlobalAdminApiUser } from '@/lib/auth/apiAdmin';
import { MATCH_REVIEW_STATUS } from '@/lib/matchReview';
import { getReadClient } from '@/lib/supabase/read';
import { resolveSerializableLogoUrl } from '@/lib/utils/logoUrl';
import { isMissingColumnError, isMissingTableError } from '@/lib/utils/supabaseSchema';

// Vista que le pega a cada partido el nombre del torneo y el de los dos clubes en
// una sola columna de texto. Es lo que permite buscar sobre TODO el historial en vez
// de sobre la pagina que está en pantalla. Se crea con la migración
// `20260809120000_admin_matches_search_view.sql`; mientras no exista, el endpoint
// usa el camino de listas de ids y avisa cuando queda corto.
const MATCH_SEARCH_VIEW = 'admin_matches_search' as const;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;
// `matches` no guarda el nombre del club ni el del torneo, así que buscar por
// nombre obliga a resolver ids primero y mandarlos dentro de la query. Eso tiene un
// techo duro y medido: PostgREST devuelve la query entera en `Content-Location`, y
// con un termino amplio ("a" engancha ~2000 clubes) la RESPUESTA se cae con
// HeadersOverflow — la busqueda no da de menos, revienta. Por eso el corte es por
// presupuesto de caracteres, no por cantidad, y cuando algo queda afuera se avisa
// (`searchTruncated`) en vez de devolver un recorte silencioso.
const SEARCH_ENTITY_LIMIT = 200;
const SEARCH_CLAUSE_BUDGET = 3500;

type MatchConsoleRow = {
  id: string;
  round_id: string | null;
  round_label?: string | null;
  date_time: string;
  venue: string | null;
  status: string | null;
  score: unknown;
  tournament_id: string | null;
  home_club_id: string | null;
  away_club_id: string | null;
  sport_id?: string | null;
  sport?: string | null;
  is_visible?: boolean | null;
  review_status?: string | null;
  created_by_user_id?: string | null;
  created_by_club_id?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
};

type TournamentConsoleRow = {
  id: string;
  name: string;
  sport_id?: string | null;
  sport?: string | null;
  season_id?: string | null;
};

type ClubConsoleRow = {
  id: string;
  name: string;
  logo_url?: string | null;
  primary_color?: string | null;
  sport_id?: string | null;
  sport?: string | null;
};

type QueryError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
} | null;

function jsonError(message: string, status = 500, details?: unknown) {
  return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getSportVariants(sport: string): string[] {
  const lower = sport.toLowerCase();
  switch (lower) {
    case 'rugby': return ['rugby', 'rugby-union', 'rugby-league'];
    case 'rugby-union': return ['rugby', 'rugby-union'];
    case 'rugby-league': return ['rugby', 'rugby-league'];
    case 'football': return ['football', 'soccer'];
    case 'hockey': return ['hockey', 'field-hockey'];
    default: return [lower];
  }
}

function normalizeSportValue(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function getSelectedColumns(columns: string) {
  return columns
    .split(',')
    .map((column) => {
      const trimmed = column.trim();
      if (!trimmed) return null;

      const aliasTarget = trimmed.includes(':')
        ? trimmed.split(':').slice(-1)[0]
        : trimmed;

      return aliasTarget.trim();
    })
    .filter((column): column is string => Boolean(column));
}

function isRetryableMissingColumnError(error: QueryError, columns: string) {
  if (!error) return false;

  const selectedColumns = getSelectedColumns(columns);
  if (selectedColumns.some((column) => isMissingColumnError(error, column))) {
    return true;
  }

  const haystack = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return (error.code === 'PGRST204' || error.code === '42703') && haystack.includes('column');
}

async function findEntityIdsBySport(
  client: Awaited<ReturnType<typeof getReadClient>>,
  table: 'tournaments' | 'clubs',
  variants: string[],
) {
  const attempts = [
    () => client.from(table).select('id').in('sport_id', variants),
    () => client.from(table).select('id').in('sport', variants),
  ];

  for (const attempt of attempts) {
    const result = await attempt();
    if (!result.error) {
      return (result.data || []).map((row: { id?: string | null }) => row.id).filter(Boolean) as string[];
    }
  }

  return [];
}

/**
 * PostgREST no sabe buscar por el nombre del club o del torneo desde `matches`:
 * son otras tablas. Se resuelven primero los ids que coinciden por nombre y se
 * arma con eso un `or` sobre el partido, más el `venue`, que sí es columna propia.
 */
async function findEntityIdsByName(
  client: Awaited<ReturnType<typeof getReadClient>>,
  table: 'tournaments' | 'clubs',
  term: string,
) {
  const pattern = `%${term.replace(/[%_]/g, (char) => `\\${char}`)}%`;

  const { data, error } = await client
    .from(table)
    .select('id')
    .ilike('name', pattern)
    .limit(SEARCH_ENTITY_LIMIT + 1);

  if (error) return { ids: [] as string[], truncated: false };

  const ids = (data || []).map((row: { id?: string | null }) => row.id).filter(Boolean) as string[];
  return {
    ids: ids.slice(0, SEARCH_ENTITY_LIMIT),
    truncated: ids.length > SEARCH_ENTITY_LIMIT,
  };
}

function quoteId(id: string) {
  // Los ids de club son slugs y los de torneo uuid, pero se citan igual: un id con
  // coma o parentesis rompe la lista `in.(...)` sin decir por qué.
  return `"${id.replace(/"/g, '\\"')}"`;
}

/**
 * Recorta las dos listas de ids para que las clausulas entren en el presupuesto.
 * Un club cuesta el doble que un torneo porque va en dos clausulas (local y
 * visitante). Se reparte mitad y mitad para que un termino que pega en las dos
 * dimensiones no deje una sin representar.
 */
function fitSearchIds(tournamentIds: string[], clubIds: string[]) {
  const take = (ids: string[], budget: number, costPerId: (id: string) => number) => {
    const kept: string[] = [];
    let spent = 0;
    for (const id of ids) {
      const cost = costPerId(id);
      if (spent + cost > budget) break;
      kept.push(id);
      spent += cost;
    }
    return { kept, truncated: kept.length < ids.length };
  };

  const half = Math.floor(SEARCH_CLAUSE_BUDGET / 2);
  const tournaments = take(tournamentIds, half, (id) => id.length + 3);
  // Sobrante del torneo para el club: si no hay torneos que pongan, el club usa todo.
  const clubBudget = SEARCH_CLAUSE_BUDGET - tournaments.kept.reduce((acc, id) => acc + id.length + 3, 0);
  const clubs = take(clubIds, clubBudget, (id) => (id.length + 3) * 2);

  return {
    tournamentIds: tournaments.kept,
    clubIds: clubs.kept,
    truncated: tournaments.truncated || clubs.truncated,
  };
}

async function supportsMatchColumn(
  client: Awaited<ReturnType<typeof getReadClient>>,
  column: string,
) {
  const { error } = await client
    .from('matches')
    .select(column)
    .limit(0);

  if (!error) return true;
  if (isMissingColumnError(error, column)) return false;
  return false;
}

async function selectPageWithFallback<T>(
  execute: (columns: string) => PromiseLike<{
    data: T[] | null;
    error: QueryError;
    count?: number | null;
  }>,
  variants: string[],
) {
  let lastError: QueryError = null;

  for (const columns of variants) {
    const result = await execute(columns);
    if (!result.error) {
      return {
        data: result.data || [],
        count: result.count ?? 0,
        error: null,
      };
    }

    lastError = result.error;
    if (!isRetryableMissingColumnError(result.error, columns)) {
      return { data: [], count: 0, error: result.error };
    }
  }

  return { data: [], count: 0, error: lastError };
}

async function selectManyWithFallback<T>(
  execute: (columns: string) => PromiseLike<{
    data: T[] | null;
    error: QueryError;
  }>,
  variants: string[],
) {
  let lastError: QueryError = null;

  for (const columns of variants) {
    const result = await execute(columns);
    if (!result.error) {
      return { data: result.data || [], error: null };
    }

    lastError = result.error;
    if (!isRetryableMissingColumnError(result.error, columns)) {
      return { data: [], error: result.error };
    }
  }

  return { data: [], error: lastError };
}

export async function GET(request: NextRequest) {
  try {
    await requireGlobalAdminApiUser();
  } catch (error) {
    return jsonError('Unauthorized', getApiErrorStatus(error, 401));
  }

  try {
    const searchParams = new URL(request.url).searchParams;
    const page = parsePositiveInt(searchParams.get('page'), 1);
    const pageSize = Math.min(parsePositiveInt(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const status = (searchParams.get('status') || 'all').trim().toLowerCase();
    const sport = (searchParams.get('sport') || 'all').trim().toLowerCase();
    const search = (searchParams.get('search') || '').trim();
    const requestedReview = (searchParams.get('review') || 'all').trim().toLowerCase();
    const review = [
      MATCH_REVIEW_STATUS.pending,
      MATCH_REVIEW_STATUS.approved,
      MATCH_REVIEW_STATUS.rejected,
      'all',
    ].includes(requestedReview)
      ? requestedReview
      : 'all';
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const readClient = await getReadClient();
    const supportsReviewStatus = review === 'all'
      ? true
      : await supportsMatchColumn(readClient, 'review_status');

    if (review !== 'all' && !supportsReviewStatus) {
      return NextResponse.json({
        data: [],
        pagination: { page, pageSize, total: 0, totalPages: 0 },
      });
    }

    let sportClauses: string[] = [];
    if (sport !== 'all') {
      const variants = getSportVariants(sport);
      const [tournamentIds, clubIds] = await Promise.all([
        findEntityIdsBySport(readClient, 'tournaments', variants),
        findEntityIdsBySport(readClient, 'clubs', variants),
      ]);

      sportClauses = [
        ...(tournamentIds.length > 0 ? [`tournament_id.in.(${tournamentIds.join(',')})`] : []),
        ...(clubIds.length > 0 ? [`home_club_id.in.(${clubIds.join(',')})`, `away_club_id.in.(${clubIds.join(',')})`] : []),
      ];

      if (sportClauses.length === 0) {
        return NextResponse.json({
          data: [],
          pagination: { page, pageSize, total: 0, totalPages: 0 },
        });
      }
    }

    let searchTruncated = false;

    /**
     * Resolver la busqueda con listas de ids es el plan B. El plan A es la vista
     * `admin_matches_search`, que trae el nombre del torneo y de los dos clubes ya
     * pegados a la fila: ahí la busqueda es un `ilike` sobre una columna, alcanza a
     * los 55 mil partidos y no tiene techo. Si la vista no está creada todavía se
     * cae al plan B, que da menos y lo dice.
     */
    const buildSearchClauses = async () => {
      const [tournamentsByName, clubsByName] = await Promise.all([
        findEntityIdsByName(readClient, 'tournaments', search),
        findEntityIdsByName(readClient, 'clubs', search),
      ]);

      const fitted = fitSearchIds(tournamentsByName.ids, clubsByName.ids);
      searchTruncated = tournamentsByName.truncated || clubsByName.truncated || fitted.truncated;

      const tournamentList = fitted.tournamentIds.map(quoteId).join(',');
      const clubList = fitted.clubIds.map(quoteId).join(',');

      return [
        `venue.ilike.*${search.replace(/[*(),]/g, ' ')}*`,
        ...(tournamentList ? [`tournament_id.in.(${tournamentList})`] : []),
        ...(clubList
          ? [
            `home_club_id.in.(${clubList})`,
            `away_club_id.in.(${clubList})`,
          ]
          : []),
      ];
    };

    const buildPageQuery = (source: 'matches' | typeof MATCH_SEARCH_VIEW, searchClauses: string[]) => (columns: string) => {
      let query = readClient
        .from(source)
        .select(columns, { count: 'exact' }) as any;
      query = query.order('date_time', { ascending: false });

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      if (review !== 'all') {
        query = query.eq('review_status', review);
      }

      if (sportClauses.length > 0) {
        query = query.or(sportClauses.join(','));
      }

      if (source === MATCH_SEARCH_VIEW && search) {
        query = query.ilike('search_text', `%${search.replace(/[%_]/g, (char: string) => `\\${char}`)}%`);
      } else if (searchClauses.length > 0) {
        // Dos `or` separados se combinan con AND: el partido tiene que ser del
        // deporte elegido Y coincidir con la busqueda.
        query = query.or(searchClauses.join(','));
      }

      return query.range(from, to);
    };

    const COLUMN_VARIANTS = [
        'id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport_id, sport, is_visible, review_status, created_by_user_id, created_by_club_id, reviewed_at, review_notes',
        'id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport_id, sport, is_visible, review_status',
        'id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport_id, sport, review_status',
        'id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport_id, sport',
        'id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport_id',
        'id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport',
        'id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id',
        'id, round_id, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport_id, sport',
        'id, round_id, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport_id',
        'id, round_id, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport',
        'id, round_id, date_time, venue, status, score, tournament_id, home_club_id, away_club_id',
        'id, date_time, venue, status, score, tournament_id, home_club_id, away_club_id',
    ];

    // Plan A: la vista con el texto ya pegado. Plan B (si no está creada): las
    // listas de ids acotadas, que avisan cuando quedan cortas.
    let pageResult = search
      ? await selectPageWithFallback<MatchConsoleRow>(buildPageQuery(MATCH_SEARCH_VIEW, []), COLUMN_VARIANTS)
      : null;

    if (!pageResult || (pageResult.error && search)) {
      if (pageResult?.error && !isMissingTableError(pageResult.error, MATCH_SEARCH_VIEW)) {
        return jsonError('Failed to load matches', 500, pageResult.error.message || 'search view error');
      }

      const searchClauses = search ? await buildSearchClauses() : [];
      pageResult = await selectPageWithFallback<MatchConsoleRow>(buildPageQuery('matches', searchClauses), COLUMN_VARIANTS);
    }

    const { data: matches, error: matchesError, count } = pageResult;

    if (matchesError) {
      return jsonError('Failed to load matches', 500, matchesError.message);
    }

    const tournamentIds = Array.from(new Set((matches || []).map((match: MatchConsoleRow) => match.tournament_id).filter(Boolean))) as string[];
    const clubIds = Array.from(new Set(
      (matches || []).flatMap((match: MatchConsoleRow) => [match.home_club_id, match.away_club_id]).filter(Boolean),
    )) as string[];

    const [{ data: tournaments, error: tournamentsError }, { data: clubs, error: clubsError }] = await Promise.all([
      tournamentIds.length > 0
        ? selectManyWithFallback<TournamentConsoleRow>(
          (columns) => readClient
            .from('tournaments')
            .select(columns)
            .in('id', tournamentIds) as any,
          [
            'id, name, sport_id, sport, season_id',
            'id, name, sport_id, season_id',
            'id, name, sport, season_id',
            'id, name, sport_id, sport',
            'id, name, sport_id',
            'id, name, sport',
            'id, name',
          ],
        )
        : Promise.resolve({ data: [], error: null }),
      clubIds.length > 0
        ? selectManyWithFallback<ClubConsoleRow>(
          (columns) => readClient
            .from('clubs')
            .select(columns)
            .in('id', clubIds) as any,
          [
            'id, name, logo_url, primary_color, sport, sport_id',
            'id, name, logo_url, primary_color, sport_id',
            'id, name, logo_url, primary_color, sport',
            'id, name, logo_url, sport, sport_id',
            'id, name, logo_url, sport_id',
            'id, name, logo_url, sport',
            'id, name, logo_url',
            'id, name',
          ],
        )
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (tournamentsError) return jsonError('Failed to load tournaments for matches', 500, tournamentsError.message);
    if (clubsError) return jsonError('Failed to load clubs for matches', 500, clubsError.message);

    const tournamentMap = new Map((tournaments || []).map((tournament: TournamentConsoleRow) => [
      tournament.id,
      {
        id: tournament.id,
        name: tournament.name,
        sport_id: normalizeSportValue(tournament.sport_id || tournament.sport || null),
        season_id: tournament.season_id || null,
      },
    ]));

    const clubMap = new Map((clubs || []).map((club: ClubConsoleRow) => [
      club.id,
      {
        id: club.id,
        name: club.name,
        logo_url: resolveSerializableLogoUrl(club.logo_url, { key: club.id, name: club.name }),
        primary_color: club.primary_color || null,
        sport_id: normalizeSportValue(club.sport_id || club.sport || null),
      },
    ]));

    const total = count || 0;
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
    const data = (matches || []).map((match: MatchConsoleRow) => {
      const tournament = match.tournament_id ? tournamentMap.get(match.tournament_id) ?? null : null;
      const homeTeam = match.home_club_id ? clubMap.get(match.home_club_id) ?? null : null;
      const awayTeam = match.away_club_id ? clubMap.get(match.away_club_id) ?? null : null;

      return {
        ...match,
        sport_id: normalizeSportValue(
          match.sport_id ||
          match.sport ||
          tournament?.sport_id ||
          homeTeam?.sport_id ||
          awayTeam?.sport_id ||
          null,
        ),
        round_id: match.round_label || match.round_id,
        tournament,
        home_team: homeTeam,
        away_team: awayTeam,
      };
    });

    return NextResponse.json({
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
      searchTruncated,
    });
  } catch (error) {
    return jsonError('Super matches error', 500, error instanceof Error ? error.message : String(error));
  }
}
