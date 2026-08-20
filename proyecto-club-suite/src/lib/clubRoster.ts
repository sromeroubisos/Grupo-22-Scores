export const CLUB_BASE_ROSTER_ID_PREFIX = 'club-roster-';

export function buildClubBaseRosterId(clubId: string) {
    return `${CLUB_BASE_ROSTER_ID_PREFIX}${clubId}`;
}

export function parseClubBaseRosterId(divisionId?: string | null) {
    if (!divisionId?.startsWith(CLUB_BASE_ROSTER_ID_PREFIX)) return null;

    const clubId = divisionId.slice(CLUB_BASE_ROSTER_ID_PREFIX.length).trim();
    return clubId || null;
}

export function isClubBaseRosterId(divisionId?: string | null, clubId?: string) {
    const resolvedClubId = parseClubBaseRosterId(divisionId);
    if (!resolvedClubId) return false;
    return clubId ? resolvedClubId === clubId : true;
}
