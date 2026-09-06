/**
 * /api/cron/rugbypass-sync
 *
 * Trae el calendario de RugbyPass y lo persiste en `external_match_cache`, que
 * es la fuente DB-first de /api/matches. Reemplaza a FlashScore en las
 * competiciones de `RUGBYPASS_COMPETITIONS`: el equivalente de FlashScore se
 * apaga en `rugbyPassSupersedes.ts`, no se muestra en ningun lado.
 *
 * Por que se cambia de proveedor: en FlashScore el rugby llega mutilado.
 * `matches/list` no completa `match_status`, asi que un partido TERMINADO llega
 * con `is_finished: false` y se publica como programado. RugbyPass manda
 * `sts: 'Result'` explicito.
 *
 * Es UNA sola llamada al proveedor (~2 MB con el calendario entero), asi que no
 * hace falta iterar por fecha como hace fixture-sync.
 *
 * Vercel Cron: cada hora. Autenticacion: Bearer {CRON_SECRET}.
 */
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';
import { mapExternalMatchToCached, upsertMatches } from '@/lib/services/externalMatchCache';
import { getRugbyPassEventsFor, getRugbyPassFixtures } from '@/lib/services/rugbyPass';
import { RUGBYPASS_COMPETITIONS, rugbyPassTeamSlugOf, type RugbyPassMatch } from '@/lib/services/rugbyPassParser';
import { competitionsWithoutSupersede } from '@/lib/services/rugbyPassSupersedes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SPORT = 'rugby';

/** Tanda de upsert. 1498 partidos entran en cuatro viajes. */
const UPSERT_BATCH = 400;

/** Las tres primeras letras alcanzan para la abreviatura de la tarjeta. */
function shortName(name: string): string {
    return name.trim().slice(0, 3).toUpperCase() || 'EQU';
}

function toCached(match: RugbyPassMatch) {
    return mapExternalMatchToCached({
        id: match.id,
        sport: SPORT,
        tournamentId: match.tournamentId,
        tournamentName: match.competitionName,
        countryName: match.country,
        homeTeam: {
            id: match.home.id,
            name: match.home.name,
            logo: match.home.logo,
            shortName: shortName(match.home.name),
            image_path: match.home.logo,
            small_image_path: match.home.logo,
        },
        awayTeam: {
            id: match.away.id,
            name: match.away.name,
            logo: match.away.logo,
            shortName: shortName(match.away.name),
            image_path: match.away.logo,
            small_image_path: match.away.logo,
        },
        score: { home: match.home.score, away: match.away.score },
        status: match.status,
        // Solo se llama con partidos de hora conocida: ver el filtro de abajo.
        dateTime: match.kickoff as string,
        roundLabel: match.roundLabel,
    });
}

/** Cuantas fichas se abren por corrida. Cada una es un request aparte. */
const MAX_EVENT_FETCHES = 30;

/** Hasta cuando atras se buscan eventos de un partido ya jugado. */
const EVENT_LOOKBACK_MS = 48 * 60 * 60 * 1000;

/**
 * LOS EVENTOS DEL PARTIDO.
 *
 * No hay API: vienen renderizados en la ficha (`/live/<slug>/?g=<id>`), asi que
 * es un request por partido. Por eso se acotan a los que empezaron hace menos de
 * 48 h y se saltean los que YA tienen eventos guardados y estan cerrados: un
 * partido terminado no cambia mas, no tiene sentido volver a bajarlo cada hora.
 *
 * Van a `external_match_events` y no a `match_events` porque esa ultima exige
 * `match_id UUID REFERENCES matches(id)`, y un partido externo no esta en
 * `matches`. Si la tabla todavia no existe (la migracion se corre a mano), esto
 * se saltea y lo reporta en vez de voltear la sincronizacion.
 */
async function syncRugbyPassEvents(
    supabase: SupabaseClient,
    fixtures: RugbyPassMatch[]
): Promise<{ fetched: number; written: number; skipped: boolean }> {
    const ahora = Date.now();
    const candidatos = fixtures.filter((m) => {
        if (!m.kickoffKnown || (m.status !== 'final' && m.status !== 'live')) return false;
        const desde = ahora - new Date(m.kickoff as string).getTime();
        return desde > 0 && desde < EVENT_LOOKBACK_MS;
    });
    if (candidatos.length === 0) return { fetched: 0, written: 0, skipped: false };

    const { data: yaGuardados, error: readError } = await supabase
        .from('external_match_events')
        .select('match_id')
        .in('match_id', candidatos.map((m) => m.id));

    if (readError) {
        if (readError.code === '42P01' || isMissingTableError(readError, 'external_match_events')) {
            console.warn('[rugbypass-sync] external_match_events no existe: aplicar 20260906120000_external_match_events.sql');
            return { fetched: 0, written: 0, skipped: true };
        }
        throw readError;
    }

    const conEventos = new Set((yaGuardados ?? []).map((r) => String(r.match_id)));
    // Un partido en vivo se vuelve a bajar aunque ya tenga eventos: le faltan los
    // que pasaron desde la ultima corrida.
    const pendientes = candidatos
        .filter((m) => m.status === 'live' || !conEventos.has(m.id))
        .slice(0, MAX_EVENT_FETCHES);

    let fetched = 0;
    let written = 0;

    for (const partido of pendientes) {
        let eventos;
        try {
            eventos = await getRugbyPassEventsFor(
                partido.gameId,
                rugbyPassTeamSlugOf(partido.home.id),
                rugbyPassTeamSlugOf(partido.away.id),
            );
        } catch (e) {
            console.warn(`[rugbypass-sync] no se pudieron leer los eventos de ${partido.id}:`, e);
            continue;
        }
        fetched++;
        // Sin eventos no se escribe nada: la Farah Palmer Cup y el Super Rugby
        // Aupiki traen marcador pero no linea de tiempo, y eso NO es un error.
        if (eventos.length === 0) continue;

        const filas = eventos.map((e, i) => ({
            match_id: partido.id,
            sort_order: i,
            type: e.type,
            side: e.side,
            minute: e.minute,
            player_name: e.playerName,
            player_slug: e.playerSlug,
            home_score: e.homeScore,
            away_score: e.awayScore,
        }));

        const { error: upsertError } = await supabase
            .from('external_match_events')
            .upsert(filas, { onConflict: 'match_id,sort_order' });
        if (upsertError) {
            console.warn(`[rugbypass-sync] upsert de eventos de ${partido.id} falló:`, upsertError.message);
            continue;
        }
        written += filas.length;
    }

    return { fetched, written, skipped: false };
}

