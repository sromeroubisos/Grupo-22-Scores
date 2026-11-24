/**
 * Sync del circuito SVNS (SVNS 2 y SVNS 3) contra la API de World Rugby, la misma que
 * alimenta svns.com.
 *
 *   GET /api/cron/worldrugby-sync                       lo que toque ahora
 *   GET /api/cron/worldrugby-sync?todo=1                todas las etapas de todos los circuitos
 *   GET /api/cron/worldrugby-sync?circuito=svns2-2027-m un circuito
 *   GET /api/cron/worldrugby-sync?dry=1                 plan sin escribir
 *
 * UNA sola entrada en vercel.json la despierta cada 5 minutos y ella decide: solo
 * sincroniza las etapas que juegan hoy (un día antes, durante y dos días después). Fuera
 * de esa ventana responde `salteado` sin tocar World Rugby.
 *
 * Por etapa: partidos nuevos, marcadores y estados en vivo, la cronología (tries,
 * conversiones, penales, tarjetas y cambios) y la tabla de la fase, de la que sale la tabla
 * general del circuito. Si World Rugby no contesta no se escribe nada de esa etapa.
 *
 * Los torneos y sus fases los crea `src/scripts/worldrugby-alta.ts`.
 */
import { NextResponse } from 'next/server';

import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    CIRCUITOS_SVNS, circuitoPorClave, etapasActivas, type CircuitoSvns, type EtapaSvns,
} from '@/lib/integrations/worldrugby/svns.ts';
import { fijarFaseActiva, sincronizarEtapa, type ResumenEtapa } from '@/lib/integrations/worldrugby/svnsSync.ts';
import { wrCountryEs } from '@/lib/services/worldRugbyEventParser';
import { getNationalTeamFlag } from '@/lib/utils/teamLogoOverrides';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Cuántas cronologías se bajan por corrida: cuida el tiempo de la función. */
const MAX_CRONOLOGIAS = 8;

export async function GET(req: Request) {
    if (!(await authorizeCronRequest(req, 'worldrugby-sync'))) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const url = new URL(req.url);
    const enSeco = url.searchParams.get('dry') === '1';
    const todo = url.searchParams.get('todo') === '1';
    const pedido = url.searchParams.get('circuito');
    const arranque = Date.now();
    const ahora = new Date();

    if (pedido && !circuitoPorClave(pedido)) {
        return NextResponse.json({ ok: false, error: `Circuito desconocido. Los hay: ${CIRCUITOS_SVNS.map((c) => c.clave).join(', ')}` }, { status: 400 });
    }

    const circuitos = pedido ? [circuitoPorClave(pedido) as CircuitoSvns] : [...CIRCUITOS_SVNS];
    const tareas: { circuito: CircuitoSvns; etapa: EtapaSvns }[] = [];
    for (const circuito of circuitos) {
        const etapas = todo || pedido ? circuito.etapas : etapasActivas(circuito, ahora);
        for (const etapa of etapas) tareas.push({ circuito, etapa });
    }
    if (!tareas.length) {
        return NextResponse.json({ ok: true, salteado: true, motivo: 'ninguna etapa juega hoy', ms: Date.now() - arranque });
    }

    const supabase = createAdminClient();
    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    const resumenes: ResumenEtapa[] = [];
    let escribio = false;
    const errors: string[] = [];

    // De a una etapa: cada una hace su propia tanda de pedidos y escrituras.
    for (const { circuito, etapa } of tareas) {
        const r = await sincronizarEtapa(supabase, circuito, etapa, {
            enSeco,
            conEventos: true,
            ahora,
            maxCronologias: MAX_CRONOLOGIAS,
            logoDe: (pais) => getNationalTeamFlag(wrCountryEs(pais)) ?? getNationalTeamFlag(pais),
            recalcular: async (torneoId, faseId, seasonId) =>
                (await recalculatePhaseStandingsScopes(torneoId, faseId, 'general', seasonId ?? undefined)).ok,
        });
        resumenes.push(r);
        escribio ||= r.escribio || r.eventos > 0;
    }

    if (!enSeco) {
        for (const circuito of new Set(tareas.map((t) => t.circuito))) {
            try {
                const { data } = await supabase.from('tournaments').select('id').eq('external_id', circuito.externalId).maybeSingle();
                if (data?.id) await fijarFaseActiva(supabase, circuito, data.id, ahora);
            } catch (e) {
                errors.push(`fase activa de ${circuito.clave}: ${e instanceof Error ? e.message : 'error'}`);
            }
        }
        if (escribio) {
            try {
                const { invalidateMatchesFeedCaches } = await import('@/lib/server/matchesFeedInvalidation');
                await invalidateMatchesFeedCaches(supabase);
            } catch {
                errors.push('No se pudieron invalidar los cachés del feed');
            }
        }
    }

    return NextResponse.json({
        ok: errors.length === 0 && resumenes.every((r) => r.ok),
        dry: enSeco,
        ms: Date.now() - arranque,
        etapas: resumenes.map(({ detalle, ...resto }) => (enSeco ? { ...resto, detalle } : resto)),
        errors,
    });
}
