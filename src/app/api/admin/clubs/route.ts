import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { getReadClient } from '@/lib/supabase/read';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';
import { escapePostgrestLike } from '@/lib/utils/postgrest';

/**
 * GET /api/admin/clubs
 * Get all clubs (for dropdowns, etc.)
 */
type AdminClubRow = {
  id: string
  name: string
  short_name?: string | null
  slug?: string | null
  logo_url?: string | null
  primary_color?: string | null
  city?: string | null
  region?: string | null
  country?: string | null
  entity_type?: string | null
  sport?: string | null
  sport_id?: string | null
}

const DEFAULT_LIMIT = 5000;
const MAX_LIMIT = 10000;
// PostgREST corta cada respuesta en 1000 filas (db-max-rows): pedir range(0, 1999)
// devuelve 1000 y nadie avisa. Para servir el catalogo entero hay que paginar.
const PAGE_SIZE = 1000;

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function parseOffset(value: string | null) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function normalizeSport(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase();
}

function getSportVariants(sport: string): string[] {
  const lower = normalizeSport(sport);
  switch (lower) {
    case 'rugby': return ['rugby', 'rugby-union', 'rugby-league'];
    case 'rugby-union': return ['rugby', 'rugby-union'];
    case 'rugby-league': return ['rugby', 'rugby-league'];
    case 'football': return ['football', 'soccer'];
    // Los dos hockeys se leen entre si: el catalogo tiene clubes viejos
    // guardados como 'hockey' que en la plataforma son de cesped.
    case 'hockey': return ['hockey', 'field-hockey'];
    case 'field-hockey': return ['field-hockey', 'hockey'];
    default: return lower ? [lower] : [];
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminApiUser();
    const supabase = await getReadClient();
    const searchParams = request.nextUrl.searchParams;
    const search = String(searchParams.get('search') || '').trim();
    const sport = String(searchParams.get('sport') || '').trim();
    const limit = parseLimit(searchParams.get('limit'));
    const offset = parseOffset(searchParams.get('offset'));

    const variants = [
      'id, name, short_name, slug, primary_color, city, region, country, entity_type, sport, sport_id',
      'id, name, short_name, slug, city, region, country, entity_type, sport, sport_id',
      'id, name, short_name, slug, city, region, country, sport, sport_id',
      'id, name, short_name, city, region, country, entity_type, sport, sport_id',
      'id, name, short_name, city, region, country, sport, sport_id',
      'id, name, short_name, region, country, entity_type, sport, sport_id',
      'id, name, short_name, region, country, sport, sport_id',
      'id, name, short_name, region, country, sport_id',
      'id, name, short_name, region, country, sport',
      'id, name, short_name, region, country',
    ];
    const optionalColumns = ['sport', 'sport_id', 'entity_type', 'city', 'slug', 'primary_color'];

    type QueryError = { message?: string | null; details?: string | null; code?: string | null } | null;

    const fetchPage = async (columns: string, from: number, size: number) => {
      let query = supabase
        .from('clubs')
        .select(columns)
        // Desempate por PK: sin el, dos clubes con el mismo nombre pueden
        // repetirse o desaparecer entre paginas.
        .order('name', { ascending: true })
        .order('id', { ascending: true });

      if (search) {
        const escapedSearch = escapePostgrestLike(search);
        query = query.or(`name.ilike.%${escapedSearch}%,short_name.ilike.%${escapedSearch}%,slug.ilike.%${escapedSearch}%`);
      }

      const result = await query.range(from, from + size - 1);
      return {
        data: (result.data || []) as unknown as AdminClubRow[],
        error: result.error as QueryError,
      };
    };

    let clubs: AdminClubRow[] | null = null;
    let error: QueryError = null;
    let resolvedColumns: string | null = null;

    // Primera pagina: sirve ademas para descubrir que columnas existen.
    for (const columns of variants) {
      const firstSize = Math.min(PAGE_SIZE, limit);
      const result = await fetchPage(columns, offset, firstSize);

      if (!result.error) {
        clubs = result.data;
        resolvedColumns = columns;
        error = null;
        break;
      }

      error = result.error;

      if (!optionalColumns.some((column) => isMissingColumnError(result.error, column))) {
        break;
      }
    }

    // Resto de las paginas hasta completar el limite pedido.
    if (!error && clubs && resolvedColumns) {
      let lastPageSize = clubs.length;
      while (lastPageSize === PAGE_SIZE && clubs.length < limit) {
        const nextSize = Math.min(PAGE_SIZE, limit - clubs.length);
        const page = await fetchPage(resolvedColumns, offset + clubs.length, nextSize);

        if (page.error) {
          error = page.error;
          break;
        }

        clubs = clubs.concat(page.data);
        lastPageSize = page.data.length;
      }
    }

    if (error) {
      console.error('Error fetching clubs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch clubs' },
        { status: 500 }
      );
    }

    const sportVariants = sport ? getSportVariants(sport) : [];
    const filteredClubs = sportVariants.length > 0
      ? (clubs || []).filter((club) => {
          const clubSport = normalizeSport(club.sport_id || club.sport || null);
          return sportVariants.includes(clubSport);
        })
      : (clubs || []);

    return NextResponse.json(filteredClubs.map((club) => ({
      ...club,
      logo_url: buildTeamLogoProxyUrl({ key: club.id, name: club.name }),
    })));
  } catch (error) {
    console.error('Unexpected error fetching clubs:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { error: message === 'Unauthorized' ? 'Unauthorized' : 'Internal server error' },
      { status }
    );
  }
}
