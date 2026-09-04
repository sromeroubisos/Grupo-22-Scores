/**
 * Sync de los torneos de la Confederación Argentina de Hockey desde SICAH.
 *
 *   GET /api/cron/cahockey-sync              corrida normal
 *   GET /api/cron/cahockey-sync?dry=1        plan sin escribir
 *   GET /api/cron/cahockey-sync?dias=7       ventana hacia atrás y adelante (default 3)
 *   GET /api/cron/cahockey-sync?modo=en-juego sólo los torneos con partidos en curso o recién terminados
 *   GET /api/cron/cahockey-sync?torneo=1580  un torneo puntual, esté o no en la ventana
 *
 * Qué torneos entran: los que tienen `external_id = 'cahockey:<id>'` (los
 * siembra `src/scripts/hockey-importar-2026.ts`) y tienen algún partido dentro
 * de la ventana. Un Argentino de Selecciones dura cuatro días y se juegan tres
 * o cuatro por año: el cron corre seguido pero fuera de esos días hace UNA
 * consulta y se va, sin tocar la fuente.
 *
 * Dos cadencias, porque un resultado tiene que entrar cuando termina el
 * partido y no un cuarto de hora después: cada 2 minutos la pasada `en-juego`
 * (torneos con algún partido que empezó hace menos de tres horas o empieza en
 * menos de una), y cada 15 la pasada completa de ±3 días, que además levanta
 * los cambios de fixture y los cruces recién definidos.
 *
 * El ciclo por torneo: `POST /updateTorneo` da la URL del iframe de SICAH; la
 * página (iso-8859-1) se parsea; `planTournamentMatches` decide qué se crea y
 * qué se actualiza; las posiciones se recalculan LOCALMENTE — de la web nunca
 * se copia una tabla, igual que con URBA y Córdoba.
 *
 * Los partidos de llave (Cuadrangular, Semifinales, Finales) van a una fase
 * `playoff` propia, que se crea la primera vez que hace falta. El importador
 * los había metido en la fase de liga y la tabla de la zona sumaba los cruces:
 * el cron corrige eso también para las filas viejas, moviéndolas de fase.
 *
 * Y las zonas son GRUPOS: con dos o más "Zona X" la fase pasa a `group_stage`,
 * cada zona es una fila de `tournament_groups`, y participantes y partidos
 * llevan su `group_id`. Sin eso el motor arma una sola tabla con las dos zonas
 * mezcladas, que es lo que se veía.
 *
 * Dos detalles que hacen que la tabla partida LLEGUE a la pantalla, porque la
 * primera versión escribía los grupos y la página seguía mostrando una sola:
 *
 *  - El grupo lleva el `season_id` de la fase. La página pública lee
 *    `tournament_groups` filtrando por la temporada del torneo, así que un
 *    grupo sin temporada existe en la base y no existe para nadie más.
 *  - El grupo se escribe en las DOS tablas de participantes: en
 *    `tournament_phase_participants` (de donde arma la tabla el servidor) y en
 *    el `group_id` viejo de `tournament_participants` (de donde la arma el
 *    cliente, que recalcula la tabla en el navegador). Es lo mismo que hace
 *    `POST /api/tournaments/[id]/phase-participants`; una sola de las dos deja
 *    a la otra mitad del sistema viendo un torneo sin zonas.
 *
 * Todo lo que no se entiende viaja en la respuesta (`omitidos`, `errors`): un
 * scraper caído que responde "sin novedades" es peor que uno que grita.
 */
import { NextResponse } from 'next/server';

