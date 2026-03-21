import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recalculateAndPersistStandings } from '@/lib/server/recalculateStandings';

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tournamentId } = await params;
        const body = await request.json();
        const { phaseId, rules } = body;

        if (!phaseId || !rules) {
            return NextResponse.json({ error: 'phaseId and rules are required' }, { status: 400 });
        }

        const supabase = await createClient();

        // Check permissions later (Assumed validated via middleware)

        // Find existing phase to update settings
        const { data: phase, error: phaseError } = await supabase
            .from('tournament_phases')
            .select('settings')
            .eq('id', phaseId)
            .eq('tournament_id', tournamentId)
            .single();

        if (phaseError) {
            return NextResponse.json({ error: 'Phase not found' }, { status: 404 });
        }

        const updatedSettings = {
            ...phase.settings,
            standings: {
                ...phase.settings?.standings,
                editable: rules.editable_mode,
                mode: rules.calculation_mode,
            },
            points: {
                win: rules.points_for_win,
                draw: rules.points_for_draw,
                loss: rules.points_for_loss
            },
            bonus: {
                offensive: rules.offensive_bonus_rule,
                defensive: rules.defensive_bonus_rule
            },
            tiebreakers: rules.tiebreakers,
            qualification: rules.qualification_rules
        };

        const { error: updateError } = await supabase
            .from('tournament_phases')
            .update({ settings: updatedSettings })
            .eq('id', phaseId);

        if (updateError) throw updateError;

        // Log to audit log
        await supabase.from('admin_audit_log').insert({
            entity_type: 'phase_rules',
            entity_id: phaseId,
            action: 'updated_phase_standings_rules',
            payload: updatedSettings
        });

        // Auto-recalculate standings so the public site reflects the new rules immediately
        recalculateAndPersistStandings(tournamentId, phaseId).catch((err) =>
            console.error('[PUT standings/rules] Auto-recalculate standings failed:', err)
        );

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        console.error('Exception saving standings rules:', e);
        return NextResponse.json({ error: 'Internal server error', details: e.message }, { status: 500 });
    }
}
