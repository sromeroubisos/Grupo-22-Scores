import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildPhaseSettingsWithSyncedLabels } from '@/lib/server/phaseLabels';
import { createApiPerfTracker } from '@/lib/perf/api';
import { logOverfetchWarning } from '@/lib/perf/measure';

export const dynamic = 'force-dynamic';

// GET all phases for a tournament
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tournamentId = (await params).id;
  const route = `/api/tournaments/${tournamentId}/phases`;
  const perf = createApiPerfTracker(route);

  try {
    const supabase = await perf.measureStep('create_client', () => createClient(), {
      bucket: 'client',
    });

    logOverfetchWarning({
      endpoint: route,
      reason: 'select(*) from tournament_phases',
    }, 'server');

    const { data: phases, error } = await perf.measureStep(
      'load_phases',
      async () => supabase
        .from('tournament_phases')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('order_index', { ascending: true }),
      {
        bucket: 'query',
        logQuery: true,
      },
    );

    if (error) {
      console.error('Error fetching phases:', error);
      return perf.json({ error: 'Error fetching phases' }, { status: 500 });
    }

    return perf.json({ data: phases || [] });
  } catch (error: unknown) {
    console.error('Error in GET /api/tournaments/[id]/phases:', error);
    return perf.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

// POST create a new phase
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tournamentId = (await params).id;
  const route = `/api/tournaments/${tournamentId}/phases`;
  const perf = createApiPerfTracker(route);

  try {
    const supabase = await perf.measureStep('create_client', () => createClient(), {
      bucket: 'client',
    });
    const body = await request.json();
    const phaseName = typeof body.name === 'string' ? body.name.trim() : '';
    const phaseType = body.phase_type || 'league';
    const groupNames: string[] = phaseType === 'group_stage'
      ? (body.settings?.group_names || [])
        .filter((name: unknown) => typeof name === 'string' && name.trim())
        .map((name: string) => name.trim())
      : [];

    const syncedSettings = await perf.measureStep(
      'sync_phase_labels',
      async () => buildPhaseSettingsWithSyncedLabels(supabase, body.settings),
      {
        bucket: 'query',
        logQuery: true,
      },
    );

    if (!phaseName) {
      return perf.json({ error: 'El nombre de la fase es obligatorio.' }, { status: 400 });
    }

    const { count: existingPhaseCount, error: countError } = await perf.measureStep(
      'count_existing_phases',
      async () => supabase
        .from('tournament_phases')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId),
      {
        bucket: 'query',
        logQuery: true,
      },
    );

    if (countError) {
      console.error('Error counting phases:', countError);
      return perf.json({ error: 'Error creating phase' }, { status: 500 });
    }

    const shouldActivate = body.is_active === true || (existingPhaseCount ?? 0) === 0;

    const { data: phase, error } = await perf.measureStep(
      'insert_phase',
      async () => supabase
        .from('tournament_phases')
        .insert({
          tournament_id: tournamentId,
          name: phaseName,
          phase_type: phaseType,
          order_index: body.order_index ?? 0,
          is_active: shouldActivate,
          settings: {
            ...syncedSettings,
            group_names: groupNames,
          },
        })
        .select()
        .single(),
      {
        bucket: 'query',
        logQuery: true,
      },
    );

    if (error) {
      console.error('Error creating phase:', error);
      return perf.json({
        error: error.message || 'Error creating phase',
        code: error.code || 'UNKNOWN',
        hint: error.hint || 'No hint',
      }, { status: 500 });
    }

    if (phase && shouldActivate) {
      const { error: deactivateError } = await perf.measureStep(
        'deactivate_previous_phases',
        async () => supabase
          .from('tournament_phases')
          .update({ is_active: false })
          .eq('tournament_id', tournamentId)
          .neq('id', phase.id),
        {
          bucket: 'query',
          logQuery: true,
        },
      );

      if (deactivateError) {
        console.error('Error clearing previous active phases:', deactivateError);
      }
    }

    if (phase && phaseType === 'group_stage' && groupNames.length > 0) {
      const groupInserts = groupNames.map((name, index) => ({
        phase_id: phase.id,
        name: name.trim(),
        order_index: index,
      }));

      const { error: groupError } = await perf.measureStep(
        'insert_phase_groups',
        async () => supabase
          .from('tournament_groups')
          .insert(groupInserts),
        {
          bucket: 'query',
          logQuery: true,
        },
      );

      if (groupError) {
        console.error('Error creating groups for phase:', groupError);
      }
    }

    return perf.json({ data: phase }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error in POST /api/tournaments/[id]/phases:', error);
    return perf.json({
      error: error instanceof Error ? error.message : String(error),
      location: 'catch_block',
    }, { status: 500 });
  }
}
