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

        const [{ data: todayMatchesRows, error: todayMatchesError }, { data: liveMatchesRows, error: liveMatchesError }, { data: unlinkedTournamentRows, error: tournamentsError }, { data: unlinkedClubRows, error: clubsError }] = await Promise.all([
            readClient
                .from('matches')
                .select('id')
                .gte('date_time', dayStart.toISOString())
                .lt('date_time', nextDayStart.toISOString()),
            readClient
                .from('matches')
                .select('id')
                .eq('status', 'live')
                .gte('date_time', dayStart.toISOString())
                .lt('date_time', nextDayStart.toISOString()),
            readClient
                .from('tournaments')
                .select('id')
                .is('union_id', null),
            readClient
                .from('clubs')
                .select('id')
                .is('union_id', null),
        ]);

        if (todayMatchesError) return jsonError('Failed to load today match count', 500, todayMatchesError.message);
        if (liveMatchesError) return jsonError('Failed to load live match count', 500, liveMatchesError.message);
        if (tournamentsError) return jsonError('Failed to load tournament conflict count', 500, tournamentsError.message);
        if (clubsError) return jsonError('Failed to load club conflict count', 500, clubsError.message);

        return NextResponse.json({
            data: {
                todayMatches: todayMatchesRows?.length ?? 0,
                liveMatches: liveMatchesRows?.length ?? 0,
                unlinkedTournaments: unlinkedTournamentRows?.length ?? 0,
                unlinkedClubs: unlinkedClubRows?.length ?? 0,
            },
        });
    } catch (error) {
        return jsonError('Failed to load dashboard stats', 500, error instanceof Error ? error.message : String(error));
    }
}
