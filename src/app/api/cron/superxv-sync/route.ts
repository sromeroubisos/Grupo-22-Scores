/**
 * Sync de la Super XV (Portugal) desde superxv.pt.
 *
 *   GET /api/cron/superxv-sync              corrida normal
 *   GET /api/cron/superxv-sync?dry=1        plan sin escribir
 *
 * Baja las jornadas del Campeonato una por una hasta que el sitio devuelve
 * otra (la 1: así contesta un número que no existe), `planSxv` las cruza con
 * lo guardado y se escribe SOLO lo que cambió. Si una jornada no contesta no
 * se escribe nada: sin ella los partidos de esa jornada no se verían.
 *
 * La tabla la arma el motor con los puntos que deja el conector (4/2/0 y el
 * bonus defensivo; el ofensivo pide tries, que el sitio no publica).
 *
 * El torneo, los clubes y los alias los crea `scripts/superxv/alta.mts`.
 * Corre los fines de semana de Portugal (vercel.json) más una pasada diaria.
 */
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildTournamentExternalId, fetchJornada, normalizarNombre, planSxv, SXV_ID_PREFIX, SXV_JORNADAS_MAX, SXV_PROVIDER, SXV_TEMPORADA,
  type ExistenteSxv, type JornadaSxv,
} from '@/lib/integrations/superxv/superxv.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const COLUMNAS = 'id, external_id, home_club_id, away_club_id, date_time, status, score, round_uuid, round_label, venue, notes, home_base_points, away_base_points, home_bonus_points, away_bonus_points';

export async function GET(req: Request) {
  if (!(await authorizeCronRequest(req, 'superxv-sync'))) {
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
  if (!torneo) return NextResponse.json({ ok: false, error: 'No hay torneo superxv:. Se da de alta con scripts/superxv/alta.mts.' });

  const { data: fase } = await supabase.from('tournament_phases').select('id, season_id').eq('tournament_id', torneo.id).order('order_index').limit(1).maybeSingle();
  if (!fase) return NextResponse.json({ ok: false, error: 'El torneo no tiene fase' });
  const seasonId = fase.season_id ?? torneo.current_season_id;

  const [aliasR, rondasR, partidosR] = await Promise.all([
    supabase.from('club_external_ids').select('external_id, club_id').eq('provider', SXV_PROVIDER),
    supabase.from('tournament_rounds').select('id, name, order_index').eq('phase_id', fase.id),
    supabase.from('matches').select(COLUMNAS).eq('tournament_id', torneo.id).like('external_id', `${SXV_ID_PREFIX}%`).limit(2000),
  ]);
  for (const [n, r] of [['alias', aliasR], ['rondas', rondasR], ['partidos', partidosR]] as const) {
    if (r.error) return NextResponse.json({ error: `No se pudieron leer los ${n} (${r.error.message})` }, { status: 500 });
  }
  const alias = new Map(((aliasR.data ?? []) as { external_id: string; club_id: string }[]).map((a) => [a.external_id, a.club_id]));
  const rondas = (rondasR.data ?? []) as { id: string; name: string; order_index: number }[];

  // Las jornadas, hasta que el sitio devuelve otra.
  const jornadas: JornadaSxv[] = [];
  for (let j = 1; j <= SXV_JORNADAS_MAX; j++) {
    const r = await fetchJornada(j);
    if (r.status === -1) break;
    if (!r.ok || !r.data) {
      return NextResponse.json({ ok: false, dry: enSeco, error: `No se escribió nada: la jornada ${j} no contestó (HTTP ${r.status})`, ms: Date.now() - arranque });
    }
    jornadas.push(r.data);
  }
  if (!jornadas.length) return NextResponse.json({ ok: false, error: 'El sitio no devolvió ninguna jornada (¿cambió la forma?)' });

  // Una jornada nueva (una segunda fase) se agrega como ronda.
  const nuevas = jornadas.filter((j) => !rondas.some((r) => r.order_index === j.jornada));
  if (nuevas.length && !enSeco) {
    const filas = nuevas.map((j) => ({
      id: crypto.randomUUID(), phase_id: fase.id, season_id: seasonId, name: `Fecha ${j.jornada}`, order_index: j.jornada,
      start_date: j.partidos.map((p) => p.fecha).filter(Boolean).sort()[0] ?? j.desde,
      end_date: j.partidos.map((p) => p.fecha).filter(Boolean).sort().pop() ?? j.hasta,
      is_completed: false, notes: null, created_at: ahora.toISOString(), updated_at: ahora.toISOString(),
    }));
    const { error } = await supabase.from('tournament_rounds').insert(filas);
    if (error) errors.push(`no se pudieron crear las rondas nuevas (${error.message})`);
    else rondas.push(...filas.map((f) => ({ id: f.id, name: f.name, order_index: f.order_index })));
  }

  const existentes = (partidosR.data ?? []) as ExistenteSxv[];
  const plan = planSxv({
    jornadas, temporada: SXV_TEMPORADA, existentes, ahora,
    resolverEquipo: (n) => alias.get(normalizarNombre(n)) ?? null,
    rondaDe: (j) => {
      const r = rondas.find((x) => x.order_index === j);
      return { id: r?.id ?? null, nombre: r?.name ?? `Fecha ${j}` };
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
    const tocaTabla = creados > 0 || plan.actualizar.some((c) => 'score' in c.patch || 'status' in c.patch);
    if (tocaTabla) {
      const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
      const res = await recalculatePhaseStandingsScopes(torneo.id, fase.id, 'general', seasonId ?? undefined);
      if (!res.ok) errors.push('recálculo de la tabla falló');
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
    jornadas: jornadas.length,
    partidos: jornadas.reduce((n, j) => n + j.partidos.length, 0),
    crear: enSeco ? plan.crear.length : creados,
    actualizar: enSeco ? plan.actualizar.length : actualizados,
    sinCambios: plan.sinCambios,
    ...(nuevas.length && { jornadasNuevas: nuevas.map((j) => j.jornada) }),
    ...(plan.equiposSinAlias.length && { equiposSinAlias: plan.equiposSinAlias }),
    ...(plan.enJuego.length && { enJuego: plan.enJuego }),
    ...(plan.correcciones.length && { correcciones: plan.correcciones }),
    ...(plan.huerfanos.length && { huerfanos: plan.huerfanos }),
    ...(enSeco && { detalleActualizar: plan.actualizar.map((c) => ({ id: c.id, cambios: c.cambios })) }),
    errors,
  });
}
