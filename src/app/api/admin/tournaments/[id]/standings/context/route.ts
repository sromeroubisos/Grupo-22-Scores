import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentReadContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { StandingsEngine } from '@/lib/services/standingsEngine';
import { buildPhaseSettingsWithSyncedLabels } from '@/lib/server/phaseLabels';
import { supportsStandingsTableTypeColumn } from '@/lib/standings/tableTypeSupport';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tournamentId } = await params;
        const { writer: supabase } = await requireTournamentReadContext(tournamentId);

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

        /**
         * Un GET no escribe.
         *
         * Acá había un bucle SERIAL que, fase por fase, recalculaba las
         * etiquetas y hacía un UPDATE sobre `tournament_phases` si detectaba una
         * diferencia. Cada apertura de Posiciones —y cada recarga del contexto—
         * disparaba tantos UPDATE como fases tuviera el torneo, en cadena. Un
         * GET tiene que poder repetirse sin consecuencias: si falla a mitad de
         * camino deja la mitad de las fases escritas y la otra mitad no, y nadie
         * pidió nada.
         *
         * La normalización se sigue calculando y se sigue DEVOLVIENDO —el
         * cliente ve lo mismo de antes—, pero no se persiste. Persistirla es una
         * acción, y vive en POST /standings/context/sync.
         */
        const enrichedPhases = [];
        for (const phase of phases || []) {
            const phaseGroups = phase.phase_type === 'group_stage'
                ? groups.filter(g => g.phase_id === phase.id)
                : [];
            let syncedSettings = phase.settings;

            try {
                syncedSettings = await buildPhaseSettingsWithSyncedLabels(supabase, phase.settings);
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
            phases: enrichedPhases,
            /**
             * Si la tabla de local y la de visitante se pueden publicar. Es lo
             * mismo que decide el 409 de /standings/recalculate: viaja acá para
             * que el botón se habilite solo cuando se corra la migración, sin
             * necesidad de un redeploy ni de una constante en el cliente.
             */
            supportsTableType: await supportsStandingsTableTypeColumn(),
        });
    } catch (e: unknown) {
        console.error('Exception fetching standings context:', e);
        return tournamentApiErrorResponse(e);
    }
}
