import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recalculatePhaseStandingsScopes } from '@/lib/server/recalculateStandings';

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
        const hasShootoutPoints =
            Number.isFinite(Number(rules.points_for_shootout_win))
            && Number.isFinite(Number(rules.points_for_shootout_loss));
        const shootoutConfig = hasShootoutPoints
            ? {
                win: Number(rules.points_for_shootout_win),
                loss: Number(rules.points_for_shootout_loss),
            }
            : null;

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
                loss: rules.points_for_loss,
                ...(shootoutConfig
                    ? {
                        shootoutWin: shootoutConfig.win,
                        shootoutLoss: shootoutConfig.loss,
                    }
                    : {}),
            },
            pointsSystem: {
                ...phase.settings?.pointsSystem,
                win: rules.points_for_win,
                draw: rules.points_for_draw,
                loss: rules.points_for_loss,
                shootout: shootoutConfig,
                behavior: {
                    ...(phase.settings?.pointsSystem?.behavior ?? {}),
                    shootoutLogic: shootoutConfig
                        ? {
                            enabledWhen: { regularTimeDraw: true },
                            requires: ['score.penalties'],
                            howToApply: 'replace_draw_points_with_shootout_points',
                            win: shootoutConfig.win,
                            loss: shootoutConfig.loss,
                        }
                        : null,
                },
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

        // Auto-recalculate every effective scope so grouped phases refresh too.
        const recalcResult = await recalculatePhaseStandingsScopes(tournamentId, phaseId);
        if (!recalcResult.ok) {
            return NextResponse.json(
                { error: 'No se pudieron recalcular las tablas luego de guardar las reglas.' },
                { status: 500 },
            );
        }

        return NextResponse.json({ ok: true });
    } catch (e: unknown) {
        console.error('Exception saving standings rules:', e);
        const details = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: 'Internal server error', details }, { status: 500 });
    }
}
