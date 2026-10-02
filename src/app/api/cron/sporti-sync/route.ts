/**
 * Sync de la Confederação Brasileira de Rugby desde SporTI
 * (plataforma.sporti.com.br).
 *
 *   GET /api/cron/sporti-sync                  corrida normal
 *   GET /api/cron/sporti-sync?dry=1            plan sin escribir
 *   GET /api/cron/sporti-sync?torneo=3542      un solo campeonato
 *
 * El ciclo, por torneo con `external_id = 'sporti:{campeonato}'`: cada fase
 * declara en `settings.sporti` qué fase de SporTI es la suya. Por fase se pide
 * la vista de partidos —el fixture entero en un pedido—, después SOLO las
 * súmulas de los jugados que todavía no tienen tries, y `planSportiMatches`
 * decide altas y cambios.
 *
 * ## Dos clases de tabla
 *
 * - Las fases de grupos publican tabla oficial (`settings.sporti.tabla`), y
 *   esa es la que se muestra: se escribe tal cual en `tournament_standings` y
 *   la fase queda `fully_manual`. Nuestra cuenta se contrasta igual
 *   (`diferenciasConLaTabla`) para ver un partido que falta en el fixture o
 *   una decisión de la CBRu.
 * - Las demás (el hexagonal, las llaves) no publican tabla: la arma el motor
 *   con los puntos que deja el conector en cada partido.
 *
 * Al final se piden las fases de cada campeonato, y las que la CBRu abrió y
 * ninguna fase reclama salen en `fasesSinMapear`: darlas de alta es correr
 * `scripts/sporti/alta.mts`, no tocar este archivo.
 */
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  fetchFases, fetchPartidos, fetchSumula, fetchTabla, partirFase, pausa, PAUSA_MS, HTTP_FORMA_INESPERADA,
} from '@/lib/integrations/sporti/client.ts';
import { resumirSumula, type FilaTablaSporti, type ResumenSumula } from '@/lib/integrations/sporti/parse.ts';
import {
  contrastarConTabla, planSportiMatches, sumulasQueFaltan, type ExistenteSporti, type Ronda,
} from '@/lib/integrations/sporti/planMatches.ts';
import {
  claveDeEquipo, nombreDeRonda, parseTournamentExternalId, SPORTI_ID_PREFIX, SPORTI_PROVIDER, type RamaSporti,
} from '@/lib/integrations/sporti/nombres.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Cuándo dejar de empezar fases nuevas: el techo de la función son 300 s. */
const PRESUPUESTO_MS = 240_000;
/** Filas por `insert` / `upsert`. */
const LOTE = 100;

interface TorneoFila {
  id: string;
  name: string;
  external_id: string;
  category: string | null;
  is_visible: boolean | null;
  current_season_id: string | null;
}

/** Lo que el alta deja en `tournament_phases.settings.sporti`. */
interface FaseSporti {
  fase: string;
  rama: RamaSporti;
  /** la fase publica tabla oficial (vista `-3`): se escribe tal cual */
  tabla: boolean;
  /** `columna`: la ronda es el título de la columna; `fin_de_semana`: la ronda es la del rango de fechas */
  rondas: 'columna' | 'fin_de_semana';
  /** letra del grupo → `tournament_groups.id` */
  grupos?: Record<string, string>;
  /** una final con los equipos sin definir no tiene tarjetas todavía */
  puedeEstarVacia?: boolean;
}

interface FaseFila {
  id: string;
  name: string;
  season_id: string | null;
  settings: { sporti?: FaseSporti } | null;
}

const COLUMNAS_PARTIDO = 'id, external_id, home_club_id, away_club_id, date_time, status, score, phase_id, group_id, round_uuid, round_label, venue, notes, home_base_points, away_base_points, home_bonus_points, away_bonus_points';

