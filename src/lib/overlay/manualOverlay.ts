/**
 * Overlays MANUALES: un marcador o un titular que maneja el productor desde un
 * panel, sin cargar el partido en G22. Este módulo es puro (sin React ni
 * Supabase): el servidor sanea con él lo que llega del panel y aplica las
 * acciones (anotar, deshacer, mover el reloj); el overlay lo traduce a lo que
 * dibuja.
 *
 * El reloj corre del lado del SERVIDOR: el panel manda "arrancar" y el servidor
 * anota su propia hora. El overlay recibe esa hora más la hora del servidor al
 * responder, y corrige la diferencia con su reloj local. Así el panel en un
 * celular y OBS en otra PC muestran el mismo segundo aunque sus relojes no
 * coincidan.
 */
import { normalizeHex, type ManualCard, type OverlayEvent, type OverlayMatch } from './matchOverlayModel.ts';
import { defaultSponsorsState, mergeSponsorsState, type ManualSponsorsState } from './sponsorsOverlay.ts';

export type { ManualSponsorsState } from './sponsorsOverlay.ts';

export type ManualKind = 'marcador' | 'titular' | 'sponsors';
export type ManualSport = 'rugby' | 'futbol' | 'hockey' | 'basquet' | 'otro';

export interface ManualTeam {
  name: string;
  short: string;
  color: string | null;
  logo: string | null;
  score: number;
  /** Plantel para elegir quién hizo el punto ("10 Juan Pérez"), uno por renglón. */
  players: string[];
}

/** Un tanto o una tarjeta cargada desde el panel. Sale como placa al aire. */
export interface ManualEvent {
  id: string;
  type: string;
  team: 'home' | 'away';
  player: string | null;
  /** Segundo de juego (del reloj manual) en que pasó. */
  at: number;
  points: number;
}

export interface ManualClock {
  running: boolean;
  /** Segundos acumulados antes del último arranque. */
  base: number;
  /** Hora del SERVIDOR del último arranque (ISO); null si está parado. */
  startedAt: string | null;
  /** Cuenta regresiva desde `limit` (segundos) en vez de para arriba. */
  countdown: boolean;
  /** Segundo en que termina el período: ahí el reloj se pone en rojo. */
  limit: number;
}

export interface ManualScoreState {
  visible: boolean;
  title: string;
  sport: ManualSport;
  status: 'previa' | 'vivo' | 'final';
  period: string;
  home: ManualTeam;
  away: ManualTeam;
  clock: ManualClock;
  /** Duración del sin-bin de una amarilla, en segundos (0 = sin temporizador). */
  sinBin: number;
  events: ManualEvent[];
}

export interface HeadlineItem {
  id: string;
  kicker: string;
  title: string;
  subtitle: string;
}

export interface ManualHeadlineState {
  visible: boolean;
  /**
   * `noticiero`: la banda de abajo a todo lo ancho, como un noticiero.
   * `persona`: nombre y rol de quien está hablando.
   * `tarjeta`: la tarjeta G22.
   */
  style: 'noticiero' | 'persona' | 'tarjeta';
  items: HeadlineItem[];
  /** Cuál está al aire (si no rota solo). */
  current: number;
  /** Segundos por título para que roten solos (0 = a mano). */
  rotate: number;
  /** Texto que corre abajo de la banda (opcional). */
  ticker: string;
}

export type ManualState = ManualScoreState | ManualHeadlineState | ManualSponsorsState;

/* ─── tantos por deporte ─── */

export interface ScoringButton {
  type: string;
  label: string;
  points: number;
}

/** Los botones de anotar de cada deporte: el tipo es el mismo que usa G22 (y sus placas). */
export const SCORING: Record<ManualSport, ScoringButton[]> = {
  rugby: [
    { type: 'try', label: 'Try', points: 5 },
    { type: 'conversion', label: 'Conversión', points: 2 },
    { type: 'penalty_goal', label: 'Penal', points: 3 },
    { type: 'drop_goal', label: 'Drop', points: 3 },
    { type: 'penalty_try', label: 'Try penal', points: 7 },
  ],
  futbol: [{ type: 'goal', label: 'Gol', points: 1 }],
  hockey: [{ type: 'goal', label: 'Gol', points: 1 }],
  basquet: [
    { type: 'point_1', label: 'Libre', points: 1 },
    { type: 'point_2', label: 'Doble', points: 2 },
    { type: 'point_3', label: 'Triple', points: 3 },
  ],
  otro: [{ type: 'point', label: 'Punto', points: 1 }],
};

export const CARD_TYPES = ['yellow_card', 'red_card'] as const;

