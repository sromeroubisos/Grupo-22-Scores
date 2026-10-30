/**
 * Sync del hockey marplatense desde aamh.com.ar.
 *
 *   GET /api/cron/aamh-sync             corrida normal (el año en curso)
 *   GET /api/cron/aamh-sync?dry=1       plan sin escribir
 *   GET /api/cron/aamh-sync?anio=2025   otra temporada
 *   GET /api/cron/aamh-sync?fichas=0    sin pedir horas (más rápido)
 *   GET /api/cron/aamh-sync?todos=1     los 38 torneos, sin acotar (NO entra en
 *                                       los 60 s de Vercel: es para correrla a
 *                                       mano después de un alta)
 *
 * NO mira los 38 torneos por corrida: está medido que eso tarda ~46 s y el techo
 * de la función es 60. `elegirObjetivos` acota por actividad y rotación —el
 * porqué está explicado ahí—, y la respuesta trae `seleccion` con cuántos miró
 * y por qué, para que "no se actualizó" nunca se confunda con "no había nada".
 *
 * El ciclo, por torneo con `external_id = 'aamh:{año}:{tid}-{cid}'` (los crea
 * `src/scripts/aamh-crear-torneos.ts`): se baja `/resultados/torneo/{tid}/{cid}/`,
 * que trae la tabla y el fixture entero con marcadores, y `planAamhMatches`
 * decide altas, adopciones y actualizaciones. Posiciones locales, como siempre:
 * la tabla del sitio no se copia — `tournament_standings` la recalcula el
 * proyecto con el sistema de puntos del torneo.
 *
 * Las HORAS son el punto flojo del proveedor: el fixture publica solo `DD/MM`.
 * La hora real y la cancha viven en la ficha de cada partido, y son ~2800 por
 * temporada — imposible en una corrida. Por eso se piden de a poco, y solo de
 * la ventana que importa (lo que se juega en los próximos días), priorizando
 * los que todavía tienen la hora de relleno. Varias corridas y el fin de
 * semana queda con horario real.
 *
 * Todo lo que no se entendió viaja en la respuesta: `omitidos`, `errors`,
 * `torneosSinPagina`. Un club que no resuelve es una fila de alias en
 * `club_external_ids`, no un deploy.
 */
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  fetchTorneo,
  fetchPartido,
  pausa,
  HTTP_FORMA_INESPERADA,
} from '@/lib/integrations/aamh/client.ts';
import { parseTorneo, parsePartidoDetalle } from '@/lib/integrations/aamh/parser.ts';
import {
  planAamhMatches,
  type DetalleDePartido,
  type ExistenteAamh,
} from '@/lib/integrations/aamh/planMatches.ts';
import {
  AAMH_ID_PREFIX,
  AAMH_PROVIDER,
  parseTournamentExternalId,
  type ClaveDeTorneo,
} from '@/lib/integrations/aamh/nombres.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Más corta que la del client: el presupuesto de la función es de 60 s. */
const PAUSA_PAGINA_MS = 200;
/** Cuántas fichas de partido se piden por corrida, para la hora y la cancha. */
const FICHAS_POR_DEFECTO = 12;
/** Cuántos torneos como mucho por corrida. Ver `elegirObjetivos`. */
const TOPE_TORNEOS = 16;
/** Días a cada lado de hoy que hacen que un torneo cuente como "en juego". */
const VENTANA_ACTIVIDAD = 4;
/**
 * Cuándo dejar de empezar torneos nuevos. El techo de la función son 60 s:
 * terminar bien con la mitad y decirlo es mejor que morir por timeout a mitad
 * de una escritura.
 */
const PRESUPUESTO_MS = 45_000;
/** La ventana de la que vale la pena saber el horario exacto, en días. */
const VENTANA_ANTES = 2;
const VENTANA_DESPUES = 9;
/** La hora que pone el planificador cuando no conoce la real. */
const HORA_DE_RELLENO = 'T10:00';

interface TorneoDb {
  id: string;
  name: string;
  external_id: string;
  is_visible: boolean | null;
  current_season_id: string | null;
  gender: string | null;
}

/** El género con el que se busca el alias del club. */
const ramaDe = (gender: string | null): string => (gender === 'masculino' ? 'caballeros' : 'damas');

