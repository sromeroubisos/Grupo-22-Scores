import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentReadContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';

/**
 * El registro de cambios de la tabla de posiciones.
 *
 * Tenía dos problemas que se tapaban entre sí:
 *
 *   1. Leía con el cliente anónimo, y la política de `admin_audit_log` exige
 *      `authorize_admin()`. Un administrador DE TORNEO —que es justamente quien
 *      opera esta pantalla— recibía una lista vacía y ningún error: parecía que
 *      no había pasado nada, cuando lo que pasaba es que no podía verlo.
 *   2. Filtraba sólo `entity_type = 'standings'`, así que los cambios de
 *      reglamento (`phase_rules`, que se guardan con el id de la FASE) nunca
 *      aparecían. Cambiar los puntos por victoria es exactamente el tipo de
 *      cambio que uno viene a buscar acá.
 *
 * Se consultan las dos familias por separado y se mezclan por fecha: es más
 * claro que armar un `or(and(...),and(...))` de PostgREST y no tiene que escapar
 * una lista de ids adentro de un string de filtro.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tournamentId } = await params;
        const { writer: supabase } = await requireTournamentReadContext(tournamentId);

        const searchParams = request.nextUrl.searchParams;
        const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);

        const { data: phases } = await supabase
            .from('tournament_phases')
            .select('id')
            .eq('tournament_id', tournamentId);

        const phaseIds = (phases ?? []).map((phase: { id: string }) => phase.id);

        const SELECT = 'id, created_at, action, entity_type, entity_id, changes, actor_user_id';

        const [standingsRes, rulesRes] = await Promise.all([
            supabase
                .from('admin_audit_log')
                .select(SELECT)
                .eq('entity_type', 'standings')
                .eq('entity_id', tournamentId)
                .order('created_at', { ascending: false })
                .limit(limit),
            phaseIds.length > 0
                ? supabase
                    .from('admin_audit_log')
                    .select(SELECT)
                    .eq('entity_type', 'phase_rules')
                    .in('entity_id', phaseIds)
                    .order('created_at', { ascending: false })
                    .limit(limit)
                : Promise.resolve({ data: [], error: null }),
        ]);

        if (standingsRes.error) throw standingsRes.error;
        if (rulesRes.error) throw rulesRes.error;

        type AuditRow = { created_at?: string | null };
        const entries = [...(standingsRes.data ?? []), ...(rulesRes.data ?? [])]
            .sort((a: AuditRow, b: AuditRow) =>
                new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
            )
            .slice(0, limit);

        return NextResponse.json({ ok: true, entries });
    } catch (e: unknown) {
        console.error('Exception fetching standings audit log:', e);
        return tournamentApiErrorResponse(e);
    }
}
