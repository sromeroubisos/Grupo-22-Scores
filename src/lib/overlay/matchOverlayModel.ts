/**
 * Overlay de transmisión (OBS, vMix): qué dibuja el gráfico a partir de la
 * misma respuesta que alimenta la ficha pública (`GET /api/matches/[id]`).
 *
 * Es puro (sin React ni DOM) a propósito: el overlay corre horas seguidas en
 * un navegador embebido y lo que decide qué se anuncia al aire tiene que poder
 * probarse aparte.
 */
import { readAmericanFootballRuleset, toPeriodRules, type MatchPeriodRules } from '../americanFootballRules.ts';
import { normalizeLocalEvents } from '../localMatchData.ts';
import {
  computeElapsedSeconds,
  formatClockSeconds,
  getClockDisplaySeconds,
  getSportClockConfig,
  normalizeStoredClock,
  type StoredMatchClock,
} from '../matchClock.ts';
import { isGoalKickAttemptEvent, isGoalKickMade } from '../matchEventStats.ts';
import { normalizeMatchPeriod, type PeriodSportRef } from '../matchPeriods.ts';
import { APP_TIMEZONE } from '../timezone.ts';
import type { ShotClock } from './shotClock.ts';
import { readRugbyModality, type RugbyModality } from '../utils/rugbyModality.ts';

/*
 * Seven: dos tiempos de 7', suplementario de 5' y amarilla de 2'. Van acá y no
 * se leen de rugbyModality.ts para que el overlay no dependa de una tabla de
 * reglas que no todas las versiones del sitio tienen. El 15 no lleva reglas de
 * período: el reloj usa la tabla de rugby de siempre.
 */
const SEVENS_SIN_BIN_MINUTES = 2;
const FIFTEENS_SIN_BIN_MINUTES = 10;

function rugbyModalityPeriodRules(modality: RugbyModality | null | undefined): MatchPeriodRules | null {
  if (modality !== 'sevens') return null;
  return { periods: 2, periodDurationMinutes: 7, overtimeDurationMinutes: 5, countdown: false };
}

export type OverlayPhase = 'scheduled' | 'live' | 'final' | 'other';
export type OverlaySide = 'home' | 'away';

export interface OverlayTeam {
  name: string;
  short: string;
  logo: string | null;
  color: string | null;
  score: number | null;
}

export interface OverlayEvent {
  id: string;
  type: string;
  team: OverlaySide | null;
  player: string | null;
  minute: number | null;
  detail: string;
  order: number;
}

/** Reloj heredado (proveedores externos y partidos viejos): minuto + segundos + cuándo se sincronizó. */
interface LegacyClock {
  minute: number;
  seconds: number;
  period: string;
  running: boolean;
  syncedAt: string | null;
}

export interface OverlayMatch {
  id: string;
  phase: OverlayPhase;
  rawStatus: string;
  sportRef: PeriodSportRef;
  clock: StoredMatchClock | null;
  legacyClock: LegacyClock | null;
  /** Texto de reloj que ya trae un proveedor externo, cuando no hay reloj propio. */
  providerTime: string | null;
  dateTime: string | null;
  tournament: { name: string; logo: string | null } | null;
  round: string | null;
  /** A qué parte del torneo pertenece: "Copa de Oro · Zona A · Fecha 3". */
  context: string | null;
  home: OverlayTeam;
  away: OverlayTeam;
  events: OverlayEvent[];
  /** Rugby 15 o 7, del reglamento del torneo: el seven tiene amarilla de 2'. */
  rugbyModality?: RugbyModality | null;
  /** Marcador MANUAL (`/overlay/manual`): el reloj lo maneja el productor desde su panel. */
  manual?: ManualClockInfo;
}

export interface ManualCard {
  type: 'yellow' | 'red';
  /** Segundo de juego (del reloj manual) en que se mostró. */
  at: number;
}

