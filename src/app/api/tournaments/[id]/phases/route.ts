import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildPhaseSettingsWithSyncedLabels } from '@/lib/server/phaseLabels';
import { requireTournamentMutationContext, TournamentApiError } from '@/lib/auth/tournamentApi';
import {
  DEFAULT_PLAYOFF_STAGE_NAMES,
  buildPlayoffStages,
  ensurePlayoffBracketMatches,
  getPlayoffTeamsCount,
  isPlayoffPhaseType,
  resolvePlayoffStagesForTeams,
  syncPlayoffStagesToRounds,
} from '@/lib/server/playoffStages';
import { createApiPerfTracker } from '@/lib/perf/api';
import { logOverfetchWarning } from '@/lib/perf/measure';
import { isUuid } from '@/lib/utils/postgrest';

export const dynamic = 'force-dynamic';

async function resolveSeasonId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tournamentId: string,
  explicitSeasonId?: string | null,
) {
  if (explicitSeasonId && explicitSeasonId.trim()) return explicitSeasonId.trim();

  const { data } = await supabase
    .from('tournaments')
    .select('current_season_id')
    .eq('id', tournamentId)
    .maybeSingle();

  return data?.current_season_id ?? null;
}

// GET all phases for a tournament
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tournamentId = (await params).id;
  const route = `/api/tournaments/${tournamentId}/phases`;
  const perf = createApiPerfTracker(route);

  try {
    // Local-only route: a non-UUID tournament id (e.g. an external FlashScore/ESPN
    // competition) has no local phases. Bail out before any query passes a non-UUID
    // into the `tournaments.id` / `tournament_phases.tournament_id` uuid columns.
    if (!isUuid(tournamentId)) {
      return perf.json({ data: [] });
    }
    const supabase = await perf.measureStep('create_client', () => createClient(), {
      bucket: 'client',
    });
    const requestedSeasonId =
      request.nextUrl.searchParams.get('seasonId') ||
      request.nextUrl.searchParams.get('season_id') ||
      request.nextUrl.searchParams.get('season');
    const scopedSeasonId = await resolveSeasonId(supabase, tournamentId, requestedSeasonId);

    logOverfetchWarning({
      endpoint: route,
      reason: 'select(*) from tournament_phases',
    }, 'server');

    let phasesQuery = supabase
      .from('tournament_phases')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('order_index', { ascending: true });

    if (scopedSeasonId) {
      phasesQuery = phasesQuery.eq('season_id', scopedSeasonId);
    }

    const { data: phases, error } = await perf.measureStep(
      'load_phases',
      async () => phasesQuery,
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
    const { writer: supabase } = await perf.measureStep('authorize_tournament_write', () => requireTournamentMutationContext(tournamentId), {
      bucket: 'auth',
    });
    const body = await request.json();
    const scopedSeasonId = await resolveSeasonId(
      supabase,
      tournamentId,
      body?.seasonId || body?.season_id || body?.season || null,
    );
    const phaseName = typeof body.name === 'string' ? body.name.trim() : '';
    const phaseType = body.phase_type || 'league';
    const groupNames: string[] = phaseType === 'group_stage'
      ? (body.settings?.group_names || [])
        .filter((name: unknown) => typeof name === 'string' && name.trim())
        .map((name: string) => name.trim())
      : [];
    const playoffTeamsCount = getPlayoffTeamsCount(body.settings);
    const playoffStages = isPlayoffPhaseType(phaseType)
      ? resolvePlayoffStagesForTeams(body.settings ?? DEFAULT_PLAYOFF_STAGE_NAMES, playoffTeamsCount)
      : [];
    const playoffStageNames = playoffStages.map((stage) => stage.name);
    const playoffStageMatchCounts = playoffStages.map((stage) => stage.matchCount);

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
    if (isPlayoffPhaseType(phaseType) && playoffTeamsCount < 2) {
      return perf.json({ error: 'La fase playoff necesita definir al menos 2 equipos.' }, { status: 400 });
    }

    let countQuery = supabase
      .from('tournament_phases')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId);

    if (scopedSeasonId) {
      countQuery = countQuery.eq('season_id', scopedSeasonId);
    }

    const { count: existingPhaseCount, error: countError } = await perf.measureStep(
      'count_existing_phases',
      async () => countQuery,
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
          season_id: scopedSeasonId,
          name: phaseName,
          phase_type: phaseType,
          order_index: body.order_index ?? 0,
          is_active: shouldActivate,
          settings: {
            ...syncedSettings,
            group_names: groupNames,
            playoffStages: isPlayoffPhaseType(phaseType) ? buildPlayoffStages(playoffStages) : [],
            playoff_stage_names: isPlayoffPhaseType(phaseType) ? playoffStageNames : [],
            playoffStageMatchCounts: isPlayoffPhaseType(phaseType) ? playoffStageMatchCounts : [],
            playoff_match_counts: isPlayoffPhaseType(phaseType) ? playoffStageMatchCounts : [],
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
      let deactivateQuery = supabase
        .from('tournament_phases')
        .update({ is_active: false })
        .eq('tournament_id', tournamentId)
        .neq('id', phase.id);

      if (scopedSeasonId) {
        deactivateQuery = deactivateQuery.eq('season_id', scopedSeasonId);
      }

      const { error: deactivateError } = await perf.measureStep(
        'deactivate_previous_phases',
        async () => deactivateQuery,
        {
          bucket: 'query',
          logQuery: true,
        },
      );

      if (deactivateError) {
        console.error('Error clearing previous active phases:', deactivateError);
      }
    }

    if (phase && isPlayoffPhaseType(phaseType)) {
      const syncResult = await perf.measureStep(
        'sync_playoff_stages',
        async () => syncPlayoffStagesToRounds(supabase, phase.id, scopedSeasonId, playoffStages),
        {
          bucket: 'query',
          logQuery: true,
        },
      );

      if (!syncResult.ok) {
        return perf.json({ error: 'La fase se creo pero no se pudieron crear las etapas playoff.' }, { status: 500 });
      }

      const bracketResult = await perf.measureStep(
        'ensure_playoff_bracket',
        async () => ensurePlayoffBracketMatches(supabase, {
          tournamentId,
          phaseId: phase.id,
          seasonId: scopedSeasonId,
          teamsCount: getPlayoffTeamsCount(phase.settings),
          stageMatchCounts: playoffStageMatchCounts,
        }),
        {
          bucket: 'query',
          logQuery: true,
        },
      );

      if (!bracketResult.ok) {
        return perf.json({ error: 'La fase se creo pero no se pudo armar el cuadro playoff.' }, { status: 500 });
      }
    }

    if (phase && phaseType === 'group_stage' && groupNames.length > 0) {
      const groupInserts = groupNames.map((name, index) => ({
        phase_id: phase.id,
        season_id: scopedSeasonId,
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
    if (error instanceof TournamentApiError) {
      return perf.json({ error: error.message }, { status: error.status });
    }
    return perf.json({
      error: error instanceof Error ? error.message : String(error),
      location: 'catch_block',
    }, { status: 500 });
  }
}