export async function GET(req: Request) {
  if (!(await authorizeCronRequest(req, 'sporti-sync'))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const url = new URL(req.url);
  const enSeco = url.searchParams.get('dry') === '1';
  const soloTorneo = url.searchParams.get('torneo');
  const arranque = Date.now();
  const ahora = new Date();
  const supabase = createAdminClient();
  const errors: string[] = [];

  const { data: torneosRaw, error: errTorneos } = await supabase
    .from('tournaments')
    .select('id, name, external_id, category, is_visible, current_season_id')
    .like('external_id', `${SPORTI_ID_PREFIX}%`);
  if (errTorneos) {
    return NextResponse.json({ error: `No se pudieron leer los torneos (${errTorneos.message})` }, { status: 500 });
  }
  let torneos = (torneosRaw ?? []) as TorneoFila[];
  if (soloTorneo) torneos = torneos.filter((t) => t.external_id === `${SPORTI_ID_PREFIX}${soloTorneo}`);
  if (!torneos.length) {
    return NextResponse.json({
      ok: false,
      error: soloTorneo
        ? `Ningún torneo tiene external_id sporti:${soloTorneo}`
        : 'Ningún torneo tiene external_id sporti:. Se dan de alta con scripts/sporti/alta.mts.',
    }, { status: 200 });
  }

  const { data: aliasRaw, error: errAlias } = await supabase
    .from('club_external_ids')
    .select('external_id, club_id')
    .eq('provider', SPORTI_PROVIDER)
    .limit(2000);
  if (errAlias) {
    return NextResponse.json({ error: `No se pudieron leer los equipos (${errAlias.message})` }, { status: 500 });
  }
  const alias = new Map(((aliasRaw ?? []) as { external_id: string; club_id: string }[]).map((a) => [a.external_id, a.club_id]));

  const resumen: unknown[] = [];
  const fasesReclamadas = new Map<string, Set<string>>();
  let escrituras = 0;

  for (const t of torneos) {
    const clave = parseTournamentExternalId(t.external_id);
    if (!clave) { errors.push(`${t.external_id}: external_id con forma desconocida`); continue; }

    const { data: fasesRaw, error: errFases } = await supabase
      .from('tournament_phases')
      .select('id, name, season_id, settings')
      .eq('tournament_id', t.id);
    if (errFases) { errors.push(`${t.external_id}: no se pudieron leer las fases (${errFases.message})`); continue; }
    const fases = ((fasesRaw ?? []) as FaseFila[]).filter((f) => f.settings?.sporti?.fase);
    fasesReclamadas.set(clave.campeonato, new Set(fases.map((f) => String(f.settings?.sporti?.fase))));
    if (!fases.length) { errors.push(`${t.external_id}: ninguna fase declara settings.sporti`); continue; }

    const { data: yaRaw, error: errYa } = await supabase
      .from('matches')
      .select(COLUMNAS_PARTIDO)
      .eq('tournament_id', t.id)
      .limit(3000);
    if (errYa) { errors.push(`${t.external_id}: no se pudieron leer los partidos (${errYa.message})`); continue; }
    const ya = (yaRaw ?? []) as ExistenteSporti[];
    const porId = new Map(ya.map((m) => [m.id, m]));

    const fasesARecalcular = new Map<string, string | null>();

    for (const fase of fases) {
      const cfg = fase.settings?.sporti as FaseSporti;
      const rotulo = `${t.external_id}/${cfg.fase}`;
      if (Date.now() - arranque > PRESUPUESTO_MS) {
        resumen.push({ fase: rotulo, saltado: 'sin presupuesto de tiempo en esta corrida' });
        continue;
      }
      const seasonId = fase.season_id ?? t.current_season_id ?? null;
      const resolverEquipo = (slug: string) => alias.get(claveDeEquipo(slug, cfg.rama)) ?? null;

      const r = await fetchPartidos(clave.campeonato, cfg.fase, { puedeEstarVacia: cfg.puedeEstarVacia });
      await pausa(PAUSA_MS);
      if (!r.ok || !r.data) {
        errors.push(`${rotulo}: ${r.status === HTTP_FORMA_INESPERADA ? 'la vista de partidos no trae tarjetas (¿cambió la forma?)' : `HTTP ${r.status}`}`);
        continue;
      }

      const { data: rondasRaw } = await supabase
        .from('tournament_rounds')
        .select('id, name, start_date, end_date')
        .eq('phase_id', fase.id);
      const rondas = (rondasRaw ?? []) as { id: string; name: string; start_date: string | null; end_date: string | null }[];
      const porNombre = new Map(rondas.map((x) => [x.name, x]));
      const rondaDe = (columna: string | null, dateTime: string): Ronda | null => {
        if (cfg.rondas === 'columna') {
          if (!columna) return null;
          const nombre = nombreDeRonda(columna);
          return { id: porNombre.get(nombre)?.id ?? null, nombre };
        }
        // La fecha de pared de Brasilia son los primeros 10 caracteres del ISO.
        const dia = dateTime.slice(0, 10);
        const x = rondas.find((k) => k.start_date && k.end_date && k.start_date <= dia && dia <= k.end_date);
        return x ? { id: x.id, nombre: x.name } : null;
      };
      const grupoDe = (columna: string | null) => (columna && cfg.grupos?.[columna]) || null;

      const pedir = sumulasQueFaltan(r.data, ya);
      const sumulas = new Map<string, ResumenSumula>();
      const sumulasFallidas: string[] = [];
      for (const id of pedir) {
        if (Date.now() - arranque > PRESUPUESTO_MS) break;
        const s = await fetchSumula(id);
        await pausa(PAUSA_MS);
        const res = s.ok && s.data ? resumirSumula(s.data) : null;
        if (res) sumulas.set(id, res);
        else sumulasFallidas.push(`s${id} (${s.status})`);
      }

      const plan = planSportiMatches({
        partidos: r.data, resolverEquipo, existentes: ya, sumulas, faseId: fase.id, grupoDe, rondaDe, ahora,
      });

      let creados = 0;
      let actualizados = 0;
      let filasDeTabla = 0;
      if (!enSeco) {
        const altas = plan.crear.map((fila) => ({
          ...fila,
          tournament_id: t.id,
          season_id: seasonId,
          sport_id: 'rugby',
          sport: 'rugby',
          category: t.category,
          is_visible: t.is_visible === true,
          live_enabled: false,
          review_status: 'approved',
        }));
        for (let i = 0; i < altas.length; i += LOTE) {
          const trozo = altas.slice(i, i + LOTE);
          const { error } = await supabase.from('matches').insert(trozo);
          if (error) { errors.push(`${rotulo}: alta de ${trozo.length} falló (${error.message})`); continue; }
          creados += trozo.length;
        }

        // Mismas columnas en TODAS las filas del lote, completando con lo que
        // la fila ya tiene: con solo el parche PostgREST toma la unión de
        // claves y la fila a la que le falta una la recibe en NULL.
        for (let i = 0; i < plan.actualizar.length; i += LOTE) {
          const trozo = plan.actualizar.slice(i, i + LOTE);
          const filas = trozo.map((c) => {
            const v = porId.get(c.id);
            return {
              id: c.id,
              tournament_id: t.id,
              external_id: v?.external_id ?? null,
              home_club_id: v?.home_club_id ?? null,
              away_club_id: v?.away_club_id ?? null,
              date_time: v?.date_time ?? null,
              status: v?.status ?? null,
              score: v?.score ?? null,
              phase_id: v?.phase_id ?? null,
              group_id: v?.group_id ?? null,
              round_uuid: v?.round_uuid ?? null,
              round_label: v?.round_label ?? null,
              venue: v?.venue ?? null,
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
          if (error) { errors.push(`${rotulo}: lote de ${filas.length} falló (${error.message})`); continue; }
          actualizados += filas.length;
        }

        // Una fase sin tabla oficial la arma el motor. Un alta también cuenta:
        // la primera corrida tiene que sembrar la tabla en cero.
        const movioLaTabla = creados > 0
          || plan.actualizar.some((c) => 'score' in c.patch || 'status' in c.patch || 'home_bonus_points' in c.patch);
        if (!cfg.tabla && movioLaTabla) fasesARecalcular.set(fase.id, seasonId);
        escrituras += creados + actualizados;
      }

      // La tabla oficial: en las fases que la publican es la que se muestra.
      let diferencias: ReturnType<typeof contrastarConTabla> | null = null;
      let tablaError: string | null = null;
      if (cfg.tabla) {
        const tabla = await fetchTabla(clave.campeonato, cfg.fase);
        await pausa(PAUSA_MS);
        if (!tabla.ok || !tabla.data) {
          tablaError = `no se pudo leer (${tabla.status})`;
          errors.push(`${rotulo}: tabla oficial ${tablaError}`);
        } else {
          diferencias = contrastarConTabla(plan.finales, tabla.data);
          if (!enSeco) {
            const escrito = await escribirTablaOficial(supabase, {
              torneoId: t.id, seasonId, faseId: fase.id, tabla: tabla.data, cfg,
              resolverEquipo, ahora: ahora.toISOString(),
            });
            if (escrito.error) errors.push(`${rotulo}: ${escrito.error}`);
            filasDeTabla = escrito.filas;
            escrituras += escrito.filas;
          }
        }
      }

      resumen.push({
        fase: rotulo,
        nombre: `${t.name} · ${fase.name}`,
        partidosEnLaFuente: r.data.length,
        finales: plan.finales.length,
        sumulasPedidas: pedir.length,
        crear: enSeco ? plan.crear.length : creados,
        actualizar: enSeco ? plan.actualizar.length : actualizados,
        sinCambios: plan.sinCambios,
        ...(cfg.tabla && !enSeco && { tablaOficial: `${filasDeTabla} filas` }),
        ...(tablaError && { tablaOficial: tablaError }),
        ...(diferencias?.length && { diferenciasConLaTabla: diferencias }),
        ...(plan.sinTries.length && { sinTries: plan.sinTries }),
        ...(sumulasFallidas.length && { sumulasFallidas }),
        ...(plan.correcciones.length && { correcciones: plan.correcciones }),
        ...(plan.omitidos.length && { omitidos: plan.omitidos }),
        ...(enSeco && {
          detalleActualizar: plan.actualizar.map((c) => ({ id: c.id, cambios: c.cambios })),
          detalleCrear: plan.crear.length > 20
            ? `${plan.crear.length} partidos`
            : plan.crear.map((a) => `${a.external_id} ${a.home_club_id} vs ${a.away_club_id} ${a.date_time} ${a.status}`),
        }),
      });
    }

    if (!enSeco && fasesARecalcular.size) {
      const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
      for (const [fase, seasonId] of fasesARecalcular) {
        const res = await recalculatePhaseStandingsScopes(t.id, fase, 'general', seasonId ?? undefined);
        if (!res.ok) errors.push(`${t.external_id}: recálculo de la fase ${fase} falló`);
      }
    }
  }

  // Fases que la CBRu abrió y ninguna fase reclama (el hexagonal, la final).
  const fasesSinMapear: { torneo: string; fase: string; nombre: string }[] = [];
  for (const [campeonato, reclamadas] of fasesReclamadas) {
    if (Date.now() - arranque > PRESUPUESTO_MS) break;
    const f = await fetchFases(campeonato);
    await pausa(PAUSA_MS);
    if (!f.ok || !f.data) { errors.push(`fases de ${campeonato}: no se pudieron leer (${f.status})`); continue; }
    for (const o of f.data) {
      const p = partirFase(o.valor);
      if (p && !reclamadas.has(p.fase)) fasesSinMapear.push({ torneo: `${SPORTI_ID_PREFIX}${campeonato}`, fase: o.valor, nombre: o.texto });
    }
  }

  if (escrituras > 0) {
    try {
      const { invalidateMatchesFeedCaches } = await import('@/lib/server/matchesFeedInvalidation');
      await invalidateMatchesFeedCaches(supabase);
    } catch {
      errors.push('No se pudieron invalidar los cachés del feed');
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    dry: enSeco,
    ms: Date.now() - arranque,
    fases: resumen,
    ...(fasesSinMapear.length && { fasesSinMapear }),
    errors,
  });
}

/**
 * Reemplaza la tabla de la fase por la oficial. Si un solo club de la tabla
 * no resuelve, no se toca nada: una tabla a la que le falta un club es peor
 * que la de la corrida anterior.
 */
async function escribirTablaOficial(
  supabase: ReturnType<typeof createAdminClient>,
  o: {
    torneoId: string; seasonId: string | null; faseId: string; tabla: FilaTablaSporti[]; cfg: FaseSporti;
    resolverEquipo: (slug: string) => string | null; ahora: string;
  },
): Promise<{ filas: number; error?: string }> {
  const sinClub = o.tabla.filter((f) => !o.resolverEquipo(f.slug)).map((f) => f.slug);
  if (sinClub.length) return { filas: 0, error: `tabla oficial sin escribir: clubes sin alias (${sinClub.join(', ')})` };
  const sinGrupo = o.tabla.filter((f) => f.grupo && o.cfg.grupos && !o.cfg.grupos[f.grupo]).map((f) => f.grupo);
  if (sinGrupo.length) return { filas: 0, error: `tabla oficial sin escribir: grupos sin mapear (${[...new Set(sinGrupo)].join(', ')})` };

  const clubes = o.tabla.map((f) => o.resolverEquipo(f.slug) as string);
  const [{ data: entradas }, { data: fichas }] = await Promise.all([
    o.seasonId
      ? supabase.from('team_season_entries').select('id, club_id').eq('season_id', o.seasonId)
      : Promise.resolve({ data: [] as { id: string; club_id: string }[] }),
    supabase.from('clubs').select('id, name, logo_url').in('id', clubes),
  ]);
  const entradaDe = new Map(((entradas ?? []) as { id: string; club_id: string }[]).map((e) => [e.club_id, e.id]));
  const fichaDe = new Map(((fichas ?? []) as { id: string; name: string; logo_url: string | null }[]).map((c) => [c.id, c]));

  const filas = o.tabla.map((f) => {
    const clubId = o.resolverEquipo(f.slug) as string;
    const bonus = Math.max(0, f.pts - 4 * f.pg - 2 * f.pe);
    return {
      tournament_id: o.torneoId, season_id: o.seasonId, phase_id: o.faseId,
      group_id: f.grupo && o.cfg.grupos ? o.cfg.grupos[f.grupo] : null,
      club_id: clubId, season_entry_id: entradaDe.get(clubId) ?? null, table_type: 'general',
      position: f.posicion, played: f.pj, won: f.pg, drawn: f.pe, lost: f.pp, points: f.pts,
      scored: f.pf, conceded: f.pc, bonus_points: bonus, form: null, streak: null, last_updated: o.ahora,
      stats: {
        status: null, team_name: fichaDe.get(clubId)?.name ?? f.nombre, team_logo: fichaDe.get(clubId)?.logo_url ?? null,
        difference: f.pf - f.pc, table_type: 'general', adjustments: 0, walkovers: f.wo,
        fuente: 'Tabla oficial de la CBRu (SporTI)', calculated_at: o.ahora,
      },
    };
  });

  const { error: errBorrar } = await supabase.from('tournament_standings').delete().eq('phase_id', o.faseId);
  if (errBorrar) return { filas: 0, error: `no se pudo vaciar la tabla (${errBorrar.message})` };
  const { error: errAlta } = await supabase.from('tournament_standings').insert(filas);
  if (errAlta) return { filas: 0, error: `no se pudo escribir la tabla (${errAlta.message})` };
  return { filas: filas.length };
}
