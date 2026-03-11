import { NextRequest, NextResponse } from 'next/server';
import { FixtureService } from '@/lib/services/fixtureService';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string, matchId: string }> }
) {
    try {
        const { matchId } = await params;
        const body = await request.json();

        const match = await FixtureService.updateMatch(matchId, body);

        if (!match) {
            return NextResponse.json(
                { error: 'Failed to update match' },
                { status: 500 }
            );
        }

        return NextResponse.json(match);
    } catch (error: any) {
        console.error('Error in PATCH /api/tournaments/[id]/matches/[matchId]:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string, matchId: string }> }
) {
    try {
        const { matchId } = await params;
        const success = await FixtureService.deleteMatch(matchId);

        if (!success) {
            return NextResponse.json(
                { error: 'Failed to delete match' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error in DELETE /api/tournaments/[id]/matches/[matchId]:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
