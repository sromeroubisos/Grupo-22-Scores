/**
 * Sigue EN VIVO partidos que publica DataFactory (el proveedor de los widgets de
 * ESPN) y los copia a nuestra base: marcador, tries, estado, reloj y eventos de
 * puntos con autor. Hoy cubre el Top 14 de la URBA (canal `urba`).
 *
 *   TS_NODE_TRANSPILE_ONLY=true \
 *   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","noEmit":false}' \
 *   node -r ts-node/register -r tsconfig-paths/register \
 *     src/scripts/vivo-datafactory.ts <nuestroId>=<idFuente> [...] [--canal=urba] [--plan] [--once] [--cada=60]
 *
 * La fuente es un JSON estatico por partido, sin token:
 *   espn.datafactory.la/html/v3/htmlCenter/data/deportes/rugby/<canal>/events/<id>.mam.json
 * Los ids de una fecha salen de `.../rugby/<canal>/agendaMaM/es/agenda.json`.
 *
 * Codigos de `incidences.points`, medidos sobre los 7 partidos de la Fecha 23
 * (cierran exactos contra el marcador): 120 try, 125 conversion, 121 penal,
 * 146 try penal. Los minutos de los eventos son ABSOLUTOS (el 2T arranca en 41);
 * `status.currentMinutes` en cambio reinicia en cada tiempo.
 *
 * Igual que `vivo-rugbyproscore.ts`: cada vuelta REEMPLAZA la lista entera de
 * eventos, asi que reiniciarlo no duplica nada. Ademas frena ante un salto de
 * marcador que los eventos no explican (la mesa cargando basura): no escribe y
 * avisa, hasta que la fuente vuelva a cerrar.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();

const envFile = path.join(REPO, '.env.local');
if (fs.existsSync(envFile)) {
  for (const linea of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

{
  const Module = require('node:module') as typeof import('node:module') & {
    _load: (request: string, ...rest: unknown[]) => unknown;
  };
  const cargar = Module._load;
  Module._load = function (request: string, ...rest: unknown[]) {
    if (request === 'server-only' || request === 'client-only') return {};
    return cargar.call(this, request, ...rest);
  };
}

const BASE = 'https://espn.datafactory.la/html/v3/htmlCenter/data/deportes/rugby';
const MINUTOS_PRIMER_TIEMPO = 40;
/** Un salto mayor entre dos vueltas que los eventos no explican no se escribe. */
const SALTO_SOSPECHOSO = 21;

const TIPO: Record<number, string> = { 120: 'try', 125: 'conversion', 121: 'penalty', 146: 'penalty_try' };
const PUNTOS: Record<string, number> = { try: 5, penalty_try: 7, conversion: 2, penalty: 3, drop_goal: 3 };

type Incidencia = { type: number; t: { half: number; m: number; s: number }; team: number; plyrName?: string };
type Fuente = {
  match: { homeTeamId: number; awayTeamId: number; homeTeamName: string; awayTeamName: string; gmt?: number };
  status: {
    value: string; statusId: number; clockStatus?: string; currentPeriod?: number; currentMinutes?: number;
    startHour?: number | null; startMinute?: number | null; startSecond?: number | null;
  };
  scoreStatus: Record<string, { score: number | null }>;
  incidences?: { points?: Record<string, Incidencia> };
};

/** Segundos corridos del tiempo actual desde la hora de arranque del periodo (hora local de la fuente). */
function segundosDelPeriodo(st: Fuente['status'], gmt: number) {
  const h = Number(st.startHour), m = Number(st.startMinute), seg = Number(st.startSecond ?? 0) || 0;
  if (st.startHour == null || st.startMinute == null || !Number.isFinite(h) || !Number.isFinite(m)) return null;
  const ahora = new Date(Date.now() + (Number(gmt) || -3) * 3600_000);
  const s = (ahora.getUTCHours() * 3600 + ahora.getUTCMinutes() * 60 + ahora.getUTCSeconds()) - (h * 3600 + m * 60 + seg);
  return s >= 0 && s < 70 * 60 ? s : null;
}

