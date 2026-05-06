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
