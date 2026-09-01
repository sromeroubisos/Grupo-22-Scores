/**
 * Fixture Management Types
 * Following professional sports admin structure:
 * Tournament → Phase → Round → Match
 */

// ─── MATCH TYPES ────────────────────────────────────────────────────────────────

export type MatchStatus = 'scheduled' | 'live' | 'final' | 'postponed' | 'suspended' | 'cancelled';

export interface MatchScore {
  home: number;
  away: number;
  /**
   * Tries de cada lado. Ya viajaban en el JSONB de `matches.score` y el motor
   * de bonus los lee de ahí (`countTeamEventMetric` los busca antes de mirar
   * los eventos), pero el tipo no los declaraba: por eso la carga rápida no
   * los pedía y el bonus ofensivo había que ponerlo a mano.
   *
   * `null` significa "no se cargaron", que no es lo mismo que cero: sin el
   * dato, el bonus por 4+ tries no se puede calcular y no se inventa.
   */
  homeTries?: number | null;
  awayTries?: number | null;
  penalties?: {
    home: number | null;
    away: number | null;
  } | null;
}

export interface MatchClock {
  minute?: number;
  seconds?: number;
  period?: string;
  running?: boolean;
}

export interface Match {
  id: string;
  tournamentId: string;
  phaseId: string | null; // Persistence column: phase_id
  roundId: string | null; // UUID reference to tournament_rounds
  roundLabel?: string | null; // Persistence column: round_label
  groupId: string | null; // Persistence column: group_id
  referee?: string | null; // Persistence column: referee
  pitch?: string | null; // Persistence column: pitch

  // Teams
  homeClubId: string | null;
  awayClubId: string | null;
  homeSquadId?: string | null;
  awaySquadId?: string | null;
  category?: string | null;

  // Scheduling
  dateTime: string; // ISO timestamp
  venue: string | null;

  // Match details
  status: MatchStatus;
  score: MatchScore;
  clock?: MatchClock | null;
  notes: string | null;
  homeBasePoints?: number | null;
  awayBasePoints?: number | null;
  homeBonusPoints?: number | null;
  awayBonusPoints?: number | null;
  pointsAutocalculated?: boolean | null;
  pointsOverrideReason?: string | null;

  // Broadcasting & Media
  streamUrl?: string | null;
  replayUrl?: string | null;

  // N° de partido en el sistema de la unión (BD UAR u otro). Opcional; se usa
  // al exportar la planilla oficial. Persistence column: official_sheet_number.
  officialSheetNumber?: string | null;

  // Metadata
  createdAt: string;
  updatedAt: string;
  lineups?: {
    home: any[];
    away: any[];
  } | null;
  events?: any[] | null;
}

export interface MatchWithClubs extends Match {
  tournament?: {
    id: string;
    name: string;
    logo: string | null;
  } | null;
  homeClub: {
    id: string;
    name: string;
    shortName: string | null;
    logo: string | null;
  } | null;
  awayClub: {
    id: string;
    name: string;
    shortName: string | null;
    logo: string | null;
  } | null;
}

// ─── ROUND TYPES ────────────────────────────────────────────────────────────────

export interface TournamentRound {
  id: string;
  phaseId: string;
  name: string; // "Fecha 1", "Cuartos de Final"
  orderIndex: number;
  startDate: string | null;
  endDate: string | null;
  isCompleted: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoundWithMatches extends TournamentRound {
  matches: MatchWithClubs[];
  matchCount: number;
}

// ─── PHASE TYPES ────────────────────────────────────────────────────────────────

export type PhaseType = 'league' | 'knockout' | 'group_stage' | 'playoff';

export interface TournamentPhase {
  id: string;
  tournamentId: string;
  name: string; // "Fase de Grupos", "Playoffs"
  phaseType: PhaseType;
  orderIndex: number;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  settings: Record<string, any>; // round-robin, home/away, etc.
  createdAt: string;
  updatedAt: string;
}

export interface PhaseWithRounds extends TournamentPhase {
  rounds: RoundWithMatches[];
  roundCount: number;
}

// ─── FIXTURE STRUCTURE ──────────────────────────────────────────────────────────

export interface TournamentParticipantInfo {
  id: string; // participant_id
  clubId: string | null;
  name: string;
  shortCode: string | null;
  logo: string | null;
}

export interface TournamentFixture {
  tournamentId: string;
  tournamentName: string;
  tournamentSeason: string | null;
  currentPhaseId: string | null;
  currentRoundId: string | null;
  phases: PhaseWithRounds[];
  participants: TournamentParticipantInfo[];
  /** true si el fixture superó la cota de partidos y se truncó (la UI debe paginar/avisar). Ver GESTOR_TORNEOS_HALLAZGOS.md H4. */
  matchesTruncated?: boolean;
}

// ─── EDITOR TYPES ───────────────────────────────────────────────────────────────

export interface MatchFormData {
  phaseId: string; // Persistence column: phase_id
  roundId: string | null;
  roundLabel?: string;
  groupId?: string | null; // Persistence column: group_id
  // Nullable so playoff/knockout placeholder matches (TBD slots) can be saved
  // with only a schedule, before the qualifying teams are known.
  homeClubId: string | null;
  awayClubId: string | null;
  homeSquadId?: string | null;
  awaySquadId?: string | null;
  category?: string | null;
  dateTime: string;
  venue: string;
  status: MatchStatus;
  streamUrl?: string | null;
  replayUrl?: string | null;
  notes?: string | null;
  referee?: string | null;
  pitch?: string | null;
  officialSheetNumber?: string | null;
  score?: MatchScore | null;
  clock?: MatchClock | null;
  homeBasePoints?: number | null;
  awayBasePoints?: number | null;
  homeBonusPoints?: number | null;
  awayBonusPoints?: number | null;
  pointsAutocalculated?: boolean | null;
  pointsOverrideReason?: string | null;
  lineups?: {
    home: any[];
    away: any[];
  } | null;
  events?: any[] | null;
  // Persistence column: is_visible. El alta lo manda desde "Público"; sin el
  // campo, la columna queda en su default.
  isVisible?: boolean | null;
}

export interface RoundFormData {
  phaseId: string;
  name: string;
  orderIndex: number;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
}

export interface PhaseFormData {
  tournamentId: string;
  name: string;
  phaseType: PhaseType;
  orderIndex: number;
  startDate?: string | null;
  endDate?: string | null;
  settings?: Record<string, any>;
}

// ─── FIXTURE GENERATION ─────────────────────────────────────────────────────────

export interface FixtureGenerationParams {
  phaseId: string;
  clubIds: string[];
  startDate: string;
  matchTime: string; // "16:00"
  venue: string;
  roundsCount?: number;
  homeAndAway?: boolean;
  groupId?: string | null;
}

// ─── MASS ACTIONS ───────────────────────────────────────────────────────────────

export interface MassRescheduleParams {
  roundId: string;
  newDate?: string;
  newTime?: string;
  newVenue?: string;
}

export interface MoveMatchesParams {
  matchIds: string[];
  targetRoundId: string;
}

export interface ResetRoundParams {
  roundId: string;
  deleteMatches: boolean;
}

// ─── VIEW PREFERENCES ───────────────────────────────────────────────────────────

export type FixtureViewMode = 'rounds' | 'list' | 'calendar' | 'groups';

export interface FixtureViewState {
  mode: FixtureViewMode;
  selectedPhaseId: string | null;
  selectedRoundId: string | null;
  filterStatus: MatchStatus | 'all';
  sortBy: 'date' | 'venue' | 'status';
}
