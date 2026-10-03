/**
 * GET /api/cron/urba-vivo
 *
 * Sigue EN VIVO el Top 14 de la URBA desde DataFactory (el proveedor de los
 * widgets de ESPN) y copia a la base marcador, tries, estado, reloj y eventos de
 * puntos con autor. URBA no publica marcador en vivo: `urba-sync` trae el
 * resultado oficial cuando lo cargan, y si difiere, manda URBA.
 *
 * Corre cada 2 minutos los fines de semana (ver `vercel.json`), pero lo primero
 * que hace es mirar la base: si no hay partido del torneo en la ventana
 * [horario - 20 min, horario + 4 h] sin terminar, contesta sin salir a la red.
 *
 *   ?dry=1   reporta lo que haria sin escribir una sola fila
 *
 * Autenticacion: header Bearer {CRON_SECRET}.
 *
 * Los partidos se emparejan con la fuente por fecha + local + visitante, con la
 * tabla `CLUBES` de abajo. Cada corrida REEMPLAZA la lista entera de eventos, asi
 * que si la mesa borra un evento mal cargado, se borra aca tambien. Y frena ante
 * un salto de marcador que los eventos no explican (la mesa cargando basura):
 * no escribe y lo reporta.
 */
import { NextRequest, NextResponse } from 'next/server';
import { estadoNuestro, leerAgendaDataFactory, leerPartidoDataFactory } from '@/lib/integrations/datafactory/vivo';
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { invalidateMatchesFeedCaches } from '@/lib/server/matchesFeedInvalidation';
import { recalculatePhaseStandingsScopes } from '@/lib/server/recalculateStandings';
import { persistMatchCenterSupplementalData } from '@/lib/services/matchCenterService';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CANAL = 'urba';
/** URBA Top 14 Copa Macro. */
const TORNEOS = ['d29703d0-125c-44a1-ab38-137450935a6e'];

/**
 * Id nuestro -> id de club en DataFactory. Medido el 2026-10-03 cruzando los
 * marcadores de la Fecha 23 contra los equipos de cada partido. Si el Top 14
 * cambia de integrantes, el club que falte aca sale en `sinEmparejar`.
 */
const CLUBES: Record<string, number> = {
  'los-tilos': 369,
  cuba: 370,
  'club-champagnat': 372,
  'la-plata': 373,
  'club-newman': 374,
  casi: 376,
  'regatas-de-bella-vista': 377,
  'asoc-alumni': 379,
  'hindu-club': 380,
  'san-isidro-club': 383,
  'belgrano-athletic': 384,
  'los-matreros': 387,
  'atletico-del-rosario': 390,
  'buenos-aires-crc': 413,
};

const ANTES_MS = 20 * 60_000;
const DESPUES_MS = 4 * 3600_000;
/** Un salto mayor a esto que los eventos no explican no se escribe. */
const SALTO_SOSPECHOSO = 21;

const fechaFuente = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso)).replace(/-/g, '');

type Fila = {
  id: string; date_time: string; status: string; tournament_id: string;
  home_club_id: string | null; away_club_id: string | null;
  score: Record<string, unknown> | null; events_count: number | null;
};

