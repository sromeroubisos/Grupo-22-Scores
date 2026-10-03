/**
 * Lectura en vivo de DataFactory, el proveedor de los widgets de resultados de
 * ESPN. Publica un JSON estatico por partido, sin token:
 *   espn.datafactory.la/html/v3/htmlCenter/data/deportes/rugby/<canal>/events/<id>.mam.json
 * y la agenda del canal en `.../rugby/<canal>/agendaMaM/es/agenda.json`.
 *
 * Codigos de `incidences.points`, medidos sobre los 7 partidos de la Fecha 23
 * del Top 14 2026 (cierran exactos contra el marcador): 120 try, 125 conversion,
 * 121 penal, 146 try penal. Los minutos de los eventos son ABSOLUTOS (el 2T
 * arranca en 41); `status.currentMinutes`, en cambio, reinicia en cada tiempo.
 */

const BASE = 'https://espn.datafactory.la/html/v3/htmlCenter/data/deportes/rugby';
const MINUTOS_PRIMER_TIEMPO = 40;

const TIPO: Record<number, string> = { 120: 'try', 125: 'conversion', 121: 'penalty', 146: 'penalty_try' };
const PUNTOS: Record<string, number> = { try: 5, penalty_try: 7, conversion: 2, penalty: 3, drop_goal: 3 };

type Incidencia = { type: number; t: { half: number; m: number; s: number }; team: number; plyrName?: string };
type PartidoFuente = {
  match: { homeTeamId: number; awayTeamId: number; homeTeamName: string; awayTeamName: string; gmt?: number };
  status: {
    value: string; statusId: number; clockStatus?: string; currentPeriod?: number; currentMinutes?: number;
    startHour?: number | null; startMinute?: number | null; startSecond?: number | null;
  };
  scoreStatus: Record<string, { score: number | null }>;
  incidences?: { points?: Record<string, Incidencia> };
};

export type EventoVivo = {
  minute: number; period: '1T' | '2T'; type: string; team: 'home' | 'away';
  playerName: string; detail: string; order: number;
};

export type LecturaVivo = {
  statusId: number;
  estadoFuente: string;
  marcador: { home: number; away: number };
  suma: { home: number; away: number; homeTries: number; awayTries: number };
  eventos: EventoVivo[];
  desconocidos: number[];
  reloj: { minute: number; seconds: number; period: '1T' | '2T'; running: boolean };
  rotulo: string;
};

/** 0 programado -> no se toca; 1 en juego -> live; 2 finalizado -> final. Otro (suspendido...) no se escribe. */
export function estadoNuestro(statusId: number): 'live' | 'final' | null {
  if (statusId === 1) return 'live';
  if (statusId === 2) return 'final';
  return null;
}

/** Segundos corridos del tiempo actual desde la hora de arranque del periodo (hora local de la fuente). */
function segundosDelPeriodo(st: PartidoFuente['status'], gmt: number) {
  if (st.startHour == null || st.startMinute == null) return null;
  const ahora = new Date(Date.now() + gmt * 3600_000);
  const s = (ahora.getUTCHours() * 3600 + ahora.getUTCMinutes() * 60 + ahora.getUTCSeconds())
    - (st.startHour * 3600 + st.startMinute * 60 + (st.startSecond ?? 0));
  return s >= 0 && s < 70 * 60 ? s : null;
}

async function pedir<T>(url: string): Promise<T> {
  const r = await fetch(`${url}?_=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

/** Agenda del canal: `fecha|idLocal|idVisitante` -> id del partido en la fuente. */
export async function leerAgendaDataFactory(canal: string) {
  const j = await pedir<{ events?: Record<string, { date: number; teams: { homeTeamId: number; awayTeamId: number } }> }>(
    `${BASE}/${canal}/agendaMaM/es/agenda.json`,
  );
  const agenda = new Map<string, string>();
  for (const [clave, e] of Object.entries(j.events ?? {})) {
    agenda.set(`${e.date}|${e.teams.homeTeamId}|${e.teams.awayTeamId}`, clave.split('.').pop()!);
  }
  return agenda;
}

export async function leerPartidoDataFactory(canal: string, idFuente: string): Promise<LecturaVivo> {
  const j = await pedir<PartidoFuente>(`${BASE}/${canal}/events/${idFuente}.mam.json`);
  const { homeTeamId, awayTeamId } = j.match;
  const desconocidos: number[] = [];

  const eventos = Object.entries(j.incidences?.points ?? {})
    .map(([id, e]) => {
      const periodo: '1T' | '2T' = e.t.half === 2 ? '2T' : '1T';
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
  for (const e of eventos) {
    suma[e.team] += PUNTOS[e.type] ?? 0;
    if (e.type === 'try' || e.type === 'penalty_try') suma[e.team === 'home' ? 'homeTries' : 'awayTries'] += 1;
  }

  const st = j.status;
  const periodo: '1T' | '2T' = st.currentPeriod === 2 ? '2T' : '1T';
  const corriendo = st.statusId === 1 && st.clockStatus !== 'stop';
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
    eventos,
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