const DEFAULT_HOME: ManualTeam = { name: 'Local', short: 'LOC', color: '#00a365', logo: null, score: 0, players: [] };
const DEFAULT_AWAY: ManualTeam = { name: 'Visitante', short: 'VIS', color: '#f2f2f2', logo: null, score: 0, players: [] };

export function defaultManualState(kind: 'titular'): ManualHeadlineState;
export function defaultManualState(kind: 'sponsors'): ManualSponsorsState;
export function defaultManualState(kind: 'marcador'): ManualScoreState;
export function defaultManualState(kind: ManualKind): ManualState;
export function defaultManualState(kind: ManualKind): ManualState {
  if (kind === 'sponsors') return defaultSponsorsState();
  if (kind === 'titular') {
    return {
      visible: false,
      style: 'noticiero',
      items: [{ id: 'h1', kicker: 'G22 SCORES', title: 'Escribí acá el primer titular', subtitle: '' }],
      current: 0,
      rotate: 0,
      ticker: '',
    };
  }
  return {
    visible: true,
    title: '',
    sport: 'rugby',
    status: 'previa',
    period: '1T',
    home: { ...DEFAULT_HOME, players: [] },
    away: { ...DEFAULT_AWAY, players: [] },
    clock: { running: false, base: 0, startedAt: null, countdown: false, limit: 40 * 60 },
    sinBin: 10 * 60,
    events: [],
  };
}

/* ─── saneo de lo que manda el panel ─── */

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : {};
}

function text(value: unknown, max: number, fallback = ''): string {
  // Sin caracteres de control: al aire no aparece basura.
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : fallback;
}

function int(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback;
}

/** Solo imágenes por https o rutas del propio sitio: nada de `javascript:` ni base64. */
export function safeImageUrl(value: unknown): string | null {
  const raw = text(value, 500);
  if (!raw) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function readPlayers(raw: unknown, fallback: string[]): string[] {
  if (raw === undefined) return fallback;
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split('\n') : [];
  return list.map((item) => text(item, 40)).filter(Boolean).slice(0, 40);
}

function mergeTeam(prev: ManualTeam, patch: unknown): ManualTeam {
  const source = rec(patch);
  const name = source.name === undefined ? prev.name : (text(source.name, 40) || prev.name);
  return {
    name,
    short: (source.short === undefined ? prev.short : text(source.short, 16) || name.slice(0, 3)).toUpperCase(),
    color: source.color === undefined ? prev.color : normalizeHex(text(source.color, 9)),
    logo: source.logo === undefined ? prev.logo : safeImageUrl(source.logo),
    score: source.score === undefined ? prev.score : int(source.score, 0, 999, prev.score),
    players: readPlayers(source.players, prev.players),
  };
}

function readClock(raw: unknown): ManualClock {
  const clock = rec(raw);
  return {
    running: Boolean(clock.running),
    base: int(clock.base, 0, 24 * 3600, 0),
    startedAt: typeof clock.startedAt === 'string' && Number.isFinite(Date.parse(clock.startedAt)) ? clock.startedAt : null,
    countdown: Boolean(clock.countdown),
    limit: int(clock.limit, 0, 24 * 3600, 40 * 60),
  };
}

function readEvents(raw: unknown): ManualEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => rec(item))
    .filter((item) => (item.team === 'home' || item.team === 'away') && typeof item.type === 'string')
    .slice(-60)
    .map((item, index) => ({
      id: text(item.id, 40) || `e${index}`,
      type: text(item.type, 30),
      team: item.team as 'home' | 'away',
      player: text(item.player, 40) || null,
      at: int(item.at, 0, 24 * 3600, 0),
      points: int(item.points, -99, 99, 0),
    }));
}

function readItems(raw: unknown): HeadlineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 30).map((item, index) => {
    const source = rec(item);
    return {
      id: text(source.id, 40) || `h${index + 1}`,
      kicker: text(source.kicker, 40),
      title: text(source.title, 140),
      subtitle: text(source.subtitle, 200),
    };
  });
}

const SPORTS: ManualSport[] = ['rugby', 'futbol', 'hockey', 'basquet', 'otro'];

/** El estado guardado, leído con tolerancia (una fila vieja o rota no tumba el overlay). */
export function readManualState(kind: 'titular', raw: unknown): ManualHeadlineState;
export function readManualState(kind: 'sponsors', raw: unknown): ManualSponsorsState;
export function readManualState(kind: 'marcador', raw: unknown): ManualScoreState;
export function readManualState(kind: ManualKind, raw: unknown): ManualState;
export function readManualState(kind: ManualKind, raw: unknown): ManualState {
  return mergeManualState(kind, raw, {});
}

