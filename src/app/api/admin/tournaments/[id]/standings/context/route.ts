import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StandingsEngine } from '@/lib/services/standingsEngine';
import { buildPhaseSettingsWithSyncedLabels } from '@/lib/server/phaseLabels';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tournamentId } = await params;
        const supabase = await createClient();

        // 1. Get tournament ruleset
        const { data: tournament, error: tournamentError } = await supabase
            .from('tournaments')
            .select('id, name, category, ruleset, status')
            .eq('id', tournamentId)
            .single();

        if (tournamentError) {
            console.error('Error fetching tournament context:', tournamentError);
            return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }

        // 2. Get phases
        const { data: phases, error: phasesError } = await supabase
            .from('tournament_phases')
            .select('id, name, phase_type, order_index, is_active, settings')
            .eq('tournament_id', tournamentId)
            .order('order_index', { ascending: true });

        if (phasesError) {
            console.error('Error fetching phases for standings context:', phasesError);
            return NextResponse.json({ error: 'Error fetching phases' }, { status: 500 });
        }

        // 3. Get groups
        let groups: Array<{ id: string; phase_id: string; name: string; order_index: number | null }> = [];
        if (phases && phases.length > 0) {
            const phaseIds = phases.map(p => p.id);
            const { data: g, error: groupsError } = await supabase
                .from('tournament_groups')
                .select('id, phase_id, name, order_index')
                .in('phase_id', phaseIds)
                .order('order_index', { ascending: true });
            
            if (!groupsError && g) {
                groups = g;
            }
        }

        // Map phases to include resolved rules and groups
        const enrichedPhases = [];
        for (const phase of phases || []) {
            const phaseGroups = groups.filter(g => g.phase_id === phase.id);
            let syncedSettings = phase.settings;

            try {
                const nextSettings = await buildPhaseSettingsWithSyncedLabels(supabase, phase.settings);
                const nextLabels = JSON.stringify(nextSettings.groupLabels || []);
                const prevLabels = JSON.stringify((phase.settings as { groupLabels?: unknown[] } | null)?.groupLabels || []);

                if (nextLabels !== prevLabels) {
                    const { error: syncError } = await supabase
                        .from('tournament_phases')
                        .update({ settings: nextSettings })
                        .eq('id', phase.id);

                    if (syncError) {
                        console.error('Error syncing phase labels in standings context:', syncError);
                    } else {
                        syncedSettings = nextSettings;
                    }
                } else {
                    syncedSettings = nextSettings;
                }
            } catch (syncError) {
                console.error('Error preparing phase labels for standings context:', syncError);
            }

            const resolvedRules = StandingsEngine.resolveRules(syncedSettings, tournament.ruleset);

            enrichedPhases.push({
                ...phase,
                settings: syncedSettings,
                groups: phaseGroups,
                resolvedRules
            });
        }

        return NextResponse.json({
            ok: true,
            tournament: {
                id: tournament.id,
                name: tournament.name,
                category: tournament.category,
                status: tournament.status,
                ruleset: tournament.ruleset
            },
            phases: enrichedPhases
        });
    } catch (e: unknown) {
        console.error('Exception fetching standings context:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
