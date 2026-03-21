/**
 * Centralized timezone utilities.
 *
 * All date -> day grouping and UTC -> local conversions go through these
 * helpers so that every layer (API route, FlashScore service, frontend
 * components) uses exactly the same logic.
 */

/* ------------------------------------------------------------------ */
/*  canonicalizeTimezone                                               */
/* ------------------------------------------------------------------ */

/**
 * Map legacy / backward-compatible IANA timezone names to their canonical
 * form.  Node.js `Intl.DateTimeFormat().resolvedOptions().timeZone` may
 * return legacy short names (e.g. `America/Buenos_Aires`) that the
 * FlashScore API rejects with HTTP 400.
 *
 * Only the most common legacy names are listed; add more as needed.
 * See: https://data.iana.org/time-zones/data/backward
 */
const LEGACY_TZ_MAP: Record<string, string> = {
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Catamarca': 'America/Argentina/Catamarca',
  'America/Cordoba': 'America/Argentina/Cordoba',
  'America/Jujuy': 'America/Argentina/Jujuy',
  'America/Mendoza': 'America/Argentina/Mendoza',
  'America/Indianapolis': 'America/Indiana/Indianapolis',
  'America/Knox_IN': 'America/Indiana/Knox',
  'America/Louisville': 'America/Kentucky/Louisville',
  'Pacific/Samoa': 'Pacific/Pago_Pago',
  'US/Eastern': 'America/New_York',
  'US/Central': 'America/Chicago',
  'US/Mountain': 'America/Denver',
  'US/Pacific': 'America/Los_Angeles',
};

export const APP_TIMEZONE = canonicalizeTimezone('America/Argentina/Buenos_Aires');

/**
 * Normalize a timezone string to its canonical IANA form.
 * Needed because browsers may report legacy names that external APIs reject.
 */
export function canonicalizeTimezone(tz: string): string {
  return LEGACY_TZ_MAP[tz] || tz;
}

function asValidDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function zonedDateTimeToUtcDate(date: string, time: string, timeZone: string): Date | null {
  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] || '0');

  let utcTimestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = getTimeZoneOffsetMs(new Date(utcTimestamp), timeZone);
  utcTimestamp -= offset;

  const adjustedOffset = getTimeZoneOffsetMs(new Date(utcTimestamp), timeZone);
  if (adjustedOffset !== offset) {
    utcTimestamp -= adjustedOffset - offset;
  }

  const result = new Date(utcTimestamp);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function formatDateInTimeZone(
  value: string | Date | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions,
  timeZone: string = APP_TIMEZONE,
): string | null {
  const date = asValidDate(value);
  if (!date) return null;

  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone,
  }).format(date);
}

export function toInputDateInTimeZone(
  value: string | Date | null | undefined,
  timeZone: string = APP_TIMEZONE,
): string {
  const date = asValidDate(value);
  if (!date) return '';

  const parts = getTimeZoneParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function toInputTimeInTimeZone(
  value: string | Date | null | undefined,
  timeZone: string = APP_TIMEZONE,
): string {
  const date = asValidDate(value);
  if (!date) return '';

  const parts = getTimeZoneParts(date, timeZone);
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

export function combineLocalDateTimeToUtcIso(
  date: string,
  time: string = '00:00',
  timeZone: string = APP_TIMEZONE,
): string | null {
  const normalizedTime = /^\d{2}:\d{2}:\d{2}$/.test(time) ? time : `${time}:00`;
  const utcDate = zonedDateTimeToUtcDate(date, normalizedTime, timeZone);
  return utcDate ? utcDate.toISOString() : null;
}

export function ensureUtcDateTimeString(
  value: string | null | undefined,
  timeZone: string = APP_TIMEZONE,
): string | null | undefined {
  if (value === undefined || value === null || value === '') return value;

  if (/z$/i.test(value) || /[+-]\d{2}:\d{2}$/i.test(value)) {
    const parsed = asValidDate(value);
    return parsed ? parsed.toISOString() : null;
  }

  const localMatch = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/);
  if (localMatch) {
    return combineLocalDateTimeToUtcIso(localMatch[1], localMatch[2], timeZone);
  }

  const parsed = asValidDate(value);
  return parsed ? parsed.toISOString() : null;
}

export function addDaysToIsoDate(value: string, days: number): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;

  const base = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  base.setUTCDate(base.getUTCDate() + days);

  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(base.getUTCDate()).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/*  Core: toLocalMatch                                                 */
/* ------------------------------------------------------------------ */

export interface LocalMatchResult {
  /** Formatted local time string, e.g. "21:00" */
  localTime: string;
  /** YYYY-MM-DD in the user's timezone - use for grouping / day tabs */
  dayKey: string;
}

/**
 * Given a UTC date/time from the API and the user's IANA timezone,
 * returns the correct local time and the dayKey for grouping.
 *
 * Example:
 *   toLocalMatch('2026-02-12T00:00:00Z', 'America/Argentina/Buenos_Aires')
 *   -> { localTime: '21:00', dayKey: '2026-02-11' }
 */
export function toLocalMatch(
  utcDateTime: string | Date | null | undefined,
  timeZone: string
): LocalMatchResult {
  // Guard: undefined/null/empty -> fallback so callers never crash
  if (!utcDateTime) {
    return { localTime: '--:--', dayKey: '1970-01-01' };
  }

  const date =
    typeof utcDateTime === 'string' ? new Date(utcDateTime) : utcDateTime;

  // Guard against invalid dates - Intl.DateTimeFormat.format() throws
  // RangeError on Invalid Date, which would crash the entire useMemo.
  if (Number.isNaN(date.getTime())) {
    return { localTime: '--:--', dayKey: '1970-01-01' };
  }

  const localTime = new Intl.DateTimeFormat('es-AR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  const dayKey = formatDateKey(date, timeZone);

  return { localTime, dayKey };
}

/* ------------------------------------------------------------------ */
/*  formatDateKey                                                      */
/* ------------------------------------------------------------------ */

/**
 * Format a Date to `YYYY-MM-DD` in the given IANA timezone.
 * Falls back to **UTC** when no timezone is provided (safe for
 * server-side code that must be deterministic).
 */
export function formatDateKey(date: Date, timeZone?: string): string {
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    } catch {
      // Invalid timezone -> fall through to UTC
    }
  }

  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/* ------------------------------------------------------------------ */
/*  getTodayKey                                                        */
/* ------------------------------------------------------------------ */

/** Today's `YYYY-MM-DD` in the given timezone. */
export function getTodayKey(timeZone: string): string {
  return formatDateKey(new Date(), timeZone);
}

/* ------------------------------------------------------------------ */
/*  generateLocalDateKeys                                              */
/* ------------------------------------------------------------------ */

export interface LocalDateEntry {
  /** YYYY-MM-DD in the user's timezone */
  dateKey: string;
  /** Offset from today: -3 ... +7 */
  offset: number;
}

/**
 * Generate a list of `YYYY-MM-DD` keys centred on "today" in the
 * user's timezone.  Used by the date-picker strip and prefetch logic.
 */
export function generateLocalDateKeys(
  timeZone: string,
  from: number = -7,
  to: number = 7
): LocalDateEntry[] {
  const entries: LocalDateEntry[] = [];
  const now = new Date();

  for (let i = from; i <= to; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    entries.push({ dateKey: formatDateKey(d, timeZone), offset: i });
  }

  return entries;
}
