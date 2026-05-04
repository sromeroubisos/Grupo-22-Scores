import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import {
    recalculateAndPersistStandings,
    recalculatePhaseStandingsScopes,
} from '@/lib/server/recalculateStandings';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tournamentId } = await params;
        const { writer: supabase } = await requireTournamentMutationContext(tournamentId);
        const body = await request.json();
        const {
            phaseId,
            groupId,
            tableType = 'general',
            seasonId = body?.season_id ?? body?.season ?? null,
        } = body;

        if (!phaseId) {
            return NextResponse.json({ error: 'phaseId is required' }, { status: 400 });
        }

        const { data: phase, error: phaseError } = await supabase
            .from('tournament_phases')
            .select('id')
            .eq('id', phaseId)
            .eq('tournament_id', tournamentId)
            .single();

        if (phaseError || !phase) {
            return NextResponse.json({ error: 'Phase not found in this tournament' }, { status: 404 });
        }

        const result = groupId
            ? await recalculateAndPersistStandings(tournamentId, phaseId, groupId, tableType, seasonId)
            : await recalculatePhaseStandingsScopes(tournamentId, phaseId, tableType, seasonId);

        if (!result.ok) {
            return NextResponse.json({ error: 'Failed to recalculate standings' }, { status: 500 });
        }

        // Audit log
        const calculatedAt = new Date().toISOString();
        await supabase.from('admin_audit_log').insert({
            entity_type: 'standings',
            entity_id: tournamentId,
            action: 'recalculated_standings_table',
            changes: {
                phase_id: phaseId,
                season_id: seasonId ?? null,
                group_id: groupId ?? null,
                table_type: tableType,
                rows_calculated: result.rows_calculated,
                calculated_at: calculatedAt,
            },
        });

        return NextResponse.json({
            ok: true,
            rows_calculated: result.rows_calculated,
            calculated_at: calculatedAt,
        });
    } catch (e: unknown) {
        if (e instanceof Error && (e.name === 'TournamentApiError')) {
            return tournamentApiErrorResponse(e);
        }

        const message = e instanceof Error ? e.message : 'Unknown error';
        console.error('Exception recalculating standings:', e);
        return NextResponse.json(
            { error: 'Failed to recalculate standings', details: message },
            { status: 500 },
        );
    }
}
