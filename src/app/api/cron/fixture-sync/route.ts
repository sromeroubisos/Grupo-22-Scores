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
import { authorizeCronRequest } from '@/lib/server/cronAuth';
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
    if (!(await authorizeCronRequest(request, 'fixture-sync'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startedAt = Date.now();
    const adminClient = createAdminClient();
    const activeSports = getActiveSports();
    const targetDates = getTargetDates();

    let totalSynced = 0;
    // `synced` cuenta filas ESCRITAS. Si la caché no está disponible (la tabla no
    // existe), el job no hizo su trabajo y tiene que decirlo: antes respondía
    // ok:true con un contador inflado y ningún monitor se enteraba.
    let storageUnavailable = false;
    const sportResults: Record<string, { synced: number; errors: number; skipped?: number }> = {};

    // Process sports in parallel, but dates sequentially per sport to avoid rate-limit bursts
    await Promise.allSettled(
        activeSports.map(async (sport) => {
            let synced = 0;
            let errors = 0;
            let skipped = 0;

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
                        const result = await upsertMatches(cached, adminClient);
                        synced += result.written;
                        if (result.skipped) {
                            skipped += cached.length;
                            storageUnavailable = true;
                        }
                    }
                } catch (e) {
                    errors++;
                    console.error(`[fixture-sync] Failed for sport=${sport.id} date=${dateKey}:`, e);
                }
            }

            /**
             * FlashScore SIGUE escribiendo los torneos que trae RugbyPass, a
             * proposito. El reemplazo se decide al LEER y no al escribir: si se
             * cortara acá, un dia sin datos de RugbyPass dejaria la pantalla en
             * blanco en vez de caer al proveedor viejo. La caché guarda las dos
             * y el feed elige — ver `dropSupersededMatches`.
             */
            sportResults[sport.id] = skipped > 0 ? { synced, errors, skipped } : { synced, errors };
            totalSynced += synced;
        })
    );

    const elapsed = Date.now() - startedAt;
    console.log(
        `[fixture-sync] Done: ${totalSynced} matches written in ${elapsed}ms` +
        (storageUnavailable ? ' — CACHÉ NO DISPONIBLE: no se escribió nada' : '')
    );

    const payload = {
        ok: !storageUnavailable,
        synced: totalSynced,
        elapsed,
        dates: targetDates.map(d => d.dateKey),
        sports: sportResults,
        ...(storageUnavailable
            ? {
                storage: 'unavailable' as const,
                reason: 'external_match_cache no existe. Aplicar 20260701090000_restore_external_match_cache.sql o dar de baja este cron.',
            }
            : {}),
    };

    // 500 a propósito cuando la caché no existe: el job no puede cumplir su
    // objetivo y el cron de Vercel tiene que verse en rojo. Devolver 200 es lo
    // que mantuvo esto invisible desde 2026-03-18.
    return NextResponse.json(payload, { status: storageUnavailable ? 500 : 200 });
}
