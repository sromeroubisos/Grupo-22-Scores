import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StandingsEngine } from '@/lib/services/standingsEngine';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tournamentId } = await params;
        const searchParams = request.nextUrl.searchParams;
        const phaseId = searchParams.get('phaseId');
        const groupId = searchParams.get('groupId');
        const tableType = searchParams.get('tableType') || 'general';

        if (!phaseId) {
            return NextResponse.json({ error: 'phaseId is required' }, { status: 400 });
        }

        const supabase = await createClient();

        // 1. Fetch phase + tournament rules
        const { data: phase, error: phaseError } = await supabase
            .from('tournament_phases')
            .select('id, settings, tournament_id')
            .eq('id', phaseId)
            .eq('tournament_id', tournamentId)
            .single();

        if (phaseError) {
            return NextResponse.json({ error: 'Phase not found' }, { status: 404 });
        }

        const { data: tournament } = await supabase
            .from('tournaments')
            .select('ruleset')
            .eq('id', tournamentId)
            .single();

        const resolvedRules = StandingsEngine.resolveRules(phase.settings, tournament?.ruleset);

        // 2. Fetch participants (exclude explicitly inactive)
        let pQuery = supabase
            .from('tournament_participants')
            .select('id, club_id, name, group_id, status, clubs(name, logo_url)')
            .eq('tournament_id', tournamentId)
            .not('status', 'in', '("withdrawn","disqualified")');

        if (groupId) pQuery = pQuery.eq('group_id', groupId);
        const { data: participants, error: pError } = await pQuery;
        if (pError) throw pError;

        // 3. Fetch final matches for this phase
        let mQuery = supabase
            .from('matches')
            .select('id, home_club_id, away_club_id, score, status, date_time, phase_id, group_id, events')
            .eq('tournament_id', tournamentId)
            .eq('phase_id', phaseId)
            .eq('status', 'final');

        if (groupId) mQuery = mQuery.eq('group_id', groupId);
        const { data: matches, error: mError } = await mQuery;
        if (mError) throw mError;

        // 4. Compute standings
        const table = StandingsEngine.generateTable(
            participants || [],
            matches || [],
            resolvedRules,
            tableType,
        );

        // 5. Metrics
        const finalMatches = matches || [];
        const metrics = {
            counted_matches: finalMatches.length,
            pending_results: 0,
            manual_overrides: resolvedRules.adjustments?.length || 0,
        };

        // Count non-final matches for this phase
        let pendingQuery = supabase
            .from('matches')
            .select('id', { count: 'exact', head: true })
            .eq('tournament_id', tournamentId)
            .eq('phase_id', phaseId)
            .in('status', ['scheduled', 'live', 'suspended', 'delayed', 'postponed']);

        if (groupId) pendingQuery = pendingQuery.eq('group_id', groupId);
        const { count: pendingCount } = await pendingQuery;
        metrics.pending_results = pendingCount || 0;

        // 6. last_calculated_at from persisted standings
        let lastCalculatedAt: string | null = null;
        {
            let cQuery = supabase
                .from('tournament_standings')
                .select('last_updated')
                .eq('tournament_id', tournamentId)
                .eq('phase_id', phaseId)
                .order('last_updated', { ascending: false })
                .limit(1);

            if (groupId) {
                cQuery = cQuery.eq('group_id', groupId);
            } else {
                cQuery = (cQuery as any).is('group_id', null);
            }
            const { data: cached } = await cQuery;
            lastCalculatedAt = cached?.[0]?.last_updated ?? null;
        }

        return NextResponse.json({
            ok: true,
            table,
            metrics,
            rules: resolvedRules,
            last_calculated_at: lastCalculatedAt,
        });
    } catch (e: any) {
        console.error('Exception generating standings:', e);
        return NextResponse.json(
            { error: 'Internal server error', details: e.message },
            { status: 500 },
        );
    }
}
