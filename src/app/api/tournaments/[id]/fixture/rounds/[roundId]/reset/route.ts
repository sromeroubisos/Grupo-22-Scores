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

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string, roundId: string }> }
) {
    try {
        void request;
        const { id: tournamentId, roundId } = await params;
        const { writer: supabase } = await requireTournamentMutationContext(tournamentId);

        const roundBelongsToTournament = await assertRoundBelongsToTournament(supabase, roundId, tournamentId);
        if (!roundBelongsToTournament) {
            return NextResponse.json({ error: 'Round not found in this tournament' }, { status: 404 });
        }

        const result = await FixtureService.resetRound(roundId);

        return NextResponse.json({ success: result });
    } catch (error: unknown) {
        console.error('Error in POST /api/tournaments/[id]/fixture/rounds/[roundId]/reset:', error);
        return tournamentApiErrorResponse(error);
    }
}
