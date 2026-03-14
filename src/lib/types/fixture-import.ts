export type FixtureImportSourceType =
  | 'excel'
  | 'csv'
  | 'pdf_text'
  | 'pdf_scanned'
  | 'image'
  | 'pasted_text'
  | 'unknown';

export type FixtureImportDocumentType =
  | 'full_fixture'
  | 'single_round_fixture'
  | 'results_sheet'
  | 'standings_sheet'
  | 'mixed_schedule'
  | 'unknown';

export type FixtureImportConfidence = 'alta' | 'media' | 'baja';

export type FixtureImportSeverity = 'error' | 'warning' | 'info';

export type FixtureImportRowStatus =
  | 'valid'
  | 'warning'
  | 'error'
  | 'duplicate'
  | 'omitted'
  | 'approved';

export type FixtureImportAction = 'approve' | 'omit';

export type FixtureDuplicateAction = 'skip_row' | 'update_existing_match' | 'flag_for_manual_review';

export type FixtureImportFieldKey =
  | 'sport'
  | 'competition_name'
  | 'season'
  | 'phase'
  | 'group'
  | 'round'
  | 'match_date'
  | 'match_time'
  | 'home_team'
  | 'away_team'
  | 'venue'
  | 'status'
  | 'category'
  | 'gender'
  | 'country'
  | 'region'
  | 'score'
  | 'score_home'
  | 'score_away';

export interface FixtureImportIssue {
  severity: FixtureImportSeverity;
  code: string;
  message: string;
  field?: FixtureImportFieldKey | 'document' | 'row' | 'duplicate' | 'mapping';
  meta?: Record<string, unknown>;
}

export interface FixtureColumnMapping {
  home_team?: string | null;
  away_team?: string | null;
  match_date?: string | null;
  match_time?: string | null;
  venue?: string | null;
  round?: string | null;
  group?: string | null;
  phase?: string | null;
  competition_name?: string | null;
  category?: string | null;
  status?: string | null;
  score?: string | null;
  score_home?: string | null;
  score_away?: string | null;
}

export interface FixtureColumnSuggestion {
  field: keyof FixtureColumnMapping;
  header: string | null;
  confidence: FixtureImportConfidence;
}

export interface FixtureImportCandidate {
  id: string;
  label: string;
  normalizedLabel: string;
  confidence: FixtureImportConfidence;
  matchType: 'exact_match' | 'normalized_string_match' | 'alias_match' | 'fuzzy_match' | 'manual_resolution';
  aliases?: string[];
}

export interface FixtureImportNormalizedRow {
  sport: string | null;
  competitionName: string | null;
  season: number | null;
  phase: string | null;
  group: string | null;
  round: string | null;
  matchDate: string | null;
  matchTime: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  venue: string | null;
  status: string | null;
  category: string | null;
  gender: string | null;
  country: string | null;
  region: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
}

export interface FixtureImportPreviewRow {
  previewId: string;
  rowIndex: number;
  sourceLabel: string;
  status: FixtureImportRowStatus;
  action: FixtureImportAction;
  duplicateAction: FixtureDuplicateAction;
  raw: Record<string, unknown>;
  normalized: FixtureImportNormalizedRow;
  matched: {
    homeClub: FixtureImportCandidate | null;
    awayClub: FixtureImportCandidate | null;
    round: FixtureImportCandidate | null;
    group: FixtureImportCandidate | null;
    venue: FixtureImportCandidate | null;
    competition: FixtureImportCandidate | null;
    duplicateMatchId: string | null;
  };
  issues: FixtureImportIssue[];
}

export interface FixtureImportReferenceOption {
  id: string;
  label: string;
}

export interface FixtureImportReferenceData {
  clubs: FixtureImportReferenceOption[];
  rounds: FixtureImportReferenceOption[];
  groups: FixtureImportReferenceOption[];
  venues: FixtureImportReferenceOption[];
}

export interface FixtureImportJobSummary {
  jobId: string;
  status: 'draft' | 'preview_ready' | 'confirmed' | 'needs_review' | 'failed';
  sourceType: FixtureImportSourceType;
  documentType: FixtureImportDocumentType;
  confidence: FixtureImportConfidence;
  fileName: string | null;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  duplicateRows: number;
  unmatchedEntities: number;
}

export interface FixtureImportPreviewResult {
  ok: boolean;
  summary: FixtureImportJobSummary;
  mapping: {
    headers: string[];
    suggestions: FixtureColumnSuggestion[];
    selected: FixtureColumnMapping;
    needsManualMapping: boolean;
  };
  referenceData: FixtureImportReferenceData;
  issues: FixtureImportIssue[];
  rows: FixtureImportPreviewRow[];
}

export interface FixtureImportConfirmDecision {
  previewId: string;
  action: FixtureImportAction;
  duplicateAction?: FixtureDuplicateAction;
  overrides?: Partial<FixtureImportNormalizedRow> & {
    homeClubId?: string | null;
    awayClubId?: string | null;
    roundId?: string | null;
    groupId?: string | null;
    venueId?: string | null;
    existingMatchId?: string | null;
  };
}

export interface FixtureImportConfirmResult {
  ok: boolean;
  jobId: string;
  created: number;
  updated: number;
  skipped: number;
  rejected: number;
  issues: FixtureImportIssue[];
}
