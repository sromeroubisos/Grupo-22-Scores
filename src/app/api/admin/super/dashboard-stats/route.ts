import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { getReadClient } from '@/lib/supabase/read';
import { TOURNAMENT_REVIEW_STATUS } from '@/lib/tournamentReview';

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

export async function GET() {
    try {
        await requireAdminApiUser();
    } catch {
        return jsonError('Unauthorized', 401);
    }

    try {
        const readClient = await getReadClient();
        const dayStart = new Date();
        dayStart.setUTCHours(0, 0, 0, 0);

        const nextDayStart = new Date(dayStart);
        nextDayStart.setUTCDate(nextDayStart.getUTCDate() + 1);

        // Use HEAD count instead of selecting all id rows. PostgREST's
        // count: 'exact' + head: true skips the row payload entirely and
        // returns just the total in the Content-Range header — orders of
        // magnitude cheaper than streaming every id back to Node.
        const [todayMatchesRes, liveMatchesRes, unlinkedTournamentsRes, pendingTournamentsRes, unlinkedClubsRes] = await Promise.all([
            readClient
                .from('matches')
                .select('id', { count: 'exact', head: true })
                .gte('date_time', dayStart.toISOString())
                .lt('date_time', nextDayStart.toISOString()),
            readClient
                .from('matches')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'live')
                .gte('date_time', dayStart.toISOString())
                .lt('date_time', nextDayStart.toISOString()),
            readClient
                .from('tournaments')
                .select('id', { count: 'exact', head: true })
                .is('union_id', null)
                .neq('review_status', TOURNAMENT_REVIEW_STATUS.pendingLink),
            readClient
                .from('tournaments')
                .select('id', { count: 'exact', head: true })
                .eq('review_status', TOURNAMENT_REVIEW_STATUS.pendingLink),
            readClient
                .from('clubs')
                .select('id', { count: 'exact', head: true })
                .is('union_id', null),
        ]);

        if (todayMatchesRes.error) return jsonError('Failed to load today match count', 500, todayMatchesRes.error.message);
        if (liveMatchesRes.error) return jsonError('Failed to load live match count', 500, liveMatchesRes.error.message);
        if (unlinkedTournamentsRes.error) return jsonError('Failed to load tournament conflict count', 500, unlinkedTournamentsRes.error.message);
        if (pendingTournamentsRes.error) return jsonError('Failed to load pending tournament count', 500, pendingTournamentsRes.error.message);
        if (unlinkedClubsRes.error) return jsonError('Failed to load club conflict count', 500, unlinkedClubsRes.error.message);

        return NextResponse.json({
            data: {
                todayMatches: todayMatchesRes.count ?? 0,
                liveMatches: liveMatchesRes.count ?? 0,
                unlinkedTournaments: unlinkedTournamentsRes.count ?? 0,
                pendingTournaments: pendingTournamentsRes.count ?? 0,
                unlinkedClubs: unlinkedClubsRes.count ?? 0,
            },
        });
    } catch (error) {
        return jsonError('Failed to load dashboard stats', 500, error instanceof Error ? error.message : String(error));
    }
}
