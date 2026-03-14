/**
 * /api/cron/live-sync
 *
 * Fetches live match state from FlashScore and persists it to external_match_cache.
 * Called by Vercel Cron every minute: "* * * * *"
 *
 * Authentication: Bearer {CRON_SECRET} header (set in Vercel env vars)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFlashScoreLiveMatches } from '@/lib/services/flashscore';
import { getActiveSports } from '@/lib/data/sports';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    mapFlashScoreMatchToCached,
    upsertMatches,
    resetStaleLiveMatches
} from '@/lib/services/externalMatchCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function isAuthorized(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    // Dev bypass: allow unauthenticated requests in development when secret is not set
    if (!secret) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('[live-sync] CRON_SECRET not set — allowing request in development mode');
            return true;
        }
        return false;
    }
    const authHeader = request.headers.get('authorization');
    return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startedAt = Date.now();
    const adminClient = createAdminClient();
    const activeSports = getActiveSports();

    const results = await Promise.allSettled(
        activeSports.map(async (sport) => {
            let apiFailed = false;
            let liveMatches: Awaited<ReturnType<typeof getFlashScoreLiveMatches>> = [];

            try {
                liveMatches = await getFlashScoreLiveMatches(sport.id);
            } catch (e) {
                apiFailed = true;
                console.error(`[live-sync] FlashScore failed for sport=${sport.id}:`, e);
            }

            if (apiFailed) {
                return { sport: sport.id, synced: 0, error: 'api_failed' };
            }

            if (liveMatches.length > 0) {
                const cached = liveMatches.map(m => mapFlashScoreMatchToCached(m, sport.id));
                await upsertMatches(cached, adminClient);
            }

            // Only reset stale live rows when API call succeeded (even if zero results = all finished)
            const currentLiveIds = liveMatches.map(m => m.id);
            await resetStaleLiveMatches(currentLiveIds, sport.id, adminClient);

            return { sport: sport.id, synced: liveMatches.length };
        })
    );

    const summary = results.map((r, i) =>
        r.status === 'fulfilled' ? r.value : { sport: activeSports[i].id, error: String(r.reason) }
    );

    const totalSynced = summary.reduce((acc, s: any) => acc + (s.synced ?? 0), 0);
    const elapsed = Date.now() - startedAt;

    console.log(`[live-sync] Done: ${totalSynced} live matches synced in ${elapsed}ms`);

    return NextResponse.json({ ok: true, synced: totalSynced, elapsed, sports: summary });
}
