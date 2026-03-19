import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET all groups for a tournament (optionally filtered by phaseId)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const tournamentId = (await params).id;
    const { searchParams } = new URL(request.url);
    const phaseId = searchParams.get('phaseId');

    // Fetch groups joined through phases to filter by tournament_id
    let query = supabase
      .from('tournament_groups')
      .select('id, name, phase_id, order_index, tournament_phases!inner(tournament_id)')
      .eq('tournament_phases.tournament_id', tournamentId)
      .order('order_index', { ascending: true });

    if (phaseId) {
      query = query.eq('phase_id', phaseId);
    }

    const { data: groups, error } = await query;

    if (error) {
      console.error('Error fetching groups:', error);
      return NextResponse.json({ error: 'Error fetching groups' }, { status: 500 });
    }

    // Return flat list without the nested tournament_phases join data
    const result = (groups || []).map(({ tournament_phases: _tp, ...g }) => g);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in GET /api/tournaments/[id]/groups:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST create a new group for a specific phase
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    await params; // ensure params are resolved
    const body = await request.json();

    if (!body.phase_id || !body.name) {
      return NextResponse.json({ error: 'phase_id and name are required' }, { status: 400 });
    }

    const { data: group, error } = await supabase
      .from('tournament_groups')
      .insert({
        phase_id: body.phase_id,
        name: body.name,
        order_index: body.order_index ?? 0,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating group:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: group }, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /api/tournaments/[id]/groups:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
