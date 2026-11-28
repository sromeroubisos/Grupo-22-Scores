/**
 * Shot clock: una cuenta regresiva corta que sale debajo del marcador. Al aire
 * dice siempre SHOT CLOCK (pedido del usuario: "se llama shot clock, nada más").
 *
 * - Después de un try arranca solo, con el tiempo elegido (1:00 por defecto:
 *   el tiempo actual para patear la conversión). La conversión la cierra.
 * - El productor también lo arranca a mano con el tiempo que quiera.
 *
 * Puro (sin React ni Supabase). Corre con la hora del SERVIDOR, como el reloj
 * del partido: `endsAt` es la hora en que llega a cero.
 */

export interface ShotClock {
  label: string;
  /** Duración total, para la barra que se vacía. */
  seconds: number;
  /** Corriendo: hora del servidor en que llega a cero. null = pausado. */
  endsAt: string | null;
  /** Pausado: los segundos que quedaban. */
  pausedLeft: number | null;
  team: 'home' | 'away' | null;
  /** El evento que lo arrancó (el try): deshacerlo lo saca. */
  source: string | null;
}

/** Lo que dice al aire, siempre. */
export const SHOT_LABEL = 'SHOT CLOCK';
/** Segundos para patear la conversión después de un try: hoy, un minuto. */
export const CONVERSION_SECONDS = 60;
/** Los tiempos de un toque del panel (y los que se ofrecen para el automático). */
export const SHOT_TIMES = [30, 45, 60, 90, 120] as const;
/** Etiqueta de las cuentas viejas (antes de SHOT CLOCK): se siguen leyendo. */
export const CONVERSION_LABEL = 'CONVERSIÓN';
/** Cuánto queda en pantalla el 0:00 antes de irse solo. */
export const SHOT_LINGER_MS = 4_000;

type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : {});

export function shotLabel(value: unknown, fallback = 'TIEMPO'): string {
  const raw = typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 24) : '';
  return (raw || fallback).toUpperCase();
}

export function readShotClock(raw: unknown): ShotClock | null {
  const source = rec(raw);
  const seconds = Math.trunc(Number(source.seconds));
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 3600) return null;
  const endsAt = typeof source.endsAt === 'string' && Number.isFinite(Date.parse(source.endsAt)) ? source.endsAt : null;
  const paused = Number(source.pausedLeft);
  const pausedLeft = endsAt === null && source.pausedLeft !== null && Number.isFinite(paused)
    ? Math.min(seconds, Math.max(0, Math.trunc(paused)))
    : null;
  if (endsAt === null && pausedLeft === null) return null;
  return {
    label: shotLabel(source.label),
    seconds,
    endsAt,
    pausedLeft,
    team: source.team === 'home' || source.team === 'away' ? source.team : null,
    source: typeof source.source === 'string' ? source.source.slice(0, 40) : null,
  };
}

export function startShot(
  nowMs: number,
  options: { label: string; seconds: number; team?: 'home' | 'away' | null; source?: string | null },
): ShotClock {
  const seconds = Math.min(3600, Math.max(1, Math.trunc(options.seconds)));
  return {
    label: shotLabel(options.label),
    seconds,
    endsAt: new Date(nowMs + seconds * 1000).toISOString(),
    pausedLeft: null,
    team: options.team ?? null,
    source: options.source ?? null,
  };
}

/** Milisegundos que faltan, a la hora del servidor `nowMs`. */
export function shotLeftMs(shot: ShotClock, nowMs: number): number {
  if (shot.endsAt === null) return (shot.pausedLeft ?? 0) * 1000;
  return Math.max(0, Date.parse(shot.endsAt) - nowMs);
}

export function pauseShot(shot: ShotClock, nowMs: number): ShotClock {
  if (shot.endsAt === null) return shot;
  return { ...shot, endsAt: null, pausedLeft: Math.ceil(shotLeftMs(shot, nowMs) / 1000) };
}

export function resumeShot(shot: ShotClock, nowMs: number): ShotClock {
  if (shot.endsAt !== null) return shot;
  return { ...shot, endsAt: new Date(nowMs + (shot.pausedLeft ?? 0) * 1000).toISOString(), pausedLeft: null };
}

export interface ShotView {
  label: string;
  /** "1:12", "0:09". */
  time: string;
  /** 0 a 1: cuánto queda de la barra. */
  progress: number;
  /** Últimos 10 segundos. */
  urgent: boolean;
  done: boolean;
  paused: boolean;
  team: 'home' | 'away' | null;
}

/** Lo que se dibuja; null si llegó a cero hace más de SHOT_LINGER_MS (se va solo). */
export function shotView(shot: ShotClock | null, nowMs: number): ShotView | null {
  if (!shot) return null;
  const left = shotLeftMs(shot, nowMs);
  if (shot.endsAt !== null && left === 0 && nowMs - Date.parse(shot.endsAt) > SHOT_LINGER_MS) return null;
  const secs = Math.ceil(left / 1000);
  return {
    // Al aire dice SHOT CLOCK aunque la cuenta se haya guardado con otro nombre.
    label: SHOT_LABEL,
    time: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`,
    progress: Math.min(1, left / (shot.seconds * 1000)),
    urgent: secs <= 10,
    done: secs === 0,
    paused: shot.endsAt === null,
    team: shot.team,
  };
}

/**
 * Un evento que corta el shot clock: la patada ya se cargó (conversión, penal
 * convertido o drop). Corta CUALQUIER shot clock, lo haya arrancado un try o
 * el productor a mano: si la patada está cargada, la cuenta no sigue.
 */
export function endsShot(type: string): boolean {
  return /conversion|penalty_goal|drop_goal/i.test(type);
}

/** Compatibilidad: el nombre viejo. */
export const endsConversion = endsShot;

/** ¿La cuenta la arrancó un try? (la conversión la cierra; una puesta a mano, no). */
export function startedByTry(shot: ShotClock | null): boolean {
  return Boolean(shot && (shot.source || shot.label === CONVERSION_LABEL));
}

/**
 * Partidos de G22 (sin panel): el overlay mira los eventos nuevos de cada
 * lectura. Un try arranca la cuenta de la conversión con la hora LOCAL; la
 * conversión la cierra.
 */
export function shotFromFreshEvents(
  current: ShotClock | null,
  fresh: ReadonlyArray<{ id: string; type: string; team: 'home' | 'away' | null }>,
  nowMs: number,
  seconds: number,
): ShotClock | null {
  let shot = current;
  for (const event of fresh) {
    if (event.type === 'try' && seconds > 0) {
      shot = startShot(nowMs, { label: SHOT_LABEL, seconds, team: event.team, source: event.id });
    } else if (endsShot(event.type)) {
      shot = null;
    }
  }
  return shot;
}
