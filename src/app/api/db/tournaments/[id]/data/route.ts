import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const supabase = await createClient();

    console.log(`[BACKEND] Fetching manual tournament data for ID: ${id}`);

    const [participantsRes, matchesRes, standingsRes, phasesRes, groupsRes] = await Promise.all([
        supabase
            .from('tournament_participants')
            .select(`
                id, club_id, name, seed, status, type, group_id,
                clubs:clubs!tournament_participants_club_id_fkey(
                    id, name, logo_url, short_name, slug
                )
            `)
            .eq('tournament_id', id)
            .not('status', 'in', '("withdrawn","disqualified")')
            .order('seed', { ascending: true, nullsFirst: false }),

        supabase
            .from('matches')
            .select(`
                id, date_time, status, score, venue, round_label, notes,
                home_club_id, away_club_id,
                home:clubs!matches_home_club_id_fkey(id, name, logo_url),
                away:clubs!matches_away_club_id_fkey(id, name, logo_url),
                phase_id, group_id
            `)
            .eq('tournament_id', id)
            .order('date_time', { ascending: true }),

        supabase
            .from('tournament_standings')
            .select(`
                id, position, played, won, drawn, lost, points, scored, conceded,
                bonus_points, form, stats, club_id, phase_id, group_id,
                club:clubs!tournament_standings_club_id_fkey(id, name, logo_url, short_name)
            `)
            .eq('tournament_id', id)
            .order('position', { ascending: true }),

        supabase
            .from('tournament_phases')
            .select('*')
            .eq('tournament_id', id)
            .order('order_index', { ascending: true }),

        supabase
            .from('tournament_groups')
            .select('*')
            .eq('tournament_id', id)
            .order('name', { ascending: true }),
    ]);

    const standingsCount = standingsRes.data?.length || 0;
    console.log(`[BACKEND] Data fetched: 
        Participants: ${participantsRes.data?.length || 0}
        Matches: ${matchesRes.data?.length || 0}
        Standings rows raw count: ${standingsCount}
        Phases: ${phasesRes.data?.length || 0}
        Groups: ${groupsRes.data?.length || 0}`);
    
    // Log sample payload if exists
    if (standingsCount > 0) {
        console.log('[BACKEND] Standings raw sample:', JSON.stringify(standingsRes.data?.[0], null, 2));
    }

    return NextResponse.json({
        ok: true,
        participants: participantsRes.data || [],
        matches: matchesRes.data || [],
        standings: standingsRes.data || [],
        phases: phasesRes.data || [],
        groups: groupsRes.data || [],
        debug: {
            id,
            standingsCount,
            phaseCount: phasesRes.data?.length || 0
        }
    });
}
