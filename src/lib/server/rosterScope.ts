import { parseRosterOwnerClubId } from '../clubRoster.ts';

/**
 * UN PLANTEL AJENO NO SE TOCA DESDE OTRO CLUB.
 *
 * `/api/club-admin/roster` autoriza sobre `clubId`, pero personService decide
 * sobre QUE club opera leyendo el `divisionId`: `club-roster-<X>` y
 * `family-division|<X>|grupo` llevan el club dueño del plantel embebido. Como el
 * `divisionId` lo manda el cliente y todo corre con service role, un editor de
 * cualquier club podia leer, pisar (nombre, DNI, nacimiento) y desvincular
 * jugadores de un club con el que no tiene nada que ver.
 *
 * El dueño embebido solo es legitimo si es el propio `clubId` o el club al que
 * `club_family_divisions` le asigna el plantel de `clubId` — exactamente los ids
 * que `divisionService.fetchFamilyDivisions(clubId)` le ofrece a la UI.
 */

type RosterScopeClient = {
    from: (table: string) => any;
};

export const FOREIGN_ROSTER_MESSAGE = 'Ese plantel no pertenece a este club.';

export async function assertDivisionBelongsToClub(
    client: RosterScopeClient,
    clubId: string,
    divisionId: string | null | undefined,
): Promise<void> {
    const ownerClubId = parseRosterOwnerClubId(divisionId);
    if (!ownerClubId || ownerClubId === clubId) return;

    const { data, error } = await client
        .from('club_family_divisions')
        .select('roster_owner_club_id')
        .eq('roster_owner_club_id', ownerClubId)
        .eq('division_club_id', clubId)
        .limit(1)
        .maybeSingle();

    if (error) {
        // Sin la tabla tampoco hay familia que justifique un dueño distinto.
        console.error('[rosterScope] lookup failed:', error);
        throw new Error(FOREIGN_ROSTER_MESSAGE);
    }

    if (!data) {
        console.error('[rosterScope] foreign roster rejected', { clubId, ownerClubId });
        throw new Error(FOREIGN_ROSTER_MESSAGE);
    }
}
