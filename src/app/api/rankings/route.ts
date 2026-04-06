import { NextRequest, NextResponse } from 'next/server';
import { listClubRankings } from '@/lib/server/clubRankings';

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function getStatusCode(error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('schema cache')) return 503;
    return 500;
}

export async function GET(request: NextRequest) {
    try {
        const sport = String(request.nextUrl.searchParams.get('sport') || '').trim().toLowerCase();
        const rankings = await listClubRankings();
        const filtered = sport
            ? rankings.filter((ranking) => String(ranking.sport || '').trim().toLowerCase() === sport)
            : rankings;

        const data = filtered.map((ranking) => ({
            id: ranking.id,
            name: ranking.name,
            sport: ranking.sport,
            season: ranking.season,
            results_season: ranking.results_season,
            scope: ranking.scope,
            description: ranking.description,
            stale_from_match_id: ranking.stale_from_match_id,
            stale_reason: ranking.stale_reason,
            initial_imported_at: ranking.initial_imported_at,
            backfill_completed_at: ranking.backfill_completed_at,
            last_incremental_match_id: ranking.last_incremental_match_id,
            created_at: ranking.created_at,
            updated_at: ranking.updated_at,
        }));

        return NextResponse.json({ data });
    } catch (error) {
        return jsonError(
            error instanceof Error ? error.message : 'No se pudieron cargar los rankings publicos.',
            getStatusCode(error),
        );
    }
}
