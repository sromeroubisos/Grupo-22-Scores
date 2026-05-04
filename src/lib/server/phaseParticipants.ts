import { isMissingTableError } from '@/lib/utils/supabaseSchema';

type SupabaseLike = {
  from: (table: string) => any;
};

type ParticipantRow = {
  id: string;
  club_id: string | null;
  name: string | null;
  group_id: string | null;
  status: string | null;
  clubs?: {
    name?: string | null;
    logo_url?: string | null;
  } | Array<{
    name?: string | null;
    logo_url?: string | null;
  }> | null;
};

type PhaseAssignmentRow = {
  participant_id: string;
  group_id: string | null;
  status: string | null;
  seed: number | null;
};

export type PhaseScopedParticipant = ParticipantRow;

function normalizeClubRelation(clubs: ParticipantRow['clubs']) {
  return Array.isArray(clubs) ? clubs[0] ?? null : clubs ?? null;
}

function isInactiveStatus(status: string | null | undefined) {
  const normalized = String(status ?? '').trim().toLowerCase();
  return normalized === 'withdrawn' || normalized === 'disqualified' || normalized === 'archived';
}

async function loadLegacyParticipants(
  supabase: SupabaseLike,
  params: {
    tournamentId: string;
    groupId?: string | null;
    seasonId?: string | null;
  },
): Promise<PhaseScopedParticipant[]> {
  let query = supabase
    .from('tournament_participants')
    .select('id, club_id, name, group_id, status, clubs:club_id(name, logo_url)')
    .eq('tournament_id', params.tournamentId)
    .not('status', 'in', '("withdrawn","disqualified","archived")');

  if (params.seasonId) query = query.eq('season_id', params.seasonId);
  if (params.groupId) query = query.eq('group_id', params.groupId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((participant: ParticipantRow) => ({
    ...participant,
    clubs: normalizeClubRelation(participant.clubs),
  }));
}

export async function loadPhaseScopedParticipants(
  supabase: SupabaseLike,
  params: {
    tournamentId: string;
    phaseId: string;
    groupId?: string | null;
    seasonId?: string | null;
  },
): Promise<{ participants: PhaseScopedParticipant[]; tableReady: boolean }> {
  let assignmentQuery = supabase
    .from('tournament_phase_participants')
    .select('participant_id, group_id, status, seed')
    .eq('tournament_id', params.tournamentId)
    .eq('phase_id', params.phaseId)
    .not('status', 'in', '("withdrawn","disqualified","archived")');

  if (params.seasonId) assignmentQuery = assignmentQuery.eq('season_id', params.seasonId);
  if (params.groupId) assignmentQuery = assignmentQuery.eq('group_id', params.groupId);

  const { data: assignments, error: assignmentsError } = await assignmentQuery;

  if (assignmentsError) {
    if (isMissingTableError(assignmentsError, 'tournament_phase_participants')) {
      const participants = await loadLegacyParticipants(supabase, {
        tournamentId: params.tournamentId,
        groupId: params.groupId,
        seasonId: params.seasonId,
      });
      return { participants, tableReady: false };
    }

    throw assignmentsError;
  }

  const assignmentRows = (assignments ?? []) as PhaseAssignmentRow[];
  if (assignmentRows.length === 0) {
    return { participants: [], tableReady: true };
  }

  const participantIds = Array.from(new Set(assignmentRows.map((row) => row.participant_id).filter(Boolean)));
  const assignmentByParticipantId = new Map(
    assignmentRows.map((row) => [row.participant_id, row]),
  );

  let participantsQuery = supabase
    .from('tournament_participants')
    .select('id, club_id, name, group_id, status, clubs:club_id(name, logo_url)')
    .eq('tournament_id', params.tournamentId)
    .in('id', participantIds)
    .not('status', 'in', '("withdrawn","disqualified","archived")');

  if (params.seasonId) participantsQuery = participantsQuery.eq('season_id', params.seasonId);

  const { data: participants, error: participantsError } = await participantsQuery;
  if (participantsError) throw participantsError;

  const scopedParticipants = (participants ?? [])
    .map((participant: ParticipantRow) => {
      const assignment = assignmentByParticipantId.get(participant.id);
      if (!assignment || isInactiveStatus(assignment.status)) return null;

      return {
        ...participant,
        group_id: assignment.group_id,
        status: participant.status,
        clubs: normalizeClubRelation(participant.clubs),
      };
    })
    .filter((participant): participant is PhaseScopedParticipant => Boolean(participant));

  return { participants: scopedParticipants, tableReady: true };
}
