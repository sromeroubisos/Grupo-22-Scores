import { NextRequest, NextResponse } from 'next/server';
import { FixtureService } from '@/lib/services/fixtureService';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { invalidateMatchesFeedCaches } from '@/lib/server/matchesFeedInvalidation';
import { isUuid } from '@/lib/utils/postgrest';
import { isDayKey } from '@/lib/matchWeekend';

/**
 * Alta de UNA fecha.
 *
 * Faltaba: sobre `rounds/[roundId]` habia `PATCH` y `reset`, y a nivel fase
 * `generate-rounds`, que arma el calendario entero. No habia forma de agregar
 * una fecha suelta — el caso de "se sumo una reprogramacion" o "esta fase se
 * carga a mano".
 *
 * `start_date` y `end_date` son el PERIODO de la fecha, no un adorno: la regla
 * de que dos partidos caen en la misma fecha si caen en el mismo fin de semana
 * vive en `lib/matchWeekend.ts` y se apoya en estas dos columnas.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id: tournamentId } = await params;
        const { writer: supabase } = await requireTournamentMutationContext(tournamentId);
        const body = await request.json().catch(() => ({}));

        const phaseId = typeof body?.phaseId === 'string' ? body.phaseId.trim() : '';
        const name = typeof body?.name === 'string' ? body.name.trim() : '';

        if (!isUuid(phaseId)) {
            return NextResponse.json({ error: 'phaseId invalido.' }, { status: 400 });
        }
        if (!name) {
            return NextResponse.json({ error: 'La fecha necesita un nombre.' }, { status: 400 });
        }

        // La fase tiene que ser de ESTE torneo. Sin esta guarda, con el id de un
        // torneo propio se le podrian colgar fechas a la fase de otro.
        const { data: phase } = await supabase
            .from('tournament_phases')
            .select('id')
            .eq('id', phaseId)
            .eq('tournament_id', tournamentId)
            .maybeSingle();

        if (!phase) {
            return NextResponse.json({ error: 'La fase no pertenece a este torneo.' }, { status: 404 });
        }

        const startDate = isDayKey(body?.startDate) ? body.startDate : null;
        const endDate = isDayKey(body?.endDate) ? body.endDate : startDate;

        if (startDate && endDate && endDate < startDate) {
            return NextResponse.json(
                { error: 'El periodo termina antes de empezar.' },
                { status: 400 },
            );
        }

        // El orden se calcula en el servidor: el cliente manda `rondas.length`,
        // que colisiona apenas se borro una del medio. Mismo criterio que el
        // `order_index` del alta de fase.
        let orderIndex = Number(body?.orderIndex);
        if (!Number.isInteger(orderIndex) || orderIndex < 1) {
            const { data: last } = await supabase
                .from('tournament_rounds')
                .select('order_index')
                .eq('phase_id', phaseId)
                .order('order_index', { ascending: false })
                .limit(1)
                .maybeSingle();
            orderIndex = (last?.order_index ?? 0) + 1;
        }

        const round = await FixtureService.createRound({
            phaseId,
            name,
            orderIndex,
            startDate,
            endDate,
            notes: typeof body?.notes === 'string' ? body.notes : null,
        });

        if (!round) {
            return NextResponse.json({ error: 'No se pudo crear la fecha.' }, { status: 500 });
        }

        await invalidateMatchesFeedCaches();

        return NextResponse.json(round, { status: 201 });
    } catch (error: unknown) {
        console.error('Error in POST /api/tournaments/[id]/fixture/rounds:', error);
        return tournamentApiErrorResponse(error);
    }
}