import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  AMBITO_CAH,
  CAHOCKEY_ID_PREFIX,
  CAHOCKEY_PROVIDER,
  buildMatchExternalId,
  buildTeamAlias,
  esClubReal,
  idDeClub,
  nombreLimpio,
} from '@/lib/integrations/cahockey/nombres.ts';
import { planTournamentMatches, type ExistenteCah } from '@/lib/integrations/cahockey/planMatches.ts';
import { esEtapaDeZona, fetchSicahHtml, fetchSicahUrl, parsearSicah } from '@/lib/integrations/cahockey/sicah.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DIAS_POR_DEFECTO = 3;
/** Pasada en juego: un partido de hockey dura ~70' y SICAH carga al terminar. */
const EN_JUEGO_HACIA_ATRAS_MS = 3 * 3_600_000;
const EN_JUEGO_HACIA_ADELANTE_MS = 60 * 60_000;
const SPORT = 'field-hockey';
const NOMBRE_FASE_LLAVE = 'Playoffs';

type TorneoFila = {
  id: string;
  name: string;
  external_id: string;
  is_visible: boolean | null;
  current_season_id: string | null;
};

type FaseFila = { id: string; name: string; phase_type: string | null; order_index: number | null; season_id: string | null; settings: unknown };

const esFaseDeLlave = (f: FaseFila) => f.phase_type === 'playoff' || f.phase_type === 'knockout';

