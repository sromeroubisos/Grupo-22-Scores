/**
 * Shared types for the tournament Excel/CSV importer (Fase 3).
 *
 * The deterministic interpreter (`interpret.ts`) turns raw parsed sheets into
 * an editable `InterpretedTournament` preview. Nothing is persisted until the
 * user confirms; `commit.ts` then creates the real entities. A future AI layer
 * can produce the same `InterpretedTournament` shape.
 */

/** A raw parsed sheet: every cell stringified, row 0 may be a header. */
export interface SheetData {
  name: string;
  rows: string[][];
}

export type Confidence = 'high' | 'medium' | 'low';

/** Optional manual column mapping override, per sheet, by logical field. */
export type ColumnMapping = Record<string, Partial<Record<ImportField, number>>>;

export type ImportField =
  | 'zone'
  | 'team'
  | 'home'
  | 'away'
  | 'date'
  | 'time'
  | 'venue'
  | 'round'
  | 'category'
  | 'playerName'
  | 'playerFirstName'
  | 'playerLastName'
  | 'jersey';

export interface InterpretedTeam {
  name: string;
  zone: string | null;
  category: string | null;
}

export interface InterpretedMatch {
  round: string | null;
  home: string;
  away: string;
  date: string | null;
  time: string | null;
  venue: string | null;
  zone: string | null;
}

export interface InterpretedPlayer {
  team: string;
  fullName: string;
  jersey: number | null;
}

export interface InterpretedTournament {
  /** Best-guess tournament name (filename / title cell / sheet name). */
  name: string;
  nameConfidence: Confidence;
  categories: string[];
  zones: string[];
  teams: InterpretedTeam[];
  matches: InterpretedMatch[];
  players: InterpretedPlayer[];
  /** Detected playoff-crossing hints, e.g. "1A vs 2B" — surfaced, not auto-applied. */
  playoffHints: string[];
  /** Has a group/zone structure (=> create a group_stage phase with zones). */
  hasGroups: boolean;
  warnings: string[];
  /** Per-section detection confidence for the preview UI. */
  confidence: {
    teams: Confidence;
    zones: Confidence;
    matches: Confidence;
    players: Confidence;
  };
  stats: {
    sheets: number;
    teamCount: number;
    zoneCount: number;
    matchCount: number;
    playerCount: number;
    duplicateTeams: string[];
    duplicateMatches: number;
  };
}

/** What the user chose to actually import (partial import). */
export interface ImportSelection {
  teams: boolean;
  zones: boolean;
  matches: boolean;
  players: boolean;
}

export interface CommitResult {
  ok: boolean;
  error?: string;
  tournamentId?: string;
  seasonId?: string | null;
  created: {
    clubs: number;
    participants: number;
    phases: number;
    zones: number;
    matches: number;
    rosters: number;
    players: number;
  };
  warnings: string[];
}
