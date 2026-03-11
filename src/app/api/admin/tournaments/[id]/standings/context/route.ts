import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StandingsEngine } from '@/lib/services/standingsEngine';

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

        // 3. Get groups
        let groups: any[] = [];
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
        const enrichedPhases = phases?.map(phase => {
            const phaseGroups = groups.filter(g => g.phase_id === phase.id);
            const resolvedRules = StandingsEngine.resolveRules(phase.settings, tournament.ruleset);
            
            return {
                ...phase,
                groups: phaseGroups,
                resolvedRules
            };
        }) || [];

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
    } catch (e: any) {
        console.error('Exception fetching standings context:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
