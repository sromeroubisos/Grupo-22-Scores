export interface ClubInfo {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
}

export interface TournamentInfo {
  id: string;
  name: string;
  logo_url?: string | null;
  sport_id?: string | null;
}

export interface MatchData {
  id: string;
  date_time: string | null;
  status: string;
  venue: string | null;
  score:
    | {
      home: number | null;
      away: number | null;
      penalties?: { home: number | null; away: number | null } | null;
      homeTries?: number | null;
      awayTries?: number | null;
      notes?: string | null;
      manualOverride?: {
        home: number | null;
        away: number | null;
        cutoffMinute?: number | null;
      } | null;
      [key: string]: unknown;
    }
    | null;
  notes: string | null;
  lineups: unknown;
  events: unknown;
  clock: unknown;
  homeClub?: ClubInfo | null;
  awayClub?: ClubInfo | null;
  tournament?: TournamentInfo | null;
  referee: string | null;
  broadcast_url: string | null;
  stream_url?: string | null;
  replay_url?: string | null;
  roundLabel?: string | null;
  category?: string | null;
  phase_id?: string | null;
  round_id?: string | null;
  home_base_points?: number | null;
  away_base_points?: number | null;
  home_bonus_points?: number | null;
  away_bonus_points?: number | null;
  points_autocalculated?: boolean | null;
  points_override_reason?: string | null;
}

export interface Division {
  id: string;
  name: string | null;
  category: string | null;
  sport: string | null;
}

export type SectionTab =
  | 'resumen'
  | 'alineacion'
  | 'vivo'
  | 'estadisticas'
  | 'postpartido'
  | 'contenido';

export type AvailabilityStatus = 'confirmed' | 'pending' | 'doubtful' | 'injured' | 'unavailable';
export type MatchStatus = 'scheduled' | 'live' | 'final' | 'suspended' | 'postponed';
export type MatchEventTeam = 'home' | 'away' | null;
export type LiveSubview = 'eventos' | 'datos';
export type LivePhase = '1T' | 'HT' | '2T' | 'FT';
export type LiveActionType = 'try' | 'conversion' | 'penalty' | 'tackle' | 'substitution' | 'scrum' | 'line' | 'card' | 'knock_on' | 'forward_pass' | 'free_kick' | 'penalty_try' | 'kick' | 'ruck' | 'pass' | 'match_start' | 'match_half' | 'match_end' | 'entradas_22';

export interface ClubCallup {
  name: string;
  status: AvailabilityStatus;
  attendance?: string;
  position: string;
  note: string;
}

export interface MatchLineupPlayer {
  id?: string;
  number?: number | string;
  name: string;
  position?: string;
  role?: string;
  rating?: number | null;
  isCaptain?: boolean;
  squadMemberId?: string | null;
  divisionId?: string | null;
}

export interface ClubPostMatch {
  analysis: string;
  report: string;
  recovery: string;
  nextSteps: string;
}

export interface ClubMediaPlan {
  headline: string;
  socialCopy: string;
  assetStatus: 'pending' | 'ready' | 'published';
}

export interface ClubStatsSummary {
  overview: string;
  keyNumbers: string;
  pendingFocus: string;
}

export interface ClubWorkflow {
  preMatch: string;
  postMatch: string;
}

export interface ClubLiveControl {
  phase: LivePhase;
  minute: string;
  homeResult: 'win' | 'draw' | 'loss';
  awayResult: 'win' | 'draw' | 'loss';
  homeTablePoints: string;
  awayTablePoints: string;
  homeBonusOffensive: boolean;
  awayBonusOffensive: boolean;
  homeBonusDefensive: boolean;
  awayBonusDefensive: boolean;
}

export interface ClubLineupsState {
  home: MatchLineupPlayer[];
  away: MatchLineupPlayer[];
  callups: ClubCallup[];
  tacticalNotes: string;
  postmatch: ClubPostMatch;
  media: ClubMediaPlan;
  statsSummary: ClubStatsSummary;
  workflow: ClubWorkflow;
  liveControl: ClubLiveControl;
  [key: string]: unknown;
}

export interface ClubLiveEvent {
  id: string;
  minute: string;
  type: string;
  team: MatchEventTeam;
  playerId?: string | null;
  playerName: string;
  secondaryPlayerId?: string | null;
  secondaryPlayerName?: string | null;
  detail: string;
  parentEventId?: string;
  sequence?: number;
  videoTime?: string;
}

export interface MatchClockState {
  minute?: number | null;
  seconds?: number | null;
  period?: string | null;
  running?: boolean | null;
  syncedAt?: string | null;
}

export interface MatchDraftState {
  status: MatchStatus;
  dateTime: string;
  venue: string;
  referee: string;
  broadcastUrl: string;
  score: {
    home: string;
    away: string;
  };
}

export interface SaveFeedback {
  tone: 'success' | 'error' | 'info';
  message: string;
}

export type SaveUiState = 'idle' | 'saving' | 'saved' | 'error' | 'unchanged';

export interface LiveComposerState {
  mode: 'create' | 'edit';
  action: LiveActionType;
  eventId?: string;
  minute: string;
  team: 'home' | 'away';
  playerName: string;
  secondaryPlayerName: string;
  outcome: string;
  zone: string;
  reason: string;
  followUpAction: '' | 'scrum' | 'lineout' | 'goal' | 'none';
  followUpOutcome: '' | 'won' | 'lost';
  secondaryTeam: 'home' | 'away';
  penaltyReason: string;
  kickDistance: string;
  kickType: '' | 'touch' | '50_22' | 'drop_ingoal' | '22_exit' | 'clearance' | 'box_kick' | 'up_and_under' | 'cross_kick';
  videoTime: string;
  passType: '' | 'long' | 'short' | 'inside' | 'outside' | 'miss' | 'offload';
}