interface Objetivo {
  row: TorneoDb;
  clave: ClaveDeTorneo;
}

/**
 * Qué torneos mirar en ESTA corrida.
 *
 * Está medido: bajar las 38 páginas de la temporada tarda ~46 s, y el techo de
 * la función es 60. Pedirlas todas garantiza un timeout a mitad de camino —y
 * siempre en los mismos torneos, porque el orden es estable, así que los
 * últimos no se sincronizarían nunca—. Así que la corrida se acota, con dos
 * criterios que se complementan:
 *
 * 1. ACTIVIDAD: los torneos con algún partido cargado en la ventana de ±N días.
 *    Un domingo a la tarde son los que se están jugando; en febrero, ninguno.
 *    Es lo que hace falta para que un resultado aparezca al toque.
 * 2. ROTACIÓN: unos pocos de los que no entraron por actividad, elegidos por el
 *    día del año. Cubre lo que la actividad no ve —una rueda 2 que recién se
 *    programa no tiene ningún partido cargado todavía, así que no aparecería
 *    jamás— y garantiza que en pocos días se revisó la temporada entera.
 *
 * La rotación no necesita ninguna columna nueva ni recordar nada: el día del
 * año como offset sobre una lista ordenada es determinista y sin estado.
 */
async function elegirObjetivos(
  supabase: ReturnType<typeof createAdminClient>,
  delAnio: Objetivo[],
  opciones: { forzarTodos: boolean; tope: number; ventana: number },
): Promise<{ objetivos: Objetivo[]; porActividad: number; porRotacion: number }> {
  if (opciones.forzarTodos) {
    return { objetivos: delAnio, porActividad: delAnio.length, porRotacion: 0 };
  }

  const activos = new Set<string>();
  if (opciones.ventana > 0) {
    const { data } = await supabase
      .from('matches')
      .select('tournament_id')
      .in('tournament_id', delAnio.map((o) => o.row.id))
      .gte('date_time', diaMas(-opciones.ventana))
      .lte('date_time', `${diaMas(opciones.ventana)}T23:59:59`)
      .limit(3000);
    for (const m of (data ?? []) as { tournament_id: string }[]) activos.add(m.tournament_id);
  }

  const conActividad = delAnio.filter((o) => activos.has(o.row.id));
  const resto = delAnio.filter((o) => !activos.has(o.row.id));

  /**
   * Toma `cuantos` de la lista arrancando en un punto que se corre con el
   * tiempo. Un `slice(0, tope)` pelado dejaría afuera SIEMPRE a los mismos
   * —los últimos del orden— y esos no se actualizarían nunca: medido, un
   * sábado hay más torneos en juego que el tope.
   */
  const tanda = (lista: Objetivo[], cuantos: number, periodoMs: number): Objetivo[] => {
    if (!lista.length || cuantos <= 0) return [];
    if (cuantos >= lista.length) return [...lista];
    const inicio = Math.floor(Date.now() / periodoMs) % lista.length;
    return Array.from({ length: cuantos }, (_, i) => lista[(inicio + i) % lista.length]);
  };

  // Los activos rotan cada MEDIA HORA, que es la cadencia del cron el fin de
  // semana (`*/30` en vercel.json): si el puntero fuera horario, dos corridas
  // seguidas mirarían exactamente lo mismo. El resto rota por día, que no urge.
  const porActividadLista = tanda(conActividad, opciones.tope, 1_800_000);
  const cupoRotacion = Math.max(0, opciones.tope - porActividadLista.length);
  const porRotacionLista = tanda(resto, cupoRotacion, 86_400_000);

  return {
    objetivos: [...porActividadLista, ...porRotacionLista],
    porActividad: porActividadLista.length,
    porRotacion: porRotacionLista.length,
  };
}

