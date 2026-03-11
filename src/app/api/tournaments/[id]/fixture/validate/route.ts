import { NextRequest, NextResponse } from 'next/server';
import { FixtureService } from '@/lib/services/fixtureService';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
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
