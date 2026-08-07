import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import {
    recalculateAndPersistStandings,
    recalculatePhaseStandingsScopes,
} from '@/lib/server/recalculateStandings';
import { normalizeTableType } from '@/lib/standings/tableType';
import { supportsStandingsTableTypeColumn } from '@/lib/standings/tableTypeSupport';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tournamentId } = await params;
        const { writer: supabase, actorUserId } = await requireTournamentMutationContext(tournamentId);
        const body = await request.json();
        const {
            phaseId,
            groupId,
            seasonId = body?.season_id ?? body?.season ?? null,
        } = body;

        if (!phaseId) {
            return NextResponse.json({ error: 'phaseId is required' }, { status: 400 });
        }

        const tableType = normalizeTableType(body?.tableType);
        if (!tableType) {
            return NextResponse.json(
                { error: 'tableType inválido: se esperaba general, home o away.' },
                { status: 400 },
            );
        }

        /**
         * Mientras `table_type` no sea una columna real, las filas de las tres
         * perspectivas comparten el mismo espacio y el borrado previo al
         * recálculo no las distingue: recalcular "Local" arrasaría con la tabla
         * general publicada. Hasta la migración, la única perspectiva que se
         * persiste es la general.
         *
         * El freno vive acá y no en el botón: un `disabled` es cortesía para el
         * operador, no un control — cualquier cliente puede mandar el POST.
         *
         * Se levanta solo cuando la columna aparece, sin redeploy: el sondeo
         * cachea el "todavía no" por 30 segundos (ver tableTypeSupport.ts).
         */
        if (tableType !== 'general' && !(await supportsStandingsTableTypeColumn())) {
            return NextResponse.json(
                {
                    error: 'Todavía no se puede publicar la tabla de local ni la de visitante: falta la migración de table_type. Recalculá en General.',
                },
                { status: 409 },
            );
        }

        const { data: phase, error: phaseError } = await supabase
            .from('tournament_phases')
            .select('id')
            .eq('id', phaseId)
            .eq('tournament_id', tournamentId)
            .single();

        if (phaseError || !phase) {
            return NextResponse.json({ error: 'Phase not found in this tournament' }, { status: 404 });
        }

        const result = groupId
            ? await recalculateAndPersistStandings(tournamentId, phaseId, groupId, tableType, seasonId)
            : await recalculatePhaseStandingsScopes(tournamentId, phaseId, tableType, seasonId);

        if (!result.ok) {
            return NextResponse.json({ error: 'Failed to recalculate standings' }, { status: 500 });
        }

        /**
         * Auditoría. `actor_user_id` es NOT NULL: sin él el insert venía
         * fallando siempre y en silencio, así que un recálculo que reescribe la
         * tabla publicada no dejaba ningún rastro de quién lo pidió. El error se
         * mira —y se loguea— aunque no aborte la respuesta: la tabla ya se
         * recalculó bien y devolver un 500 acá sería mentir sobre el resultado.
         */
        const calculatedAt = new Date().toISOString();
        const { error: auditError } = await supabase.from('admin_audit_log').insert({
            entity_type: 'standings',
            entity_id: tournamentId,
            actor_user_id: actorUserId,
            action: 'recalculated_standings_table',
            changes: {
                phase_id: phaseId,
                season_id: seasonId ?? null,
                group_id: groupId ?? null,
                table_type: tableType,
                rows_calculated: result.rows_calculated,
                calculated_at: calculatedAt,
            },
        });

        if (auditError) {
            console.error('[standings/recalculate] No se pudo registrar la auditoría', auditError);
        }

        return NextResponse.json({
            ok: true,
            rows_calculated: result.rows_calculated,
            calculated_at: calculatedAt,
        });
    } catch (e: unknown) {
        if (e instanceof Error && (e.name === 'TournamentApiError')) {
            return tournamentApiErrorResponse(e);
        }

        const message = e instanceof Error ? e.message : 'Unknown error';
        console.error('Exception recalculating standings:', e);
        return NextResponse.json(
            { error: 'Failed to recalculate standings', details: message },
            { status: 500 },
        );
    }
}
