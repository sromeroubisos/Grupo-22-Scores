/**
 * UN EVENTO NO SE MUDA DE PARTIDO.
 *
 * `persistMatchCenterSupplementalData` guarda los eventos con
 * `upsert(..., { onConflict: 'id' })`, y el `id` lo manda el cliente (un UUID
 * bien formado se respeta tal cual). La autorizacion de la ruta es sobre ESTE
 * partido, pero la clave del upsert es global: si el id pertenece a un evento de
 * otro partido, el upsert lo reescribe y le cambia el `match_id`. Como los ids de
 * `match_events` son publicos, un editor del partido A podia pisar tries y
 * tarjetas de un torneo ajeno.
 *
 * El borrado ya estaba atado al partido (`.eq('match_id', matchId)`); esto pone
 * el mismo invariante del lado de la escritura. Corre con el cliente que escribe
 * (service role), asi que ve las filas de cualquier partido.
 */

type EventOwnershipClient = {
    from: (table: string) => any;
};

export type MatchEventOwnerRow = {
    id: string;
    match_id: string | null;
};

export const FOREIGN_EVENT_MESSAGE = 'Uno de los eventos enviados pertenece a otro partido.';

/** Los ids que ya existen colgados de OTRO partido. Puro, para testearlo solo. */
export function findForeignEventIds(rows: readonly MatchEventOwnerRow[], matchId: string): string[] {
    return rows
        .filter((row) => String(row.match_id ?? '') !== String(matchId))
        .map((row) => String(row.id));
}

/**
 * Rechaza la escritura si algun id ya existe en otro partido. Los ids que no
 * existen todavia son eventos nuevos y pasan.
 */
export async function assertEventIdsBelongToMatch(
    client: EventOwnershipClient,
    matchId: string,
    eventIds: readonly unknown[],
): Promise<void> {
    const ids = Array.from(new Set(eventIds.map((id) => String(id ?? '').trim()).filter(Boolean)));
    if (ids.length === 0) return;

    const { data, error } = await client
        .from('match_events')
        .select('id, match_id')
        .in('id', ids);

    if (error) {
        console.error('[matchEventOwnership] lookup failed:', error);
        throw new Error('No se pudieron validar los eventos del partido.');
    }

    const foreign = findForeignEventIds((data || []) as MatchEventOwnerRow[], matchId);
    if (foreign.length > 0) {
        console.error('[matchEventOwnership] foreign event ids rejected', { matchId, foreign });
        throw new Error(FOREIGN_EVENT_MESSAGE);
    }
}
