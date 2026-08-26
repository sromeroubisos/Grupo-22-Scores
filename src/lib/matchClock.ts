import {
  getNextActivePeriodAfterEvent,
  normalizeMatchPeriod,
  unpackPeriodSportRef,
  type MatchPeriodRules,
  type PeriodSportRef,
} from './matchPeriods.ts';

/**
 * Reloj de partido DERIVADO.
 *
 * El reloj dejo de ser un snapshot (minute/seconds que alguien incrementa) y
 * paso a ser una funcion del tiempo real:
 *
 *   display = is_running
 *     ? accumulated_seconds + (now - period_started_at)
 *     : accumulated_seconds
 *
 * `period_started_at` lo estampa SIEMPRE el server (la consola se usa desde el
 * celular en la cancha y el reloj del dispositivo no es confiable). El tick de
 * 1s del cliente es solo re-render: la verdad se recalcula contra el ancla, asi
 * que el valor sobrevive a un refresh, al cambio de dispositivo y a la pestana
 * throttleada en background.
 *
 * DECISION A: `accumulated_seconds` es CUMULATIVO DEL PARTIDO, no del periodo.
 * El 2T arranca en el offset del deporte (rugby 2400) y de ahi sigue sumando.
 * Se eligio asi porque el espejo legacy (minute/seconds) que leen la ficha
 * publica y ClubMatchWorkspace sale cumulativo y solo cumulativo: con esta
 * forma esos consumidores siguen correctos sin tocarles una linea.
 */

/* ─── modelo ─── */

export const MATCH_CLOCK_MODES = ['start', 'pause', 'set', 'keep'] as const;
export type MatchClockMode = (typeof MATCH_CLOCK_MODES)[number];

/** Forma persistida en matches.clock (JSONB). Incluye el espejo legacy. */
export interface StoredMatchClock {
  /* modelo derivado: la fuente de verdad */
  period_started_at: string | null;
  accumulated_seconds: number;
  is_running: boolean;
  period: string;
  /** server-only: lo estampa el PATCH. null mientras la transicion es optimista. */
  updated_at: string | null;

  /* espejo legacy: DERIVADO, nunca se lee para calcular */
  minute: number;
  seconds: number;
  running: boolean;
  syncedAt: string | null;
}

/** Intencion declarada por el cliente. El server resuelve los numeros. */
export interface MatchClockTransition {
  mode: MatchClockMode;
  period?: string;
  /** solo para mode='set': el acumulado destino, en segundos */
  seconds?: number;
  /** solo para mode='set': si el reloj queda corriendo. Default: como estaba. */
  running?: boolean;
}

/* ─── tabla por deporte ─── */

export interface SportClockConfig {
  /** secuencia de periodos que el operador puede abrir, en orden */
  periods: string[];
  /** offset CUMULATIVO en segundos al que rebasa el arranque de cada periodo */
  offsets: Record<string, number>;
}

export const DEFAULT_CLOCK_SPORT = 'rugby';

/**
 * La forma { periods, offsets } es a proposito: agregar Q1..Q4 despues es
 * sumar codigos aca (y en matchPeriods.ts), no rearquitectura.
 *
 * hockey = hockey sobre CESPED (sport_id real en DB: 'field-hockey'; 23
 * torneos, 105 partidos). Se juega en 4 CUARTOS de 15' y desde que
 * `matchPeriods` tiene vocabulario de cuartos el reloj los expresa de verdad,
 * en vez de aproximarlos a mitades de 30'. Los eventos vuelven a tener
 * atribucion por cuarto.
 */
