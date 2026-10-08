/**
 * Sync del rugby universitario de EE.UU. desde la CRAA (craa.rugby).
 *
 *   GET /api/cron/craa-sync              corrida normal
 *   GET /api/cron/craa-sync?dry=1        plan sin escribir
 *   GET /api/cron/craa-sync?forzar=1     corre aunque sea receso
 *
 * El fixture de las cinco divisiones son diez planillas públicas de Google
 * (~23 KB en total): se bajan enteras, `planCraa` las cruza con lo guardado y
 * se escribe SOLO lo que cambió. La D1A publica tabla oficial, que se escribe
 * tal cual (`fully_manual`) cuando difiere de la guardada; las otras cuatro las
 * arma el motor.
 *
 * ## Todo o nada con las planillas
 *
 * Si una sola pestaña no contesta, no se escribe nada: un cruce entre
 * divisiones se asigna mirando las DOS planillas, y con una caída el partido
 * se mudaría de torneo para volver en la corrida siguiente.
 *
 * ## Cuándo corre
 *
 * `vercel.json` la llama cada hora con UNA entrada (el proyecto anda por el
 * tope de crons), y la ruta decide:
 *
 * - del viernes 20 UTC al lunes 7 UTC —viernes a la tarde en el Este hasta el
 *   sábado a la noche en el Pacífico— corre en cada llamada;
 * - el resto de la semana, una vez por día, para levantar reprogramaciones y
 *   resultados cargados tarde (`tocaCorrer` en `fuentes.ts`);
 * - fuera de las fechas de las temporadas (más dos semanas de margen a cada
 *   lado) no corre: la CRAA juega de fines de agosto a abril.
 *
 * Fuera de la ventana contesta sin leer la base ni bajar nada. `?forzar=1`
 * saltea las dos guardas.
 *
 * Los torneos, clubes y alias los crea `scripts/craa/alta.mts`. Un nombre
 * nuevo en la planilla sale en `equiposSinAlias`: se suma a
 * `scripts/craa/datos.mjs` y se corre el alta, no se toca este archivo.
 */
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchPestana, fetchTabla, HTTP_FORMA_INESPERADA } from '@/lib/integrations/craa/client.ts';
import {
  claveDeEquipo, CRAA_ID_PREFIX, CRAA_PROVIDER, DIVISIONES, parseTournamentExternalId, tocaCorrer, type RamaCraa,
} from '@/lib/integrations/craa/fuentes.ts';
import type { FilaTablaCraa } from '@/lib/integrations/craa/parse.ts';
import {
  planCraa, PUNTOS_CRAA, type DestinoCraa, type ExistenteCraa, type PestanaCraa, type Ronda,
} from '@/lib/integrations/craa/planMatches.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const LOTE = 100;
const MARGEN_RECESO_DIAS = 14;

const COLUMNAS_PARTIDO = 'id, external_id, tournament_id, season_id, phase_id, home_club_id, away_club_id, date_time, status, score, round_uuid, round_label, notes, home_base_points, away_base_points, home_bonus_points, away_bonus_points';

interface FaseCraa {
  division: string;
  rama: RamaCraa;
  tabla: boolean;
  zonas?: Record<string, string>;
}

interface Torneo {
  id: string;
  name: string;
  category: string | null;
  is_visible: boolean | null;
  division: string;
  temporada: string;
  seasonId: string | null;
  fase: { id: string; cfg: FaseCraa } | null;
  inicio: string | null;
  fin: string | null;
}

