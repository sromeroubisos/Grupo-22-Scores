/**
 * Sync de la Federación Española de Rugby desde iSquad
 * (resultadosrugby.isquad.es).
 *
 *   GET /api/cron/isquad-sync                  corrida normal
 *   GET /api/cron/isquad-sync?dry=1            plan sin escribir
 *   GET /api/cron/isquad-sync?torneo=419       un solo campeonato
 *
 * El ciclo, por torneo con `external_id = 'isquad:{temporada}:{campeonato}'`:
 * cada fase declara en `settings.isquad.grupos` qué grupos de iSquad son suyos
 * (la DH B tiene cuatro en la misma fase; la Liga Iberdrola, uno). Por grupo se
 * pide `resultados_completos.php` —el fixture entero en un pedido—, después
 * SOLO las actas de los finales que todavía no tienen tries, y
 * `planIsquadMatches` decide altas y cambios.
 *
 * Al final de cada grupo se pide la tabla oficial y se contrasta con nuestra
 * cuenta (`diferenciasConLaTabla`). Vacío es lo esperado: la regla del bonus de
 * la FER (3 tries de diferencia, derrota por 7) está medida contra las tablas
 * oficiales. Una diferencia es casi siempre un acta que la federación todavía
 * no cargó, y se arregla sola en la corrida siguiente.
 *
 * Una vez por temporada se pide también el árbol de campeonatos, y los grupos
 * que la federación abrió y ninguna fase reclama salen en `gruposSinMapear`:
 * la 2ª fase de la DH B aparece así, y darla de alta es correr
 * `src/scripts/isquad-alta.ts`, no tocar este archivo.
 *
 * Las posiciones se recalculan con `recalculatePhaseStandingsScopes` en cada
 * fase tocada: escribir partidos por fuera del gestor deja la tabla con la
 * foto vieja.
 */
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  fetchActa, fetchArbol, fetchClasificacion, fetchResultados, gruposDe, pausa, PAUSA_MS, HTTP_FORMA_INESPERADA,
} from '@/lib/integrations/isquad/client.ts';
import { resumirActa, type ResumenActa } from '@/lib/integrations/isquad/parse.ts';
import {
  contrastarConTabla, partidosQueNecesitanActa, planIsquadMatches, type ExistenteIsquad,
} from '@/lib/integrations/isquad/planMatches.ts';
import { ISQUAD_ID_PREFIX, ISQUAD_PROVIDER, parseTournamentExternalId } from '@/lib/integrations/isquad/nombres.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Cuándo dejar de empezar grupos nuevos: el techo de la función son 300 s. */
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

interface GrupoDeFase {
  /** id del grupo en iSquad (`resultados_completos.php?id=`) */
  id: string;
  /** `tournament_groups.id`, o null si la fase tiene un solo grupo */
  groupId: string | null;
  nombre?: string;
}

interface FaseFila {
  id: string;
  season_id: string | null;
  settings: { isquad?: { grupos?: GrupoDeFase[] } } | null;
}

const COLUMNAS_PARTIDO = 'id, external_id, home_club_id, away_club_id, date_time, status, score, phase_id, group_id, round_uuid, round_label, venue, stream_url, notes, home_base_points, away_base_points, home_bonus_points, away_bonus_points';

