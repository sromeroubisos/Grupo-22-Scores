/**
 * Sync de la AAHBA desde tournamenttracker.buenosaireshockey.ar.
 *
 *   GET /api/cron/aahba-sync                 corrida normal
 *   GET /api/cron/aahba-sync?dry=1           plan sin escribir
 *   GET /api/cron/aahba-sync?torneo=00000401 un solo torneo
 *
 * El ciclo, por torneo con `external_id = 'aahba:{año}:{torneoId}'`: se pide
 * `/torneos/{id}`, que trae el fixture ENTERO con marcadores en un solo
 * pedido, y `planAahbaMatches` decide adopciones, altas y actualizaciones.
 * Un torneo = un request, así que los dos Metropolitanos entran holgados en
 * los 60 s de la función; el presupuesto igual está puesto porque el día que
 * se sumen las veinte divisiones de Damas va a hacer falta.
 *
 * Las posiciones NO se copian: el tracker publica su tabla, pero la nuestra la
 * recalcula el proyecto con el sistema de puntos del torneo. Escribir partidos
 * por fuera del gestor deja `tournament_standings` con la foto vieja, así que
 * al final de cada torneo tocado se llama a `recalculatePhaseStandingsScopes`.
 *
 * Todo lo que no se entendió viaja en la respuesta: `omitidos`, `correcciones`,
 * `sinPresentacion`, `errors`. Un equipo que no resuelve es una fila en
 * `club_external_ids`, no un deploy.
 */
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchTorneo, partidosDe, pausa, PAUSA_MS, HTTP_FORMA_INESPERADA } from '@/lib/integrations/aahba/client.ts';
import { planAahbaMatches, type ExistenteAahba } from '@/lib/integrations/aahba/planMatches.ts';
import {
  AAHBA_ID_PREFIX,
  AAHBA_PROVIDER,
  parseTournamentExternalId,
} from '@/lib/integrations/aahba/nombres.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Cuándo dejar de empezar torneos nuevos: el techo de la función son 60 s. */
const PRESUPUESTO_MS = 45_000;
/** Filas por `upsert`. Ver el comentario del lote, más abajo. */
const LOTE = 100;

interface TorneoFila {
  id: string;
  name: string;
  external_id: string;
  is_visible: boolean | null;
  current_season_id: string | null;
}

