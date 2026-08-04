import { NextRequest } from 'next/server';
import { FixtureService } from '@/lib/services/fixtureService';
import { createClient } from '@/lib/supabase/server';
import { createApiPerfTracker } from '@/lib/perf/api';
import { isUuid } from '@/lib/utils/postgrest';

export const dynamic = 'force-dynamic';

type TournamentPhaseRow = {
  id: string;
  tournament_id: string;
  name: string;
  phase_type: string | null;
  order_index: number | null;
  is_active: boolean | null;
  settings: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tournamentId = (await params).id;
  let seasonId =
    request.nextUrl.searchParams.get('seasonId') ||
    request.nextUrl.searchParams.get('season_id') ||
    request.nextUrl.searchParams.get('season');
  const route = `/api/tournaments/${tournamentId}/fixture`;
  const perf = createApiPerfTracker(route);

  try {
    // tournamentId no-UUID → getTournamentFixture pega columnas uuid → 22P02 → 500.
    if (!isUuid(tournamentId)) {
      return perf.json({ error: 'Tournament not found' }, { status: 404 });
    }
    console.log(`[fixture/route] GET fixture for tournament: ${tournamentId}`);

    if (!seasonId) {
      const supabase = await createClient();
      const { data } = await supabase
        .from('tournaments')
        .select('current_season_id')
        .eq('id', tournamentId)
        .maybeSingle();
      seasonId = data?.current_season_id ?? null;
    }

    const fixture = await perf.measureStep(
      'fixture_service',
      async () => FixtureService.getTournamentFixture(tournamentId, seasonId),
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

    // Mismo contrato de columnas que FixtureService.getTournamentFixture:
    // tournament_phases no tiene start_date/end_date (42703 si se piden).
    let phasesQuery = supabase
      .from('tournament_phases')
      .select('id, tournament_id, name, phase_type, order_index, is_active, settings, created_at, updated_at')
      .eq('tournament_id', tournamentId)
      .order('order_index', { ascending: true });

    if (seasonId) {
      phasesQuery = phasesQuery.eq('season_id', seasonId);
    }

    const { data: phases, error: phasesError } = await perf.measureStep(
      'fallback_load_phases',
      async () => phasesQuery,
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
      // La fase no tiene fechas propias en la base (start_date/end_date viven en
      // tournament_rounds); el rango real sale de sus jornadas.
      startDate: null,
      endDate: null,
      isActive: phase.is_active,
      settings: phase.settings || {},
      createdAt: phase.created_at,
      updatedAt: phase.updated_at,
      rounds: [],
      roundCount: 0,
    }));

    // El torneo EXISTE (lo acabamos de leer) pero el camino principal fallo: este
    // payload nunca trae jornadas ni partidos. Devolverlo con 200 hacia el gestor
    // hace indistinguible "la consulta se rompio" de "el torneo no tiene partidos",
    // que es exactamente como se enmascaro el 42703 de tournament_phases. Preferimos
    // el error explicito: la UI muestra el card con Reintentar en vez de un fixture
    // vacio mentiroso.
    if (mappedPhases.length > 0 || phasesError) {
      console.error(
        `[fixture/route] Camino principal caido para ${tournamentId}; el fallback solo puede devolver ${mappedPhases.length} fases sin jornadas ni partidos. Respondo 500 en vez de un fixture vacio.`,
      );
      return perf.json(
        {
          error:
            'No se pudo cargar el fixture completo del torneo (fallo la consulta de estructura). Reintenta; si persiste, revisa los logs del servidor.',
        },
        { status: 500 },
      );
    }

    console.log('[fixture/route] Fallback: el torneo no tiene fases cargadas');

    return perf.json({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      tournamentSeason: seasonId,
      currentPhaseId: null,
      currentRoundId: null,
      phases: [],
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
