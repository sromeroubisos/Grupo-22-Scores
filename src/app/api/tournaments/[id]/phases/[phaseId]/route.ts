import { NextRequest, NextResponse } from 'next/server';
import { buildPhaseSettingsWithSyncedLabels } from '@/lib/server/phaseLabels';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import {
  DEFAULT_PLAYOFF_STAGE_NAMES,
  buildPlayoffStages,
  ensurePlayoffBracketMatches,
  getPlayoffTeamsCount,
  isPlayoffPhaseType,
  resolvePlayoffStagesForTeams,
  syncPlayoffStagesToRounds,
} from '@/lib/server/playoffStages';
import { recalculatePhaseStandingsScopes } from '@/lib/server/recalculateStandings';
import { isUuid } from '@/lib/utils/postgrest';

// PATCH update a phase
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string, phaseId: string }> }
) {
  try {
    const { id: tournamentId, phaseId } = await params;
    // Guard ANTES del contexto: un phaseId no-UUID no debe gastar el round-trip de auth.
    if (!isUuid(phaseId)) {
      return NextResponse.json({ error: 'Fase no encontrada' }, { status: 404 });
    }
    const { writer: supabase } = await requireTournamentMutationContext(tournamentId);
    const body = await request.json();
    const { data: currentPhase, error: currentPhaseError } = await supabase
      .from('tournament_phases')
      .select('phase_type, season_id, settings')
      .eq('id', phaseId)
      .eq('tournament_id', tournamentId)
      .single();

    if (currentPhaseError || !currentPhase) {
      console.error('Error loading phase before update:', currentPhaseError);
      return NextResponse.json({ error: 'Fase no encontrada' }, { status: 404 });
    }

    const nextPhaseType = body.phase_type ?? currentPhase.phase_type ?? 'league';
    const sanitizedGroupNames: string[] = (body.settings?.group_names || [])
      .filter((n: unknown) => typeof n === 'string' && n.trim())
      .map((name: string) => name.trim());
    const nextSettings = body.settings ?? currentPhase.settings;
    const playoffTeamsCount = getPlayoffTeamsCount(nextSettings);
    const playoffStages = isPlayoffPhaseType(nextPhaseType)
      ? resolvePlayoffStagesForTeams(nextSettings ?? DEFAULT_PLAYOFF_STAGE_NAMES, playoffTeamsCount)
      : [];
    const playoffStageNames = playoffStages.map((stage) => stage.name);
    const playoffStageMatchCounts = playoffStages.map((stage) => stage.matchCount);
    const syncedSettings = body.settings !== undefined
      ? await buildPhaseSettingsWithSyncedLabels(supabase, body.settings)
      : undefined;

    if (
      isPlayoffPhaseType(nextPhaseType) &&
      (body.phase_type !== undefined || body.settings !== undefined) &&
      playoffTeamsCount < 2
    ) {
      return NextResponse.json(
        { error: 'La fase playoff necesita definir al menos 2 equipos.' },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = typeof body.name === 'string' ? body.name.trim() : body.name;
    if (body.phase_type !== undefined) updateData.phase_type = body.phase_type;
    if (body.order_index !== undefined) updateData.order_index = body.order_index;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.settings !== undefined || body.phase_type !== undefined) {
      updateData.settings = {
        ...(syncedSettings ?? (nextSettings && typeof nextSettings === 'object' ? nextSettings as Record<string, unknown> : {})),
        group_names: nextPhaseType === 'group_stage' ? sanitizedGroupNames : [],
        playoffStages: isPlayoffPhaseType(nextPhaseType) ? buildPlayoffStages(playoffStages) : [],
        playoff_stage_names: isPlayoffPhaseType(nextPhaseType) ? playoffStageNames : [],
        playoffStageMatchCounts: isPlayoffPhaseType(nextPhaseType) ? playoffStageMatchCounts : [],
        playoff_match_counts: isPlayoffPhaseType(nextPhaseType) ? playoffStageMatchCounts : [],
      };
    }

    // Activation clears sibling phases BEFORE the target is set active, so a
    // mid-flight failure leaves at most the target (or zero) active — never two
    // active phases, which would corrupt standings scoping. No DB constraint
    // enforces a single active phase, so this ordering is the only guarantee.
    // Uses currentPhase.season_id (fetched above) since `phase` isn't set yet.
    if (body.is_active === true) {
      let deactivateQuery = supabase
        .from('tournament_phases')
        .update({ is_active: false })
        .eq('tournament_id', tournamentId)
        .neq('id', phaseId);

      if (currentPhase.season_id) {
        deactivateQuery = deactivateQuery.eq('season_id', currentPhase.season_id);
      }

      const { error: deactivateError } = await deactivateQuery;

      if (deactivateError) {
        console.error('Error clearing active phase:', deactivateError);
        return NextResponse.json({ error: 'Error updating active phase' }, { status: 500 });
      }
    }

    const { data: phase, error } = await supabase
      .from('tournament_phases')
      .update(updateData)
      .eq('id', phaseId)
      .eq('tournament_id', tournamentId)
      .select()
      .single();

    if (error) {
      console.error('Error updating phase:', error);
      return NextResponse.json({ error: 'Error updating phase' }, { status: 500 });
    }

    // Sync tournament_groups when updating a group_stage phase.
    //
    // Reconcile BY NAME instead of delete-all + re-insert: a blanket delete
    // would fire the ON DELETE SET NULL on every FK pointing at these groups
    // (participants, standings, matches, phase_participants, ui_labels), so
    // editing an unrelated setting on a group_stage phase silently unassigned
    // every team/match from its zone. We only drop groups whose name was
    // removed and only insert genuinely new names, so untouched groups keep
    // their UUID — and every row that references them keeps its group_id.
    if (phase && (body.phase_type !== undefined || body.settings?.group_names !== undefined)) {
      const shouldHaveGroups = phase.phase_type === 'group_stage';
      const desiredNames = shouldHaveGroups ? sanitizedGroupNames : [];

      const { data: existingGroups, error: existingGroupsError } = await supabase
        .from('tournament_groups')
        .select('id, name, order_index')
        .eq('phase_id', phaseId);

      if (existingGroupsError) {
        console.error('Error loading existing groups for phase:', existingGroupsError);
      } else {
        const existing = (existingGroups ?? []) as Array<{ id: string; name: string; order_index: number }>;
        const desiredSet = new Set(desiredNames);

        // Delete groups whose name is no longer requested.
        const idsToDelete = existing
          .filter((g) => !desiredSet.has(g.name))
          .map((g) => g.id);
        if (idsToDelete.length > 0) {
          const { error: deleteError } = await supabase
            .from('tournament_groups')
            .delete()
            .in('id', idsToDelete);
          if (deleteError) {
            console.error('Error deleting removed groups:', deleteError);
          }
        }

        // Insert names that don't exist yet.
        const existingByName = new Map(existing.map((g) => [g.name, g]));
        const groupInserts = desiredNames
          .map((name, index) => ({ name, index }))
          .filter(({ name }) => !existingByName.has(name))
          .map(({ name, index }) => ({
            phase_id: phaseId,
            season_id: phase.season_id ?? null,
            name,
            order_index: index,
          }));
        if (groupInserts.length > 0) {
          const { error: insertError } = await supabase
            .from('tournament_groups')
            .insert(groupInserts);
          if (insertError) {
            console.error('Error inserting new groups for phase:', insertError);
          }
        }

        // Keep order_index in sync for groups that survived a reorder.
        for (let index = 0; index < desiredNames.length; index++) {
          const kept = existingByName.get(desiredNames[index]);
          if (kept && kept.order_index !== index) {
            const { error: reorderError } = await supabase
              .from('tournament_groups')
              .update({ order_index: index })
              .eq('id', kept.id);
            if (reorderError) {
              console.error('Error reordering group:', reorderError);
            }
          }
        }
      }
    }

    if (phase && isPlayoffPhaseType(phase.phase_type) && (body.phase_type !== undefined || body.settings !== undefined)) {
      const stageConfigs = resolvePlayoffStagesForTeams(phase.settings ?? DEFAULT_PLAYOFF_STAGE_NAMES, getPlayoffTeamsCount(phase.settings));
      const syncResult = await syncPlayoffStagesToRounds(supabase, phaseId, phase.season_id ?? null, stageConfigs);

      if (!syncResult.ok) {
        return NextResponse.json(
          { error: 'La fase se guardo pero no se pudieron sincronizar las etapas playoff.' },
          { status: 500 },
        );
      }

      const bracketResult = await ensurePlayoffBracketMatches(supabase, {
        tournamentId,
        phaseId,
        seasonId: phase.season_id ?? null,
        teamsCount: getPlayoffTeamsCount(phase.settings),
        stageMatchCounts: stageConfigs.map((stage) => stage.matchCount),
      });

      if (!bracketResult.ok) {
        return NextResponse.json(
          { error: 'La fase se guardo pero no se pudo armar el cuadro playoff.' },
          { status: 500 },
        );
      }
    }

    if (phase && (body.phase_type !== undefined || body.settings !== undefined)) {
      const recalcResult = await recalculatePhaseStandingsScopes(tournamentId, phaseId);
      if (!recalcResult.ok) {
        return NextResponse.json(
          { error: 'La fase se guardo pero no se pudieron recalcular las tablas.' },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ data: phase });
  } catch (error: unknown) {
    console.error('Error in PATCH /api/tournaments/[id]/phases/[phaseId]:', error);
    return tournamentApiErrorResponse(error);
  }
}

// DELETE a phase
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string, phaseId: string }> }
) {
  try {
    const { id: tournamentId, phaseId } = await params;
    // Guard ANTES del contexto: un phaseId no-UUID no debe gastar el round-trip de auth.
    if (!isUuid(phaseId)) {
      return NextResponse.json({ error: 'Fase no encontrada' }, { status: 404 });
    }
    const { writer: supabase } = await requireTournamentMutationContext(tournamentId);

    const { data: phaseToDelete, error: phaseLookupError } = await supabase
      .from('tournament_phases')
      .select('id, is_active, season_id')
      .eq('id', phaseId)
      .eq('tournament_id', tournamentId)
      .maybeSingle();

    if (phaseLookupError) {
      console.error('Error fetching phase before delete:', phaseLookupError);
      return NextResponse.json({ error: 'Error deleting phase' }, { status: 500 });
    }

    // Already gone (e.g. a double-clicked delete): report 404, not a generic
    // 500 from .single() finding no row.
    if (!phaseToDelete) {
      return NextResponse.json({ error: 'Fase no encontrada' }, { status: 404 });
    }

    const { error } = await supabase
      .from('tournament_phases')
      .delete()
      .eq('id', phaseId)
      .eq('tournament_id', tournamentId);

    if (error) {
      console.error('Error deleting phase:', error);
      return NextResponse.json({ error: 'Error deleting phase' }, { status: 500 });
    }

    if (phaseToDelete?.is_active) {
      let replacementQuery = supabase
        .from('tournament_phases')
        .select('id')
        .eq('tournament_id', tournamentId)
        .order('order_index', { ascending: true })
        .limit(1);

      if (phaseToDelete.season_id) {
        replacementQuery = replacementQuery.eq('season_id', phaseToDelete.season_id);
      }

      const { data: replacementPhase, error: replacementError } = await replacementQuery.maybeSingle();

      if (replacementError) {
        console.error('Error finding replacement active phase:', replacementError);
        return NextResponse.json({ error: 'Error deleting phase' }, { status: 500 });
      }

      if (replacementPhase?.id) {
        const { error: activateReplacementError } = await supabase
          .from('tournament_phases')
          .update({ is_active: true })
          .eq('id', replacementPhase.id)
          .eq('tournament_id', tournamentId);

        if (activateReplacementError) {
          console.error('Error activating replacement phase:', activateReplacementError);
          return NextResponse.json({ error: 'Error deleting phase' }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error in DELETE /api/tournaments/[id]/phases/[phaseId]:', error);
    return tournamentApiErrorResponse(error);
  }
}