const SPORT_CLOCK_CONFIG: Record<string, SportClockConfig> = {
  rugby: {
    periods: ['PRE', '1T', '2T', 'ET', 'FT'],
    // 40' por tiempo. ET colapsa los dos suplementarios en uno solo.
    offsets: { PRE: 0, '1T': 0, HT: 2400, '2T': 2400, ET: 4800, FT: 4800 },
  },
  football: {
    periods: ['PRE', '1T', '2T', 'ET', 'FT'],
    offsets: { PRE: 0, '1T': 0, HT: 2700, '2T': 2700, ET: 5400, FT: 5400 },
  },
  hockey: {
    periods: ['PRE', 'Q1', 'Q2', 'Q3', 'Q4', 'ET', 'FT'],
    // 15' por cuarto, acumulado del partido. '1T' y '2T' SIGUEN en la tabla
    // aunque ya no se ofrezcan: los partidos guardados antes de los cuartos
    // tienen ese periodo en `matches.clock`, y sin la entrada el offset caia a
    // 0 y el reloj retrocedia media hora al abrirlos.
    offsets: {
      PRE: 0,
      Q1: 0,
      Q2: 900,
      HT: 1800,
      Q3: 1800,
      Q4: 2700,
      ET: 3600,
      FT: 3600,
      '1T': 0,
      '2T': 1800,
    },
  },
  /**
   * Cuatro cuartos de 15' (60' reglamentarios). Caia al default de rugby y el
   * reloj rebasaba a 40' en el segundo tiempo de un deporte que no lo tiene.
   *
   * El reloj sigue siendo CUMULATIVO Y ASCENDENTE, como en todos los deportes
   * de la plataforma: Q2 07:34 de la NFL (que cuenta para atras) aca se ve
   * como 22:26. Cambiarlo a cuenta regresiva es una decision de presentacion
   * que toca a todos los consumidores del espejo minute/seconds, no de esta
   * tabla. '1T'/'2T' estan por si algun partido viejo guardo mitades.
   */
  'american-football': {
    periods: ['PRE', 'Q1', 'Q2', 'Q3', 'Q4', 'ET', 'FT'],
    offsets: {
      PRE: 0,
      Q1: 0,
      Q2: 900,
      HT: 1800,
      Q3: 1800,
      Q4: 2700,
      ET: 3600,
      FT: 3600,
      '1T': 0,
      '2T': 1800,
    },
  },
};

/** Mismos buckets que normalizeSportBucket de matchEventCatalog. */
export function normalizeClockSportBucket(sportId?: string | null) {
  const normalized = String(sportId || '').trim().toLowerCase();

  if (!normalized) return DEFAULT_CLOCK_SPORT;
  if (['rugby', 'rugby-union', 'rugby-league', 'rugby7s', 'rugby-7s'].includes(normalized)) return 'rugby';
  if (['football', 'futsal', 'beach-soccer'].includes(normalized)) return 'football';
  if (['hockey', 'field-hockey'].includes(normalized)) return 'hockey';
  if (normalized === 'american-football') return 'american-football';

  return DEFAULT_CLOCK_SPORT;
}

/**
 * Reloj derivado de las reglas de periodo del torneo (futbol americano). Los
 * offsets son cumulativos como en todas las tablas de arriba; '1T'/'2T' se
 * conservan por si un partido viejo guardo mitades.
 */
export function buildClockConfigFromPeriodRules(rules: MatchPeriodRules): SportClockConfig {
  const period = Math.max(1, Math.trunc(rules.periodDurationMinutes)) * 60;
  if (rules.periods === 4) {
    return {
      periods: ['PRE', 'Q1', 'Q2', 'Q3', 'Q4', 'ET', 'FT'],
      offsets: {
        PRE: 0,
        Q1: 0,
        Q2: period,
        HT: period * 2,
        Q3: period * 2,
        Q4: period * 3,
        ET: period * 4,
        FT: period * 4,
        '1T': 0,
        '2T': period * 2,
      },
    };
  }
  return {
    periods: ['PRE', '1T', '2T', 'ET', 'FT'],
    offsets: { PRE: 0, '1T': 0, HT: period, '2T': period, ET: period * 2, FT: period * 2 },
  };
}

export function getSportClockConfig(ref?: PeriodSportRef): SportClockConfig {
  const { sportId, periodRules } = unpackPeriodSportRef(ref);
  if (periodRules) return buildClockConfigFromPeriodRules(periodRules);
  return SPORT_CLOCK_CONFIG[normalizeClockSportBucket(sportId)] ?? SPORT_CLOCK_CONFIG[DEFAULT_CLOCK_SPORT];
}

/** Offset cumulativo al que rebasa el arranque de `period`. */
export function getPeriodOffsetSeconds(sportId: PeriodSportRef, period: unknown) {
  const config = getSportClockConfig(sportId);
  const normalized = normalizeMatchPeriod(period);
  return Math.max(0, config.offsets[normalized] ?? 0);
}

/* ─── normalizacion / lectura ─── */

