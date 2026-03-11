import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/admin/clubs
 * Get all clubs (for dropdowns, etc.)
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const { data: clubs, error } = await supabase
      .from('clubs')
      .select('id, name, short_name, logo_url')
      .order('name', { ascending: true });

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
