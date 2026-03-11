import { NextRequest, NextResponse } from 'next/server';
import { FixtureService } from '@/lib/services/fixtureService';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const body = await request.json();

        // Ensure tournamentId is in the data
        const matchData = {
            ...body,
            tournamentId
        };

        const match = await FixtureService.createMatch(matchData);

        if (!match) {
            return NextResponse.json(
                { error: 'Failed to create match' },
                { status: 500 }
            );
        }

        return NextResponse.json(match, { status: 201 });
    } catch (error: any) {
        console.error('Error in POST /api/tournaments/[id]/matches:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
