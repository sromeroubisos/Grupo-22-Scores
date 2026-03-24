import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';

/**
 * GET /api/admin/clubs
 * Get all clubs (for dropdowns, etc.)
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const variants = [
      'id, name, short_name, logo_url, sport, sport_id',
      'id, name, short_name, logo_url, sport_id',
      'id, name, short_name, logo_url, sport',
      'id, name, short_name, logo_url',
    ];

    let clubs: any[] | null = null;
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
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