/**
 * Mezcla lo que manda el panel sobre el estado guardado, campo por campo y
 * saneado. El reloj solo acepta `countdown` y `limit` desde acá, y los
 * eventos no se tocan: arrancar, corregir el tiempo, anotar y deshacer pasan
 * por las acciones (`applyClockAction`, `applyScoreAction`), con la hora del
 * servidor.
 */
export function mergeManualState(kind: ManualKind, current: unknown, patch: unknown): ManualState {
  const saved = rec(current);
  const incoming = rec(patch);

  if (kind === 'sponsors') return mergeSponsorsState(current, patch);

  if (kind === 'titular') {
    const defaults = defaultManualState('titular');
    // Las filas de la primera versión tenían un solo título suelto.
    const legacy = !Array.isArray(saved.items) && typeof saved.title === 'string'
      ? [{ id: 'h1', kicker: saved.kicker, title: saved.title, subtitle: saved.subtitle }]
      : null;
    const items = readItems(incoming.items ?? saved.items ?? legacy ?? defaults.items);
    const style = incoming.style ?? saved.style;
    return {
      visible: Boolean(incoming.visible ?? saved.visible ?? defaults.visible),
      style: style === 'persona' || style === 'tarjeta' ? style : 'noticiero',
      items: items.length ? items : defaults.items,
      current: int(incoming.current ?? saved.current, 0, Math.max(0, items.length - 1), 0),
      rotate: int(incoming.rotate ?? saved.rotate, 0, 600, 0),
      ticker: text(incoming.ticker ?? saved.ticker, 400),
    };
  }

  const defaults = defaultManualState('marcador');
  const prevHome = mergeTeam(defaults.home, saved.home);
  const prevAway = mergeTeam(defaults.away, saved.away);
  const clock = readClock(saved.clock ?? defaults.clock);
  const clockPatch = rec(incoming.clock);
  const status = incoming.status ?? saved.status;
  const sport = (incoming.sport ?? saved.sport) as ManualSport;
  return {
    visible: incoming.visible === undefined ? (saved.visible === undefined ? true : Boolean(saved.visible)) : Boolean(incoming.visible),
    title: text(incoming.title ?? saved.title, 60),
    sport: SPORTS.includes(sport) ? sport : 'rugby',
    status: status === 'vivo' || status === 'final' ? status : 'previa',
    period: text(incoming.period ?? saved.period, 12) || '1T',
    home: mergeTeam(prevHome, incoming.home),
    away: mergeTeam(prevAway, incoming.away),
    clock: {
      ...clock,
      countdown: clockPatch.countdown === undefined ? clock.countdown : Boolean(clockPatch.countdown),
      limit: clockPatch.limit === undefined ? clock.limit : int(clockPatch.limit, 0, 24 * 3600, clock.limit),
    },
    sinBin: int(incoming.sinBin ?? saved.sinBin ?? defaults.sinBin, 0, 3600, defaults.sinBin),
    events: readEvents(saved.events),
  };
}

/* ─── reloj ─── */

export type ClockAction = 'start' | 'pause' | 'reset' | { set: number } | { adjust: number };

export function parseClockAction(raw: unknown): ClockAction | null {
  if (raw === 'start' || raw === 'pause' || raw === 'reset') return raw;
  const source = rec(raw);
  const set = Number(source.set);
  if (source.set !== undefined && Number.isFinite(set)) return { set };
  const adjust = Number(source.adjust);
  if (source.adjust !== undefined && Number.isFinite(adjust)) return { adjust: Math.max(-3600, Math.min(3600, adjust)) };
  return null;
}

/** Segundos transcurridos del reloj, a la hora del servidor `nowMs`. */
export function manualElapsed(clock: ManualClock, nowMs: number): number {
  if (!clock.running || !clock.startedAt) return clock.base;
  const started = Date.parse(clock.startedAt);
  return Number.isFinite(started) ? clock.base + Math.max(0, Math.floor((nowMs - started) / 1000)) : clock.base;
}

export function applyClockAction(state: ManualScoreState, action: ClockAction, nowMs: number): ManualScoreState {
  const clock = { ...state.clock };
  if (action === 'start') {
    if (!clock.running) {
      clock.running = true;
      clock.startedAt = new Date(nowMs).toISOString();
    }
  } else if (action === 'pause') {
    clock.base = manualElapsed(clock, nowMs);
    clock.running = false;
    clock.startedAt = null;
  } else if (action === 'reset') {
    clock.base = 0;
    clock.running = false;
    clock.startedAt = null;
  } else {
    // Fijar o corregir: el tiempo nuevo arranca a correr desde ahora.
    const target = 'set' in action ? action.set : manualElapsed(clock, nowMs) + action.adjust;
    clock.base = Math.max(0, Math.min(24 * 3600, Math.trunc(target)));
    clock.startedAt = clock.running ? new Date(nowMs).toISOString() : null;
  }
  return { ...state, clock };
}

