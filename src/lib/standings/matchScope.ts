export const FINAL_STANDINGS_STATUSES = ['final', 'finished', 'ft'] as const;

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function getParticipantTeamId(participant: Record<string, unknown>): string {
  return normalizeString(participant.club_id ?? participant.id);
}

function getMatchTeamId(match: Record<string, unknown>, side: 'home' | 'away'): string {
  return normalizeString(match[`${side}_club_id`] ?? match[`${side}_participant_id`]);
}

export function isFinalStandingsStatus(status: unknown): boolean {
  const normalized = normalizeString(status).toLowerCase();
  return FINAL_STANDINGS_STATUSES.includes(
    normalized as (typeof FINAL_STANDINGS_STATUSES)[number],
  );
}

export function filterMatchesForGroupScope<
  TMatch extends Record<string, unknown>,
  TParticipant extends Record<string, unknown>,
>(
  matches: TMatch[],
  participants: TParticipant[],
  groupId?: string | null,
): TMatch[] {
  const normalizedGroupId = normalizeString(groupId);
  if (!normalizedGroupId) return matches;

  const groupTeamIds = new Set(
    participants
      .map((participant) => getParticipantTeamId(participant))
      .filter(Boolean),
  );

  return matches.filter((match) => {
    const matchGroupId = normalizeString(match.group_id);
    if (matchGroupId) return matchGroupId === normalizedGroupId;

    const homeId = getMatchTeamId(match, 'home');
    const awayId = getMatchTeamId(match, 'away');

    return Boolean(homeId && awayId && groupTeamIds.has(homeId) && groupTeamIds.has(awayId));
  });
}