export interface ManualClockInfo {
  period: string;
  clock: { running: boolean; base: number; startedAt: string | null; countdown: boolean; limit: number };
  cards?: { home: ManualCard[]; away: ManualCard[] };
  /** Segundos de sin-bin de una amarilla (0 = sin temporizador). */
  sinBin?: number;
  /** Shot clock del panel (conversión o una cuenta propia). */
  shot?: ShotClock | null;
  /** Hora del servidor − hora local, para que el panel y OBS muestren el mismo segundo. */
  offsetMs: number;
}

function manualElapsedNow(match: OverlayMatch, nowMs: number): number {
  const { clock, offsetMs } = match.manual!;
  const started = clock.startedAt ? Date.parse(clock.startedAt) : Number.NaN;
  return clock.running && Number.isFinite(started)
    ? clock.base + Math.max(0, Math.floor((nowMs + offsetMs - started) / 1000))
    : clock.base;
}

function manualClock(match: OverlayMatch, nowMs: number): OverlayClock {
  const { period, clock } = match.manual!;
  if (match.phase === 'final') return { time: null, label: 'FINAL' };
  const elapsed = manualElapsedNow(match, nowMs);
  if (match.phase === 'scheduled' && !clock.running && elapsed === 0) return { time: null, label: 'PREVIA' };
  const shown = clock.countdown ? Math.max(0, clock.limit - elapsed) : elapsed;
  // Se cumplió el tiempo: la cuenta regresiva llegó a cero, o la ascendente
  // pasó el minuto en que termina el período (lo fija el operador).
  const expired = clock.limit > 0 && (clock.countdown ? shown === 0 : elapsed >= clock.limit);
  return {
    time: formatClockSeconds(shown),
    label: period.toUpperCase(),
    expired,
    elapsed,
    minutes: minuteLabel(clock.countdown, shown, elapsed, clock.countdown ? null : clock.limit || null),
  };
}

/**
 * El reloj en minutos, como lo muestra el fútbol: "34'" es el minuto 34 que se
 * está jugando, y con el tiempo cumplido "40+2'". En cuenta regresiva, los
 * minutos que faltan.
 */
function minuteLabel(countdown: boolean, shown: number, elapsed: number, periodEnd: number | null): string {
  if (countdown) return `${Math.ceil(shown / 60)}'`;
  if (periodEnd !== null && elapsed >= periodEnd) {
    return `${Math.round(periodEnd / 60)}+${Math.floor((elapsed - periodEnd) / 60) + 1}'`;
  }
  return `${Math.floor(elapsed / 60) + 1}'`;
}

/** Segundo acumulado en que termina el período: donde arranca el siguiente. */
function periodEndSeconds(sportRef: PeriodSportRef, period: string): number | null {
  const config = getSportClockConfig(sportRef);
  const start = config.offsets[period];
  if (start === undefined) return null;
  for (const next of config.periods.slice(config.periods.indexOf(period) + 1)) {
    const offset = config.offsets[next];
    if (offset !== undefined && offset > start) return offset;
  }
  return null;
}

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : {};
}

