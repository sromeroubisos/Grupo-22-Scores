import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createApiPerfTracker } from '@/lib/perf/api';

export const dynamic = 'force-dynamic';

// GET all groups for a tournament (optionally filtered by phaseId)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tournamentId = (await params).id;
  const route = `/api/tournaments/${tournamentId}/groups`;
  const perf = createApiPerfTracker(route);

  try {
    const supabase = await perf.measureStep('create_client', () => createClient(), {
      bucket: 'client',
    });
    const { searchParams } = new URL(request.url);
    const phaseId = searchParams.get('phaseId');

    let query = supabase
      .from('tournament_groups')
      .select('id, name, phase_id, order_index, tournament_phases!inner(tournament_id)')
      .eq('tournament_phases.tournament_id', tournamentId)
      .order('order_index', { ascending: true });

    if (phaseId) {
      query = query.eq('phase_id', phaseId);
    }

    const { data: groups, error } = await perf.measureStep(
      'load_groups',
      async () => query,
      {
        bucket: 'query',
        logQuery: true,
        metadata: {
          phaseId: phaseId || 'all',
        },
      },
    );

    if (error) {
      console.error('Error fetching groups:', error);
      return perf.json({ error: 'Error fetching groups' }, { status: 500 });
    }

    const result = (groups || []).map((group) => ({
      id: group.id,
      name: group.name,
      phase_id: group.phase_id,
      order_index: group.order_index,
    }));
    return perf.json(result);
  } catch (error: unknown) {
    console.error('Error in GET /api/tournaments/[id]/groups:', error);
    return perf.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}

// POST create a new group for a specific phase
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tournamentId = (await params).id;
  const route = `/api/tournaments/${tournamentId}/groups`;
  const perf = createApiPerfTracker(route);

  try {
    const supabase = await perf.measureStep('create_client', () => createClient(), {
      bucket: 'client',
    });
    const body = await request.json();

    if (!body.phase_id || !body.name) {
      return perf.json({ error: 'phase_id and name are required' }, { status: 400 });
    }

    const { data: group, error } = await perf.measureStep(
      'insert_group',
      async () => supabase
        .from('tournament_groups')
        .insert({
          phase_id: body.phase_id,
          name: body.name,
          order_index: body.order_index ?? 0,
        })
        .select()
        .single(),
      {
        bucket: 'query',
        logQuery: true,
      },
    );

    if (error) {
      console.error('Error creating group:', error);
      return perf.json({ error: error.message }, { status: 500 });
    }

    return perf.json({ data: group }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error in POST /api/tournaments/[id]/groups:', error);
    return perf.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
