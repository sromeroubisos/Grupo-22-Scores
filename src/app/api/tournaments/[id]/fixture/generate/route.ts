import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { FixtureService } from '@/lib/services/fixtureService';
import { createClient } from '@/lib/supabase/server';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        await requireAdminApiUser();
        const body = await request.json();
        const { phaseId, numRounds, namePattern } = body;

        if (!phaseId) {
            return NextResponse.json(
                { error: 'Phase ID is required' },
                { status: 400 }
            );
        }

        const supabase = await createClient();
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

        return NextResponse.json({ success: result });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        console.error('Error in POST /api/tournaments/[id]/fixture/generate:', error);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
