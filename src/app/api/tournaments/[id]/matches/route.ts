import { NextRequest, NextResponse } from 'next/server';
import { canManageTournamentContext, getTournamentManagementTarget, requireUserAccessContext } from '@/lib/auth/permissions';
import { EDIT_MEMBERSHIP_ROLES, hasFederationAdminAccess } from '@/lib/auth/roles';
import { FixtureService } from '@/lib/services/fixtureService';
import { recalculateAndPersistStandings } from '@/lib/server/recalculateStandings';
import { createClient } from '@/lib/supabase/server';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);
        if (!context) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        if (!hasFederationAdminAccess(context.rawRole, context.memberships)) {
            const target = await getTournamentManagementTarget(supabase, tournamentId);

            if (!target || !canManageTournamentContext(context, target, EDIT_MEMBERSHIP_ROLES)) {
                return NextResponse.json(
                    { error: 'Forbidden' },
                    { status: 403 }
                );
            }
        }

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

        const tournamentIdForStandings = match.tournamentId;
        const phaseIdForStandings = match.phaseId;
        if (match.status === 'final' && tournamentIdForStandings && phaseIdForStandings) {
            recalculateAndPersistStandings(
                tournamentIdForStandings,
                phaseIdForStandings,
                match.groupId ?? null,
            ).catch((err) =>
                console.error('[POST match] Auto-recalculate standings failed:', err)
            );
        }

        return NextResponse.json(match, { status: 201 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        console.error('Error in POST /api/tournaments/[id]/matches:', error);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
