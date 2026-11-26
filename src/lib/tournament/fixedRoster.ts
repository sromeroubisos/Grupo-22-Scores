/**
 * "Plantel fijo por equipo" (fixed roster per tournament).
 *
 * Pure helpers — no DB access. The config lives in JSONB only, so no migration
 * is required: it is read from `tournament_seasons.settings.fixedRoster` first
 * and falls back to `tournaments.ruleset.fixedRoster` (same dual-write pattern
 * as the `points` / `pointsSystem` contract).
 *
 * When enabled, a team's 23 registered players (`season_rosters` +
 * `roster_memberships`) are auto-derived into each match's `lineups` instead of
 * manual per-match entry. Edits to the roster propagate to future, not-yet-played
 * matches; matches that are live/played, or whose phase is at/after the
 * configurable lock instance, keep their snapshot.
 */

import { isFinalStandingsStatus } from '@/lib/standings/matchScope';
import { getRugbyModalityRules, readRugbyModality } from '@/lib/utils/rugbyModality';

export type FixedRosterConfig = {
  /** "Plantel fijo por equipo" master switch for this tournament. */
  enabled: boolean;
  /** Expected roster size (informational + soft validation). Default 23. */
  rosterSize: number;
  /** When true, surfacing < rosterSize is flagged as an error (Phase 1: warn-only by default). */
  enforceExactSize: boolean;
  /** Phase id from which the roster is frozen (this phase onward). null = never freeze. */
  lockPhaseId: string | null;
  /** Denormalized order_index of `lockPhaseId` for cheap match-vs-lock comparison. */
  lockOrderIndex: number | null;
  /**
   * Cuantos de la lista arrancan cuando el plantel no dice quien es titular.
   * null = no se asigna nada (la planilla decide, como siempre). En el seven
   * son 7: los primeros siete de la lista, el resto al banco.
   */
  startersCount: number | null;
};

export const DEFAULT_FIXED_ROSTER_CONFIG: FixedRosterConfig = {
  enabled: false,
  rosterSize: 23,
  enforceExactSize: false,
  lockPhaseId: null,
  lockOrderIndex: null,
  startersCount: null,
};

/**
 * Lo que un torneo usa cuando nadie configuro el plantel fijo. En el seven viene
 * PRENDIDO con 12 (7 + 5): un club arma su plantel una vez para el torneo y ese
 * plantel juega todos los partidos de la edicion. El 15 sigue apagado.
 */
export function getDefaultFixedRosterConfig(tournament?: { ruleset?: unknown } | null): FixedRosterConfig {
  const ruleset = tournament?.ruleset && typeof tournament.ruleset === 'object'
    ? tournament.ruleset as Record<string, unknown>
    : null;
  if (readRugbyModality(ruleset) === 'sevens') {
    const sevens = getRugbyModalityRules('sevens');
    return {
      ...DEFAULT_FIXED_ROSTER_CONFIG,
      enabled: true,
      rosterSize: sevens.lineupSize,
      startersCount: sevens.starters,
    };
  }
  return { ...DEFAULT_FIXED_ROSTER_CONFIG };
}

const MIN_ROSTER_SIZE = 1;
const MAX_ROSTER_SIZE = 40;

/** Statuses where a match has started or finished and must keep its snapshot. */
const LIVE_STATUS_TOKENS = new Set([
  'live',
  'playing',
  'ongoing',
  'in_progress',
  'half_time',
  'halftime',
  'paused',
]);

/**
 * True when the match should keep its lineup snapshot regardless of later roster
 * edits because it is already live or finished.
 */
export function isMatchRosterSnapshotStatus(status: unknown): boolean {
  if (isFinalStandingsStatus(status)) return true;
  const normalized = String(status ?? '').trim().toLowerCase();
  return LIVE_STATUS_TOKENS.has(normalized);
}

function clampRosterSize(value: unknown, fallback: number = DEFAULT_FIXED_ROSTER_CONFIG.rosterSize): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_ROSTER_SIZE, Math.max(MIN_ROSTER_SIZE, Math.trunc(n)));
}

function readRawConfig(source: unknown): Record<string, unknown> | null {
  if (!source || typeof source !== 'object') return null;
  const container = source as Record<string, unknown>;
  const raw = container.fixedRoster ?? container.fixed_roster;
  if (!raw || typeof raw !== 'object') return null;
  return raw as Record<string, unknown>;
}

function toOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function normalizeFixedRosterConfig(
  raw: unknown,
  defaults: FixedRosterConfig = DEFAULT_FIXED_ROSTER_CONFIG,
): FixedRosterConfig {
  if (!raw || typeof raw !== 'object') return { ...defaults };
  const source = raw as Record<string, unknown>;
  const lockPhaseId =
    typeof source.lockPhaseId === 'string' && source.lockPhaseId.trim()
      ? source.lockPhaseId.trim()
      : typeof source.lock_phase_id === 'string' && source.lock_phase_id.trim()
        ? source.lock_phase_id.trim()
        : null;

  return {
    enabled: Boolean(source.enabled),
    rosterSize: clampRosterSize(source.rosterSize ?? source.roster_size, defaults.rosterSize),
    enforceExactSize: Boolean(source.enforceExactSize ?? source.enforce_exact_size),
    lockPhaseId,
    lockOrderIndex: toOptionalInt(source.lockOrderIndex ?? source.lock_order_index),
    startersCount: toOptionalInt(source.startersCount ?? source.starters_count) ?? defaults.startersCount,
  };
}

/**
 * Resolve the fixed-roster config. Season `settings` wins over tournament
 * `ruleset` so the gestor's per-season edits take precedence.
 */
export function getFixedRosterConfig(
  season?: { settings?: unknown } | null,
  tournament?: { ruleset?: unknown } | null,
): FixedRosterConfig {
  const defaults = getDefaultFixedRosterConfig(tournament);
  const fromSeason = readRawConfig(season?.settings);
  if (fromSeason) return normalizeFixedRosterConfig(fromSeason, defaults);
  const fromTournament = readRawConfig(tournament?.ruleset);
  if (fromTournament) return normalizeFixedRosterConfig(fromTournament, defaults);
  return defaults;
}

/**
 * Whether a match's lineup is frozen against roster propagation.
 *
 * Locked when the match is live/played, OR when its phase order_index is at or
 * after the configured lock instance. A missing/unknown phase order never locks
 * by instance (status check stays primary and independent).
 */
export function isMatchRosterLocked(params: {
  status?: unknown;
  matchPhaseOrderIndex?: number | null;
  lockOrderIndex?: number | null;
}): boolean {
  if (isMatchRosterSnapshotStatus(params.status)) return true;
  const lock = params.lockOrderIndex;
  const phase = params.matchPhaseOrderIndex;
  if (typeof lock === 'number' && typeof phase === 'number' && phase >= lock) {
    return true;
  }
  return false;
}
