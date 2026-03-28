import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildPhaseSettingsWithSyncedLabels } from '@/lib/server/phaseLabels';

// PATCH update a phase
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string, phaseId: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: tournamentId, phaseId } = await params;
    const body = await request.json();
    const nextPhaseType = body.phase_type;
    const sanitizedGroupNames: string[] = (body.settings?.group_names || [])
      .filter((n: unknown) => typeof n === 'string' && n.trim())
      .map((name: string) => name.trim());
    const syncedSettings = body.settings !== undefined
      ? await buildPhaseSettingsWithSyncedLabels(supabase, body.settings)
      : undefined;

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = typeof body.name === 'string' ? body.name.trim() : body.name;
    if (body.phase_type !== undefined) updateData.phase_type = body.phase_type;
    if (body.order_index !== undefined) updateData.order_index = body.order_index;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.settings !== undefined) {
      updateData.settings = {
        ...syncedSettings,
        group_names: nextPhaseType === 'group_stage' ? sanitizedGroupNames : [],
      };
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

    if (body.is_active === true) {
      const { error: deactivateError } = await supabase
        .from('tournament_phases')
        .update({ is_active: false })
        .eq('tournament_id', tournamentId)
        .neq('id', phaseId);

      if (deactivateError) {
        console.error('Error clearing active phase:', deactivateError);
        return NextResponse.json({ error: 'Error updating active phase' }, { status: 500 });
      }
    }

    // Sync tournament_groups when updating a group_stage phase
    if (phase && (body.phase_type !== undefined || body.settings?.group_names !== undefined)) {
      const shouldHaveGroups = (nextPhaseType ?? phase.phase_type) === 'group_stage';
      // Delete existing groups for this phase then re-insert
      const { error: deleteError } = await supabase
        .from('tournament_groups')
        .delete()
        .eq('phase_id', phaseId);

      if (deleteError) {
        console.error('Error deleting old groups:', deleteError);
      } else if (shouldHaveGroups && sanitizedGroupNames.length > 0) {
        const groupInserts = sanitizedGroupNames.map((name, index) => ({
          phase_id: phaseId,
          name: name.trim(),
          order_index: index,
        }));
        const { error: insertError } = await supabase
          .from('tournament_groups')
          .insert(groupInserts);
        if (insertError) {
          console.error('Error re-creating groups for phase:', insertError);
        }
      }
    }

    return NextResponse.json({ data: phase });
  } catch (error: unknown) {
    console.error('Error in PATCH /api/tournaments/[id]/phases/[phaseId]:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

// DELETE a phase
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string, phaseId: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: tournamentId, phaseId } = await params;

    const { data: phaseToDelete, error: phaseLookupError } = await supabase
      .from('tournament_phases')
      .select('id, is_active')
      .eq('id', phaseId)
      .eq('tournament_id', tournamentId)
      .single();

    if (phaseLookupError) {
      console.error('Error fetching phase before delete:', phaseLookupError);
      return NextResponse.json({ error: 'Error deleting phase' }, { status: 500 });
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
      const { data: replacementPhase, error: replacementError } = await supabase
        .from('tournament_phases')
        .select('id')
        .eq('tournament_id', tournamentId)
        .order('order_index', { ascending: true })
        .limit(1)
        .maybeSingle();

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
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