function text(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const LIVE_STATUSES = new Set([
  'live', 'in_progress', 'inprogress', 'playing', 'en_juego', 'en vivo', 'halftime', 'half_time', 'ht',
  '1t', '2t', '1h', '2h', 'q1', 'q2', 'q3', 'q4', 'et', 'ot',
]);
const FINAL_STATUSES = new Set(['final', 'finished', 'ft', 'completed', 'ended', 'full_time', 'aet', 'pen']);
const SCHEDULED_STATUSES = new Set(['scheduled', 'not_started', 'ns', 'pre', 'upcoming', 'fixture']);

export function phaseOf(status: string): OverlayPhase {
  const key = status.trim().toLowerCase();
  if (LIVE_STATUSES.has(key)) return 'live';
  if (FINAL_STATUSES.has(key)) return 'final';
  if (SCHEDULED_STATUSES.has(key) || !key) return 'scheduled';
  return 'other';
}

function teamFrom(club: Rec, score: number | null): OverlayTeam {
  const name = text(club.name, club.team_name, club.title) || 'Equipo';
  return {
    name,
    short: text(club.short_name, club.shortName, club.abbreviation) || name,
    logo: text(club.logo, club.logo_url, club.logoUrl, club.crest) || null,
    color: normalizeHex(text(club.primary_color, club.primaryColor, club.color)),
    score,
  };
}

/** `#abc`, `abc`, `#aabbcc` → `#aabbcc`. Cualquier otra cosa → null (no se inyecta CSS crudo). */
export function normalizeHex(value: string | null | undefined): string | null {
  const raw = String(value || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(raw)) return `#${raw.split('').map((c) => c + c).join('')}`.toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`.toLowerCase();
  return null;
}

function legacyClockFrom(raw: unknown): LegacyClock | null {
  const clock = rec(raw);
  if (!Object.keys(clock).length) return null;
  return {
    minute: Math.max(0, Math.trunc(num(clock.minute) ?? 0)),
    seconds: Math.max(0, Math.trunc(num(clock.seconds) ?? 0)),
    period: text(clock.period),
    running: Boolean(clock.running),
    syncedAt: text(clock.syncedAt) || null,
  };
}

/**
 * La respuesta del API tiene dos formas: la de un partido propio (snake_case
 * con `homeClub`/`awayClub`, `score`, `clock` y `events`) y la de un proveedor
 * externo (`{ match: { home, away, status, time } }`). Devuelve null si no se
 * reconoce ninguna de las dos.
 */
export function toOverlayMatch(payload: unknown): OverlayMatch | null {
  const body = rec(payload);

  if (body.match && typeof body.match === 'object') {
    const match = rec(body.match);
    const home = rec(match.home);
    const away = rec(match.away);
    const rawStatus = text(match.status) || 'scheduled';
    const phase = phaseOf(rawStatus);
    const showScore = phase !== 'scheduled';
    return {
      id: text(match.id, body.id),
      phase,
      rawStatus,
      sportRef: text(match.sportId, match.sport_id) || null,
      clock: null,
      legacyClock: legacyClockFrom(match.clock),
      providerTime: text(match.time) || null,
      dateTime: text(match.date, match.dateTime, match.date_time) || null,
      tournament: text(match.tournament) ? { name: text(match.tournament), logo: text(match.tournamentLogo) || null } : null,
      round: text(match.round) || null,
      context: text(match.stageName, match.round) || null,
      home: teamFrom(home, showScore ? num(home.score) : null),
      away: teamFrom(away, showScore ? num(away.score) : null),
      events: [],
    };
  }

  const id = text(body.id);
  if (!id) return null;

  const rawStatus = text(body.status) || 'scheduled';
  const phase = phaseOf(rawStatus);
  const score = rec(body.score);
  const showScore = phase !== 'scheduled';
  const tournament = rec(body.tournament);
  const sportId = text(body.sport_id, body.sportId, body.sport, tournament.sport_id, tournament.sportId) || null;
  const rules = readAmericanFootballRuleset(tournament.ruleset);
  const rugbyModality = readRugbyModality(rec(tournament.ruleset));
  const sevensPeriods = rugbyModalityPeriodRules(rugbyModality);
  const sportRef: PeriodSportRef = rules
    ? { sportId, periodRules: toPeriodRules(rules) }
    : sevensPeriods ? { sportId, periodRules: sevensPeriods } : sportId;

  const rawClock = rec(body.clock);
  const hasDerivedClock = Object.prototype.hasOwnProperty.call(rawClock, 'accumulated_seconds');

  const events = normalizeLocalEvents(Array.isArray(body.events) ? body.events : [], sportId).map((event) => ({
    id: event.id,
    type: event.type,
    team: event.team,
    // `normalizeLocalEvents` rellena con "Jugador" cuando no hay nombre: al aire no se escribe eso.
    player: event.player && event.player !== 'Jugador' ? event.player : null,
    minute: Number.isFinite(event.minute) && event.minute > 0 ? event.minute : null,
    detail: event.description || '',
    order: event.order,
  }));

  return {
    id,
    phase,
    rawStatus,
    sportRef,
    rugbyModality,
    clock: hasDerivedClock ? normalizeStoredClock(rawClock) : null,
    legacyClock: hasDerivedClock ? null : legacyClockFrom(body.clock),
    // La home trae el minuto que publica el proveedor externo ("67'"), sin reloj propio.
    providerTime: text(body.provider_time) || null,
    dateTime: text(body.date_time, body.dateTime) || null,
    tournament: text(tournament.name)
      ? { name: text(tournament.name), logo: text(tournament.logo_url, tournament.logo) || null }
      : null,
    round: text(body.round_label, body.roundLabel) || null,
    context: text(body.context_label) || null,
    home: teamFrom(rec(body.homeClub ?? body.home_club), showScore ? num(score.home) ?? 0 : null),
    away: teamFrom(rec(body.awayClub ?? body.away_club), showScore ? num(score.away) ?? 0 : null),
    events,
  };
}

/* ─── reloj ─── */

export interface OverlayClock {
  /** `34:12`, o null cuando no corresponde mostrar tiempo (entretiempo, final, previa). */
  time: string | null;
  /** `1T`, `2T`, `ENTRETIEMPO`, `FINAL`, `EN VIVO`, la hora de inicio… */
  label: string;
  /** Se cumplió el tiempo reglamentario del período (el reloj se pinta de rojo). */
  expired?: boolean;
  /** Segundos de juego transcurridos, para los temporizadores de sin-bin. */
  elapsed?: number;
  /** El mismo reloj en minutos: "34'", o "40+2'" con el tiempo cumplido. */
  minutes?: string;
}

/** Lo que dibuja el reloj según el modo elegido (`reloj=minutos`). */
export function clockText(clock: OverlayClock, mode: 'normal' | 'minutos' | 'oculto'): string | null {
  if (mode === 'minutos') return clock.minutes ?? clock.time;
  return clock.time;
}

const PERIOD_BROADCAST_LABEL: Record<string, string> = {
  HT: 'ENTRETIEMPO',
  FT: 'FINAL',
};

function kickoffLabel(dateTime: string | null): string {
  if (!dateTime) return 'PREVIA';
  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) return 'PREVIA';
  return parsed.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: APP_TIMEZONE });
}

/** `{ day: 'SÁB 22/11', time: '15:30' }` en la hora de Argentina; guiones si no hay fecha. */
export function kickoffParts(dateTime: string | null): { day: string; time: string } {
  const parsed = dateTime ? new Date(dateTime) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return { day: 'A CONFIRMAR', time: '--:--' };
  const weekday = parsed
    .toLocaleDateString('es-AR', { weekday: 'short', timeZone: APP_TIMEZONE })
    .replace('.', '')
    .toUpperCase();
  const date = parsed.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: APP_TIMEZONE });
  return { day: `${weekday} ${date}`, time: kickoffLabel(dateTime) };
}

export function overlayClock(match: OverlayMatch, nowMs: number): OverlayClock {
  if (match.manual) return manualClock(match, nowMs);
  if (match.phase === 'final') return { time: null, label: 'FINAL' };
  if (match.phase === 'scheduled') return { time: null, label: kickoffLabel(match.dateTime) };
  if (match.phase === 'other') return { time: null, label: match.rawStatus.toUpperCase() };

  if (match.clock) {
    const period = normalizeMatchPeriod(match.clock.period, 'PRE');
    if (PERIOD_BROADCAST_LABEL[period]) return { time: null, label: PERIOD_BROADCAST_LABEL[period] };
    if (period === 'PRE') return { time: null, label: 'EN VIVO' };
    const elapsed = computeElapsedSeconds(match.clock, nowMs);
    return runningClock(match.sportRef, period, elapsed, period);
  }

  if (match.legacyClock) {
    const legacy = match.legacyClock;
    const period = normalizeMatchPeriod(legacy.period, 'PRE');
    if (PERIOD_BROADCAST_LABEL[period]) return { time: null, label: PERIOD_BROADCAST_LABEL[period] };
    let total = legacy.minute * 60 + legacy.seconds;
    if (legacy.running && legacy.syncedAt) {
      const synced = Date.parse(legacy.syncedAt);
      if (Number.isFinite(synced)) total += Math.max(0, Math.floor((nowMs - synced) / 1000));
    }
    if (total <= 0 && period === 'PRE') return { time: null, label: 'EN VIVO' };
    return runningClock(match.sportRef, period, total, period === 'PRE' ? 'EN VIVO' : period);
  }

  if (match.providerTime) return { time: null, label: match.providerTime.toUpperCase() };
  return { time: null, label: 'EN VIVO' };
}

function runningClock(sportRef: PeriodSportRef, period: string, elapsed: number, label: string): OverlayClock {
  const display = getClockDisplaySeconds(sportRef, period, elapsed);
  const end = display.countdown ? null : periodEndSeconds(sportRef, period);
  const expired = display.countdown ? display.seconds === 0 : end !== null && elapsed >= end;
  return {
    time: formatClockSeconds(display.seconds),
    label,
    expired,
    elapsed,
    minutes: minuteLabel(display.countdown, display.seconds, elapsed, end),
  };
}

/** Segundos de juego transcurridos ahora (null si el partido no tiene reloj). */
export function matchElapsed(match: OverlayMatch, nowMs: number): number | null {
  const clock = overlayClock(match, nowMs);
  return typeof clock.elapsed === 'number' ? clock.elapsed : null;
}

/* ─── tarjetas y sin-bin ─── */

export interface TeamCards {
  yellow: number;
  red: number;
  /** Segundos que le quedan a cada amarilla en el sin-bin (las vigentes). */
  sinBins: number[];
}

const YELLOW_TYPES = new Set(['yellow_card', 'card_yellow']);
const RED_TYPES = new Set(['red_card', 'card_red']);

/** Cuánto dura el sin-bin según el deporte: 10' en rugby, 2' en seven, nada en el resto. */
export function sinBinSeconds(match: OverlayMatch): number {
  if (match.manual) return match.manual.sinBin ?? 0;
  if (match.rugbyModality) {
    return (match.rugbyModality === 'sevens' ? SEVENS_SIN_BIN_MINUTES : FIFTEENS_SIN_BIN_MINUTES) * 60;
  }
  const ref = match.sportRef;
  const sportId = String((typeof ref === 'string' ? ref : ref?.sportId) ?? '').toLowerCase();
  if (sportId.includes('seven') || /rugby[-_ ]?7/.test(sportId)) return 120;
  if (!sportId || sportId.includes('rugby')) return 600;
  return 0;
}

/**
 * Amarillas y rojas de cada equipo, y los sin-bin que siguen corriendo. El
 * sin-bin se cuenta en TIEMPO DE JUEGO (se frena con el reloj), desde el
 * minuto en que se cargó la tarjeta.
 */
export function teamCards(match: OverlayMatch, nowMs: number): Record<OverlaySide, TeamCards> {
  const empty = (): TeamCards => ({ yellow: 0, red: 0, sinBins: [] });
  const result: Record<OverlaySide, TeamCards> = { home: empty(), away: empty() };
  const elapsed = match.phase === 'live' ? matchElapsed(match, nowMs) : null;
  const sinBin = sinBinSeconds(match);

  const add = (side: OverlaySide, type: 'yellow' | 'red', at: number | null) => {
    if (type === 'red') {
      result[side].red += 1;
      return;
    }
    result[side].yellow += 1;
    if (sinBin > 0 && elapsed !== null && at !== null) {
      const remaining = sinBin - (elapsed - at);
      if (remaining > 0 && remaining <= sinBin) result[side].sinBins.push(remaining);
    }
  };

  if (match.manual?.cards) {
    for (const side of ['home', 'away'] as const) {
      for (const card of match.manual.cards[side]) add(side, card.type, card.at);
    }
  } else {
    for (const event of match.events) {
      if (!event.team) continue;
      if (YELLOW_TYPES.has(event.type)) add(event.team, 'yellow', event.minute !== null ? event.minute * 60 : null);
      else if (RED_TYPES.has(event.type)) add(event.team, 'red', null);
    }
  }
  for (const side of ['home', 'away'] as const) result[side].sinBins.sort((a, b) => a - b);
  return result;
}

/* ─── placas de evento ─── */

/** Qué sale al aire como placa, con el rótulo que se lee en pantalla. */
const ANNOUNCED: Record<string, { title: string; tone: 'score' | 'yellow' | 'red' | 'neutral' }> = {
  try: { title: 'TRY', tone: 'score' },
  penalty_try: { title: 'TRY PENAL', tone: 'score' },
  conversion: { title: 'CONVERSIÓN', tone: 'score' },
  penalty_goal: { title: 'PENAL', tone: 'score' },
  penalty: { title: 'PENAL', tone: 'score' },
  drop_goal: { title: 'DROP', tone: 'score' },
  goal: { title: 'GOL', tone: 'score' },
  touchdown: { title: 'TOUCHDOWN', tone: 'score' },
  field_goal: { title: 'FIELD GOAL', tone: 'score' },
  extra_point: { title: 'PUNTO EXTRA', tone: 'score' },
  two_point_conversion: { title: 'CONVERSIÓN DE 2', tone: 'score' },
  safety: { title: 'SAFETY', tone: 'score' },
  yellow_card: { title: 'TARJETA AMARILLA', tone: 'yellow' },
  card_yellow: { title: 'TARJETA AMARILLA', tone: 'yellow' },
  red_card: { title: 'TARJETA ROJA', tone: 'red' },
  card_red: { title: 'TARJETA ROJA', tone: 'red' },
  substitution: { title: 'CAMBIO', tone: 'neutral' },
  // Los tantos del marcador manual de básquet y de "otro deporte".
  point_1: { title: 'LIBRE', tone: 'score' },
  point_2: { title: 'DOBLE', tone: 'score' },
  point_3: { title: 'TRIPLE', tone: 'score' },
  point: { title: 'PUNTO', tone: 'score' },
};

export interface OverlayPlate {
  key: string;
  title: string;
  tone: 'score' | 'yellow' | 'red' | 'neutral';
  team: OverlaySide | null;
  player: string | null;
  minute: number | null;
}

/**
 * Una patada a los palos errada no sale al aire, y un penal a touch tampoco es
 * un tiro: es la misma regla que usa el marcador para no sumar esos puntos.
 */
export function plateFor(event: OverlayEvent, options: { substitutions: boolean }): OverlayPlate | null {
  const spec = ANNOUNCED[event.type];
  if (!spec) return null;
  if (event.type === 'substitution' && !options.substitutions) return null;
  if (event.type === 'penalty' && !isGoalKickAttemptEvent({ type: event.type, detail: event.detail })) return null;
  if (!isGoalKickMade(event.type, event.detail)) return null;
  return {
    key: event.id,
    title: spec.title,
    tone: spec.tone,
    team: event.team,
    player: event.player,
    minute: event.minute,
  };
}

/**
 * Los eventos nuevos desde la última lectura que corresponde anunciar, en
 * orden. Si entran muchos de golpe (el overlay estuvo sin conexión, o el
 * planillero cargó el partido entero después), no se recita una lista al
 * aire: se anuncia solo el último.
 */
export function newPlates(
  events: readonly OverlayEvent[],
  seen: ReadonlySet<string>,
  options: { substitutions: boolean; maxBurst?: number },
): OverlayPlate[] {
  const fresh = events
    .filter((event) => !seen.has(event.id))
    .sort((a, b) => a.order - b.order)
    .map((event) => plateFor(event, options))
    .filter((plate): plate is OverlayPlate => plate !== null);
  const maxBurst = options.maxBurst ?? 3;
  return fresh.length > maxBurst ? fresh.slice(-1) : fresh;
}
