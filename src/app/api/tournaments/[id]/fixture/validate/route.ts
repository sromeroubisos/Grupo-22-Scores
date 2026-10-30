import { NextRequest, NextResponse } from 'next/server';
import { FixtureService } from '@/lib/services/fixtureService';
import { getTournamentReadAccess } from '@/lib/server/tournamentReadGate';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        // Borrador u oculto: 404 salvo para quien lo puede leer en el gestor.
        if ((await getTournamentReadAccess(tournamentId)) === 'denied') {
            return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }
        const result = await FixtureService.validateFixture(tournamentId);

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Error in GET /api/tournaments/[id]/fixture/validate:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
