import { NextRequest, NextResponse } from 'next/server';
import { getApiErrorMessage, getApiErrorStatus, requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { FixtureService } from '@/lib/services/fixtureService';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; roundId: string }> }
) {
    try {
        await requireAdminApiUser();
        const { roundId } = await params;
        const body = await request.json();

        const round = await FixtureService.updateRound(roundId, {
            name: body.name,
            startDate: body.startDate,
            endDate: body.endDate,
            notes: body.notes,
            orderIndex: body.orderIndex,
        });

        if (!round) {
            return NextResponse.json(
                { error: 'Failed to update round' },
                { status: 500 }
            );
        }

        return NextResponse.json(round);
    } catch (error: unknown) {
        const message = getApiErrorMessage(error);
        console.error('Error in PATCH /api/tournaments/[id]/fixture/rounds/[roundId]:', error);
        return NextResponse.json(
            { error: message },
            { status: getApiErrorStatus(error) }
        );
    }
}
