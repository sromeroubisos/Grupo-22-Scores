import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { FixtureService } from '@/lib/services/fixtureService';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const { writer: supabase } = await requireTournamentMutationContext(tournamentId);
        const body = await request.json();
        const { phaseId, numRounds, namePattern } = body;

        if (!phaseId) {
            return NextResponse.json(
                { error: 'Phase ID is required' },
                { status: 400 }
            );
        }

        const { data: phase, error: phaseError } = await supabase
            .from('tournament_phases')
            .select('id')
            .eq('id', phaseId)
            .eq('tournament_id', tournamentId)
            .single();

        if (phaseError || !phase) {
            return NextResponse.json(
                { error: 'La fase seleccionada no pertenece al torneo activo.' },
                { status: 400 }
            );
        }

        const result = await FixtureService.generateRoundsForPhase(
            phaseId,
            numRounds || 1,
            namePattern || 'Jornada {n}'
        );

        if (!result) {
            return NextResponse.json(
                { success: false, error: 'No se pudo generar la estructura de la fase.' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('Error in POST /api/tournaments/[id]/fixture/generate:', error);
        return tournamentApiErrorResponse(error);
    }
}
