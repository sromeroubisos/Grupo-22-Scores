import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET all phases for a tournament
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const tournamentId = (await params).id;

    const { data: phases, error } = await supabase
      .from('tournament_phases')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('order_index', { ascending: true });

    if (error) {
      console.error('Error fetching phases:', error);
      return NextResponse.json({ error: 'Error fetching phases' }, { status: 500 });
    }

    return NextResponse.json({ data: phases || [] });
  } catch (error: any) {
    console.error('Error in GET /api/tournaments/[id]/phases:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST create a new phase
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const tournamentId = (await params).id;
    const body = await request.json();

    const { data: phase, error } = await supabase
      .from('tournament_phases')
      .insert({
        tournament_id: tournamentId,
        name: body.name,
        phase_type: body.phase_type || 'league',
        order_index: body.order_index ?? 0,
        is_active: body.is_active ?? true,
        settings: body.settings || {},
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating phase:', error);
      return NextResponse.json({
        error: error.message || 'Error creating phase',
        code: error.code || 'UNKNOWN',
        hint: error.hint || 'No hint'
      }, { status: 500 });
    }

    return NextResponse.json({ data: phase }, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /api/tournaments/[id]/phases:', error);
    return NextResponse.json({
      error: error?.message || String(error),
      location: 'catch_block'
    }, { status: 500 });
  }
}
