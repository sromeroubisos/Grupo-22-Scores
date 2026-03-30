import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { getReadClient } from '@/lib/supabase/read';

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

        const [{ count: todayMatches, error: todayMatchesError }, { count: liveMatches, error: liveMatchesError }, { count: unlinkedTournaments, error: tournamentsError }, { count: unlinkedClubs, error: clubsError }] = await Promise.all([
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
                .is('union_id', null),
            readClient
                .from('clubs')
                .select('id', { count: 'exact', head: true })
                .is('union_id', null),
        ]);

        if (todayMatchesError) return jsonError('Failed to load today match count', 500, todayMatchesError.message);
        if (liveMatchesError) return jsonError('Failed to load live match count', 500, liveMatchesError.message);
        if (tournamentsError) return jsonError('Failed to load tournament conflict count', 500, tournamentsError.message);
        if (clubsError) return jsonError('Failed to load club conflict count', 500, clubsError.message);

        return NextResponse.json({
            data: {
                todayMatches: todayMatches ?? 0,
                liveMatches: liveMatches ?? 0,
                unlinkedTournaments: unlinkedTournaments ?? 0,
                unlinkedClubs: unlinkedClubs ?? 0,
            },
        });
    } catch (error) {
        return jsonError('Failed to load dashboard stats', 500, error instanceof Error ? error.message : String(error));
    }
}
