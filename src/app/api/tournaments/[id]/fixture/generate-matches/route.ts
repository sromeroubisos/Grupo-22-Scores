import { NextRequest, NextResponse } from 'next/server';
import { FixtureService } from '@/lib/services/fixtureService';
import { FixtureGenerationParams } from '@/lib/types/fixture';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const body = await request.json();
        const { phaseId, teamIds, ...options } = body as any;

        if (!phaseId) {
            return NextResponse.json(
                { error: 'Phase ID is required' },
                { status: 400 }
            );
        }

        if (!teamIds || teamIds.length < 2) {
            return NextResponse.json(
                { error: 'At least 2 teams are required for generation' },
                { status: 400 }
            );
        }

        const success = await FixtureService.generateMatchesForPhase({
            phaseId,
            clubIds: teamIds,
            startDate: options?.startDate,
            matchTime: options?.matchTime,
            venue: options?.venue,
            roundsCount: options?.roundsCount,
            homeAndAway: options?.homeAndAway,
            groupId: options?.groupId
        });

        if (success) {
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json(
                { error: 'Failed to generate matches' },
                { status: 500 }
            );
        }
    } catch (error: any) {
        console.error('Error in POST /api/tournaments/[id]/fixture/generate-matches:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
