import { createAdminClient } from '@/lib/supabase/admin';
import { requireTournamentReadContext } from '@/lib/auth/tournamentApi';
import { TOURNAMENT_REVIEW_STATUS } from '@/lib/tournamentReview';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type GateRow = {
    id: string;
    status?: string | null;
    is_visible?: boolean | null;
    review_status?: string | null;
};

/**
 * Un torneo que todavía no es del público: oculto a mano, borrador, o el de
 * un club esperando revisión (o rechazado).
 *
 * A propósito NO usa `isTournamentVisibleToPublic`: esa regla esconde también
 * los `archived`, y las ediciones viejas archivadas se siguen viendo en el
 * historial y en el selector de temporadas. Acá sólo se cierra lo que nunca
 * se publicó.
 */
function isUnpublishedTournament(row: GateRow): boolean {
    if (row.is_visible === false) return true;
    const status = typeof row.status === 'string' ? row.status.trim().toLowerCase() : '';
    if (status === 'draft') return true;
    return row.review_status === TOURNAMENT_REVIEW_STATUS.pendingLink
        || row.review_status === TOURNAMENT_REVIEW_STATUS.rejected;
}

async function lookupGateRow(idOrSlug: string): Promise<GateRow | null> {
    const value = String(idOrSlug ?? '').trim();
    if (!value) return null;
    const column = UUID_RE.test(value) ? 'id' : 'slug';
    const admin = createAdminClient() as any;

    let result = await admin
        .from('tournaments')
        .select('id, status, is_visible, review_status')
        .eq(column, value)
        .maybeSingle();
    if (isMissingColumnError(result.error, 'review_status')) {
        result = await admin
            .from('tournaments')
            .select('id, status, is_visible')
            .eq(column, value)
            .maybeSingle();
    }
    if (result.error || !result.data) return null;
    return result.data as GateRow;
}

/**
 * Las lecturas públicas de un torneo (ficha, data, temporadas, histórica,
 * fixture) leían cualquier torneo por id, incluidos borradores y ocultos: el
 * fixture de un torneo sin anunciar salía con sólo adivinar la URL.
 *
 * `denied` = contestar 404. Un torneo publicado pasa sin tocar la sesión
 * (`public`); uno sin publicar pasa (`restricted`) sólo si quien pregunta puede
 * leerlo en el gestor (`requireTournamentReadContext`), que es lo que usa el
 * gestor logueado al pedir estas mismas rutas. Un id que no está en la base
 * (proveedores externos) no se juzga acá: lo resuelve cada ruta como antes.
 */
export type TournamentReadAccess = 'public' | 'restricted' | 'denied';

/**
 * `restricted`: se puede contestar, pero la respuesta NO puede quedar en una
 * caché compartida (s-maxage): si no, el borde le sirve al público lo que
 * pidió el admin.
 */
export async function getTournamentReadAccess(idOrSlug: string): Promise<TournamentReadAccess> {
    const row = await lookupGateRow(idOrSlug).catch(() => null);
    if (!row) return 'public';
    if (!isUnpublishedTournament(row)) return 'public';

    try {
        await requireTournamentReadContext(row.id);
        return 'restricted';
    } catch {
        return 'denied';
    }
}

export const PRIVATE_NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;
