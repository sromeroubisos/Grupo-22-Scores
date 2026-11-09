/**
 * Sync de las competiciones de Rugby Europe (rugbyeurope.eu).
 *
 *   GET /api/cron/rugbyeurope-sync                    lo que toque ahora
 *   GET /api/cron/rugbyeurope-sync?todo=1             todas las ediciones activas
 *   GET /api/cron/rugbyeurope-sync?edicion=<clave>    una sola
 *   GET /api/cron/rugbyeurope-sync?dry=1              plan sin escribir
 *
 * UNA sola entrada en vercel.json despierta esta ruta cada 10 minutos y ella
 * decide si hay algo que hacer: no es un cron por torneo.
 *
 *  - Si hay un partido de Rugby Europe en juego o por empezar (de 4 horas atrás a
 *    45 minutos adelante) y todavía sin cerrar, sincroniza SOLO las ediciones de
 *    esos partidos. Es lo que da el marcador y el estado en vivo.
 *  - Cuatro veces por día (6, 12, 18 y 22 UTC) hace el barrido de todas las ediciones
 *    activas: toma los partidos que el sitio programó o movió, los resultados
 *    que se publicaron tarde y los cruces nuevos de un cuadro.
 *  - Si no, responde `salteado` sin bajar nada del sitio.
 *
 * Qué ediciones existen y sus ventanas: `integrations/rugbyeurope/ediciones.ts`.
 * El torneo, los clubes y los alias los crea `scripts/rugbyeurope/alta.mts`.
 *
 * Por edición se baja la página (tablas Fixtures y Results) y solo la ficha de los
 * partidos que pueden traer algo nuevo (`necesitaFicha`); `planRe` lo cruza con lo
 * guardado y se escribe SOLO lo que cambió. Si la página no contesta no se escribe
 * nada de esa edición. En ligas y zonas se recalcula la tabla.
 */
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  EDICIONES, claveAlias, edicionPorClave, edicionesActivas, normalizarNombre, type EdicionRe,
} from '@/lib/integrations/rugbyeurope/ediciones.ts';
import {
  RE_ID_PREFIX, RE_PROVIDER, bonosDeTabla, buildTournamentExternalId, fetchFicha, fetchPagina, lunesDe, necesitaFicha, planRe, prefijoPartidos,
  rondaEliminatoria, rondaPorSemana, semanasNuevas,
  type ExistenteRe, type FichaRe, type PartidoRe, type RondaDb,
} from '@/lib/integrations/rugbyeurope/rugbyeurope.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const COLUMNAS = 'id, external_id, home_club_id, away_club_id, date_time, status, score, round_uuid, round_label, venue, notes, group_id, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated';
const HORAS_BARRIDO = [6, 12, 18, 22];
const MAX_FICHAS = 15;

type Admin = ReturnType<typeof createAdminClient>;

interface Resumen {
  edicion: string;
  ok: boolean;
  filas?: number;
  fichas?: number;
  crear?: number;
  actualizar?: number;
  sinCambios?: number;
  rondasNuevas?: number;
  equiposSinAlias?: string[];
  correcciones?: string[];
  huerfanos?: string[];
  sinZona?: number;
  detalleActualizar?: { id: string; cambios: string[] }[];
  error?: string;
  errors: string[];
}

const claveDeExternal = (id: string | null) => new RegExp(`^${RE_ID_PREFIX}([^:]+):`).exec(id ?? '')?.[1] ?? null;
const sumarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Las ediciones que tienen un partido sin cerrar en curso o por empezar. */
async function edicionesEnJuego(supabase: Admin, ahora: Date): Promise<Set<string>> {
  const desde = new Date(ahora.getTime() - 4 * 3_600_000).toISOString();
  const hasta = new Date(ahora.getTime() + 45 * 60_000).toISOString();
  const { data } = await supabase.from('matches').select('external_id')
    .like('external_id', `${RE_ID_PREFIX}%`).neq('status', 'final').gte('date_time', desde).lte('date_time', hasta).limit(200);
  return new Set(((data ?? []) as { external_id: string | null }[]).map((m) => claveDeExternal(m.external_id)).filter(Boolean) as string[]);
}

