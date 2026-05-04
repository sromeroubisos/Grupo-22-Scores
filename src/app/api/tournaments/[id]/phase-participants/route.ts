import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';

export const dynamic = 'force-dynamic';

type PhaseAssignmentPayload = {
  id: string;
  tournament_id: string;
  season_id: string | null;
  phase_id: string;
  participant_id: string;
  group_id: string | null;
  status: string;
  seed: number | null;
  notes: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeParticipantIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(normalizeString).filter(Boolean)));
}

async function resolveSeasonId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tournamentId: string,
  explicitSeasonId?: string | null,
) {
  const requested = normalizeString(explicitSeasonId);
  if (requested) return requested;

  const { data } = await supabase
    .from('tournaments')
    .select('current_season_id')
    .eq('id', tournamentId)
    .maybeSingle();

  return data?.current_season_id ?? null;
}

async function loadPhase(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tournamentId: string,
  phaseId: string,
) {
  const { data, error } = await supabase
    .from('tournament_phases')
    .select('id, tournament_id, season_id')
    .eq('id', phaseId)
    .eq('tournament_id', tournamentId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function loadGroup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  phaseId: string,
  groupId: string,
) {
  const { data, error } = await supabase
    .from('tournament_groups')
    .select('id, phase_id, season_id')
    .eq('id', groupId)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.phase_id !== phaseId) return null;
  return data;
}

function missingTableResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: 'Falta aplicar la migracion de participantes por fase en Supabase.',
      tableReady: false,
    },
    { status: 409 },
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tournamentId = (await params).id;
    const supabase = await createClient();
    const requestedSeasonId =
      request.nextUrl.searchParams.get('seasonId') ||
      request.nextUrl.searchParams.get('season_id') ||
      request.nextUrl.searchParams.get('season');
    const scopedSeasonId = await resolveSeasonId(supabase, tournamentId, requestedSeasonId);

    let query = supabase
      .from('tournament_phase_participants')
      .select(`
        id,
        tournament_id,
        season_id,
        phase_id,
        participant_id,
        group_id,
        status,
        seed,
        notes,
        created_at,
        updated_at
      `)
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: true });

    if (scopedSeasonId) query = query.eq('season_id', scopedSeasonId);

    const { data, error } = await query;

    if (error) {
      if (isMissingTableError(error, 'tournament_phase_participants')) {
        return NextResponse.json({ ok: true, tableReady: false, assignments: [] });
      }
      throw error;
    }

    return NextResponse.json({
      ok: true,
      tableReady: true,
      assignments: (data ?? []) as PhaseAssignmentPayload[],
    });
  } catch (error: unknown) {
    console.error('Error in GET /api/tournaments/[id]/phase-participants:', error);
    return tournamentApiErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tournamentId = (await params).id;
    const { writer: supabase } = await requireTournamentMutationContext(tournamentId);
    const body = await request.json().catch(() => ({}));
    const phaseId = normalizeString(body?.phaseId ?? body?.phase_id);
    const participantIds = normalizeParticipantIds(body?.participantIds ?? body?.participant_ids);
    const groupId = normalizeString(body?.groupId ?? body?.group_id) || null;
    const status = normalizeString(body?.status) || 'active';

    if (!phaseId) {
      return NextResponse.json({ error: 'phaseId es requerido.' }, { status: 400 });
    }
    if (participantIds.length === 0) {
      return NextResponse.json({ error: 'Selecciona al menos un participante.' }, { status: 400 });
    }

    const phase = await loadPhase(supabase, tournamentId, phaseId);
    if (!phase) {
      return NextResponse.json({ error: 'La fase no pertenece a este torneo.' }, { status: 404 });
    }

    let resolvedGroupId: string | null = null;
    if (groupId) {
      const group = await loadGroup(supabase, phaseId, groupId);
      if (!group) {
        return NextResponse.json({ error: 'El grupo no pertenece a la fase seleccionada.' }, { status: 400 });
      }
      resolvedGroupId = group.id;
    }

    let participantsQuery = supabase
      .from('tournament_participants')
      .select('id, tournament_id, season_id, seed')
      .eq('tournament_id', tournamentId)
      .in('id', participantIds);

    if (phase.season_id) participantsQuery = participantsQuery.eq('season_id', phase.season_id);

    const { data: participants, error: participantsError } = await participantsQuery;
    if (participantsError) throw participantsError;

    if ((participants ?? []).length !== participantIds.length) {
      return NextResponse.json(
        { error: 'Uno o mas participantes no pertenecen a este torneo o temporada.' },
        { status: 400 },
      );
    }

    const rows = (participants ?? []).map((participant: { id: string; season_id?: string | null; seed?: number | null }) => ({
      tournament_id: tournamentId,
      season_id: phase.season_id ?? participant.season_id ?? null,
      phase_id: phaseId,
      participant_id: participant.id,
      group_id: resolvedGroupId,
      status,
      seed: participant.seed ?? null,
      notes: typeof body?.notes === 'string' ? body.notes : null,
    }));

    const { data, error } = await supabase
      .from('tournament_phase_participants')
      .upsert(rows, { onConflict: 'phase_id,participant_id' })
      .select(`
        id,
        tournament_id,
        season_id,
        phase_id,
        participant_id,
        group_id,
        status,
        seed,
        notes,
        created_at,
        updated_at
      `);

    if (error) {
      if (isMissingTableError(error, 'tournament_phase_participants')) {
        return missingTableResponse();
      }
      throw error;
    }

    if (resolvedGroupId) {
      const { error: participantGroupError } = await supabase
        .from('tournament_participants')
        .update({ group_id: resolvedGroupId })
        .in('id', participantIds)
        .eq('tournament_id', tournamentId);

      if (participantGroupError) {
        console.error('[phase-participants] Could not sync legacy group_id:', participantGroupError);
      }
    }

    return NextResponse.json({
      ok: true,
      tableReady: true,
      assignments: (data ?? []) as PhaseAssignmentPayload[],
    });
  } catch (error: unknown) {
    console.error('Error in POST /api/tournaments/[id]/phase-participants:', error);
    return tournamentApiErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tournamentId = (await params).id;
    const { writer: supabase } = await requireTournamentMutationContext(tournamentId);
    const body = await request.json().catch(() => ({}));
    const phaseId = normalizeString(body?.phaseId ?? body?.phase_id);
    const participantIds = normalizeParticipantIds(body?.participantIds ?? body?.participant_ids);

    if (!phaseId) {
      return NextResponse.json({ error: 'phaseId es requerido.' }, { status: 400 });
    }
    if (participantIds.length === 0) {
      return NextResponse.json({ error: 'Selecciona al menos un participante.' }, { status: 400 });
    }

    const phase = await loadPhase(supabase, tournamentId, phaseId);
    if (!phase) {
      return NextResponse.json({ error: 'La fase no pertenece a este torneo.' }, { status: 404 });
    }

    const { error } = await supabase
      .from('tournament_phase_participants')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('phase_id', phaseId)
      .in('participant_id', participantIds);

    if (error) {
      if (isMissingTableError(error, 'tournament_phase_participants')) {
        return missingTableResponse();
      }
      throw error;
    }

    const { data: phaseGroups, error: groupsError } = await supabase
      .from('tournament_groups')
      .select('id')
      .eq('phase_id', phaseId);

    if (groupsError) {
      console.error('[phase-participants] Could not load phase groups for legacy cleanup:', groupsError);
    }

    const phaseGroupIds = (phaseGroups ?? []).map((group: { id: string }) => group.id);
    if (phaseGroupIds.length > 0) {
      const { error: cleanupError } = await supabase
        .from('tournament_participants')
        .update({ group_id: null })
        .eq('tournament_id', tournamentId)
        .in('id', participantIds)
        .in('group_id', phaseGroupIds);

      if (cleanupError) {
        console.error('[phase-participants] Could not clear legacy group_id:', cleanupError);
      }
    }

    return NextResponse.json({ ok: true, removed: participantIds.length, tableReady: true });
  } catch (error: unknown) {
    console.error('Error in DELETE /api/tournaments/[id]/phase-participants:', error);
    return tournamentApiErrorResponse(error);
  }
}