export async function GET(req: Request) {
  if (!(await authorizeCronRequest(req, 'aahba-sync'))) {
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
    .select('id, name, external_id, is_visible, current_season_id')
    .like('external_id', `${AAHBA_ID_PREFIX}%`);
  if (errTorneos) {
    return NextResponse.json({ error: `No se pudieron leer los torneos (${errTorneos.message})` }, { status: 500 });
  }
  let torneos = (torneosRaw ?? []) as TorneoFila[];
  if (soloTorneo) torneos = torneos.filter((t) => t.external_id.endsWith(`:${soloTorneo}`));
  if (!torneos.length) {
    return NextResponse.json({
      ok: false,
      error: soloTorneo
        ? `Ningún torneo tiene external_id aahba:*:${soloTorneo}`
        : 'Ningún torneo tiene external_id aahba:. Hay que marcarlos antes de que el cron sirva de algo.',
    }, { status: 200 });
  }

  const { data: aliasRaw, error: errAlias } = await supabase
    .from('club_external_ids')
    .select('external_id, club_id')
    .eq('provider', AAHBA_PROVIDER)
    .limit(2000);
  if (errAlias) {
    return NextResponse.json({ error: `No se pudieron leer los alias (${errAlias.message})` }, { status: 500 });
  }
  const alias = new Map(((aliasRaw ?? []) as { external_id: string; club_id: string }[]).map((a) => [a.external_id, a.club_id]));

  const resumen: unknown[] = [];
  let escrituras = 0;

  for (const t of torneos) {
    if (Date.now() - arranque > PRESUPUESTO_MS) {
      resumen.push({ torneo: t.external_id, saltado: 'sin presupuesto de tiempo en esta corrida' });
      continue;
    }
    const clave = parseTournamentExternalId(t.external_id);
    if (!clave) { errors.push(`${t.external_id}: external_id con forma desconocida`); continue; }

    const r = await fetchTorneo(clave.torneoId);
    await pausa(PAUSA_MS);
    if (!r.ok || !r.data) {
      const detalle = r.status === HTTP_FORMA_INESPERADA
        ? 'el tracker contestó algo que el conector no entiende (cambió la forma o el torneo no existe)'
        : `HTTP ${r.status}`;
      errors.push(`${t.external_id}: ${detalle}`);
      continue;
    }
    const partidos = partidosDe(r.data);

    const { data: yaRaw, error: errYa } = await supabase
      .from('matches')
      .select('id, external_id, home_club_id, away_club_id, date_time, status, score, phase_id, round_label, venue, referee, is_visible, season_id, home_base_points, away_base_points, points_autocalculated')
      .eq('tournament_id', t.id)
      .limit(2000);
    if (errYa) { errors.push(`${t.external_id}: no se pudieron leer los partidos (${errYa.message})`); continue; }
    const ya = (yaRaw ?? []) as (ExistenteAahba & {
      is_visible: boolean | null;
      season_id: string | null;
      home_base_points: number | null;
      away_base_points: number | null;
      points_autocalculated: boolean | null;
    })[];

    // El alcance del alias es el torneo de la fuente: ver `nombres.ts`.
    const resolver = (claveNombre: string) => alias.get(`${clave.torneoId}|${claveNombre}`) ?? null;

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

    const plan = planAahbaMatches({ partidos, resolverClub: resolver, existentes: ya, ahora });

    const fasesTocadas = new Set<string>();
    let creados = 0;
    let actualizados = 0;

    if (!enSeco) {
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

      // Las actualizaciones van en LOTES, no de a una. Está medido: la primera
      // corrida adopta los 182 partidos del torneo y un update por fila son
      // 182 idas y vueltas de ~250 ms, o sea ~45 s por torneo — el segundo
      // torneo se quedaba sin presupuesto y la función se comía los 60 s de
      // Vercel. Con `upsert` por clave primaria son tres pedidos.
      //
      // El upsert manda SIEMPRE las mismas columnas para todas las filas del
      // lote, completando con el valor que la fila ya tiene lo que este plan no
      // cambia. Si se mandara solo el parche, PostgREST toma la unión de las
      // claves del lote y las filas a las que les falta una la reciben en NULL:
      // una fila que solo cambiaba de cancha se llevaría puesto el marcador.
      const porId = new Map(ya.map((m) => [m.id, m]));
      for (let i = 0; i < plan.actualizar.length; i += LOTE) {
        const trozo = plan.actualizar.slice(i, i + LOTE);
        const filas = trozo.map((c) => {
          const v = porId.get(c.id);
          return {
            id: c.id,
            external_id: v?.external_id ?? null,
            status: v?.status ?? null,
            score: v?.score ?? null,
            date_time: v?.date_time ?? null,
            round_label: v?.round_label ?? null,
            venue: v?.venue ?? null,
            referee: v?.referee ?? null,
            home_base_points: v?.home_base_points ?? 0,
            away_base_points: v?.away_base_points ?? 0,
            points_autocalculated: v?.points_autocalculated ?? false,
            ...c.patch,
          };
        });
        const { error } = await supabase.from('matches').upsert(filas, { onConflict: 'id' });
        if (error) { errors.push(`${t.external_id}: lote de ${filas.length} falló (${error.message})`); continue; }
        actualizados += filas.length;
        for (const c of trozo) {
          // Un cambio de estado también mueve la tabla: un partido que pasa a
          // postergado deja de sumar los puntos que sumaba como final.
          if (('score' in c.patch || 'status' in c.patch) && c.phase_id) fasesTocadas.add(c.phase_id);
        }
      }

      if (fasesTocadas.size) {
        const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
        for (const fase of fasesTocadas) {
          const res = await recalculatePhaseStandingsScopes(t.id, fase, 'general', seasonDelTorneo ?? undefined);
          if (!res.ok) errors.push(`${t.external_id}: recálculo de la fase ${fase} falló`);
        }
      }
      escrituras += creados + actualizados;
    }

    resumen.push({
      torneo: t.external_id,
      nombre: t.name,
      ultimaActualizacionFuente: r.data.ultimaActualizacion,
      partidosEnLaFuente: partidos.length,
      crear: enSeco ? plan.crear.length : creados,
      actualizar: enSeco ? plan.actualizar.length : actualizados,
      sinCambios: plan.sinCambios,
      ...(plan.correcciones.length && { correcciones: plan.correcciones }),
      ...(plan.sinPresentacion.length && { sinPresentacion: plan.sinPresentacion }),
      ...(plan.omitidos.length && { omitidos: plan.omitidos }),
      ...(enSeco && {
        detalleActualizar: plan.actualizar.map((c) => ({ id: c.id, cambios: c.cambios })),
        detalleCrear: plan.crear.map((a) => `${a.external_id} ${a.home_club_id} vs ${a.away_club_id} ${a.date_time}`),
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
    ms: Date.now() - arranque,
    torneos: resumen,
    errors,
  });
}
