/**
 * Playoff automatic scheduling (pure).
 *
 * Given the ordered rounds of a generated bracket and a rule-based config,
 * computes a concrete date/time + venue for every future match — so the
 * whole bracket already has kickoff times the moment it is created.
 *
 * Deterministic and DB-less: `playoffBracket.ts` feeds it the rounds and
 * writes the result into matches.
 */

export type SchedulingMode = 'manual' | 'auto';

export interface BracketScheduleConfig {
  mode: SchedulingMode;
  /** ISO datetime of the first (qualifier) round's first match. */
  firstRoundStart?: string | null;
  /** Estimated match duration, minutes (default 90). */
  matchDurationMin?: number;
  /** Gap between consecutive matches sharing a venue, minutes (default 30). */
  breakBetweenMatchesMin?: number;
  /** Days added per round vs. the previous round (default 7). */
  daysBetweenRounds?: number;
  /**
   * Optional cumulative day offset per round (index = round order).
   * Overrides daysBetweenRounds when present for that round.
   */
  roundDayOffsets?: number[];
  /** Optional venue pool; matches are spread round-robin across them. */
  venues?: string[];
}

export interface ScheduleRoundInput {
  /** stable id (DB round id or template key). */
  id: string;
  orderIndex: number;
  /** matches in the round, in display order. */
  matches: Array<{ id: string }>;
}

export interface ScheduledMatch {
  matchId: string;
  dateTime: string; // ISO (UTC)
  venue: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

function clampPositive(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Compute the schedule. Returns one entry per match (only in 'auto' mode;
 * 'manual' mode returns an empty list — the caller leaves slots pending).
 */
export function computeBracketSchedule(
  rounds: ScheduleRoundInput[],
  config: BracketScheduleConfig,
): ScheduledMatch[] {
  if (config.mode !== 'auto') return [];

  const duration = clampPositive(config.matchDurationMin, 90);
  const breakMin = Number.isFinite(Number(config.breakBetweenMatchesMin))
    ? Math.max(0, Number(config.breakBetweenMatchesMin))
    : 30;
  const daysBetween = clampPositive(config.daysBetweenRounds, 7);
  const venues = (config.venues ?? []).map((v) => v.trim()).filter(Boolean);
  const venueCount = venues.length || 1;

  const baseMs = config.firstRoundStart
    ? new Date(config.firstRoundStart).getTime()
    : defaultBaseStart();
  const base = Number.isFinite(baseMs) ? baseMs : defaultBaseStart();

  const ordered = [...rounds].sort((a, b) => a.orderIndex - b.orderIndex);
  const result: ScheduledMatch[] = [];

  ordered.forEach((round, roundIdx) => {
    const cumulativeOffsetDays =
      config.roundDayOffsets && config.roundDayOffsets[roundIdx] != null
        ? Math.max(0, Number(config.roundDayOffsets[roundIdx]))
        : roundIdx * daysBetween;

    const roundStart = base + cumulativeOffsetDays * DAY_MS;

    round.matches.forEach((m, k) => {
      const lane = k % venueCount;
      const wave = Math.floor(k / venueCount);
      const startMs = roundStart + wave * (duration + breakMin) * MIN_MS;
      result.push({
        matchId: m.id,
        dateTime: new Date(startMs).toISOString(),
        venue: venues.length ? venues[lane] : null,
      });
    });
  });

  return result;
}

/** Next Saturday 15:00 local-ish (UTC-based fallback when no start given). */
function defaultBaseStart(): number {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 18, 0, 0),
  );
  // advance to the next Saturday (UTC day 6)
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.getTime();
}

export function normalizeScheduleConfig(input: unknown): BracketScheduleConfig {
  const src = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const mode: SchedulingMode = src.mode === 'auto' ? 'auto' : 'manual';
  return {
    mode,
    firstRoundStart:
      typeof src.firstRoundStart === 'string' && src.firstRoundStart ? src.firstRoundStart : null,
    matchDurationMin: clampPositive(src.matchDurationMin, 90),
    breakBetweenMatchesMin: Number.isFinite(Number(src.breakBetweenMatchesMin))
      ? Math.max(0, Number(src.breakBetweenMatchesMin))
      : 30,
    daysBetweenRounds: clampPositive(src.daysBetweenRounds, 7),
    roundDayOffsets: Array.isArray(src.roundDayOffsets)
      ? src.roundDayOffsets.map((n) => Math.max(0, Number(n) || 0))
      : undefined,
    venues: Array.isArray(src.venues)
      ? src.venues.map((v) => String(v).trim()).filter(Boolean)
      : [],
  };
}
