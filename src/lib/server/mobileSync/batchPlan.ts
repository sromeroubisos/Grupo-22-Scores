/**
 * Plan de una tanda de la app móvil. Archivo PURO (sin Supabase ni Next): se
 * prueba con `node --test`.
 *
 * La regla que importa para la escala: TODO lo de un mismo partido que llega en
 * una tanda (eventos nuevos, editados o borrados, marcador, estado, reloj,
 * alineaciones) sale en UN solo PATCH al Match Center. Cada PATCH recalcula la
 * tabla de posiciones (`recalcAffectedPhases`): 50 eventos cargados sin señal
 * son 1 recálculo, no 50.
 */
import { computeElapsedSeconds, normalizeStoredClock, type MatchClockTransition } from '../../matchClock.ts';
import type { MutationEnvelope } from './protocol.ts';

export type Row = Record<string, unknown>;

/** Columnas del partido → campos que acepta el PATCH del Match Center (`FixtureService.updateMatch`). */
export const MATCH_FIELD_MAP: Record<string, string> = {
  status: 'status',
  score: 'score',
  date_time: 'dateTime',
  venue: 'venue',
  notes: 'notes',
  referee: 'referee',
  official_sheet_number: 'officialSheetNumber',
  round_label: 'roundLabel',
  phase_id: 'phaseId',
  home_club_id: 'homeClubId',
  away_club_id: 'awayClubId',
  // Las alineaciones viajan enteras (`{ home, away }`), como las guarda la pestaña Alineaciones.
  lineups: 'lineups',
  // `clock` NO va por acá: sube como `clockTransition` (ver clockTransitionFor).
};

export function toMatchBody(fields: Row): Row {
  const body: Row = {};
  for (const [column, value] of Object.entries(fields)) if (MATCH_FIELD_MAP[column]) body[MATCH_FIELD_MAP[column]] = value;
  return body;
}

/**
 * El reloj del celular → la transición que entiende G22. Se manda el estado
 * ACTUAL como `set`, calculado con la hora DEL CELULAR (`sentAt`): el ancla del
 * reloj también la puso el celular, así un desfase de hora no corre el reloj.
 */
export function clockTransitionFor(rawClock: unknown, clientNowMs: number): MatchClockTransition {
  const clock = normalizeStoredClock(rawClock);
  return { mode: 'set', seconds: computeElapsedSeconds(clock, clientNowMs), running: clock.is_running, period: clock.period };
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value));
const asRecord = (value: unknown): Row => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {});

/** Fila de `match_events` → evento del Match Center (lo que espera `eventPatch.upsert`). Misma regla que la app. */
export function toMatchCenterEvent(row: Row, match: Row | null): Row {
  const details = asRecord(row.details);
  const clubId = text(row.club_id);
  const teamFromDetails = details.team === 'home' || details.team === 'away' ? details.team : null;
  const team =
    clubId && clubId === text(match?.home_club_id) ? 'home' : clubId && clubId === text(match?.away_club_id) ? 'away' : teamFromDetails;
  const period = text(details.period);
  const order = details.order !== null && details.order !== undefined && Number.isFinite(Number(details.order)) ? Number(details.order) : null;
  return {
    id: row.id,
    type: text(row.event_type) || 'note',
    team,
    minute: Number.isFinite(Number(row.minute)) ? Number(row.minute) : 0,
    detail: text(details.detail),
    playerId: text(row.player_id) || text(details.playerId) || null,
    playerName: text(row.player_name) || text(details.playerName),
    secondaryPlayerId: text(details.secondaryPlayerId) || null,
    secondaryPlayerName: text(details.secondaryPlayerName),
    ...(period ? { period } : {}),
    ...(order !== null ? { order } : {}),
  };
}

export interface MatchGroup {
  matchId: string;
  /** Cambio de campos del partido (marcador, estado, reloj, alineaciones…). */
  matchUpdate: MutationEnvelope | null;
  events: MutationEnvelope[];
}

export interface BatchPlan {
  groups: MatchGroup[];
  /** Lo que no se agrupa (altas y bajas de partidos, torneos, clubes, jugadores…), en el orden recibido. */
  singles: MutationEnvelope[];
}

/**
 * Agrupa por partido. `eventMatchId` dice a qué partido pertenece un evento
 * (del payload o de la fila central); si no se sabe, el evento va suelto y se
 * rechaza o reintenta solo.
 */
export function planBatch(mutations: MutationEnvelope[], eventMatchId: (mutation: MutationEnvelope) => string | null): BatchPlan {
  const groups = new Map<string, MatchGroup>();
  const singles: MutationEnvelope[] = [];
  const groupFor = (matchId: string) => {
    let group = groups.get(matchId);
    if (!group) {
      group = { matchId, matchUpdate: null, events: [] };
      groups.set(matchId, group);
    }
    return group;
  };
  for (const mutation of mutations) {
    if (mutation.entity === 'match_events') {
      const matchId = eventMatchId(mutation);
      if (matchId) {
        groupFor(matchId).events.push(mutation);
        continue;
      }
    } else if (mutation.entity === 'matches' && mutation.op === 'update') {
      const group = groupFor(mutation.recordId);
      if (!group.matchUpdate) {
        group.matchUpdate = mutation;
        continue;
      }
    }
    singles.push(mutation);
  }
  return { groups: [...groups.values()], singles };
}

export type EventAction =
  /** El alta ya había llegado (el id lo generó el celular y G22 lo conserva). */
  | { kind: 'duplicate' }
  /** Borrar algo que ya no está: éxito sin escribir. */
  | { kind: 'gone' }
  | { kind: 'upsert'; event: Row }
  | { kind: 'delete'; id: string };

export function decideEvent(mutation: MutationEnvelope, central: Row | null, match: Row | null): EventAction {
  if (mutation.op === 'delete') return central ? { kind: 'delete', id: String(central.id) } : { kind: 'gone' };
  if (mutation.op === 'insert' && central) return { kind: 'duplicate' };
  const row = { ...(central ?? {}), ...mutation.payload, id: mutation.recordId };
  return { kind: 'upsert', event: toMatchCenterEvent(row, match) };
}

/**
 * Cuánto le pide el servidor a la app para la próxima tanda, según lo que tardó
 * esta. La app nunca manda más de `maxBatch` y espera `retryAfterMs` si viene.
 */
export function serverHints(durationMs: number): { maxBatch: number; retryAfterMs?: number } {
  if (durationMs > 20_000) return { maxBatch: 10, retryAfterMs: 5_000 };
  if (durationMs > 8_000) return { maxBatch: 20 };
  return { maxBatch: 50 };
}