const diaMas = (dias: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

export async function GET(req: Request) {
  if (!(await authorizeCronRequest(req, 'aamh-sync'))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const url = new URL(req.url);
  const enSeco = url.searchParams.get('dry') === '1';
  const anioPedido = Number(url.searchParams.get('anio')) || new Date().getUTCFullYear();
  const topeFichas = Math.max(0, Math.min(60, Number(url.searchParams.get('fichas') ?? FICHAS_POR_DEFECTO)));

  const supabase = createAdminClient();
  const errors: string[] = [];

  const { data: torneosRaw, error: errTorneos } = await supabase
    .from('tournaments')
    .select('id, name, external_id, is_visible, current_season_id, gender')
    .like('external_id', `${AAMH_ID_PREFIX}%`);
  if (errTorneos) {
    return NextResponse.json({ error: `No se pudieron leer los torneos (${errTorneos.message})` }, { status: 500 });
  }

  const todos = (torneosRaw ?? []) as TorneoDb[];
  if (!todos.length) {
    return NextResponse.json({
      ok: false,
      error: 'Ningún torneo tiene external_id aamh:. Correr src/scripts/aamh-crear-torneos.ts primero.',
    }, { status: 200 });
  }

  const delAnio: Objetivo[] = [];
  for (const row of todos) {
    const clave = parseTournamentExternalId(row.external_id);
    if (clave && clave.anio === anioPedido) delAnio.push({ row, clave });
  }

  if (!delAnio.length) {
    return NextResponse.json({
      ok: true, anio: anioPedido, torneos: [],
      aviso: `Ningún torneo de la AAMH está dado de alta para ${anioPedido}.`,
    });
  }

  // Orden estable: la rotación depende de que no cambie entre corridas.
  delAnio.sort((a, b) => a.row.external_id.localeCompare(b.row.external_id));

  const { objetivos, porActividad, porRotacion } = await elegirObjetivos(supabase, delAnio, {
    forzarTodos: url.searchParams.get('todos') === '1',
    tope: Math.max(1, Math.min(60, Number(url.searchParams.get('tope') ?? TOPE_TORNEOS))),
    ventana: Math.max(0, Number(url.searchParams.get('ventana') ?? VENTANA_ACTIVIDAD)),
  });

  // Los alias son de alcance GÉNERO, no por torneo: la AAMH escribe cada club
  // igual en los 38 certámenes, pero las fichas marplatenses ya cargadas son
  // por rama (`mar-del-plata-club-damas`) y confundirlas cruzaría los partidos.
  const { data: aliasRaw, error: errAlias } = await supabase
    .from('club_external_ids')
    .select('external_id, club_id')
    .eq('provider', AAMH_PROVIDER)
    .limit(2000);
  if (errAlias) {
    return NextResponse.json({ error: `No se pudieron leer los alias (${errAlias.message})` }, { status: 500 });
  }
  const alias = new Map(((aliasRaw ?? []) as { external_id: string; club_id: string }[]).map((a) => [a.external_id, a.club_id]));
  /** El alias lleva el género adelante: la misma grafía nombra ramas distintas. */
  const resolverDe = (rama: string) => (clave: string) => alias.get(`${rama}|${clave}`) ?? null;

  const desde = diaMas(-VENTANA_ANTES);
  const hasta = diaMas(VENTANA_DESPUES);

  const resumen: unknown[] = [];
  const torneosSinPagina: string[] = [];
  const sinTiempo: string[] = [];
  const arranque = Date.now();
  let escrituras = 0;
  let fichasPedidas = 0;

  for (const { row: t, clave } of objetivos) {
    // No empezar un torneo que no vamos a poder terminar.
    if (Date.now() - arranque > PRESUPUESTO_MS) { sinTiempo.push(t.external_id); continue; }

    const rPagina = await fetchTorneo(clave.tid, clave.cid);
    await pausa(PAUSA_PAGINA_MS);
    if (!rPagina.ok || !rPagina.data) {
      const detalle = rPagina.status === HTTP_FORMA_INESPERADA
        ? 'la página contestó algo que el conector no entiende (cambió la forma)'
        : `HTTP ${rPagina.status}`;
      errors.push(`${t.external_id}: ${detalle}`);
      torneosSinPagina.push(t.external_id);
      continue;
    }

    const pagina = parseTorneo(rPagina.data);
    const delFixture = pagina.ruedas.flatMap((r) => r.partidos);
    if (!delFixture.length) {
      resumen.push({ torneo: t.external_id, nombre: t.name, sinFixture: true, posiciones: pagina.posiciones.length });
      continue;
    }

    const { data: yaRaw, error: errYa } = await supabase
      .from('matches')
      .select('id, external_id, home_club_id, away_club_id, date_time, status, score, phase_id, is_visible, season_id, round_label')
      .eq('tournament_id', t.id)
      .limit(3000);
    if (errYa) { errors.push(`${t.external_id}: no se pudieron leer los partidos (${errYa.message})`); continue; }
    const ya = (yaRaw ?? []) as (ExistenteAamh & { is_visible: boolean | null; season_id: string | null })[];
    const porExternalId = new Map(ya.filter((m) => m.external_id).map((m) => [m.external_id!, m]));

    // ── las fichas de la ventana, para la hora y la cancha ──────────────────
    const detalles = new Map<number, DetalleDePartido>();
    if (topeFichas > 0 && Date.now() - arranque < PRESUPUESTO_MS) {
      const candidatos = delFixture.filter((p) => {
        const m = /^(\d{1,2})\/(\d{1,2})$/.exec(p.dia.trim());
        if (!m) return false;
        const dia = `${clave.anio}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        if (dia < desde || dia > hasta) return false;
        // Ya cargado con hora real: no hace falta volver a preguntar.
        const cargado = porExternalId.get(`${AAMH_ID_PREFIX}m${p.mid}`);
        return !cargado?.date_time || cargado.date_time.includes(HORA_DE_RELLENO);
      });

      for (const p of candidatos) {
        if (fichasPedidas >= topeFichas) break;
        const rFicha = await fetchPartido(p.mid);
        fichasPedidas++;
        await pausa(PAUSA_PAGINA_MS);
        if (!rFicha.ok || !rFicha.data) { errors.push(`ficha ${p.mid}: HTTP ${rFicha.status}`); continue; }
        const ficha = parsePartidoDetalle(rFicha.data, p.mid);
        if (!ficha) { errors.push(`ficha ${p.mid}: forma inesperada`); continue; }
        const hora = /\b(\d{1,2}:\d{2})\b/.exec(ficha.fechaHora)?.[1];
        detalles.set(p.mid, {
          ...(hora && { hora }),
          ...(ficha.cancha && { cancha: ficha.cancha }),
        });
      }
    }

    // ── el plan ────────────────────────────────────────────────────────────
    const plan = planAamhMatches({
      anio: clave.anio,
      ruedas: pagina.ruedas,
      resolverClub: resolverDe(ramaDe(t.gender)),
      existentes: ya,
      detalles,
    });

    let faseDelTorneo = ya.find((m) => m.phase_id)?.phase_id ?? null;
    if (!faseDelTorneo) {
      const { data: fases } = await supabase
        .from('tournament_phases')
        .select('id, order_index')
        .eq('tournament_id', t.id)
        .order('order_index', { ascending: true })
        .limit(1);
      faseDelTorneo = (fases as { id: string }[] | null)?.[0]?.id ?? null;
    }
    const visibleEnEsteTorneo = ya.length ? ya.some((m) => m.is_visible === true) : t.is_visible === true;
    const seasonDelTorneo = ya.find((m) => m.season_id)?.season_id ?? t.current_season_id ?? null;

    const { data: partsRaw, error: errParts } = await supabase
      .from('tournament_participants').select('club_id').eq('tournament_id', t.id).limit(2000);
    if (errParts) { errors.push(`${t.external_id}: no se pudieron leer los participantes (${errParts.message})`); continue; }
    const yaParticipan = new Set(((partsRaw ?? []) as { club_id: string }[]).map((p) => p.club_id));

    const fasesTocadas = new Set<string>();
    let creados = 0;
    let actualizados = 0;
    let participantesCreados = 0;

    if (!enSeco) {
      // Un club sin las TRES filas no aparece: participante, entrada de
      // temporada y asignación de fase.
      const faltan = [...plan.clubesInvolucrados].filter((c) => !yaParticipan.has(c));
      if (faltan.length) {
        const { data: nombresRaw } = await supabase.from('clubs').select('id, name').in('id', faltan);
        const nombres = new Map(((nombresRaw ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
        for (const clubId of faltan) {
          const participantId = globalThis.crypto.randomUUID();
          const { error } = await supabase.from('tournament_participants').insert([{
            id: participantId, tournament_id: t.id, season_id: seasonDelTorneo,
            club_id: clubId, name: nombres.get(clubId) ?? clubId, type: 'club', status: 'active',
          }]);
          if (error) { errors.push(`${t.external_id}: no se pudo inscribir a ${clubId} (${error.message})`); continue; }
          if (seasonDelTorneo) {
            const entryId = globalThis.crypto.randomUUID();
            const { error: errEntrada } = await supabase.from('team_season_entries').insert([{
              id: entryId, season_id: seasonDelTorneo, tournament_id: t.id,
              club_id: clubId, team_id: null, source_participant_id: participantId,
              status: 'active', settings: { source: 'aamh-sync' },
            }]);
            if (errEntrada) errors.push(`${t.external_id}: inscripto ${clubId} pero sin entrada de temporada (${errEntrada.message})`);
            else await supabase.from('tournament_participants').update({ season_entry_id: entryId }).eq('id', participantId);
          }
          if (faseDelTorneo) {
            const { error: errFase } = await supabase.from('tournament_phase_participants').insert([{
              id: globalThis.crypto.randomUUID(), tournament_id: t.id, season_id: seasonDelTorneo,
              phase_id: faseDelTorneo, participant_id: participantId, group_id: null, status: 'active',
            }]);
            if (errFase) errors.push(`${t.external_id}: inscripto ${clubId} pero sin asignación de fase (${errFase.message})`);
          }
          participantesCreados++;
          if (faseDelTorneo) fasesTocadas.add(faseDelTorneo);
        }
      }

      for (const alta of plan.crear) {
        const { error } = await supabase.from('matches').insert([{
          ...alta,
          tournament_id: t.id,
          sport_id: 'field-hockey',
          is_visible: visibleEnEsteTorneo,
          phase_id: faseDelTorneo,
          season_id: seasonDelTorneo,
        }]);
        if (error) { errors.push(`${alta.external_id}: alta falló (${error.message})`); continue; }
        creados++;
        if (alta.status === 'final' && faseDelTorneo) fasesTocadas.add(faseDelTorneo);
      }

      for (const cambio of plan.actualizar) {
        const { error } = await supabase.from('matches').update(cambio.patch).eq('id', cambio.id);
        if (error) { errors.push(`${t.external_id} ${cambio.id}: update falló (${error.message})`); continue; }
        actualizados++;
        if ('score' in cambio.patch && cambio.phase_id) fasesTocadas.add(cambio.phase_id);
      }

      if (fasesTocadas.size) {
        const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
        for (const fase of fasesTocadas) {
          const r = await recalculatePhaseStandingsScopes(t.id, fase, 'general');
          if (!r.ok) errors.push(`${t.external_id}: recálculo de la fase ${fase} falló`);
        }
      }
      escrituras += creados + actualizados + participantesCreados;
    }

    const omitidosUnicos = [...new Map(plan.omitidos.map((o) => [`${o.motivo}|${o.detalle}`, o])).values()];
    resumen.push({
      torneo: t.external_id,
      nombre: t.name,
      enElSitio: pagina.titulo,
      partidosEnFixture: delFixture.length,
      fichasLeidas: detalles.size,
      crear: enSeco ? plan.crear.length : creados,
      actualizar: enSeco ? plan.actualizar.length : actualizados,
      participantesNuevos: participantesCreados,
      sinCambios: plan.sinCambios,
      omitidos: omitidosUnicos,
      ...(enSeco && {
        detalleCrear: plan.crear.slice(0, 20).map((a) => `${a.external_id} → ${a.status} ${a.date_time}${a.score ? ` ${a.score.home}-${a.score.away}` : ''}`),
        detalleActualizar: plan.actualizar.slice(0, 20).map((c) => ({ id: c.id, cambios: c.cambios })),
      }),
    });
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
    anio: anioPedido,
    // Cuantos de los del anio se miraron y por que: sin esto no hay forma de
    // saber si un torneo quedo sin sincronizar o es que no tenia novedades.
    seleccion: {
      delAnio: delAnio.length,
      mirados: objetivos.length,
      porActividad,
      porRotacion,
      ...(sinTiempo.length && { sinTiempoEnEstaCorrida: sinTiempo }),
    },
    duracionMs: Date.now() - arranque,
    fichasPedidas,
    torneos: resumen,
    torneosSinPagina,
    errors,
  });
}