function toFiniteInt(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function toIsoOrNull(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function createEmptyClock(period = 'PRE'): StoredMatchClock {
  return {
    period_started_at: null,
    accumulated_seconds: 0,
    is_running: false,
    period: normalizeMatchPeriod(period, 'PRE'),
    updated_at: null,
    minute: 0,
    seconds: 0,
    running: false,
    syncedAt: null,
  };
}

/**
 * Lee cualquier forma historica de matches.clock y la devuelve como modelo
 * derivado. Es el equivalente en lectura de la migracion SQL: una fila que
 * nunca se migro se sigue leyendo bien (queda pausada, sin perder el minuto).
 */
export function normalizeStoredClock(raw: unknown): StoredMatchClock {
  if (!raw || typeof raw !== 'object') return createEmptyClock();

  const source = raw as Record<string, unknown>;
  const period = normalizeMatchPeriod(
    typeof source.period === 'string' && source.period.trim() ? source.period : 'PRE',
    'PRE',
  );

  // Modelo nuevo: la clave manda.
  if (Object.prototype.hasOwnProperty.call(source, 'accumulated_seconds')) {
    const accumulated = Math.max(0, toFiniteInt(source.accumulated_seconds));
    const periodStartedAt = toIsoOrNull(source.period_started_at);
    const isRunning = Boolean(source.is_running) && Boolean(periodStartedAt);

    return {
      period_started_at: periodStartedAt,
      accumulated_seconds: accumulated,
      is_running: isRunning,
      period,
      updated_at: toIsoOrNull(source.updated_at),
      minute: Math.floor(accumulated / 60),
      seconds: accumulated % 60,
      running: isRunning,
      syncedAt: toIsoOrNull(source.syncedAt) ?? toIsoOrNull(source.updated_at),
    };
  }

  // Legacy: minute/seconds. Tambien el caso raro de solo-seconds-totales.
  const rawMinute = Number(source.minute);
  const rawSeconds = Number(source.seconds);
  const hasOnlyTotalSeconds = !Number.isFinite(rawMinute) && Number.isFinite(rawSeconds) && rawSeconds >= 60;
  const accumulated = hasOnlyTotalSeconds
    ? Math.max(0, Math.trunc(rawSeconds))
    : Math.max(0, toFiniteInt(rawMinute) * 60 + toFiniteInt(rawSeconds));

  return {
    // Sin ancla no hay forma de saber cuanto corrio desde el ultimo snapshot:
    // se preserva el minuto y se deja PAUSADO. Nadie pierde tiempo cargado.
    period_started_at: null,
    accumulated_seconds: accumulated,
    is_running: false,
    period,
    updated_at: null,
    minute: Math.floor(accumulated / 60),
    seconds: accumulated % 60,
    running: false,
    syncedAt: toIsoOrNull(source.syncedAt),
  };
}

/** LA derivacion. Todo lo que se muestra pasa por aca. */
export function computeElapsedSeconds(clock: StoredMatchClock, nowMs: number): number {
  const base = Math.max(0, clock.accumulated_seconds);
  if (!clock.is_running || !clock.period_started_at) return base;

  const anchor = Date.parse(clock.period_started_at);
  if (!Number.isFinite(anchor)) return base;

  return Math.max(0, base + Math.floor((nowMs - anchor) / 1000));
}

/** Espejo legacy para la ficha publica y club-admin. Cumulativo. */
export function toLegacyClockMirror(clock: StoredMatchClock, nowMs: number) {
  const elapsed = computeElapsedSeconds(clock, nowMs);
  return {
    minute: Math.floor(elapsed / 60),
    seconds: elapsed % 60,
    period: clock.period,
    running: clock.is_running,
    syncedAt: clock.updated_at,
  };
}

export function formatClockSeconds(totalSeconds: number) {
  const safe = Math.max(0, Math.trunc(totalSeconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function formatClockLabel(clock: StoredMatchClock, nowMs: number) {
  const time = formatClockSeconds(computeElapsedSeconds(clock, nowMs));
  const period = (clock.period || '').trim();
  return period && period !== 'PRE' ? `${time} - ${period}` : time;
}

/* ─── transiciones ─── */

/**
 * Aplica una transicion. Se usa en dos lados con la MISMA semantica:
 *  - cliente, para pintar optimista mientras vuelve el PATCH;
 *  - server (fallback JS), cuando la funcion Postgres no existe.
 *
 * `nowIso` tiene que venir del reloj de quien resuelve; en el server eso es
 * hora de server, que es el punto.
 */
export function applyClockTransition(
  clock: StoredMatchClock,
  transition: MatchClockTransition,
  nowIso: string,
): StoredMatchClock {
  const nowMs = Date.parse(nowIso);
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const period = transition.period ? normalizeMatchPeriod(transition.period) : clock.period;

  let next: StoredMatchClock;

  switch (transition.mode) {
    case 'start': {
      // INICIAR / REANUDAR: ancla nueva, el acumulado no se toca.
      next = {
        ...clock,
        period,
        period_started_at: nowIso,
        is_running: true,
      };
      break;
    }
    case 'pause': {
      // El acumulado se calcula contra el ancla GUARDADA, ignorando cualquier
      // numero que mande el cliente: inmune a la deriva del dispositivo.
      next = {
        ...clock,
        period,
        accumulated_seconds: computeElapsedSeconds(clock, safeNowMs),
        period_started_at: null,
        is_running: false,
      };
      break;
    }
    case 'set': {
      // Override manual (MIN/SEG) y rebase de arranque de periodo.
      const target = Math.max(0, toFiniteInt(transition.seconds));
      const running = transition.running ?? clock.is_running;
      next = {
        ...clock,
        period,
        accumulated_seconds: target,
        period_started_at: running ? nowIso : null,
        is_running: running,
      };
      break;
    }
    case 'keep':
    default: {
      next = { ...clock, period };
      break;
    }
  }

  const elapsed = computeElapsedSeconds(next, safeNowMs);

  return {
    ...next,
    updated_at: nowIso,
    minute: Math.floor(elapsed / 60),
    seconds: elapsed % 60,
    running: next.is_running,
    syncedAt: nowIso,
  };
}

/* ─── regla de eventos ─── */

/** Pausan conservando el tiempo real corrido. NUNCA rebasan. */
const PAUSE_CONSERVING_EVENTS = new Set(['match_half', 'end_period', 'match_end']);
/** Rebasan al offset del periodo que abren. */
const START_REBASE_EVENTS = new Set(['match_start', 'start_period']);

/**
 * El rebase se engancha al evento de ARRANQUE, no al cambio de periodo.
 *
 * Por que: con P0.5 el periodo avanza a 2T en el "Fin 1T" (match_half), no en
 * el "Inicio 2T". Si el rebase mirara el cambio de periodo, FIN 1T rebasaria a
 * 40:00 justo cuando tiene que congelar el tiempo real (41:30), y el INICIO 2T
 * no rebasaria nunca porque el periodo ya venia bien.
 *
 *   match_half / end_period / match_end  -> PAUSAR conservando (41:30 queda 41:30)
 *   match_start / start_period           -> REBASAR al offset del periodo que abre
 *
 * Por eso ramifica por TIPO DE EVENTO y no puede hacer early-return cuando el
 * periodo no cambia.
 *
 * Guarda: el rebase solo aplica con el reloj PAUSADO. El flujo natural es
 * apretar INICIAR y recien despues cargar el evento "Inicio partido" para la
 * timeline; sin la guarda ese evento borraria los 3:20 ya corridos y frenaria
 * un reloj que estaba andando. Con el reloj corriendo el operador ya mando, no
 * se le pisa. El flujo feliz no cambia: FIN 1T pausa -> INICIO 2T rebasa.
 */
export function resolveClockTransitionForEvent(
  eventType: string,
  clock: StoredMatchClock,
  sportId: PeriodSportRef,
): MatchClockTransition | null {
  const nextPeriod = getNextActivePeriodAfterEvent(eventType, clock.period, sportId);

  if (PAUSE_CONSERVING_EVENTS.has(eventType)) {
    return { mode: 'pause', period: nextPeriod };
  }

  if (START_REBASE_EVENTS.has(eventType)) {
    if (clock.is_running) return null;
    return {
      mode: 'set',
      period: nextPeriod,
      seconds: getPeriodOffsetSeconds(sportId, nextPeriod),
      running: false,
    };
  }

  return null;
}

/** El minuto que se estampa en el evento: calculado al momento del click. */
export function resolveEventMinute(clock: StoredMatchClock, nowMs: number) {
  return Math.max(0, Math.floor(computeElapsedSeconds(clock, nowMs) / 60));
}