/* ─── anotar y deshacer ─── */

export type ScoreAction =
  | { event: { team: 'home' | 'away'; type: string; player?: string | null } }
  | { undo: string | true };

export function parseScoreAction(raw: unknown): ScoreAction | null {
  const source = rec(raw);
  const event = rec(source.event);
  if ((event.team === 'home' || event.team === 'away') && typeof event.type === 'string') {
    return { event: { team: event.team, type: text(event.type, 30), player: text(event.player, 40) || null } };
  }
  if (source.undo === true || typeof source.undo === 'string') return { undo: source.undo === true ? true : text(source.undo, 40) };
  return null;
}

function pointsFor(sport: ManualSport, type: string): number {
  return SCORING[sport].find((button) => button.type === type)?.points ?? 0;
}

/**
 * Anotar: suma los puntos del tipo (Try = 5 en rugby), registra quién lo hizo
 * en el segundo de juego actual y deja el evento para que salga la placa.
 * Deshacer: saca el evento (el último, o uno por id) y resta lo que sumó.
 */
export function applyScoreAction(state: ManualScoreState, action: ScoreAction, nowMs: number): ManualScoreState {
  if ('event' in action) {
    const { team, type, player } = action.event;
    const isCard = (CARD_TYPES as readonly string[]).includes(type);
    const points = isCard ? 0 : pointsFor(state.sport, type);
    if (!isCard && points === 0) return state;
    const event: ManualEvent = {
      id: `m${nowMs.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      type,
      team,
      player: player ?? null,
      at: manualElapsed(state.clock, nowMs),
      points,
    };
    return {
      ...state,
      [team]: { ...state[team], score: Math.min(999, state[team].score + points) },
      events: [...state.events, event].slice(-60),
    };
  }
  const index = action.undo === true ? state.events.length - 1 : state.events.findIndex((event) => event.id === action.undo);
  if (index < 0) return state;
  const removed = state.events[index];
  return {
    ...state,
    [removed.team]: { ...state[removed.team], score: Math.max(0, state[removed.team].score - removed.points) },
    events: state.events.filter((_, i) => i !== index),
  };
}

/* ─── al aire ─── */

/**
 * El marcador manual con la forma de un partido, para dibujarlo con las mismas
 * piezas (marcador de esquina, franja, zócalo, tarjeta) y con las mismas
 * placas: cada tanto cargado con su jugador sale como "TRY · Juan Pérez".
 * `offsetMs` = hora del servidor − hora local.
 */
export function manualToOverlayMatch(id: string, state: ManualScoreState, offsetMs: number): OverlayMatch {
  const phase = state.status === 'vivo' ? 'live' : state.status === 'final' ? 'final' : 'scheduled';
  const events: OverlayEvent[] = state.events.map((event, order) => ({
    id: event.id,
    type: event.type,
    team: event.team,
    player: event.player,
    minute: Math.floor(event.at / 60) + 1,
    detail: '',
    order,
  }));
  const cards = (side: 'home' | 'away'): ManualCard[] => state.events
    .filter((event) => event.team === side && (event.type === 'yellow_card' || event.type === 'red_card'))
    .map((event) => ({ type: event.type === 'yellow_card' ? 'yellow' : 'red', at: event.at }));
  return {
    id,
    phase,
    rawStatus: state.status,
    sportRef: state.sport === 'futbol' ? 'football' : state.sport === 'hockey' ? 'field-hockey' : state.sport === 'rugby' ? 'rugby' : null,
    clock: null,
    legacyClock: null,
    providerTime: null,
    dateTime: null,
    tournament: state.title ? { name: state.title, logo: null } : null,
    round: null,
    context: null,
    // El marcador manual SIEMPRE muestra los números: en la previa van 0-0.
    home: { name: state.home.name, short: state.home.short, logo: state.home.logo, color: state.home.color, score: state.home.score },
    away: { name: state.away.name, short: state.away.short, logo: state.away.logo, color: state.away.color, score: state.away.score },
    events,
    manual: {
      period: state.period,
      clock: state.clock,
      offsetMs,
      cards: { home: cards('home'), away: cards('away') },
      sinBin: state.sinBin,
    },
  };
}

/** Qué título del noticiero está al aire: el elegido, o el que toca si rotan solos. */
export function currentHeadline(state: ManualHeadlineState, serverNowMs: number): { item: HeadlineItem; index: number } {
  const count = state.items.length;
  const index = state.rotate > 0 && count > 1
    ? Math.floor(serverNowMs / (state.rotate * 1000)) % count
    : Math.min(state.current, count - 1);
  return { item: state.items[index], index };
}
