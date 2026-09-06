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
import type { SupabaseClient } from '@supabase/supabase-js';
import { getRugbyPassPoll } from '@/lib/services/rugbyPass';
import { RUGBYPASS_MATCH_ID_PREFIX } from '@/lib/services/rugbyPassParser';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Un partido de rugby dura unos 80 minutos de juego mas el entretiempo: 100
 * minutos desde el kickoff es el piso para darlo por terminado.
 */
const RUGBY_MATCH_SPAN_MS = 100 * 60 * 1000;

/** Cuanto antes del kickoff empieza a sondearse un partido. */
const PRE_KICKOFF_MS = 15 * 60 * 1000;

/**
 * SONDEO EN VIVO DE RUGBYPASS.
 *
 * El poll acepta muchos ids en una sola llamada y contesta chico (318 bytes
 * para cuatro partidos), asi que la ventana entera del dia sale en un request.
 *
 * Solo distingue en-vivo de no-en-vivo: NO sabe decir "termino". Por eso un
 * partido se cierra recien cuando el poll lo da como no-vivo Y ya pasaron
 * `RUGBY_MATCH_SPAN_MS` desde el kickoff. Sin esa guarda, el entretiempo —donde
 * el proveedor bien puede contestar 0— cerraria el partido a los 40 minutos.
 */
async function syncRugbyPassLive(supabase: SupabaseClient) {
    const ahora = Date.now();
    const desde = new Date(ahora - 6 * 60 * 60 * 1000).toISOString();
    const hasta = new Date(ahora + PRE_KICKOFF_MS).toISOString();

    const { data: filas, error } = await supabase
        .from('external_match_cache')
        // Solo lo que hace falta para decidir. `select('*')` invitaba a
        // devolver la fila entera al escribir, y ahi estaba el bug.
        .select('id, status, date_time, score')
        .like('id', `${RUGBYPASS_MATCH_ID_PREFIX}%`)
        .in('status', ['scheduled', 'live'])
        .gte('date_time', desde)
        .lte('date_time', hasta);

    if (error) {
        console.error('[live-sync] no se pudieron leer las filas de RugbyPass:', error.message);
        return { polled: 0, updated: 0, failed: 0 };
    }
    if (!filas || filas.length === 0) return { polled: 0, updated: 0, failed: 0 };

    const porGameId = new Map<number, any>();
    for (const fila of filas) {
        const gameId = Number(String(fila.id).slice(RUGBYPASS_MATCH_ID_PREFIX.length));
        if (Number.isFinite(gameId)) porGameId.set(gameId, fila);
    }

    const resultados = await getRugbyPassPoll([...porGameId.keys()]);
    const cambiadas: any[] = [];

    for (const r of resultados) {
        const fila = porGameId.get(r.gameId);
        if (!fila) continue;

        const kickoffMs = new Date(fila.date_time).getTime();
        const yaTendriaQueHaberTerminado =
            !Number.isNaN(kickoffMs) && ahora - kickoffMs > RUGBY_MATCH_SPAN_MS;

        let status = fila.status;
        if (r.status === 'live') {
            status = 'live';
        } else if (fila.status === 'live' && yaTendriaQueHaberTerminado) {
            status = 'final';
        }

        // UN MARCADOR QUE NO VINO NO ES UN 0-0.
        //
        // El poll devuelve `null` cuando no publica el tanteador. Escribir eso
        // encima de un marcador bueno lo borra, y en la pantalla un `null` se
        // lee igual que un cero: el partido queda 0-0 en el peor momento, con
        // el "En vivo" al lado. Sin dato, el marcador guardado no se toca.
        const traeMarcador = typeof r.home === 'number' && typeof r.away === 'number';
        const score = traeMarcador
            ? { home: r.home, away: r.away, penalties: null }
            : fila.score;
        const cambioMarcador =
            traeMarcador && (fila.score?.home !== r.home || fila.score?.away !== r.away);

        if (status !== fila.status || cambioMarcador) {
            cambiadas.push({ id: fila.id, status, score });
        }
    }

    /**
     * SE ESCRIBEN LAS DOS COLUMNAS QUE CAMBIAN, NO LA FILA ENTERA.
     *
     * La primera version leia con `select('*')` y devolvia `{ ...fila }` al
     * upsert. `external_match_cache` tiene columnas GENERADAS —`home_team_id`
     * entre ellas—, y Postgres rechaza el insert entero con 428C9: «cannot
     * insert a non-DEFAULT value into column». O sea que el sondeo en vivo de
     * RugbyPass no escribio nunca.
     *
     * Y no se veia: el error se registraba con un `console.warn` y la funcion
     * contestaba `updated: 0`, que es indistinguible de "no habia nada que
     * actualizar". En la pantalla el sintoma era un partido en vivo clavado en
     * 0-0 que, al abrirlo, mostraba el marcador de verdad — porque la ficha,
     * cuando el partido esta en juego, le pregunta al proveedor en vez de leer
     * la cache.
     *
     * Por eso ahora el fallo se CUENTA y viaja en la respuesta del cron: un
     * sondeo que no pudo escribir tiene que poder verse sin abrir la pantalla.
     */
    let updated = 0;
    let fallidas = 0;
    for (const cambio of cambiadas) {
        const { error: updateError } = await supabase
            .from('external_match_cache')
            .update({ status: cambio.status, score: cambio.score })
            .eq('id', cambio.id);
        if (updateError) {
            fallidas += 1;
            console.error(`[live-sync] RugbyPass ${cambio.id} no se pudo actualizar:`, updateError.message);
            continue;
        }
        updated += 1;
    }

    return { polled: resultados.length, updated, failed: fallidas };
}


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

    // RugbyPass va aparte del bucle de FlashScore: es su propio proveedor, con
    // su propia ventana y su propio criterio de cierre.
    let rugbyPass = { polled: 0, updated: 0, failed: 0 };
    try {
        rugbyPass = await syncRugbyPassLive(adminClient);
    } catch (e) {
        console.warn('[live-sync] el sondeo de RugbyPass falló:', e);
    }

    const summary = results.map((r, i) =>
        r.status === 'fulfilled' ? r.value : { sport: activeSports[i].id, error: String(r.reason) }
    );

    const totalSynced = summary.reduce((acc, s: any) => acc + (s.synced ?? 0), 0);
    const gatedCount = summary.filter((s: any) => s.gated).length;
    const storageUnavailable = summary.some((s: any) => s.storage === 'unavailable');
    const elapsed = Date.now() - startedAt;

    console.log(
        `[live-sync] Done: ${totalSynced} live matches written in ${elapsed}ms` +
        (rugbyPass.polled > 0 ? ` — RugbyPass: ${rugbyPass.updated}/${rugbyPass.polled}` : '') +
        (rugbyPass.failed > 0 ? ` — RugbyPass NO ESCRIBIO ${rugbyPass.failed}` : '') +
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
            rugbypass: rugbyPass,
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
