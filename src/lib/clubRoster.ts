export const CLUB_BASE_ROSTER_ID_PREFIX = 'club-roster-';

export function buildClubBaseRosterId(clubId: string) {
    return `${CLUB_BASE_ROSTER_ID_PREFIX}${clubId}`;
}

export function parseClubBaseRosterId(divisionId?: string | null) {
    if (!divisionId?.startsWith(CLUB_BASE_ROSTER_ID_PREFIX)) return null;

    const clubId = divisionId.slice(CLUB_BASE_ROSTER_ID_PREFIX.length).trim();
    return clubId || null;
}

export const FAMILY_DIVISION_ID_PREFIX = 'family-division';

/** `family-division|<clubDuenoDelPlantel>|<grupo>`, el id sintetico que arma divisionService. */
export function parseFamilyDivisionId(divisionId?: string | null) {
    if (!divisionId?.startsWith(`${FAMILY_DIVISION_ID_PREFIX}|`)) return null;
    const [, rosterOwnerClubId, encodedName] = divisionId.split('|');
    if (!rosterOwnerClubId) return null;

    return {
        rosterOwnerClubId,
        groupName: encodedName ? decodeURIComponent(encodedName) : null,
    };
}

/**
 * El club cuyo plantel nombra un divisionId, o null si el id es una division
 * comun (sin club embebido).
 */
export function parseRosterOwnerClubId(divisionId?: string | null) {
    return parseClubBaseRosterId(divisionId) ?? parseFamilyDivisionId(divisionId)?.rosterOwnerClubId ?? null;
}

export function isClubBaseRosterId(divisionId?: string | null, clubId?: string) {
    const resolvedClubId = parseClubBaseRosterId(divisionId);
    if (!resolvedClubId) return false;
    return clubId ? resolvedClubId === clubId : true;
}
