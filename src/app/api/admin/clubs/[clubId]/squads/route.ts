import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/admin/clubs/[clubId]/squads
 * Get all squads for a club
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const supabase = await createClient();
    const { clubId } = await params;

    let { data: squads, error } = await supabase
      .from('club_divisions')
      .select('id, name, category, season, status')
      .eq('club_id', clubId)
      .order('name', { ascending: true });

    if (error) {
      console.warn('Error fetching club_divisions, falling back to club categories:', error);

      const { data: club } = await supabase
        .from('clubs')
        .select('categories')
        .eq('id', clubId)
        .single();

      if (club?.categories) {
        squads = club.categories.map((cat: string, i: number) => ({
          id: `legacy-${i}`,
          name: cat,
          category: cat,
          season: String(new Date().getFullYear()),
          status: 'active'
        }));
      } else {
        return NextResponse.json(
          { error: 'Failed to fetch squads', details: error.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(squads || []);
  } catch (error) {
    console.error('Unexpected error fetching squads:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
