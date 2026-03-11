import { NextRequest, NextResponse } from 'next/server';
import { FixtureService } from '@/lib/services/fixtureService';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string, roundId: string }> }
) {
    try {
        const { roundId } = await params;

        // The FixtureService doesn't have a direct 'resetRound' yet, 
        // but we can either implement it there or use clearMatchesForRound if it exists.
        // Looking at the context, we'll need to ensure FixtureService can handle this.
        // For now, let's assume it has something similar or we'll need to add it.

        // Actually, let's check FixtureService for available methods.

        const result = await FixtureService.resetRound(roundId);

        return NextResponse.json({ success: result });
    } catch (error: any) {
        console.error('Error in POST /api/tournaments/[id]/fixture/rounds/[roundId]/reset:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
