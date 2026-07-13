/**
 * /api/cron/tournament-catalog-sync
 *
 * Rebuilds `external_tournament_catalog`, which is what makes external tournaments
 * findable in the global search — the provider has no search endpoint of its own
 * (/search answers 404).
 *
 * The matches feed populates the catalog opportunistically, but it only ever sees
 * competitions playing in its ±7-day window. This job walks the provider's country
 * directory instead, so out-of-season competitions are indexed too.
 *
 * Authentication: Bearer {CRON_SECRET} header (open in development, like the other crons).
 */
import { NextRequest, NextResponse } from 'next/server';
import { syncExternalTournamentCatalog } from '@/lib/server/externalTournamentCatalog';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DEFAULT_SPORTS = ['rugby-union', 'rugby-league'];

function isAuthorized(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('[tournament-catalog-sync] CRON_SECRET not set — allowing request in development mode');
            return true;
        }
        return false;
    }
    const authHeader = request.headers.get('authorization');
    return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const sportsParam = request.nextUrl.searchParams.get('sports');
    const sports = sportsParam
        ? sportsParam.split(',').map((sport) => sport.trim()).filter(Boolean)
        : DEFAULT_SPORTS;

    try {
        const summary = await syncExternalTournamentCatalog(sports);
        return NextResponse.json({ ok: true, summary });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[tournament-catalog-sync] failed:', error);
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