export async function GET(req: Request) {
  if (!(await authorizeCronRequest(req, 'isquad-sync'))) {
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
    .like('external_id', `${ISQUAD_ID_PREFIX}%`);
  if (errTorneos) {
    return NextResponse.json({ error: `No se pudieron leer los torneos (${errTorneos.message})` }, { status: 500 });
  }
  let torneos = (torneosRaw ?? []) as TorneoFila[];
  if (soloTorneo) torneos = torneos.filter((t) => t.external_id.endsWith(`:${soloTorneo}`));
  if (!torneos.length) {
    return NextResponse.json({
      ok: false,
      error: soloTorneo
        ? `Ningún torneo tiene external_id isquad:*:${soloTorneo}`
        : 'Ningún torneo tiene external_id isquad:. Se dan de alta con src/scripts/isquad-alta.ts.',
    }, { status: 200 });
  }

  const { data: aliasRaw, error: errAlias } = await supabase
    .from('club_external_ids')
    .select('external_id, club_id')
    .eq('provider', ISQUAD_PROVIDER)
    .limit(2000);
  if (errAlias) {
    return NextResponse.json({ error: `No se pudieron leer los equipos (${errAlias.message})` }, { status: 500 });
  }
  const alias = new Map(((aliasRaw ?? []) as { external_id: string; club_id: string }[]).map((a) => [a.external_id, a.club_id]));
  const resolverEquipo = (clave: string) => alias.get(clave) ?? null;

  const resumen: unknown[] = [];
  const gruposReclamados = new Map<string, Set<string>>();
  let escrituras = 0;

  for (const t of torneos) {
    const clave = parseTournamentExternalId(t.external_id);
    if (!clave) { errors.push(`${t.external_id}: external_id con forma desconocida`); continue; }

    const { data: fasesRaw, error: errFases } = await supabase
      .from('tournament_phases')
      .select('id, season_id, settings')
      .eq('tournament_id', t.id);
    if (errFases) { errors.push(`${t.external_id}: no se pudieron leer las fases (${errFases.message})`); continue; }
    const fases = ((fasesRaw ?? []) as FaseFila[]).filter((f) => f.settings?.isquad?.grupos?.length);
    const reclamados = gruposReclamados.get(`${clave.temporada}:${clave.campeonato}`) ?? new Set<string>();
    for (const f of fases) for (const g of f.settings?.isquad?.grupos ?? []) reclamados.add(String(g.id));
    gruposReclamados.set(`${clave.temporada}:${clave.campeonato}`, reclamados);
    if (!fases.length) { errors.push(`${t.external_id}: ninguna fase declara settings.isquad.grupos`); continue; }

    const { data: yaRaw, error: errYa } = await supabase
      .from('matches')
      .select(COLUMNAS_PARTIDO)
      .eq('tournament_id', t.id)
      .limit(3000);
    if (errYa) { errors.push(`${t.external_id}: no se pudieron leer los partidos (${errYa.message})`); continue; }
    const ya = (yaRaw ?? []) as ExistenteIsquad[];
    const porId = new Map(ya.map((m) => [m.id, m]));

    const fasesTocadas = new Map<string, string | null>();

    for (const fase of fases) {
      const { data: rondasRaw } = await supabase
        .from('tournament_rounds')
        .select('id, name')
        .eq('phase_id', fase.id);
      const rondas = new Map(((rondasRaw ?? []) as { id: string; name: string }[]).map((r) => [r.name, r.id]));
      const rondaDe = (jornada: number | null) => (jornada ? rondas.get(`Jornada ${jornada}`) ?? null : null);
      const seasonId = fase.season_id ?? t.current_season_id ?? null;

      for (const grupo of fase.settings?.isquad?.grupos ?? []) {
        const rotulo = `${t.external_id}/${grupo.id}`;
        if (Date.now() - arranque > PRESUPUESTO_MS) {
          resumen.push({ grupo: rotulo, saltado: 'sin presupuesto de tiempo en esta corrida' });
          continue;
        }

        const r = await fetchResultados(String(grupo.id));
        await pausa(PAUSA_MS);
        if (!r.ok || !r.data) {
          errors.push(`${rotulo}: ${r.status === HTTP_FORMA_INESPERADA ? 'la página de resultados no trae partidos (¿cambió la forma?)' : `HTTP ${r.status}`}`);
          continue;
        }

        const pedir = partidosQueNecesitanActa(r.data, ya);
        const actas = new Map<string, ResumenActa>();
        const actasFallidas: string[] = [];
        for (const id of pedir) {
          if (Date.now() - arranque > PRESUPUESTO_MS) break;
          const a = await fetchActa(id);
          await pausa(PAUSA_MS);
          if (a.ok && a.data) actas.set(id, resumirActa(a.data));
          else actasFallidas.push(`p${id} (${a.status})`);
        }

        const plan = planIsquadMatches({
          partidos: r.data, resolverEquipo, existentes: ya, actas,
          faseId: fase.id, grupoId: grupo.groupId ?? null, rondaDe, ahora,
        });

        let creados = 0;
        let actualizados = 0;
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
          // la fila ya tiene: si se mandara solo el parche, PostgREST toma la
          // unión de claves y la fila a la que le falta una la recibe en NULL
          // (ver el sync de la AAHBA, donde eso se llevaba puesto el marcador).
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
                stream_url: v?.stream_url ?? null,
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

          // Un alta también cuenta: la primera corrida de un torneo sin ningún
          // final todavía tiene que sembrar la tabla (en cero), o la pantalla
          // del torneo la dibuja vacía hasta la primera jornada.
          const movioLaTabla = creados > 0
            || plan.actualizar.some((c) => 'score' in c.patch || 'status' in c.patch || 'home_bonus_points' in c.patch);
          if (movioLaTabla) fasesTocadas.set(fase.id, seasonId);
          escrituras += creados + actualizados;
        }

        // La tabla oficial, para contrastar. Si no se puede leer, el sync igual vale.
        const tabla = await fetchClasificacion(String(grupo.id));
        await pausa(PAUSA_MS);
        const diferencias = tabla.ok && tabla.data ? contrastarConTabla(plan.finales, tabla.data) : null;

        resumen.push({
          grupo: rotulo,
          nombre: `${t.name}${grupo.nombre ? ` · ${grupo.nombre}` : ''}`,
          partidosEnLaFuente: r.data.length,
          finales: plan.finales.length,
          actasPedidas: pedir.length,
          crear: enSeco ? plan.crear.length : creados,
          actualizar: enSeco ? plan.actualizar.length : actualizados,
          sinCambios: plan.sinCambios,
          ...(diferencias === null && { tablaOficial: `no se pudo leer (${tabla.status})` }),
          ...(diferencias?.length && { diferenciasConLaTabla: diferencias }),
          ...(plan.sinTries.length && { sinTries: plan.sinTries }),
          ...(actasFallidas.length && { actasFallidas }),
          ...(plan.correcciones.length && { correcciones: plan.correcciones }),
          ...(plan.estadosDesconocidos.length && { estadosDesconocidos: plan.estadosDesconocidos }),
          ...(plan.omitidos.length && { omitidos: plan.omitidos }),
          ...(enSeco && {
            detalleActualizar: plan.actualizar.map((c) => ({ id: c.id, cambios: c.cambios })),
            detalleCrear: plan.crear.length > 20
              ? `${plan.crear.length} partidos`
              : plan.crear.map((a) => `${a.external_id} ${a.home_club_id} vs ${a.away_club_id} ${a.date_time} ${a.status}`),
          }),
        });
      }
    }

    if (!enSeco && fasesTocadas.size) {
      const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
      for (const [fase, seasonId] of fasesTocadas) {
        const res = await recalculatePhaseStandingsScopes(t.id, fase, 'general', seasonId ?? undefined);
        if (!res.ok) errors.push(`${t.external_id}: recálculo de la fase ${fase} falló`);
      }
    }
  }

  // Grupos que la federación abrió y ninguna fase reclama (la 2ª fase, los playoffs).
  const gruposSinMapear: { torneo: string; grupo: number; nombre: string }[] = [];
  const porTemporada = new Map<string, string[]>();
  for (const k of gruposReclamados.keys()) {
    const [temporada, campeonato] = k.split(':');
    porTemporada.set(temporada, [...(porTemporada.get(temporada) ?? []), campeonato]);
  }
  for (const [temporada, campeonatos] of porTemporada) {
    if (Date.now() - arranque > PRESUPUESTO_MS) break;
    const arbol = await fetchArbol(temporada);
    if (!arbol.ok || !arbol.data) { errors.push(`árbol ${temporada}: no se pudo leer (${arbol.status})`); continue; }
    for (const campeonato of campeonatos) {
      const reclamados = gruposReclamados.get(`${temporada}:${campeonato}`) ?? new Set<string>();
      for (const g of gruposDe(arbol.data, campeonato)) {
        if (!reclamados.has(String(g.id))) {
          gruposSinMapear.push({ torneo: `${ISQUAD_ID_PREFIX}${temporada}:${campeonato}`, grupo: g.id, nombre: `${g.nombre_fase} · ${g.grupo}` });
        }
      }
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
    grupos: resumen,
    ...(gruposSinMapear.length && { gruposSinMapear }),
    errors,
  });
}