export async function GET(req: Request) {
  if (!(await authorizeCronRequest(req, 'craa-sync'))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const url = new URL(req.url);
  const enSeco = url.searchParams.get('dry') === '1';
  const forzar = url.searchParams.get('forzar') === '1';
  const arranque = Date.now();
  const ahora = new Date();
  const supabase = createAdminClient();
  const errors: string[] = [];

  if (!forzar && !enSeco && !tocaCorrer(ahora)) {
    return NextResponse.json({ ok: true, fueraDeVentana: true, ms: Date.now() - arranque });
  }

  // ── Los torneos y su fase ──────────────────────────────────────────────────
  const { data: torneosRaw, error: errTorneos } = await supabase
    .from('tournaments')
    .select('id, name, category, is_visible, external_id, current_season_id')
    .like('external_id', `${CRAA_ID_PREFIX}%`);
  if (errTorneos) return NextResponse.json({ error: `No se pudieron leer los torneos (${errTorneos.message})` }, { status: 500 });
  if (!torneosRaw?.length) {
    return NextResponse.json({ ok: false, error: 'Ningún torneo tiene external_id craa:. Se dan de alta con scripts/craa/alta.mts.' });
  }

  const torneos: Torneo[] = [];
  for (const t of torneosRaw as { id: string; name: string; category: string | null; is_visible: boolean | null; external_id: string; current_season_id: string | null }[]) {
    const clave = parseTournamentExternalId(t.external_id);
    if (!clave) { errors.push(`${t.external_id}: external_id con forma desconocida`); continue; }
    torneos.push({
      id: t.id, name: t.name, category: t.category, is_visible: t.is_visible, division: clave.division,
      temporada: clave.temporada, seasonId: t.current_season_id, fase: null, inicio: null, fin: null,
    });
  }
  const ids = torneos.map((t) => t.id);
  const [{ data: fasesRaw, error: errFases }, { data: temporadasRaw }] = await Promise.all([
    supabase.from('tournament_phases').select('id, tournament_id, settings').in('tournament_id', ids),
    supabase.from('tournament_seasons').select('id, start_date, end_date').in('tournament_id', ids),
  ]);
  if (errFases) return NextResponse.json({ error: `No se pudieron leer las fases (${errFases.message})` }, { status: 500 });
  const temporadaDe = new Map(((temporadasRaw ?? []) as { id: string; start_date: string | null; end_date: string | null }[]).map((s) => [s.id, s]));
  for (const f of (fasesRaw ?? []) as { id: string; tournament_id: string; settings: { craa?: FaseCraa } | null }[]) {
    const t = torneos.find((x) => x.id === f.tournament_id);
    if (t && f.settings?.craa?.division) t.fase = { id: f.id, cfg: f.settings.craa };
  }
  for (const t of torneos) {
    const s = t.seasonId ? temporadaDe.get(t.seasonId) : null;
    t.inicio = s?.start_date ?? null;
    t.fin = s?.end_date ?? null;
    if (!t.fase) errors.push(`${t.name}: ninguna fase declara settings.craa`);
  }

  // ── Receso ─────────────────────────────────────────────────────────────────
  const hoy = ahora.toISOString().slice(0, 10);
  const correr = (d: string, dias: number) => new Date(Date.parse(`${d}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
  const enTemporada = torneos.some((t) => !t.inicio || !t.fin
    || (correr(t.inicio, -MARGEN_RECESO_DIAS) <= hoy && hoy <= correr(t.fin, MARGEN_RECESO_DIAS)));
  if (!enTemporada && !forzar) {
    return NextResponse.json({ ok: true, dry: enSeco, receso: true, ms: Date.now() - arranque, errors });
  }

  // Una sola temporada a la vez: la del torneo más nuevo.
  const temporada = [...new Set(torneos.map((t) => t.temporada))].sort().pop() as string;
  const deLaTemporada = torneos.filter((t) => t.temporada === temporada && t.fase);
  const torneoDe = new Map(deLaTemporada.map((t) => [t.division, t]));

  // ── Lo que ya está: alias, participantes, rondas, partidos ─────────────────
  const [aliasR, participantesR, rondasR, partidosR] = await Promise.all([
    supabase.from('club_external_ids').select('external_id, club_id').eq('provider', CRAA_PROVIDER).limit(3000),
    supabase.from('tournament_participants').select('tournament_id, club_id').in('tournament_id', deLaTemporada.map((t) => t.id)).limit(3000),
    supabase.from('tournament_rounds').select('id, phase_id, name, start_date, end_date').in('phase_id', deLaTemporada.map((t) => t.fase!.id)).limit(3000),
    supabase.from('matches').select(COLUMNAS_PARTIDO).like('external_id', `${CRAA_ID_PREFIX}${temporada}:%`).limit(5000),
  ]);
  for (const [nombre, r] of [['alias', aliasR], ['participantes', participantesR], ['rondas', rondasR], ['partidos', partidosR]] as const) {
    if (r.error) return NextResponse.json({ error: `No se pudieron leer los ${nombre} (${r.error.message})` }, { status: 500 });
  }
  const alias = new Map(((aliasR.data ?? []) as { external_id: string; club_id: string }[]).map((a) => [a.external_id, a.club_id]));
  const integrantes = new Map<string, Set<string>>();
  for (const t of deLaTemporada) integrantes.set(t.division, new Set());
  for (const p of (participantesR.data ?? []) as { tournament_id: string; club_id: string | null }[]) {
    const t = deLaTemporada.find((x) => x.id === p.tournament_id);
    if (t && p.club_id) integrantes.get(t.division)!.add(p.club_id);
  }
  const zonas = new Map<string, string>();
  for (const t of deLaTemporada) for (const [club, zona] of Object.entries(t.fase!.cfg.zonas ?? {})) zonas.set(club, zona);
  const rondas = (rondasR.data ?? []) as { id: string; phase_id: string; name: string; start_date: string | null; end_date: string | null }[];
  const existentes = (partidosR.data ?? []) as ExistenteCraa[];

  // ── Las planillas: todas o ninguna ─────────────────────────────────────────
  const pestanas: PestanaCraa[] = [];
  const fallidas: string[] = [];
  for (const div of DIVISIONES) {
    for (const [semestre, url] of Object.entries(div.planillas)) {
      const r = await fetchPestana(url);
      if (!r.ok || !r.data) {
        fallidas.push(`${div.id}/${semestre}: ${r.status === HTTP_FORMA_INESPERADA ? 'la planilla cambió de forma o dejó de ser pública' : `HTTP ${r.status}`}`);
        continue;
      }
      pestanas.push({ division: div.id, rama: div.rama, filas: r.data });
    }
  }
  if (fallidas.length) {
    return NextResponse.json({
      ok: false, dry: enSeco, ms: Date.now() - arranque,
      error: 'No se escribió nada: faltan planillas (un cruce entre divisiones se decide mirando las dos).',
      fallidas, errors,
    });
  }

  const destinoDe = (division: string): DestinoCraa | null => {
    const t = torneoDe.get(division);
    return t?.fase ? { tournamentId: t.id, phaseId: t.fase.id, seasonId: t.seasonId } : null;
  };
  const rondaDe = (division: string, fecha: string): Ronda | null => {
    const fase = torneoDe.get(division)?.fase?.id;
    const r = rondas.find((x) => x.phase_id === fase && x.start_date && x.end_date && x.start_date <= fecha && fecha <= x.end_date);
    return r ? { id: r.id, nombre: r.name } : null;
  };

  const plan = planCraa({
    pestanas,
    temporada,
    resolverEquipo: (nombre, rama) => alias.get(claveDeEquipo(nombre, rama)) ?? null,
    zonaDe: (club) => zonas.get(club) ?? null,
    integrantes,
    destinoDe,
    rondaDe,
    existentes,
    ahora,
  });

  // ── Escritura ──────────────────────────────────────────────────────────────
  let creados = 0;
  let actualizados = 0;
  const torneosTocados = new Set<string>();
  if (!enSeco) {
    const porTorneo = new Map(deLaTemporada.map((t) => [t.id, t]));
    const altas = plan.crear.map((fila) => {
      const t = porTorneo.get(fila.tournament_id);
      return {
        ...fila, sport_id: 'rugby', sport: 'rugby', category: t?.category ?? null,
        is_visible: t?.is_visible === true, live_enabled: false, review_status: 'approved',
      };
    });
    for (let i = 0; i < altas.length; i += LOTE) {
      const trozo = altas.slice(i, i + LOTE);
      const { error } = await supabase.from('matches').insert(trozo);
      if (error) { errors.push(`alta de ${trozo.length} partidos falló (${error.message})`); continue; }
      creados += trozo.length;
      for (const f of trozo) torneosTocados.add(f.tournament_id);
    }

    // Mismas columnas en TODAS las filas del lote, completando con lo que la
    // fila ya tiene: con solo el parche PostgREST toma la unión de claves y la
    // fila a la que le falta una la recibe en NULL.
    const porId = new Map(existentes.map((m) => [m.id, m]));
    for (let i = 0; i < plan.actualizar.length; i += LOTE) {
      const trozo = plan.actualizar.slice(i, i + LOTE);
      const filas = trozo.map((c) => {
        const v = porId.get(c.id);
        return {
          id: c.id,
          external_id: v?.external_id ?? null,
          tournament_id: v?.tournament_id ?? null,
          season_id: v?.season_id ?? null,
          phase_id: v?.phase_id ?? null,
          home_club_id: v?.home_club_id ?? null,
          away_club_id: v?.away_club_id ?? null,
          date_time: v?.date_time ?? null,
          status: v?.status ?? null,
          score: v?.score ?? null,
          round_uuid: v?.round_uuid ?? null,
          round_label: v?.round_label ?? null,
          notes: v?.notes ?? null,
          home_base_points: v?.home_base_points ?? 0,
          away_base_points: v?.away_base_points ?? 0,
          home_bonus_points: v?.home_bonus_points ?? 0,
          away_bonus_points: v?.away_bonus_points ?? 0,
          points_autocalculated: false,
          updated_at: ahora.toISOString(),
          ...c.patch,
        };
      });
      const { error } = await supabase.from('matches').upsert(filas, { onConflict: 'id' });
      if (error) { errors.push(`lote de ${filas.length} partidos falló (${error.message})`); continue; }
      actualizados += filas.length;
      for (const c of trozo) {
        const tocaLaTabla = 'score' in c.patch || 'status' in c.patch || 'tournament_id' in c.patch || 'home_base_points' in c.patch;
        if (!tocaLaTabla) continue;
        torneosTocados.add(c.tournamentId);
        const antes = porId.get(c.id)?.tournament_id;
        if (antes) torneosTocados.add(antes);
      }
    }
  }

  // ── Tablas ─────────────────────────────────────────────────────────────────
  const tablas: Record<string, string> = {};
  for (const t of deLaTemporada) {
    const div = DIVISIONES.find((d) => d.id === t.division);
    const fase = t.fase!;
    if (fase.cfg.tabla && div?.tabla) {
      const r = await fetchTabla(div.tabla);
      if (!r.ok || !r.data) { errors.push(`${t.name}: tabla oficial no se pudo leer (${r.status})`); continue; }
      if (enSeco) { tablas[t.division] = `oficial: ${r.data.length} filas (no se escribe en seco)`; continue; }
      const escrito = await escribirTablaOficial(supabase, {
        torneoId: t.id, seasonId: t.seasonId, faseId: fase.id, tabla: r.data,
        resolver: (nombre) => alias.get(claveDeEquipo(nombre, fase.cfg.rama)) ?? null, ahora: ahora.toISOString(),
      });
      if (escrito.error) errors.push(`${t.name}: ${escrito.error}`);
      tablas[t.division] = escrito.error ? 'oficial sin escribir' : escrito.filas ? `oficial: ${escrito.filas} filas` : 'oficial sin cambios';
    } else if (!enSeco && torneosTocados.has(t.id)) {
      const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
      const res = await recalculatePhaseStandingsScopes(t.id, fase.id, 'general', t.seasonId ?? undefined);
      if (!res.ok) errors.push(`${t.name}: recálculo de la tabla falló`);
      tablas[t.division] = res.ok ? `recalculada: ${res.rows_calculated} filas` : 'recálculo falló';
    }
  }

  if (creados + actualizados > 0) {
    try {
      const { invalidateMatchesFeedCaches } = await import('@/lib/server/matchesFeedInvalidation');
      await invalidateMatchesFeedCaches(supabase);
    } catch {
      errors.push('No se pudieron invalidar los cachés del feed');
    }
  }

  const porDivision = Object.fromEntries(deLaTemporada.map((t) => [t.division, {
    crear: plan.crear.filter((c) => c.tournament_id === t.id).length,
    actualizar: plan.actualizar.filter((c) => c.tournamentId === t.id).length,
  }]));

  return NextResponse.json({
    ok: errors.length === 0,
    dry: enSeco,
    ms: Date.now() - arranque,
    temporada,
    filas: pestanas.reduce((n, p) => n + p.filas.length, 0),
    crear: enSeco ? plan.crear.length : creados,
    actualizar: enSeco ? plan.actualizar.length : actualizados,
    sinCambios: plan.sinCambios,
    porDivision,
    repetidosEntreDivisiones: plan.repetidosEntreDivisiones,
    ...(Object.keys(tablas).length && { tablas }),
    ...(plan.equiposSinAlias.length && { equiposSinAlias: plan.equiposSinAlias }),
    ...(plan.omitidos.length && { omitidos: plan.omitidos }),
    ...(plan.marcadoresRaros.length && { marcadoresRaros: plan.marcadoresRaros }),
    ...(plan.discrepancias.length && { discrepancias: plan.discrepancias }),
    ...(plan.correcciones.length && { correcciones: plan.correcciones }),
    ...(plan.huerfanos.length && { huerfanos: plan.huerfanos }),
    ...(enSeco && {
      detalleActualizar: plan.actualizar.slice(0, 50).map((c) => ({ id: c.id, cambios: c.cambios })),
      detalleCrear: plan.crear.length > 20
        ? `${plan.crear.length} partidos`
        : plan.crear.map((a) => `${a.external_id} ${a.date_time} ${a.status}`),
    }),
    errors,
  });
}

/**
 * Reemplaza la tabla de la fase por la oficial, solo si cambió. Si un solo
 * club de la tabla no resuelve, no se toca nada: una tabla a la que le falta
 * un club es peor que la de la corrida anterior.
 */
async function escribirTablaOficial(
  supabase: ReturnType<typeof createAdminClient>,
  o: {
    torneoId: string; seasonId: string | null; faseId: string; tabla: FilaTablaCraa[];
    resolver: (nombre: string) => string | null; ahora: string;
  },
): Promise<{ filas: number; error?: string }> {
  const sinClub = o.tabla.filter((f) => !o.resolver(f.nombre)).map((f) => f.nombre);
  if (sinClub.length) return { filas: 0, error: `tabla oficial sin escribir: equipos sin alias (${sinClub.join(', ')})` };

  const clubes = o.tabla.map((f) => o.resolver(f.nombre) as string);
  const [{ data: guardada }, { data: entradas }, { data: fichas }] = await Promise.all([
    supabase.from('tournament_standings').select('club_id, position, played, won, drawn, lost, scored, conceded').eq('phase_id', o.faseId),
    o.seasonId
      ? supabase.from('team_season_entries').select('id, club_id').eq('season_id', o.seasonId)
      : Promise.resolve({ data: [] as { id: string; club_id: string }[] }),
    supabase.from('clubs').select('id, name, logo_url').in('id', clubes),
  ]);

  type Firma = { club_id: string; position: number; played: number; won: number; drawn: number; lost: number; scored: number; conceded: number };
  const firma = (filas: Firma[]) =>
    filas.map((f) => [f.club_id, f.position, f.played, f.won, f.drawn, f.lost, f.scored, f.conceded].join(':')).sort().join('|');
  const nueva: Firma[] = o.tabla.map((f) => ({
    club_id: o.resolver(f.nombre) as string, position: f.posicion, played: f.pj, won: f.pg, drawn: f.pe, lost: f.pp, scored: f.pf, conceded: f.pc,
  }));
  if (guardada && firma(guardada as Firma[]) === firma(nueva)) return { filas: 0 };

  const entradaDe = new Map(((entradas ?? []) as { id: string; club_id: string }[]).map((e) => [e.club_id, e.id]));
  const fichaDe = new Map(((fichas ?? []) as { id: string; name: string; logo_url: string | null }[]).map((c) => [c.id, c]));
  const filas = o.tabla.map((f) => {
    const clubId = o.resolver(f.nombre) as string;
    return {
      tournament_id: o.torneoId, season_id: o.seasonId, phase_id: o.faseId, group_id: null,
      club_id: clubId, season_entry_id: entradaDe.get(clubId) ?? null, table_type: 'general',
      position: f.posicion, played: f.pj, won: f.pg, drawn: f.pe, lost: f.pp,
      points: PUNTOS_CRAA.win * f.pg + PUNTOS_CRAA.draw * f.pe,
      scored: f.pf, conceded: f.pc, bonus_points: 0, form: null, streak: null, last_updated: o.ahora,
      stats: {
        status: null, team_name: fichaDe.get(clubId)?.name ?? f.nombre, team_logo: fichaDe.get(clubId)?.logo_url ?? null,
        difference: f.pf - f.pc, table_type: 'general', adjustments: 0,
        fuente: 'Tabla oficial de la CRAA', calculated_at: o.ahora,
      },
    };
  });

  const { error: errBorrar } = await supabase.from('tournament_standings').delete().eq('phase_id', o.faseId);
  if (errBorrar) return { filas: 0, error: `no se pudo vaciar la tabla (${errBorrar.message})` };
  const { error: errAlta } = await supabase.from('tournament_standings').insert(filas);
  if (errAlta) return { filas: 0, error: `no se pudo escribir la tabla (${errAlta.message})` };
  return { filas: filas.length };
}
