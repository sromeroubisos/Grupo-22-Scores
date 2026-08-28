/**
 * /api/cron/live-sync
 *
 * Fetches live match state from FlashScore and persists it to external_match_cache.
 * Called by Vercel Cron every minute: "* * * * *"
 *
 * Authentication: Bearer {CRON_SECRET} header (set in Vercel env vars)
 */
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { NextRequest, NextResponse } from 'next/server';
import { getFlashScoreLiveMatches } from '@/lib/services/flashscore';
import { getActiveSports } from '@/lib/data/sports';
import { createAdminClient } from '@/lib/supabase/admin';
import { isFlashScoreEnabledForSport } from '@/lib/externalProviderPolicy';
import {
    mapFlashScoreMatchToCached,
    upsertMatches,
    resetStaleLiveMatches,
    shouldPollLiveMatches
} from '@/lib/services/externalMatchCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;


export async function GET(request: NextRequest) {
    if (!(await authorizeCronRequest(request, 'live-sync'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startedAt = Date.now();
    const adminClient = createAdminClient();
    const activeSports = getActiveSports();

    const results = await Promise.allSettled(
        activeSports.map(async (sport) => {
            if (!isFlashScoreEnabledForSport(sport.id)) {
                return { sport: sport.id, synced: 0, skipped: true };
            }

            // Gate por ventana: si el fixture en external_match_cache dice que
            // no hay nada en vivo ni por arrancar, el request al proveedor se
            // ahorra. 'unknown' falla abierto y pollea como siempre.
            const pollDecision = await shouldPollLiveMatches(sport.id, adminClient);
            if (pollDecision === 'skip') {
                return { sport: sport.id, synced: 0, gated: true };
            }

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

            // `synced` es lo que se ESCRIBIÓ, no lo que trajo el proveedor: si la
            // caché no existe, informar liveMatches.length sería inventar trabajo.
            let written = 0;
            let storageSkipped = false;

            if (liveMatches.length > 0) {
                const cached = liveMatches.map(m => mapFlashScoreMatchToCached(m, sport.id));
                const result = await upsertMatches(cached, adminClient);
                written = result.written;
                storageSkipped = result.skipped;
            }

            // Only reset stale live rows when API call succeeded (even if zero results = all finished)
            const currentLiveIds = liveMatches.map(m => m.id);
            await resetStaleLiveMatches(currentLiveIds, sport.id, adminClient);

            return storageSkipped
                ? { sport: sport.id, synced: written, fetched: liveMatches.length, storage: 'unavailable' as const }
                : { sport: sport.id, synced: written };
        })
    );

    const summary = results.map((r, i) =>
        r.status === 'fulfilled' ? r.value : { sport: activeSports[i].id, error: String(r.reason) }
    );

    const totalSynced = summary.reduce((acc, s: any) => acc + (s.synced ?? 0), 0);
    const gatedCount = summary.filter((s: any) => s.gated).length;
    const storageUnavailable = summary.some((s: any) => s.storage === 'unavailable');
    const elapsed = Date.now() - startedAt;

    console.log(
        `[live-sync] Done: ${totalSynced} live matches written in ${elapsed}ms` +
        (gatedCount > 0 ? ` (${gatedCount} sports gated, sin request al proveedor)` : '') +
        (storageUnavailable ? ' — CACHÉ NO DISPONIBLE: no se escribió nada' : '')
    );

    // Mismo criterio que fixture-sync: si la caché no existe el job no cumplió y
    // responde 500, para que el cron se vea en rojo en vez de verde con un
    // contador inflado.
    return NextResponse.json(
        {
            ok: !storageUnavailable,
            synced: totalSynced,
            elapsed,
            sports: summary,
            ...(storageUnavailable
                ? {
                    storage: 'unavailable' as const,
                    reason: 'external_match_cache no existe. Aplicar 20260701090000_restore_external_match_cache.sql o dar de baja este cron.',
                }
                : {}),
        },
        { status: storageUnavailable ? 500 : 200 },
    );
}
