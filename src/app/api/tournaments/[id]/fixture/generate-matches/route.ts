import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { FixtureService } from '@/lib/services/fixtureService';
import { createClient } from '@/lib/supabase/server';

type GenerateMatchesRequest = {
    phaseId?: string;
    teamIds?: string[];
    startDate?: string;
    matchTime?: string;
    venue?: string;
    roundsCount?: number;
    homeAndAway?: boolean;
    groupId?: string | null;
};

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        await requireAdminApiUser();
        const body = await request.json() as GenerateMatchesRequest;
        const { phaseId, teamIds, ...options } = body;

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

        if (!options.startDate || !options.matchTime || !options.venue) {
            return NextResponse.json(
                { error: 'startDate, matchTime and venue are required' },
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

        const success = await FixtureService.generateMatchesForPhase({
            phaseId,
            clubIds: teamIds,
            startDate: options.startDate,
            matchTime: options.matchTime,
            venue: options.venue,
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
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        console.error('Error in POST /api/tournaments/[id]/fixture/generate-matches:', error);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
