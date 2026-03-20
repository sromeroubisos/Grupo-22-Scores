import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const supabase = await getReadClient();

    console.log(`[BACKEND] Fetching manual tournament data for ID/Slug: ${id}`);
    
    // Resolve ID if it's a slug
    let tournament_id = id;
    if (!id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        console.log(`[BACKEND] Resolving slug: ${id}`);
        const { data: t } = await supabase
            .from('tournaments')
            .select('id')
            .eq('slug', id)
            .single();
        if (t) {
            tournament_id = t.id;
            console.log(`[BACKEND] Slug resolved to UUID: ${tournament_id}`);
        } else {
            return NextResponse.json({ ok: false, error: 'Tournament not found' }, { status: 404 });
        }
    }

    const [tournamentRes, participantsRes, matchesRes, standingsRes, phasesRes, groupsRes, teamLabelsRes] = await Promise.all([
        supabase
            .from('tournaments')
            .select('id, name, display_name, sport_id, legacy_sport:sport, country_id, logo_url, status, is_visible, slug')
            .eq('id', tournament_id)
            .maybeSingle(),


        supabase
            .from('tournament_participants')
            .select(`
                id, club_id, name, seed, status, type, group_id,
                clubs:clubs!tournament_participants_club_id_fkey(
                    id, name, logo_url, short_name, slug
                )
            `)
            .eq('tournament_id', tournament_id)
            .not('status', 'in', '("withdrawn","disqualified")')
            .order('seed', { ascending: true, nullsFirst: false }),

        supabase
            .from('matches')
            .select(`
                id, date_time, status, score, venue, round_label, notes,
                home_club_id, away_club_id,
                home:clubs!matches_home_club_id_fkey(id, name, logo_url),
                away:clubs!matches_away_club_id_fkey(id, name, logo_url),
                phase_id, group_id, round_uuid
            `)
            .eq('tournament_id', tournament_id)
            .order('date_time', { ascending: true }),

        supabase
            .from('tournament_standings')
            .select(`
                id, position, played, won, drawn, lost, points, scored, conceded,
                bonus_points, form, stats, club_id, phase_id, group_id,
                club:clubs!tournament_standings_club_id_fkey(id, name, logo_url, short_name)
            `)
            .eq('tournament_id', tournament_id)
            .order('position', { ascending: true }),

        supabase
            .from('tournament_phases')
            .select('*')
            .eq('tournament_id', tournament_id)
            .order('order_index', { ascending: true }),

        supabase
            .from('tournament_groups')
            .select('*')
            .eq('tournament_id', tournament_id)
            .order('name', { ascending: true }),

        supabase
            .from('team_labels')
            .select('id, label_id, club_id, tournament_id, phase_id, group_id, created_at, label:ui_labels(id, name, color, scope)')
            .eq('tournament_id', tournament_id),
    ]);

    const standingsCount = standingsRes.data?.length || 0;
    console.log(`[BACKEND] Data fetched: 
        Participants: ${participantsRes.data?.length || 0}
        Matches: ${matchesRes.data?.length || 0}
        Standings rows raw count: ${standingsCount}
        Phases: ${phasesRes.data?.length || 0}
        Groups: ${groupsRes.data?.length || 0}
        Team labels: ${teamLabelsRes.data?.length || 0}`);
    
    // Log sample payload if exists
    if (standingsCount > 0) {
        console.log('[BACKEND] Standings raw sample:', JSON.stringify(standingsRes.data?.[0], null, 2));
    }

    return NextResponse.json({
        ok: true,
        tournament: tournamentRes.data ? {
            ...tournamentRes.data,
            sport_id: tournamentRes.data.sport_id || tournamentRes.data.legacy_sport || 'rugby',
        } : null,
        participants: participantsRes.data || [],
        matches: matchesRes.data || [],
        standings: standingsRes.data || [],
        phases: phasesRes.data || [],
        groups: groupsRes.data || [],
        teamLabels: teamLabelsRes.data || [],
        debug: {
            id,
            standingsCount,
            phaseCount: phasesRes.data?.length || 0
        }
    });
}
