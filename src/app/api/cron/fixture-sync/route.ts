/**
 * /api/cron/fixture-sync
 *
 * Fetches fixture data (yesterday + today + 2 days) from FlashScore and persists
 * it to external_match_cache, the primary source for /api/matches (DB-first).
 * Yesterday acts as the results sweep: it re-confirms finals and scores that
 * live-sync may have missed (a final the live feed never showed).
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
import { recordExternalTournamentsFromMatches } from '@/lib/server/externalTournamentCatalog';
import {
    mapFlashScoreMatchToCached,
    upsertMatches
} from '@/lib/services/externalMatchCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DAYS_AHEAD = 3;  // today + 2 ahead
const DAYS_BEHIND = 1; // ayer: barrido de resultados (reconfirma finales que live-sync pudo perderse)


/** Build an array of [Date, dateKey] pairs for today-DAYS_BEHIND through today+DAYS_AHEAD-1 in UTC. */
function getTargetDates(): { date: Date; dateKey: string }[] {
    const now = new Date();
    return Array.from({ length: DAYS_BEHIND + DAYS_AHEAD }, (_, i) => {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() + i - DAYS_BEHIND);
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
                        // Con /api/matches en modo DB-first casi nunca llama a
                        // FlashScore, así que el catálogo buscable de torneos
                        // externos pasa a alimentarse desde este cron.
                        void recordExternalTournamentsFromMatches(matches, sport.id).catch((catalogErr) => {
                            console.warn(`[fixture-sync] catálogo de torneos externos falló para sport=${sport.id}:`, catalogErr);
                        });
                    }
                } catch (e) {
                    errors++;
                    console.error(`[fixture-sync] Failed for sport=${sport.id} date=${dateKey}:`, e);
                }
            }

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
