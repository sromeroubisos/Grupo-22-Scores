import { NextRequest, NextResponse } from 'next/server';
import { FixtureService } from '@/lib/services/fixtureService';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const body = await request.json();
        const { phaseId, matches: matchesData } = body;

        if (!phaseId || !Array.isArray(matchesData)) {
            return NextResponse.json(
                { error: 'Phase ID and matches array are required' },
                { status: 400 }
            );
        }

        const result = await FixtureService.importMatches(tournamentId, phaseId, matchesData);

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Error in POST /api/tournaments/[id]/fixture/import:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
