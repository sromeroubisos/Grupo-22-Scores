/**
 * Sync del U20 Championship 2026 de Rugby Europe (rugbyeurope.eu).
 *
 *   GET /api/cron/rugbyeurope-sync              corrida normal
 *   GET /api/cron/rugbyeurope-sync?dry=1        plan sin escribir
 *
 * Baja la página de la competencia (tablas Fixtures y Results) y la ficha de
 * cada partido que puede haber cambiado, `planRe` lo cruza con lo guardado y se
 * escribe SOLO lo que cambió. Si la página no contesta no se escribe nada.
 *
 * Es un cuadro de eliminación: no hay tabla de posiciones que recalcular. Un
 * cruce aún sin definir ("Winner M4") no está en las tablas del sitio; el partido
 * entra cuando el sitio nombra a los dos equipos.
 *
 * El torneo, los clubes y los alias los crea `scripts/rugbyeurope/alta.mts`.
 * vercel.json lo llama cada 10 minutos entre el 8 y el 16 de noviembre.
 */
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildTournamentExternalId, fetchFicha, fetchPagina, normalizarNombre, planRe, RE_ID_PREFIX, RE_PROVIDER, RONDAS,
  type ExistenteRe, type FichaRe, type PartidoRe,
} from '@/lib/integrations/rugbyeurope/rugbyeurope.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const COLUMNAS = 'id, external_id, home_club_id, away_club_id, date_time, status, score, round_uuid, round_label, venue, notes';

export async function GET(req: Request) {
  if (!(await authorizeCronRequest(req, 'rugbyeurope-sync'))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const enSeco = new URL(req.url).searchParams.get('dry') === '1';
  const arranque = Date.now();
  const ahora = new Date();
  const supabase = createAdminClient();
  const errors: string[] = [];

  const { data: torneo, error: errTorneo } = await supabase
    .from('tournaments')
    .select('id, category, is_visible, current_season_id')
    .eq('external_id', buildTournamentExternalId())
    .maybeSingle();
  if (errTorneo) return NextResponse.json({ error: `No se pudo leer el torneo (${errTorneo.message})` }, { status: 500 });
  if (!torneo) return NextResponse.json({ ok: false, error: 'No hay torneo rugbyeurope:. Se da de alta con scripts/rugbyeurope/alta.mts.' });

  const { data: fase } = await supabase.from('tournament_phases').select('id, season_id').eq('tournament_id', torneo.id).order('order_index').limit(1).maybeSingle();
  if (!fase) return NextResponse.json({ ok: false, error: 'El torneo no tiene fase' });
  const seasonId = fase.season_id ?? torneo.current_season_id;

  const [aliasR, rondasR, partidosR] = await Promise.all([
    supabase.from('club_external_ids').select('external_id, club_id').eq('provider', RE_PROVIDER),
    supabase.from('tournament_rounds').select('id, name, order_index').eq('phase_id', fase.id),
    supabase.from('matches').select(COLUMNAS).eq('tournament_id', torneo.id).like('external_id', `${RE_ID_PREFIX}%`).limit(500),
  ]);
  for (const [n, r] of [['alias', aliasR], ['rondas', rondasR], ['partidos', partidosR]] as const) {
    if (r.error) return NextResponse.json({ error: `No se pudieron leer los ${n} (${r.error.message})` }, { status: 500 });
  }
  const alias = new Map(((aliasR.data ?? []) as { external_id: string; club_id: string }[]).map((a) => [a.external_id, a.club_id]));
  const rondas = (rondasR.data ?? []) as { id: string; name: string; order_index: number }[];
  const existentes = (partidosR.data ?? []) as ExistenteRe[];

  const pagina = await fetchPagina();
  if (!pagina.ok) {
    return NextResponse.json({
      ok: false, dry: enSeco, ms: Date.now() - arranque,
      error: pagina.status === -1
        ? 'No se escribió nada: la página bajó pero sin las tablas (¿cambió la forma?)'
        : `No se escribió nada: rugbyeurope.eu no contestó (HTTP ${pagina.status})`,
    });
  }

  // La ficha trae ronda, estadio y el estado en vivo. Se pide la de todo lo que
  // todavía puede cambiar; un resultado ya cerrado y guardado no se vuelve a bajar.
  const yaCerrado = (p: { local: string; visitante: string; puntosLocal: number | null; puntosVisitante: number | null }) => {
    const h = alias.get(normalizarNombre(p.local));
    const a = alias.get(normalizarNombre(p.visitante));
    return existentes.some((e) => e.home_club_id === h && e.away_club_id === a && e.status === 'final'
      && e.score?.home === p.puntosLocal && e.score?.away === p.puntosVisitante && e.venue && e.round_uuid);
  };
  const partidos: PartidoRe[] = [];
  for (const fila of pagina.filas) {
    let ficha: FichaRe | null = null;
    if (fila.ficha && !(fila.tabla === 'results' && yaCerrado(fila))) {
      const r = await fetchFicha(fila.ficha);
      if (r.ok) ficha = r.ficha;
      else errors.push(`ficha ${fila.local} v ${fila.visitante}: HTTP ${r.status}`);
    }
    partidos.push({ ...fila, ficha_datos: ficha });
  }

  const plan = planRe({
    partidos, existentes, ahora,
    resolverEquipo: (n) => alias.get(normalizarNombre(n)) ?? null,
    rondaDe: (clave) => {
      const def = RONDAS.find((r) => r.clave === clave);
      const fila = def ? rondas.find((r) => r.order_index === def.orden) : undefined;
      return { id: fila?.id ?? null, nombre: def?.nombre ?? 'Cuadro' };
    },
  });

  let creados = 0;
  let actualizados = 0;
  if (!enSeco) {
    if (plan.crear.length) {
      const { error } = await supabase.from('matches').insert(plan.crear.map((f) => ({
        ...f, tournament_id: torneo.id, season_id: seasonId, phase_id: fase.id, sport_id: 'rugby', sport: 'rugby',
        category: torneo.category, is_visible: torneo.is_visible === true, live_enabled: false, review_status: 'approved',
      })));
      if (error) errors.push(`alta de ${plan.crear.length} partidos falló (${error.message})`);
      else creados = plan.crear.length;
    }
    for (const c of plan.actualizar) {
      const { error } = await supabase.from('matches').update({ ...c.patch, updated_at: ahora.toISOString() }).eq('id', c.id);
      if (error) errors.push(`${c.id}: ${error.message}`);
      else actualizados++;
    }
    if (creados + actualizados > 0) {
      try {
        const { invalidateMatchesFeedCaches } = await import('@/lib/server/matchesFeedInvalidation');
        await invalidateMatchesFeedCaches(supabase);
      } catch {
        errors.push('No se pudieron invalidar los cachés del feed');
      }
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    dry: enSeco,
    ms: Date.now() - arranque,
    filas: pagina.filas.length,
    crear: enSeco ? plan.crear.length : creados,
    actualizar: enSeco ? plan.actualizar.length : actualizados,
    sinCambios: plan.sinCambios,
    ...(plan.equiposSinAlias.length && { equiposSinAlias: plan.equiposSinAlias }),
    ...(plan.correcciones.length && { correcciones: plan.correcciones }),
    ...(plan.huerfanos.length && { huerfanos: plan.huerfanos }),
    ...(enSeco && { detalleActualizar: plan.actualizar.map((c) => ({ id: c.id, cambios: c.cambios })) }),
    errors,
  });
}