async function leerFuente(canal: string, idFuente: string) {
  const r = await fetch(`${BASE}/${canal}/events/${idFuente}.mam.json?_=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = (await r.json()) as Fuente;
  const { homeTeamId, awayTeamId } = j.match;
  const desconocidos: number[] = [];

  const lista = Object.entries(j.incidences?.points ?? {})
    .map(([id, e]) => {
      const periodo = e.t.half === 2 ? '2T' : '1T';
      // Absolutos en la fuente; si alguno viniera reiniciado, se corre al 2T.
      const minuto = periodo === '2T' && e.t.m < MINUTOS_PRIMER_TIEMPO ? e.t.m + MINUTOS_PRIMER_TIEMPO : e.t.m;
      return { id, e, periodo, minuto };
    })
    .sort((a, b) => a.e.t.half - b.e.t.half || a.minuto - b.minuto || a.e.t.s - b.e.t.s || a.id.localeCompare(b.id))
    .flatMap(({ e, periodo, minuto }) => {
      const tipo = TIPO[e.type];
      if (!tipo) { desconocidos.push(e.type); return []; }
      return [{
        minute: minuto,
        period: periodo,
        type: tipo,
        team: (e.team === awayTeamId ? 'away' : 'home') as 'home' | 'away',
        playerName: e.plyrName ?? '',
        detail: '',
      }];
    })
    .map((e, order) => ({ ...e, order }));

  const suma = { home: 0, away: 0, homeTries: 0, awayTries: 0 };
  for (const e of lista) {
    suma[e.team] += PUNTOS[e.type] ?? 0;
    if (e.type === 'try' || e.type === 'penalty_try') suma[e.team === 'home' ? 'homeTries' : 'awayTries'] += 1;
  }

  const st = j.status;
  const periodo = st.currentPeriod === 2 ? '2T' : '1T';
  const corriendo = (st.statusId === 1 || st.statusId === 6) && st.clockStatus !== 'stop';
  const enVivo = corriendo ? segundosDelPeriodo(st, j.match.gmt ?? -3) : null;
  const segundos = enVivo ?? (st.currentMinutes ?? 0) * 60;
  const marcador = {
    home: Number(j.scoreStatus[homeTeamId]?.score) || 0,
    away: Number(j.scoreStatus[awayTeamId]?.score) || 0,
  };

  return {
    statusId: st.statusId,
    estadoFuente: st.value,
    marcador,
    suma,
    eventos: lista,
    desconocidos,
    reloj: {
      minute: Math.floor(segundos / 60) + (periodo === '2T' ? MINUTOS_PRIMER_TIEMPO : 0),
      seconds: Math.floor(segundos % 60),
      period: periodo,
      running: corriendo,
    },
    rotulo: `${j.match.homeTeamName} ${marcador.home}-${marcador.away} ${j.match.awayTeamName}`,
  };
}

/**
 * 0 programado -> no se toca; 1 primer tiempo, 5 entretiempo, 6 segundo tiempo -> live;
 * 2 finalizado -> final. Otro (suspendido...) se avisa y no se escribe.
 * Medido el 2026-10-03: el 5 y el 6 no son "otro estado", son el MISMO partido en juego.
 */
const EN_JUEGO = new Set([1, 5, 6]);
function estadoNuestro(statusId: number) {
  if (EN_JUEGO.has(statusId)) return 'live';
  if (statusId === 2) return 'final';
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const pares = args.filter((a) => a.includes('=') && !a.startsWith('--')).map((a) => a.split('=') as [string, string]);
  const plan = args.includes('--plan');
  const once = args.includes('--once');
  const cada = Number(args.find((a) => a.startsWith('--cada='))?.split('=')[1]) || 60;
  const canal = args.find((a) => a.startsWith('--canal='))?.split('=')[1] || 'urba';
  if (!pares.length) {
    console.error('uso: vivo-datafactory.ts <nuestroId>=<idFuente> [...] [--canal=urba] [--plan] [--once] [--cada=60]');
    process.exit(2);
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { persistMatchCenterSupplementalData } = await import('@/lib/services/matchCenterService');
  const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
  const db = createAdminClient();

  /** Escribir por fuera del gestor no rehace `tournament_standings`. */
  async function recalcularTabla(matchId: string) {
    const { data: fila } = await db.from('matches').select('tournament_id').eq('id', matchId).single();
    const torneo = (fila as { tournament_id?: string } | null)?.tournament_id;
    if (!torneo) return;
    const { data: fases } = await db.from('tournament_phases').select('id, name, season_id').eq('tournament_id', torneo);
    for (const fase of (fases ?? []) as { id: string; name: string; season_id: string | null }[]) {
      const r = await recalculatePhaseStandingsScopes(torneo, fase.id, 'general', fase.season_id ?? null);
      console.log(`         tabla ${fase.name}: ${r.ok ? 'ok' : 'FALLÓ'} · ${r.rows_calculated} filas`);
    }
  }

  const huella = new Map<string, string>();
  const escrito = new Map<string, { home: number; away: number }>();
  const terminados = new Set<string>();

  for (;;) {
    const hora = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date());

    for (const [nuestroId, idFuente] of pares) {
      if (terminados.has(nuestroId)) continue;
      try {
        const f = await leerFuente(canal, idFuente);
        const estado = estadoNuestro(f.statusId);
        const firma = JSON.stringify([f.statusId, f.marcador, f.eventos]);
        const cambio = huella.get(nuestroId) !== firma;
        const cierra = f.suma.home === f.marcador.home && f.suma.away === f.marcador.away;

        if (cambio) {
          console.log(`[${hora}] ${f.rotulo} · ${f.estadoFuente} · ${f.reloj.minute}' · ${f.eventos.length} eventos`);
          const ultimo = f.eventos[f.eventos.length - 1];
          if (ultimo) console.log(`         último: ${ultimo.minute}' ${ultimo.team} ${ultimo.type} ${ultimo.playerName || '(sin autor)'}`);
          if (!cierra) console.log(`         AVISO: los eventos suman ${f.suma.home}-${f.suma.away}, la fuente dice ${f.marcador.home}-${f.marcador.away}`);
          if (f.desconocidos.length) console.log(`         AVISO: tipos sin mapear: ${[...new Set(f.desconocidos)].join(', ')}`);
          if (!estado && f.statusId !== 0) console.log(`         AVISO: estado ${f.statusId} (${f.estadoFuente}) sin mapear, no se escribe`);
        }

        const previo = escrito.get(nuestroId) ?? { home: 0, away: 0 };
        const salto = (f.marcador.home - previo.home) + (f.marcador.away - previo.away);
        if (estado && !cierra && salto > SALTO_SOSPECHOSO) {
          if (cambio) console.log(`         FRENO: +${salto} puntos de golpe sin eventos que lo expliquen; no se escribe`);
          huella.set(nuestroId, firma);
          continue;
        }

        if (estado && !plan) {
          // Los eventos se reescriben cuando cambian; el reloj, en cada vuelta mientras corre.
          if (cambio || estado === 'live') {
            await persistMatchCenterSupplementalData(db as never, nuestroId, {
              ...(cambio ? { events: f.eventos } : {}),
              ...(estado === 'live'
                ? { clock: { ...f.reloj, is_running: f.reloj.running, syncedAt: new Date().toISOString() } }
                : {}),
            } as never);
          }
          if (cambio) {
            const { data: fila, error } = await db.from('matches').select('score').eq('id', nuestroId).single();
            if (error) throw new Error(error.message);
            const score = {
              ...((fila?.score ?? {}) as Record<string, unknown>),
              home: f.marcador.home, away: f.marcador.away,
              homeTries: f.suma.homeTries, awayTries: f.suma.awayTries,
            };
            const { error: e2 } = await db.from('matches')
              .update({ score, status: estado, events_count: f.eventos.length, ...(estado === 'final' ? { clock: null } : {}) })
              .eq('id', nuestroId);
            if (e2) throw new Error(e2.message);
            escrito.set(nuestroId, f.marcador);
          }
        }

        huella.set(nuestroId, firma);
        if (estado === 'final') {
          terminados.add(nuestroId);
          console.log(`[${hora}] FINAL ${f.rotulo}`);
          if (!plan) await recalcularTabla(nuestroId);
        }
      } catch (err) {
        console.log(`[${hora}] ERROR ${nuestroId}: ${(err as Error).message}`);
      }
    }

    if (once || terminados.size === pares.length) break;
    await new Promise((r) => setTimeout(r, cada * 1000));
  }
  console.log('fin del seguimiento');
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