/** Pausa corta entre torneos: SICAH es un servidor chico y no hay apuro. */
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: Request) {
  if (!(await authorizeCronRequest(req, 'cahockey-sync'))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const url = new URL(req.url);
  const { status, body } = await sincronizarCahockey({
    enSeco: url.searchParams.get('dry') === '1',
    dias: Number(url.searchParams.get('dias') ?? DIAS_POR_DEFECTO) || DIAS_POR_DEFECTO,
    torneoPedido: url.searchParams.get('torneo')?.trim() || null,
    enJuego: url.searchParams.get('modo') === 'en-juego',
  });
  return NextResponse.json(body, { status });
}

type Resultado = { status: number; body: Record<string, unknown> };
const responder = (body: Record<string, unknown>, status = 200): Resultado => ({ status, body });

/**
 * El sync entero, separado de la ruta para poder correrlo en seco por `tsx`
 * sin una API key: la autenticación queda en `GET`, y esto es lo que hace.
 */
export async function sincronizarCahockey(opts: {
  enSeco: boolean;
  dias: number;
  torneoPedido: string | null;
  enJuego?: boolean;
}): Promise<Resultado> {
  const { enSeco, dias, torneoPedido, enJuego = false } = opts;
  const ahora = new Date();
  const ahoraIso = ahora.toISOString();

  const supabase = createAdminClient();
  const errors: string[] = [];

  // ── torneos vinculados ───────────────────────────────────────────────────
  const { data: torneosRaw, error: errTorneos } = await supabase
    .from('tournaments')
    .select('id, name, external_id, is_visible, current_season_id')
    .like('external_id', `${CAHOCKEY_ID_PREFIX}%`)
    .limit(1000);
  if (errTorneos) {
    return responder({ error: `No se pudieron leer los torneos (${errTorneos.message})` }, 500);
  }
  const todos = (torneosRaw ?? []) as TorneoFila[];
  if (!todos.length) {
    return responder({ ok: false, error: 'Ningún torneo tiene external_id cahockey:. Correr el importador primero.' });
  }

  // ── cuáles están activos: los que tienen partidos en la ventana ──────────
  let activos: TorneoFila[];
  if (torneoPedido) {
    activos = todos.filter((t) => t.external_id === `${CAHOCKEY_ID_PREFIX}${torneoPedido}`);
    if (!activos.length) {
      return responder({ ok: false, error: `No hay un torneo con external_id ${CAHOCKEY_ID_PREFIX}${torneoPedido}` });
    }
  } else {
    const desde = new Date(ahora.getTime() - (enJuego ? EN_JUEGO_HACIA_ATRAS_MS : dias * 86_400_000)).toISOString();
    const hasta = new Date(ahora.getTime() + (enJuego ? EN_JUEGO_HACIA_ADELANTE_MS : dias * 86_400_000)).toISOString();
    const { data: enVentana, error: errVentana } = await supabase
      .from('matches')
      .select('tournament_id')
      .in('tournament_id', todos.map((t) => t.id))
      .gte('date_time', desde)
      .lte('date_time', hasta)
      .limit(5000);
    if (errVentana) {
      return responder({ error: `No se pudo leer la ventana de partidos (${errVentana.message})` }, 500);
    }
    const ids = new Set(((enVentana ?? []) as { tournament_id: string }[]).map((m) => m.tournament_id));
    activos = todos.filter((t) => ids.has(t.id));
  }

  if (!activos.length) {
    return responder({ ok: true, dry: enSeco, modo: enJuego ? 'en-juego' : 'completa', torneos: [], sinActividad: true, ventanaDias: dias, errors });
  }

  // ── alias y clubes conocidos (una sola vez para todos los torneos) ───────
  const { data: aliasRaw, error: errAlias } = await supabase
    .from('club_external_ids')
    .select('external_id, club_id')
    .eq('provider', CAHOCKEY_PROVIDER)
    .limit(5000);
  if (errAlias) {
    return responder({ error: `No se pudieron leer los alias (${errAlias.message})` }, 500);
  }
  const alias = new Map(((aliasRaw ?? []) as { external_id: string; club_id: string }[]).map((a) => [a.external_id, a.club_id]));

  const { data: clubesRaw, error: errClubes } = await supabase
    .from('clubs')
    .select('id')
    .eq('sport_id', SPORT)
    .limit(5000);
  if (errClubes) {
    return responder({ error: `No se pudieron leer los clubes (${errClubes.message})` }, 500);
  }
  const clubesConocidos = new Set(((clubesRaw ?? []) as { id: string }[]).map((c) => c.id));

  // ── un plan por torneo ───────────────────────────────────────────────────
  const resumen: unknown[] = [];
  let escrituras = 0;

  for (const [i, t] of activos.entries()) {
    if (i > 0) await pausa(400);
    const torneoId = t.external_id.slice(CAHOCKEY_ID_PREFIX.length);

    const rUrl = await fetchSicahUrl(torneoId);
    if (!rUrl.ok) {
      errors.push(`${t.external_id}: cahockey.org.ar no devolvió el iframe de SICAH (HTTP ${rUrl.status})`);
      continue;
    }
    const rHtml = await fetchSicahHtml(rUrl.data);
    if (!rHtml.ok) {
      errors.push(`${t.external_id}: SICAH contestó HTTP ${rHtml.status}`);
      continue;
    }
    const sicah = parsearSicah(rHtml.data);
    if (!sicah.desde || !sicah.partidos.length) {
      // Página que llegó pero no se entiende: cambió la forma, o el torneo fue
      // despublicado. Nunca "sin novedades".
      errors.push(`${t.external_id}: la página de SICAH no trae rango ni partidos (cambió la forma)`);
      continue;
    }

    const { data: yaRaw, error: errYa } = await supabase
      .from('matches')
      .select('id, external_id, home_club_id, away_club_id, date_time, status, score, phase_id, round_label, venue')
      .eq('tournament_id', t.id)
      .limit(2000);
    if (errYa) { errors.push(`${t.external_id}: no se pudieron leer los partidos (${errYa.message})`); continue; }
    const existentes = (yaRaw ?? []) as ExistenteCah[];

    const { data: fasesRaw, error: errFases } = await supabase
      .from('tournament_phases')
      .select('id, name, phase_type, order_index, season_id, settings')
      .eq('tournament_id', t.id)
      .order('order_index', { ascending: true });
    if (errFases) { errors.push(`${t.external_id}: no se pudieron leer las fases (${errFases.message})`); continue; }
    const fases = (fasesRaw ?? []) as FaseFila[];
    const faseZona = fases.find((f) => !esFaseDeLlave(f)) ?? fases[0] ?? null;
    let faseLlave = fases.find(esFaseDeLlave) ?? null;

    const plan = planTournamentMatches({
      torneoExternalId: t.external_id,
      sicah,
      existentes,
      resolverClub: (nombre) => alias.get(buildTeamAlias(t.external_id, nombre)) ?? null,
      clubConocido: (id) => clubesConocidos.has(id),
      ahora: ahoraIso,
    });

    // Filas de llave que quedaron en la fase de zona (las dejó así el
    // importador): se mueven aunque no tengan otro cambio.
    const etapaPorExternalId = new Map(sicah.partidos.map((p) => [buildMatchExternalId(t.external_id, p.nro), p.etapa]));
    const enFaseEquivocada = existentes.filter((e) => {
      if (!e.external_id || !faseZona || e.phase_id !== faseZona.id) return false;
      const etapa = etapaPorExternalId.get(e.external_id);
      return etapa !== undefined && !esEtapaDeZona(etapa);
    });
    const necesitaFaseLlave = !faseLlave && (plan.crear.some((a) => a.fase === 'llave') || enFaseEquivocada.length > 0);

    const zonasSicah = [...new Set(sicah.partidos.map((p) => p.etapa).filter((e): e is string => esEtapaDeZona(e)))].sort();

    const fasesTocadas = new Set<string>();
    let creados = 0;
    let actualizados = 0;
    let movidos = 0;
    let faseCreada = false;
    let gruposCreados = 0;
    let gruposReparados = 0;
    let asignaciones = 0;
    let faseConvertida = false;

    if (!enSeco) {
      if (necesitaFaseLlave) {
        const nuevaFase = {
          id: globalThis.crypto.randomUUID(),
          tournament_id: t.id,
          season_id: t.current_season_id,
          name: NOMBRE_FASE_LLAVE,
          phase_type: 'playoff',
          order_index: (fases.at(-1)?.order_index ?? 0) + 1,
          // Sólo una fase activa por torneo (índice único): la activa es la de
          // zona, que es la que tiene tabla. La llave no compite por ese lugar.
          is_active: false,
          settings: faseZona?.settings ?? {},
          created_at: ahoraIso,
          updated_at: ahoraIso,
        };
        const { error } = await supabase.from('tournament_phases').insert([nuevaFase]);
        if (error) errors.push(`${t.external_id}: no se pudo crear la fase de llave (${error.message})`);
        else { faseLlave = nuevaFase; faseCreada = true; }
      }
      // Sin fase de llave (no se pudo crear), la llave cae en la de zona: mejor
      // un partido en la fase equivocada que un partido perdido.
      const faseDe = (fase: 'zona' | 'llave'): string | null =>
        (fase === 'llave' ? faseLlave?.id : undefined) ?? faseZona?.id ?? null;

      for (const alta of plan.crear) {
        const { fase, ...fila } = alta;
        const phaseId = faseDe(fase);
        const { error } = await supabase.from('matches').insert([{
          ...fila,
          tournament_id: t.id,
          sport_id: SPORT,
          sport: SPORT,
          is_visible: t.is_visible !== false,
          phase_id: phaseId,
          season_id: t.current_season_id,
        }]);
        if (error) { errors.push(`${alta.external_id}: alta falló (${error.message})`); continue; }
        creados++;
        if (alta.status === 'final' && phaseId) fasesTocadas.add(phaseId);
      }

      const yaMovidos = new Set<string>();
      for (const cambio of plan.actualizar) {
        const phaseId = faseDe(cambio.fase);
        const patch: Record<string, unknown> = { ...cambio.patch };
        if (phaseId && cambio.phase_id !== phaseId) { patch.phase_id = phaseId; yaMovidos.add(cambio.id); }
        const { error } = await supabase.from('matches').update(patch).eq('id', cambio.id);
        if (error) { errors.push(`${cambio.external_id}: update falló (${error.message})`); continue; }
        actualizados++;
        // Sólo un resultado mueve una tabla; una reprogramación no. Y si un
        // partido cambia de fase, las tablas de las DOS fases cambian.
        if ('score' in cambio.patch || patch.phase_id !== undefined) {
          if (cambio.phase_id) fasesTocadas.add(cambio.phase_id);
          if (phaseId) fasesTocadas.add(phaseId);
        }
      }

      for (const fila of enFaseEquivocada) {
        if (yaMovidos.has(fila.id)) continue;
        const phaseId = faseDe('llave');
        if (!phaseId || phaseId === fila.phase_id) continue;
        const { error } = await supabase.from('matches').update({ phase_id: phaseId }).eq('id', fila.id);
        if (error) { errors.push(`${fila.external_id}: no se pudo mover de fase (${error.message})`); continue; }
        movidos++;
        if (fila.phase_id) fasesTocadas.add(fila.phase_id);
        fasesTocadas.add(phaseId);
      }

      // ── zonas → grupos ─────────────────────────────────────────────────
      if (faseZona && zonasSicah.length >= 2) {
        const r = await sincronizarZonas({ supabase, t, faseZona, zonasSicah, sicah, alias, errors, ahoraIso });
        gruposCreados = r.gruposCreados;
        gruposReparados = r.gruposReparados;
        asignaciones = r.asignaciones;
        faseConvertida = r.faseConvertida;
        if (r.tocada) fasesTocadas.add(faseZona.id);
      }

      // La tabla sólo tiene sentido en la fase de zona: la de llave no se recalcula.
      if (faseLlave) fasesTocadas.delete(faseLlave.id);
      if (fasesTocadas.size) {
        // Import diferido: la cadena de standings arrastra módulos `server-only`.
        const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
        for (const fase of fasesTocadas) {
          const r = await recalculatePhaseStandingsScopes(t.id, fase, 'general');
          if (!r.ok) errors.push(`${t.external_id}: recálculo de la fase ${fase} falló`);
        }
      }
      escrituras += creados + actualizados + movidos + gruposCreados + gruposReparados + asignaciones;
    }

    resumen.push({
      torneo: t.external_id,
      nombre: t.name,
      sicah: { nombre: sicah.nombre, desde: sicah.desde, hasta: sicah.hasta, partidos: sicah.partidos.length },
      crear: enSeco ? plan.crear.length : creados,
      actualizar: enSeco ? plan.actualizar.length : actualizados,
      moverAFaseDeLlave: enSeco ? enFaseEquivocada.length : movidos,
      faseDeLlave: faseCreada ? 'creada' : faseLlave ? 'existe' : necesitaFaseLlave ? 'a crear' : 'no hace falta',
      zonas: zonasSicah,
      grupos: { creados: gruposCreados, reparados: gruposReparados, asignaciones, faseConvertida },
      sinCambios: plan.sinCambios,
      omitidos: plan.omitidos,
      clubesDesconocidos: plan.clubesDesconocidos,
      ...(enSeco && {
        detalleCrear: plan.crear.map((a) => `${a.external_id} [${a.fase}] ${a.home_club_id} vs ${a.away_club_id} → ${a.status} ${a.date_time}${a.score ? ` ${a.score.home}-${a.score.away}` : ''}`),
        detalleActualizar: plan.actualizar.map((c) => ({ id: c.id, external_id: c.external_id, cambios: c.cambios })),
      }),
    });
  }

  if (escrituras > 0) {
    try {
      const { invalidateMatchesFeedCaches } = await import('@/lib/server/matchesFeedInvalidation');
      await invalidateMatchesFeedCaches(supabase);
    } catch (e) {
      errors.push(`No se pudieron invalidar los cachés del feed (${e instanceof Error ? e.message : String(e)})`);
    }
  }

  return responder({
    ok: errors.length === 0,
    dry: enSeco,
    modo: enJuego ? 'en-juego' : 'completa',
    ventanaDias: dias,
    torneosActivos: activos.map((t) => t.external_id),
    torneos: resumen,
    escrituras,
    errors,
  });
}

type ClienteAdmin = ReturnType<typeof createAdminClient>;

/**
 * Las zonas de SICAH como grupos de la fase: crea los `tournament_groups` que
 * falten (con la temporada de la fase), pasa la fase a `group_stage`, y pone el
 * `group_id` en las asignaciones de fase, en los participantes y en los
 * partidos de zona. Idempotente: en la segunda corrida no escribe nada.
 *
 * También repara lo que dejó la primera versión: un grupo de esta fase sin
 * `season_id` recibe el de la fase, y un participante cuyo `group_id` viejo no
 * coincide con su zona se corrige. Así un torneo ya convertido se arregla solo
 * en la próxima pasada (o con `?torneo=<id>` si ya salió de la ventana).
 *
 * La zona de un club sale de sus partidos de zona (un equipo juega una sola).
 * Las filas de posiciones sin grupo de esa fase se borran al convertirla: el
 * motor limpia por alcance (fase, grupo) y las de grupo NULL quedarían rancias
 * al lado de las nuevas.
 */
async function sincronizarZonas(args: {
  supabase: ClienteAdmin;
  t: TorneoFila;
  faseZona: FaseFila;
  zonasSicah: string[];
  sicah: ReturnType<typeof parsearSicah>;
  alias: Map<string, string>;
  errors: string[];
  ahoraIso: string;
}): Promise<{ gruposCreados: number; gruposReparados: number; asignaciones: number; faseConvertida: boolean; tocada: boolean }> {
  const { supabase, t, faseZona, zonasSicah, sicah, alias, errors, ahoraIso } = args;
  const salida = { gruposCreados: 0, gruposReparados: 0, asignaciones: 0, faseConvertida: false, tocada: false };
  const seasonId = faseZona.season_id ?? t.current_season_id ?? null;

  const zonaPorClub = new Map<string, string>();
  const zonaPorPartido = new Map<string, string>();
  for (const p of sicah.partidos) {
    if (!esEtapaDeZona(p.etapa) || !p.etapa) continue;
    zonaPorPartido.set(buildMatchExternalId(t.external_id, p.nro), p.etapa);
    for (const lado of [p.local, p.visitante]) {
      const nombre = nombreLimpio(lado?.equipo ?? '');
      if (!esClubReal(nombre)) continue;
      zonaPorClub.set(alias.get(buildTeamAlias(t.external_id, nombre)) ?? idDeClub(nombre, AMBITO_CAH), p.etapa);
    }
  }

  // grupos
  const { data: gruposRaw, error: errGrupos } = await supabase
    .from('tournament_groups').select('id, name, season_id').eq('phase_id', faseZona.id);
  if (errGrupos) { errors.push(`${t.external_id}: no se pudieron leer los grupos (${errGrupos.message})`); return salida; }
  const grupos = (gruposRaw ?? []) as { id: string; name: string; season_id: string | null }[];
  const grupoPorZona = new Map(grupos.map((g) => [g.name, g.id]));
  // Un grupo sin temporada no lo ve la página pública: se le pone la de la fase.
  for (const g of grupos) {
    if (!seasonId || g.season_id) continue;
    const { error } = await supabase.from('tournament_groups').update({ season_id: seasonId }).eq('id', g.id);
    if (error) { errors.push(`${t.external_id}: no se pudo poner la temporada al grupo ${g.name} (${error.message})`); continue; }
    salida.gruposReparados++;
    salida.tocada = true;
  }
  for (const [i, zona] of zonasSicah.entries()) {
    if (grupoPorZona.has(zona)) continue;
    const id = globalThis.crypto.randomUUID();
    const { error } = await supabase.from('tournament_groups')
      .insert([{ id, phase_id: faseZona.id, season_id: seasonId, name: zona, order_index: i + 1 }]);
    if (error) { errors.push(`${t.external_id}: no se pudo crear el grupo ${zona} (${error.message})`); continue; }
    grupoPorZona.set(zona, id);
    salida.gruposCreados++;
    salida.tocada = true;
  }

  // la fase
  if (faseZona.phase_type !== 'group_stage') {
    const { error } = await supabase.from('tournament_phases')
      .update({ phase_type: 'group_stage', updated_at: ahoraIso }).eq('id', faseZona.id);
    if (error) errors.push(`${t.external_id}: no se pudo pasar la fase a group_stage (${error.message})`);
    else {
      salida.faseConvertida = true;
      salida.tocada = true;
      const { error: errBorrar } = await supabase.from('tournament_standings')
        .delete().eq('tournament_id', t.id).eq('phase_id', faseZona.id).is('group_id', null);
      if (errBorrar) errors.push(`${t.external_id}: no se pudo limpiar la tabla sin grupo (${errBorrar.message})`);
    }
  }

  // participantes: el grupo va en la asignación de fase y en el `group_id` viejo
  // de `tournament_participants`, que es el que lee el cliente al armar la tabla
  const { data: partsRaw, error: errParts } = await supabase
    .from('tournament_participants').select('id, club_id, group_id').eq('tournament_id', t.id).limit(500);
  if (errParts) { errors.push(`${t.external_id}: no se pudieron leer los participantes (${errParts.message})`); return salida; }
  const participantes = (partsRaw ?? []) as { id: string; club_id: string; group_id: string | null }[];
  const clubPorParticipante = new Map(participantes.map((p) => [p.id, p.club_id]));
  for (const p of participantes) {
    const zona = zonaPorClub.get(p.club_id);
    const grupoId = zona ? grupoPorZona.get(zona) ?? null : null;
    if (!grupoId || p.group_id === grupoId) continue;
    const { error } = await supabase.from('tournament_participants').update({ group_id: grupoId }).eq('id', p.id);
    if (error) { errors.push(`${t.external_id}: no se pudo asignar el grupo al participante ${p.id} (${error.message})`); continue; }
    salida.asignaciones++;
    salida.tocada = true;
  }
  const { data: asigRaw, error: errAsig } = await supabase
    .from('tournament_phase_participants').select('id, participant_id, group_id').eq('phase_id', faseZona.id).limit(500);
  if (errAsig) { errors.push(`${t.external_id}: no se pudieron leer las asignaciones de fase (${errAsig.message})`); return salida; }
  for (const a of (asigRaw ?? []) as { id: string; participant_id: string; group_id: string | null }[]) {
    const zona = zonaPorClub.get(clubPorParticipante.get(a.participant_id) ?? '');
    const grupoId = zona ? grupoPorZona.get(zona) ?? null : null;
    if (!grupoId || a.group_id === grupoId) continue;
    const { error } = await supabase.from('tournament_phase_participants').update({ group_id: grupoId }).eq('id', a.id);
    if (error) { errors.push(`${t.external_id}: no se pudo asignar el grupo a ${a.participant_id} (${error.message})`); continue; }
    salida.asignaciones++;
    salida.tocada = true;
  }

  // partidos de zona (se releen: los de esta corrida recién se crearon)
  const { data: msRaw, error: errMs } = await supabase
    .from('matches').select('id, external_id, group_id').eq('tournament_id', t.id).eq('phase_id', faseZona.id).limit(2000);
  if (errMs) { errors.push(`${t.external_id}: no se pudieron releer los partidos (${errMs.message})`); return salida; }
  for (const m of (msRaw ?? []) as { id: string; external_id: string | null; group_id: string | null }[]) {
    const zona = m.external_id ? zonaPorPartido.get(m.external_id) : undefined;
    const grupoId = zona ? grupoPorZona.get(zona) ?? null : null;
    if (!grupoId || m.group_id === grupoId) continue;
    const { error } = await supabase.from('matches').update({ group_id: grupoId }).eq('id', m.id);
    if (error) { errors.push(`${m.external_id}: no se pudo asignar el grupo (${error.message})`); continue; }
    salida.asignaciones++;
    salida.tocada = true;
  }

  return salida;
}
