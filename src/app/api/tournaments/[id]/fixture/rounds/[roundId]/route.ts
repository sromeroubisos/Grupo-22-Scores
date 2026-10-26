import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { FixtureService } from '@/lib/services/fixtureService';

async function assertRoundBelongsToTournament(supabase: any, roundId: string, tournamentId: string) {
    const { data: round, error: roundError } = await supabase
        .from('tournament_rounds')
        .select('id, phase_id')
        .eq('id', roundId)
        .single();

    if (roundError || !round) {
        return false;
    }

    const { data: phase, error: phaseError } = await supabase
        .from('tournament_phases')
        .select('id')
        .eq('id', round.phase_id)
        .eq('tournament_id', tournamentId)
        .single();

    return !phaseError && Boolean(phase);
}

/**
 * Baja de una fecha.
 *
 * Borrar la fecha NO borra sus partidos: quedan con `round_uuid` en null,
 * sueltos en la fase — invisibles en el calendario pero contando para la tabla.
 * Por eso se cuentan antes y se exige `?force=1` para seguir: un boton que se
 * lleva doce partidos por delante sin decirlo es una trampa.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; roundId: string }> }
) {
    try {
        const { id: tournamentId, roundId } = await params;
        const { writer: supabase } = await requireTournamentMutationContext(tournamentId);

        const belongs = await assertRoundBelongsToTournament(supabase, roundId, tournamentId);
        if (!belongs) {
            return NextResponse.json({ error: 'Round not found in this tournament' }, { status: 404 });
        }

        const { count } = await supabase
            .from('matches')
            .select('id', { count: 'exact', head: true })
            .eq('round_uuid', roundId);

        const matchCount = count ?? 0;
        const force = request.nextUrl.searchParams.get('force') === '1';

        if (matchCount > 0 && !force) {
            return NextResponse.json(
                {
                    error: `La fecha tiene ${matchCount} ${matchCount === 1 ? 'partido' : 'partidos'}. Se van a quedar sin fecha asignada.`,
                    matchCount,
                    requiresForce: true,
                },
                { status: 409 },
            );
        }

        const deleted = await FixtureService.deleteRound(roundId);
        if (!deleted) {
            return NextResponse.json({ error: 'No se pudo borrar la fecha.' }, { status: 500 });
        }

        return NextResponse.json({ ok: true, matchCount });
    } catch (error: unknown) {
        console.error('Error in DELETE /api/tournaments/[id]/fixture/rounds/[roundId]:', error);
        return tournamentApiErrorResponse(error);
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; roundId: string }> }
) {
    try {
        const { id: tournamentId, roundId } = await params;
        const { writer: supabase } = await requireTournamentMutationContext(tournamentId);
        const body = await request.json();

        const roundBelongsToTournament = await assertRoundBelongsToTournament(supabase, roundId, tournamentId);
        if (!roundBelongsToTournament) {
            return NextResponse.json({ error: 'Round not found in this tournament' }, { status: 404 });
        }

        const round = await FixtureService.updateRound(roundId, {
            name: body.name,
            startDate: body.startDate,
            endDate: body.endDate,
            notes: body.notes,
            orderIndex: body.orderIndex,
        });

        if (!round) {
            return NextResponse.json(
                { error: 'Failed to update round' },
                { status: 500 }
            );
        }

        return NextResponse.json(round);
    } catch (error: unknown) {
        console.error('Error in PATCH /api/tournaments/[id]/fixture/rounds/[roundId]:', error);
        return tournamentApiErrorResponse(error);
    }
}
