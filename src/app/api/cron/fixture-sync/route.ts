/**
 * /api/cron/fixture-sync
 *
 * Fetches upcoming fixture data (today + 2 days) from FlashScore and persists
 * it to external_match_cache so the API has a fallback when FlashScore is unavailable.
 *
 * Called by Vercel Cron every hour: "0 * * * *"
 *
 * Authentication: Bearer {CRON_SECRET} header (set in Vercel env vars)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFlashScoreMatches } from '@/lib/services/flashscore';
import { getActiveSports } from '@/lib/data/sports';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatDateKey } from '@/lib/timezone';
import { isFlashScoreEnabledForSport } from '@/lib/externalProviderPolicy';
import {
    mapFlashScoreMatchToCached,
    upsertMatches
} from '@/lib/services/externalMatchCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DAYS_AHEAD = 3; // today + 2 ahead

function isAuthorized(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('[fixture-sync] CRON_SECRET not set — allowing request in development mode');
            return true;
        }
        return false;
    }
    const authHeader = request.headers.get('authorization');
    return authHeader === `Bearer ${secret}`;
}

/** Build an array of [Date, dateKey] pairs for today through today+DAYS_AHEAD in UTC. */
function getTargetDates(): { date: Date; dateKey: string }[] {
    const now = new Date();
    return Array.from({ length: DAYS_AHEAD }, (_, i) => {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() + i);
        d.setUTCHours(12, 0, 0, 0); // midday UTC avoids boundary issues
        const dateKey = formatDateKey(d, 'UTC');
        return { date: d, dateKey };
    });
}

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startedAt = Date.now();
    const adminClient = createAdminClient();
    const activeSports = getActiveSports();
    const targetDates = getTargetDates();

    let totalSynced = 0;
    const sportResults: Record<string, { synced: number; errors: number }> = {};

    // Process sports in parallel, but dates sequentially per sport to avoid rate-limit bursts
    await Promise.allSettled(
        activeSports.map(async (sport) => {
            let synced = 0;
            let errors = 0;

            if (!isFlashScoreEnabledForSport(sport.id)) {
                sportResults[sport.id] = { synced: 0, errors: 0 };
                return;
            }

            for (const { date, dateKey } of targetDates) {
                try {
                    const matches = await getFlashScoreMatches(date, sport.id, {
                        timeZone: 'UTC',
                        targetDateKey: dateKey
                    });

                    if (matches.length > 0) {
                        const cached = matches.map(m => mapFlashScoreMatchToCached(m, sport.id));
                        await upsertMatches(cached, adminClient);
                        synced += cached.length;
                    }
                } catch (e) {
                    errors++;
                    console.error(`[fixture-sync] Failed for sport=${sport.id} date=${dateKey}:`, e);
                }
            }

            sportResults[sport.id] = { synced, errors };
            totalSynced += synced;
        })
    );

    const elapsed = Date.now() - startedAt;
    console.log(`[fixture-sync] Done: ${totalSynced} matches synced in ${elapsed}ms`);

    return NextResponse.json({
        ok: true,
        synced: totalSynced,
        elapsed,
        dates: targetDates.map(d => d.dateKey),
        sports: sportResults
    });
}
