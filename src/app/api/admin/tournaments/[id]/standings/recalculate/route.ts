import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recalculateAndPersistStandings } from '@/lib/server/recalculateStandings';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tournamentId } = await params;
        const body = await request.json();
        const { phaseId, groupId, tableType = 'general' } = body;

        if (!phaseId) {
            return NextResponse.json({ error: 'phaseId is required' }, { status: 400 });
        }

        const result = await recalculateAndPersistStandings(tournamentId, phaseId, groupId, tableType);

        if (!result.ok) {
            return NextResponse.json({ error: 'Failed to recalculate standings' }, { status: 500 });
        }

        // Audit log
        const supabase = await createClient();
        const calculatedAt = new Date().toISOString();
        await supabase.from('admin_audit_log').insert({
            entity_type: 'standings',
            entity_id: tournamentId,
            action: 'recalculated_standings_table',
            changes: {
                phase_id: phaseId,
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
        const message = e instanceof Error ? e.message : 'Unknown error';
        console.error('Exception recalculating standings:', e);
        return NextResponse.json(
            { error: 'Failed to recalculate standings', details: message },
            { status: 500 },
        );
    }
}
