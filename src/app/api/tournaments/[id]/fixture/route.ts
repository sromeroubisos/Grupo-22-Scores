import { NextRequest } from 'next/server';
import { FixtureService } from '@/lib/services/fixtureService';
import { createClient } from '@/lib/supabase/server';
import { createApiPerfTracker } from '@/lib/perf/api';
import { logOverfetchWarning } from '@/lib/perf/measure';

export const dynamic = 'force-dynamic';

type TournamentPhaseRow = {
  id: string;
  tournament_id: string;
  name: string;
  phase_type: string | null;
  order_index: number | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean | null;
  settings: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tournamentId = (await params).id;
  const route = `/api/tournaments/${tournamentId}/fixture`;
  const perf = createApiPerfTracker(route);

  try {
    console.log(`[fixture/route] GET fixture for tournament: ${tournamentId}`);

    const fixture = await perf.measureStep(
      'fixture_service',
      async () => FixtureService.getTournamentFixture(tournamentId),
      {
        bucket: 'query',
        logQuery: true,
      },
    );

    if (fixture) {
      console.log(`[fixture/route] FixtureService returned ${fixture.phases.length} phases`);
      return perf.json(fixture);
    }

    console.warn('[fixture/route] FixtureService returned null, falling back to direct query');

    const supabase = await perf.measureStep('create_client', () => createClient(), {
      bucket: 'client',
    });

    const { data: tournament, error: tournamentError } = await perf.measureStep(
      'load_tournament_header',
      async () => supabase
        .from('tournaments')
        .select('id, name')
        .eq('id', tournamentId)
        .single(),
      {
        bucket: 'query',
        logQuery: true,
      },
    );

    if (tournamentError || !tournament) {
      console.error('[fixture/route] Tournament not found:', tournamentError);
      return perf.json(
        { error: 'Tournament not found' },
        { status: 404 },
      );
    }

    logOverfetchWarning({
      endpoint: route,
      reason: 'fallback select(*) from tournament_phases',
    }, 'server');

    const { data: phases, error: phasesError } = await perf.measureStep(
      'fallback_load_phases',
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

    if (phasesError) {
      console.error('[fixture/route] Error fetching phases fallback:', phasesError);
    }

    const mappedPhases = ((phases || []) as TournamentPhaseRow[]).map((phase) => ({
      id: phase.id,
      tournamentId: phase.tournament_id,
      name: phase.name,
      phaseType: phase.phase_type,
      orderIndex: phase.order_index,
      startDate: phase.start_date,
      endDate: phase.end_date,
      isActive: phase.is_active,
      settings: phase.settings || {},
      createdAt: phase.created_at,
      updatedAt: phase.updated_at,
      rounds: [],
      roundCount: 0,
    }));

    const currentPhase = mappedPhases.find((phase) => phase.isActive) || mappedPhases[0] || null;

    console.log(`[fixture/route] Fallback found ${mappedPhases.length} phases`);

    return perf.json({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      tournamentSeason: null,
      currentPhaseId: currentPhase?.id || null,
      currentRoundId: null,
      phases: mappedPhases,
      participants: [],
    }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error in GET /api/tournaments/[id]/fixture:', error);
    return perf.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
