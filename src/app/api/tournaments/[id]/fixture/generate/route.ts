import { NextRequest, NextResponse } from 'next/server';
import { FixtureService } from '@/lib/services/fixtureService';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const body = await request.json();
        const { phaseId, numRounds, namePattern } = body;

        if (!phaseId) {
            return NextResponse.json(
                { error: 'Phase ID is required' },
                { status: 400 }
            );
        }

        const result = await FixtureService.generateRoundsForPhase(
            phaseId,
            numRounds || 1,
            namePattern || 'Jornada {n}'
        );

        return NextResponse.json({ success: result });
    } catch (error: any) {
        console.error('Error in POST /api/tournaments/[id]/fixture/generate:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
