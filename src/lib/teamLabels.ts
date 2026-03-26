export type TeamLabelRecord = {
  id?: string | null;
  name?: string | null;
  color?: string | null;
  scope?: string | null;
};

export type TeamLabelAssignmentRecord = {
  id?: string | null;
  label_id?: string | null;
  club_id?: string | null;
  position?: number | string | null;
  tournament_id?: string | null;
  phase_id?: string | null;
  group_id?: string | null;
  created_at?: string | null;
  label?: TeamLabelRecord | TeamLabelRecord[] | null;
};

export type NormalizedTeamLabel = {
  id: string;
  name: string;
  color: string;
  scope: string;
};

export type NormalizedTeamLabelAssignment = {
  id: string | null;
  label_id: string | null;
  club_id: string | null;
  position?: number;
  tournament_id: string | null;
  phase_id: string | null;
  group_id: string | null;
  created_at: string | null;
  label: NormalizedTeamLabel | null;
};

type StandingsLabelContext = {
  position?: number | string | null;
  phase_id?: string | null;
  group_id?: string | null;
};

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    if (Number.isInteger(numeric)) return numeric;
  }
  return undefined;
}

export function normalizeTeamLabel(record: unknown): NormalizedTeamLabel | null {
  if (!record || typeof record !== 'object') return null;

  const raw = record as TeamLabelRecord;
  const id = normalizeNullableString(raw.id);
  const name = normalizeNullableString(raw.name);
  const color = normalizeNullableString(raw.color);

  if (!id || !name || !color) return null;

  return {
    id,
    name,
    color,
    scope: normalizeNullableString(raw.scope) ?? 'standings',
  };
}

export function normalizeTeamLabelAssignment(record: unknown): NormalizedTeamLabelAssignment | null {
  if (!record || typeof record !== 'object') return null;

  const raw = record as TeamLabelAssignmentRecord;
  const rawLabel = Array.isArray(raw.label) ? raw.label[0] : raw.label;

  return {
    id: normalizeNullableString(raw.id),
    label_id: normalizeNullableString(raw.label_id),
    club_id: normalizeNullableString(raw.club_id),
    position: normalizeOptionalInteger(raw.position),
    tournament_id: normalizeNullableString(raw.tournament_id),
    phase_id: normalizeNullableString(raw.phase_id),
    group_id: normalizeNullableString(raw.group_id),
    created_at: normalizeNullableString(raw.created_at),
    label: normalizeTeamLabel(rawLabel),
  };
}

export function normalizeTeamLabelAssignments(records: unknown[]): NormalizedTeamLabelAssignment[] {
  if (!Array.isArray(records)) return [];

  return records
    .map((record) => normalizeTeamLabelAssignment(record))
    .filter((record): record is NormalizedTeamLabelAssignment => !!record);
}

function getAssignmentPriority(
  assignment: NormalizedTeamLabelAssignment,
  phaseId: string | null,
  groupId: string | null,
) {
  const assignmentPhaseId = assignment.phase_id ?? null;
  const assignmentGroupId = assignment.group_id ?? null;

  if (assignmentGroupId && assignmentGroupId !== groupId) return 0;
  if (assignmentPhaseId && assignmentPhaseId !== phaseId) return 0;

  if (assignmentPhaseId === phaseId && !assignmentGroupId && assignmentPhaseId) {
    // Phase-level position labels should win in grouped phases so the same
    // standing position can be shared across every group in the phase.
    return 5;
  }
  if (assignmentPhaseId === phaseId && assignmentGroupId === groupId && (assignmentPhaseId || assignmentGroupId)) {
    return 4;
  }
  if (!assignmentPhaseId && assignmentGroupId === groupId && assignmentGroupId) {
    return 3;
  }
  if (!assignmentPhaseId && !assignmentGroupId) {
    return 2;
  }

  return 1;
}

export function resolveStandingsRowLabel(
  row: StandingsLabelContext | null | undefined,
  assignments: NormalizedTeamLabelAssignment[],
): NormalizedTeamLabel | null {
  const position = normalizeOptionalInteger(row?.position);
  if (!position) return null;

  const phaseId = normalizeNullableString(row?.phase_id) ?? null;
  const groupId = normalizeNullableString(row?.group_id) ?? null;

  const matches = assignments
    .filter((assignment) => assignment.position === position && assignment.label?.color)
    .sort((left, right) => {
      return getAssignmentPriority(right, phaseId, groupId) - getAssignmentPriority(left, phaseId, groupId);
    });

  return matches[0]?.label ?? null;
}
