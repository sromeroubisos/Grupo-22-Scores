import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { getReadClient } from '@/lib/supabase/read';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';

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

export async function GET() {
  try {
    await requireAdminApiUser();
    const supabase = await getReadClient();

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
      const result = await supabase
        .from('clubs')
        .select(columns)
        .order('name', { ascending: true });

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

    return NextResponse.json(clubs || []);
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