export async function GET(request: NextRequest) {
  if (!(await authorizeCronRequest(request, 'urba-vivo'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const enSeco = new URL(request.url).searchParams.get('dry') === '1';
  const db = createAdminClient();
  const ahora = Date.now();

  const { data, error } = await db
    .from('matches')
    .select('id, date_time, status, tournament_id, home_club_id, away_club_id, score, events_count')
    .in('tournament_id', TORNEOS)
    .in('status', ['scheduled', 'live'])
    .gte('date_time', new Date(ahora - DESPUES_MS).toISOString())
    .lte('date_time', new Date(ahora + ANTES_MS).toISOString());
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const filas = (data ?? []) as Fila[];
  if (!filas.length) return NextResponse.json({ ok: true, enSeco, partidos: 0 });

  let agenda: Map<string, string>;
  try {
    agenda = await leerAgendaDataFactory(CANAL);
  } catch (err) {
    return NextResponse.json({ ok: false, error: `agenda: ${(err as Error).message}` }, { status: 502 });
  }

  const reporte: Record<string, unknown>[] = [];
  const torneosTerminados = new Set<string>();
  let escribio = false;

  for (const fila of filas) {
    const local = CLUBES[fila.home_club_id ?? ''];
    const visita = CLUBES[fila.away_club_id ?? ''];
    const idFuente = local && visita ? agenda.get(`${fechaFuente(fila.date_time)}|${local}|${visita}`) : undefined;
    if (!idFuente) {
      reporte.push({ id: fila.id, sinEmparejar: `${fila.home_club_id} vs ${fila.away_club_id}` });
      continue;
    }

    try {
      const f = await leerPartidoDataFactory(CANAL, idFuente);
      const estado = estadoNuestro(f.statusId);
      const cierra = f.suma.home === f.marcador.home && f.suma.away === f.marcador.away;
      const previo = { home: Number(fila.score?.home) || 0, away: Number(fila.score?.away) || 0 };
      const salto = (f.marcador.home - previo.home) + (f.marcador.away - previo.away);
      const cambio = estado !== fila.status
        || f.marcador.home !== previo.home || f.marcador.away !== previo.away
        || f.eventos.length !== (fila.events_count ?? 0);

      const linea: Record<string, unknown> = {
        id: fila.id, fuente: idFuente, partido: f.rotulo, estadoFuente: f.estadoFuente,
        minuto: f.reloj.minute, eventos: f.eventos.length,
      };
      if (!cierra) linea.aviso = `los eventos suman ${f.suma.home}-${f.suma.away}`;
      if (f.desconocidos.length) linea.tiposSinMapear = [...new Set(f.desconocidos)];
      reporte.push(linea);

      if (!estado) continue;
      if (!cierra && salto > SALTO_SOSPECHOSO) {
        linea.freno = `+${salto} puntos de golpe sin eventos que lo expliquen`;
        continue;
      }
      linea.escribe = cambio ? estado : estado === 'live' ? 'reloj' : 'nada';
      if (enSeco) continue;

      if (cambio || estado === 'live') {
        await persistMatchCenterSupplementalData(db as never, fila.id, {
          ...(cambio ? { events: f.eventos } : {}),
          ...(estado === 'live'
            ? { clock: { ...f.reloj, is_running: f.reloj.running, syncedAt: new Date().toISOString() } }
            : {}),
        } as never);
      }
      if (cambio) {
        const score = {
          ...(fila.score ?? {}),
          home: f.marcador.home, away: f.marcador.away,
          homeTries: f.suma.homeTries, awayTries: f.suma.awayTries,
        };
        const { error: e2 } = await db.from('matches')
          .update({ score, status: estado, events_count: f.eventos.length, ...(estado === 'final' ? { clock: null } : {}) })
          .eq('id', fila.id);
        if (e2) throw new Error(e2.message);
        escribio = true;
        if (estado === 'final') torneosTerminados.add(fila.tournament_id);
      }
    } catch (err) {
      reporte.push({ id: fila.id, fuente: idFuente, error: (err as Error).message });
    }
  }

  // Escribir por fuera del gestor no rehace `tournament_standings`.
  const tablas: Record<string, unknown>[] = [];
  for (const torneo of torneosTerminados) {
    const { data: fases } = await db.from('tournament_phases').select('id, name, season_id').eq('tournament_id', torneo);
    for (const fase of (fases ?? []) as { id: string; name: string; season_id: string | null }[]) {
      const r = await recalculatePhaseStandingsScopes(torneo, fase.id, 'general', fase.season_id ?? null);
      tablas.push({ fase: fase.name, ok: r.ok, filas: r.rows_calculated });
    }
  }
  if (escribio) {
    try { await invalidateMatchesFeedCaches(db); } catch { /* la cache vence sola */ }
  }

  return NextResponse.json({ ok: true, enSeco, partidos: filas.length, reporte, tablas });
}
