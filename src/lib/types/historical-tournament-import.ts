export type HistoricalImportConfidence = 'alta' | 'media' | 'baja' | 'sin_match';

export interface HistoricalImportIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
}

export interface HistoricalImportClubResolution {
  sourceName: string;
  normalizedName: string;
  matchedClubId: string | null;
  matchedClubName: string | null;
  matchedClubShortName: string | null;
  confidence: HistoricalImportConfidence;
  matchType: 'exact' | 'alias' | 'fuzzy' | 'manual' | 'unresolved';
  sourceCount: number;
  existingParticipant: boolean;
  options: Array<{
    id: string;
    name: string;
    shortName: string | null;
  }>;
}

export interface HistoricalImportPhasePreview {
  key: string;
  name: string;
  phaseType: 'league' | 'playoff';
  roundCount: number;
  matchCount: number;
  startDate: string | null;
  endDate: string | null;
}

export interface HistoricalImportMatchPreview {
  id: string;
  phaseKey: string;
  phaseName: string;
  roundName: string;
  roundDate: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}

export interface HistoricalImportStandingRow {
  position: number;
  teamName: string;
  matchedClubId: string | null;
  matchedClubName: string | null;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scored: number;
  conceded: number;
  difference: number;
  tryBonus: number;
  losingBonus: number;
  note: string | null;
}

export interface HistoricalImportPreviewResult {
  ok: boolean;
  summary: {
    seasonId: string;
    suggestedName: string;
    suggestedDisplayName: string;
    suggestedSlug: string;
    matchesCount: number;
    standingsCount: number;
    teamsCount: number;
    unresolvedTeams: number;
    champion: string | null;
    runnerUp: string | null;
    thirdPlace: string | null;
  };
  issues: HistoricalImportIssue[];
  phases: HistoricalImportPhasePreview[];
  clubs: HistoricalImportClubResolution[];
  matches: HistoricalImportMatchPreview[];
  standings: HistoricalImportStandingRow[];
}

export interface HistoricalImportConfirmResult {
  ok: boolean;
  tournamentId: string | null;
  relationCreated: boolean;
  created: {
    participants: number;
    phases: number;
    rounds: number;
    matches: number;
    standings: number;
  };
  warnings: string[];
}