export async function GET(request: NextRequest) {
    if (!(await authorizeCronRequest(request, 'rugbypass-sync'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startedAt = Date.now();
    const adminClient = createAdminClient();

    let fixtures: RugbyPassMatch[];
    try {
        fixtures = await getRugbyPassFixtures();
    } catch (e) {
        console.error('[rugbypass-sync] el proveedor no contesto:', e);
        return NextResponse.json(
            { ok: false, reason: 'provider_unavailable', message: String(e) },
            { status: 502 }
        );
    }

    /**
     * Un partido sin hora confirmada NO se guarda.
     *
     * `external_match_cache.date_time` no admite "solo la fecha", asi que
     * guardarlo obligaria a inventar una hora — y es exactamente el error del
     * proveedor: medianoche UTC leida como horario se muestra a las 21:00 del
     * DIA ANTERIOR en Argentina. Se saltea y se cuenta.
     *
     * No se pierde nada permanente: son fixtures futuros sin horario asignado
     * todavia (Top 14 83%, Pro D2 89%, y 0% en los partidos ya jugados), y este
     * cron corre cada hora, asi que entran solos cuando el horario aparece.
     */
    const conHora = fixtures.filter((m) => m.kickoffKnown);
    const sinHora = fixtures.length - conHora.length;

    let written = 0;
    let storageUnavailable = false;

    for (let i = 0; i < conHora.length; i += UPSERT_BATCH) {
        const tanda = conHora.slice(i, i + UPSERT_BATCH).map(toCached);
        const result = await upsertMatches(tanda, adminClient);
        written += result.written;
        if (result.skipped) storageUnavailable = true;
    }

    // Los eventos van despues de los partidos: la FK apunta a la cache, asi que
    // la fila del partido tiene que existir antes que sus eventos.
    let eventos = { fetched: 0, written: 0, skipped: false };
    try {
        eventos = await syncRugbyPassEvents(adminClient, fixtures);
    } catch (e) {
        console.warn('[rugbypass-sync] la sincronización de eventos falló:', e);
    }

    const porTorneo: Record<string, { total: number; guardados: number; sinHora: number }> = {};
    for (const c of RUGBYPASS_COMPETITIONS) {
        const propios = fixtures.filter((m) => m.competitionId === c.id);
        porTorneo[c.name] = {
            total: propios.length,
            guardados: propios.filter((m) => m.kickoffKnown).length,
            sinHora: propios.filter((m) => !m.kickoffKnown).length,
        };
    }

    const elapsed = Date.now() - startedAt;
    console.log(
        `[rugbypass-sync] ${written} partidos escritos de ${fixtures.length} en ${elapsed}ms` +
        (sinHora ? ` — ${sinHora} sin horario confirmado, no se publican` : '') +
        (eventos.fetched ? ` — eventos: ${eventos.written} de ${eventos.fetched} fichas` : '') +
        (eventos.skipped ? ' — eventos SALTEADOS: falta la migración external_match_events' : '') +
        (storageUnavailable ? ' — CACHÉ NO DISPONIBLE: no se escribió nada' : '')
    );

    return NextResponse.json(
        {
            ok: !storageUnavailable,
            written,
            fetched: fixtures.length,
            skippedNoKickoffTime: sinHora,
            events: eventos,
            elapsed,
            tournaments: porTorneo,
            // Si esto trae algo que no sea Internationals, alguien sumo una
            // competicion y se olvido de apagar la de FlashScore.
            competitionsWithoutSupersede: competitionsWithoutSupersede(),
            ...(storageUnavailable
                ? {
                    storage: 'unavailable' as const,
                    reason: 'external_match_cache no existe. Aplicar 20260701090000_restore_external_match_cache.sql.',
                }
                : {}),
        },
        { status: storageUnavailable ? 500 : 200 }
    );
}
