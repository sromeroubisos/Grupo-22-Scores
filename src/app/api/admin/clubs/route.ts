import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { getReadClient } from '@/lib/supabase/read';
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
  logo_url?: string | null
  region?: string | null
  country?: string | null
  sport?: string | null
  sport_id?: string | null
}

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
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
    case 'hockey': return ['hockey', 'field-hockey'];
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

    const variants = [
      'id, name, short_name, logo_url, region, country, sport, sport_id',
      'id, name, short_name, logo_url, region, country, sport_id',
      'id, name, short_name, logo_url, region, country, sport',
      'id, name, short_name, logo_url, region, country',
      'id, name, short_name, region, country, sport, sport_id',
      'id, name, short_name, region, country, sport_id',
      'id, name, short_name, region, country, sport',
      'id, name, short_name, region, country',
    ];

    let clubs: AdminClubRow[] | null = null;
    let error: { message?: string | null; details?: string | null; code?: string | null } | null = null;

    for (const columns of variants) {
      let query = supabase
        .from('clubs')
        .select(columns)
        .order('name', { ascending: true });

      if (search) {
        const escapedSearch = escapePostgrestLike(search);
        query = query.or(`name.ilike.%${escapedSearch}%,short_name.ilike.%${escapedSearch}%,slug.ilike.%${escapedSearch}%`);
      }

      const result = await query.limit(limit);

      if (!result.error) {
        clubs = result.data || [];
        error = null;
        break;
      }

      error = result.error;

      if (
        !isMissingColumnError(result.error, 'sport') &&
        !isMissingColumnError(result.error, 'sport_id')
      ) {
        break;
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

    return NextResponse.json(filteredClubs);
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