async function sincronizar(
  supabase: Admin, ed: EdicionRe, alias: Map<string, string>, pagina: Awaited<ReturnType<typeof fetchPagina>>, ahora: Date, enSeco: boolean,
): Promise<{ resumen: Resumen; escribio: boolean }> {
  const errors: string[] = [];
  const falla = (error: string): { resumen: Resumen; escribio: boolean } => ({ resumen: { edicion: ed.clave, ok: false, error, errors }, escribio: false });

  const { data: torneo, error: errTorneo } = await supabase.from('tournaments')
    .select('id, category, is_visible, current_season_id').eq('external_id', buildTournamentExternalId(ed.clave)).maybeSingle();
  if (errTorneo) return falla(`No se pudo leer el torneo (${errTorneo.message})`);
  if (!torneo) return falla('No hay torneo rugbyeurope:. Se da de alta con scripts/rugbyeurope/alta.mts.');
  const { data: fase } = await supabase.from('tournament_phases').select('id, season_id').eq('tournament_id', torneo.id).order('order_index').limit(1).maybeSingle();
  if (!fase) return falla('El torneo no tiene fase');
  const seasonId = fase.season_id ?? torneo.current_season_id;

  const [rondasR, partidosR, gruposR, fppR, partR] = await Promise.all([
    supabase.from('tournament_rounds').select('id, name, order_index, start_date').eq('phase_id', fase.id),
    supabase.from('matches').select(COLUMNAS).eq('tournament_id', torneo.id).like('external_id', `${prefijoPartidos(ed.clave)}%`).limit(1000),
    ed.formato === 'zonas' ? supabase.from('tournament_groups').select('id').eq('phase_id', fase.id) : Promise.resolve({ data: [], error: null }),
    ed.formato === 'zonas' ? supabase.from('tournament_phase_participants').select('participant_id, group_id').eq('phase_id', fase.id) : Promise.resolve({ data: [], error: null }),
    ed.formato === 'zonas' ? supabase.from('tournament_participants').select('id, club_id').eq('tournament_id', torneo.id) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const [n, r] of [['rondas', rondasR], ['partidos', partidosR], ['zonas', gruposR], ['participantes de fase', fppR], ['participantes', partR]] as const) {
    if (r.error) return falla(`No se pudieron leer los ${n} (${r.error.message})`);
  }
  const rondas = [...((rondasR.data ?? []) as RondaDb[])];
  const existentes = (partidosR.data ?? []) as ExistenteRe[];

  const clubDeParticipante = new Map(((partR.data ?? []) as { id: string; club_id: string | null }[]).map((p) => [p.id, p.club_id]));
  const zonaDeClub = new Map<string, string>();
  for (const f of (fppR.data ?? []) as { participant_id: string; group_id: string | null }[]) {
    const club = clubDeParticipante.get(f.participant_id);
    if (club && f.group_id) zonaDeClub.set(club, f.group_id);
  }
  const grupoDe = ed.formato === 'zonas'
    ? (h: string, a: string) => { const gh = zonaDeClub.get(h); return gh && gh === zonaDeClub.get(a) ? gh : null; }
    : undefined;

  // El nombre del sitio → club de la base. Los alias del U20 se cargaron sin prefijo de categoría.
  const resolverEquipo = (n: string) => alias.get(claveAlias(ed.grupo, n)) ?? (ed.grupo === 'u20' ? alias.get(normalizarNombre(n)) : undefined) ?? null;

  // La ficha trae ronda (cuadros), estadio y el estado en vivo: solo la de lo que puede traer algo nuevo.
  const existenteDe = (p: { local: string; visitante: string; inicio: string }) => {
    const h = resolverEquipo(p.local);
    const a = resolverEquipo(p.visitante);
    if (!h || !a) return undefined;
    return existentes.find((e) => e.home_club_id === h && e.away_club_id === a && e.date_time && Math.abs(Date.parse(e.date_time) - Date.parse(p.inicio)) < 2 * 86_400_000);
  };
  const aBajar = pagina.filas.filter((f) => f.ficha && necesitaFicha(f, ed, existenteDe(f), ahora)).slice(0, MAX_FICHAS);
  const fichas = new Map<string, FichaRe>();
  for (let i = 0; i < aBajar.length; i += 5) {
    await Promise.all(aBajar.slice(i, i + 5).map(async (f) => {
      const r = await fetchFicha(f.ficha as string);
      if (r.ok && r.ficha) fichas.set(f.ficha as string, r.ficha);
      else errors.push(`ficha ${f.local} v ${f.visitante}: HTTP ${r.status}`);
    }));
  }
  const partidos: PartidoRe[] = pagina.filas.map((fila) => ({ ...fila, ficha_datos: fila.ficha ? fichas.get(fila.ficha) ?? null : null }));

  // Una fecha nueva de liga (una semana con partidos) se agrega como ronda.
  let rondasNuevas = 0;
  if (ed.formato !== 'eliminatoria') {
    const semanas = semanasNuevas(partidos, rondas);
    if (semanas.length) {
      let orden = rondas.reduce((m, r) => Math.max(m, r.order_index), 0);
      const filas = semanas.map((lunes) => {
        orden += 1;
        return {
          id: crypto.randomUUID(), phase_id: fase.id, season_id: seasonId, name: `Fecha ${orden}`, order_index: orden,
          start_date: lunes, end_date: sumarDias(lunes, 6), is_completed: false, notes: null,
          created_at: ahora.toISOString(), updated_at: ahora.toISOString(),
        };
      });
      rondasNuevas = filas.length;
      if (!enSeco) {
        const { error } = await supabase.from('tournament_rounds').insert(filas);
        if (error) return falla(`no se pudieron crear las rondas nuevas (${error.message})`);
      }
      rondas.push(...filas.map((f) => ({ id: f.id, name: f.name, order_index: f.order_index, start_date: f.start_date })));
    }
  }

  const plan = planRe({
    edicion: ed, partidos, existentes, ahora, resolverEquipo, grupoDe,
    rondaDe: ed.formato === 'eliminatoria' ? rondaEliminatoria(rondas) : rondaPorSemana(rondas),
    // La tabla oficial da el bonus total por equipo: de ahí sale el ofensivo, que los marcadores no muestran.
    bonosOficiales: ed.formato === 'eliminatoria' ? undefined : bonosDeTabla(pagina.html, resolverEquipo),
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
    // Un cuadro no tiene tabla; una liga o unas zonas sí.
    const tocaTabla = ed.formato !== 'eliminatoria'
      && (creados > 0 || plan.actualizar.some((c) => 'score' in c.patch || 'status' in c.patch || 'home_base_points' in c.patch || 'group_id' in c.patch));
    if (tocaTabla) {
      try {
        const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
        const res = await recalculatePhaseStandingsScopes(torneo.id, fase.id, 'general', seasonId ?? undefined);
        if (!res.ok) errors.push('recálculo de la tabla falló');
      } catch (e) {
        errors.push(`recálculo de la tabla falló (${e instanceof Error ? e.message : 'error'})`);
      }
    }
  }

  const sinZona = grupoDe ? plan.crear.filter((f) => !f.group_id).length : 0;
  return {
    escribio: creados + actualizados + rondasNuevas > 0,
    resumen: {
      edicion: ed.clave, ok: errors.length === 0, filas: pagina.filas.length, fichas: fichas.size,
      crear: enSeco ? plan.crear.length : creados, actualizar: enSeco ? plan.actualizar.length : actualizados,
      sinCambios: plan.sinCambios, rondasNuevas,
      ...(plan.equiposSinAlias.length && { equiposSinAlias: plan.equiposSinAlias }),
      ...(plan.correcciones.length && { correcciones: plan.correcciones }),
      ...(plan.huerfanos.length && { huerfanos: plan.huerfanos }),
      ...(sinZona > 0 && { sinZona }),
      ...(enSeco && { detalleActualizar: plan.actualizar.map((c) => ({ id: c.id, cambios: c.cambios })) }),
      errors,
    },
  };
}

export async function GET(req: Request) {
  if (!(await authorizeCronRequest(req, 'rugbyeurope-sync'))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const url = new URL(req.url);
  const enSeco = url.searchParams.get('dry') === '1';
  const todo = url.searchParams.get('todo') === '1';
  const pedida = url.searchParams.get('edicion');
  const arranque = Date.now();
  const ahora = new Date();
  const supabase = createAdminClient();

  if (pedida && !edicionPorClave(pedida)) {
    return NextResponse.json({ ok: false, error: `Edición desconocida. Las hay: ${EDICIONES.map((e) => e.clave).join(', ')}` }, { status: 400 });
  }

  // ¿Qué ediciones tocan ahora?
  let motivo: string;
  let ediciones: EdicionRe[];
  if (pedida) {
    ediciones = [edicionPorClave(pedida) as EdicionRe];
    motivo = 'pedida';
  } else {
    const activas = edicionesActivas(ahora);
    const barrido = HORAS_BARRIDO.includes(ahora.getUTCHours()) && ahora.getUTCMinutes() < 10;
    if (todo || barrido) {
      ediciones = activas;
      motivo = todo ? 'todo' : 'barrido';
    } else {
      const enJuego = activas.length ? await edicionesEnJuego(supabase, ahora) : new Set<string>();
      ediciones = activas.filter((e) => enJuego.has(e.clave));
      motivo = ediciones.length ? 'en juego' : 'nada en juego';
    }
  }
  if (!ediciones.length) return NextResponse.json({ ok: true, salteado: true, motivo, ms: Date.now() - arranque });

  const { data: aliasR, error: errAlias } = await supabase.from('club_external_ids').select('external_id, club_id').eq('provider', RE_PROVIDER).limit(1000);
  if (errAlias) return NextResponse.json({ error: `No se pudieron leer los alias (${errAlias.message})` }, { status: 500 });
  const alias = new Map(((aliasR ?? []) as { external_id: string; club_id: string }[]).map((a) => [a.external_id, a.club_id]));

  // Las páginas se bajan en paralelo; lo demás, de a una edición.
  const paginas = await Promise.all(ediciones.map((e) => fetchPagina(e)));
  const resumenes: Resumen[] = [];
  let escribio = false;
  for (const [i, ed] of ediciones.entries()) {
    const pagina = paginas[i];
    if (!pagina.ok) {
      resumenes.push({
        edicion: ed.clave, ok: false, errors: [],
        error: pagina.status === -1
          ? 'No se escribió nada: la página bajó pero sin las tablas (¿cambió la forma?)'
          : `No se escribió nada: rugbyeurope.eu no contestó (HTTP ${pagina.status})`,
      });
      continue;
    }
    const r = await sincronizar(supabase, ed, alias, pagina, ahora, enSeco);
    resumenes.push(r.resumen);
    escribio ||= r.escribio;
  }

  const errors: string[] = [];
  if (escribio && !enSeco) {
    try {
      const { invalidateMatchesFeedCaches } = await import('@/lib/server/matchesFeedInvalidation');
      await invalidateMatchesFeedCaches(supabase);
    } catch {
      errors.push('No se pudieron invalidar los cachés del feed');
    }
  }

  return NextResponse.json({
    ok: errors.length === 0 && resumenes.every((r) => r.ok),
    dry: enSeco, motivo, ms: Date.now() - arranque, ediciones: resumenes, errors,
    // lunes de la semana de hoy: ayuda a leer las rondas de las ligas
    semana: lunesDe(ahora.toISOString()),
  });
}
