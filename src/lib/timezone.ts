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

/**
 * Normalize a timezone string to its canonical IANA form.
 * Needed because browsers may report legacy names that external APIs reject.
 */
export function canonicalizeTimezone(tz: string): string {
  return LEGACY_TZ_MAP[tz] || tz;
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
  from: number = -3,
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
