import { z } from 'zod';
import { MOTORSPORT_TOURNAMENTS_BY_COUNTRY, MOTORSPORT_TOURNAMENTS_INTERNATIONAL } from '@/lib/data/tournaments/motorsport';
import { RUGBY_TOURNAMENTS_INTERNATIONAL } from '@/lib/data/tournaments/rugby';
import type { ClubNameResolution } from '@/lib/integrations/whatsappMatchSync';
import { resolveClubName } from '@/lib/integrations/whatsappMatchSync';
import { hasAnyResultsApiSecretConfigured, matchesResultsApiSecretCandidates } from '@/lib/server/resultsApiKeys';
import { recalculatePhaseStandingsScopes } from '@/lib/server/recalculateStandings';
import { FixtureService } from '@/lib/services/fixtureService';
import { deriveClubAdminPointsPatch } from '@/lib/services/matchPointsSync';
import { StandingsEngine } from '@/lib/services/standingsEngine';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  APP_TIMEZONE,
  addDaysToIsoDate,
  canonicalizeTimezone,
  combineLocalDateTimeToUtcIso,
  toInputDateInTimeZone,
  toInputTimeInTimeZone,
} from '@/lib/timezone';
import type { MatchWithClubs } from '@/lib/types/fixture';

type ResultsApiClient = ReturnType<typeof createAdminClient>;

type BonusTarget = 'home' | 'away' | 'both' | 'winner' | 'none';

type TournamentLookupRow = {
  id: string;
  name: string | null;
  slug: string | null;
  category: string | null;
  ruleset: Record<string, unknown> | null;
};

type PhaseLookupRow = {
  id: string;
  name: string | null;
  phase_type: string | null;
  settings: Record<string, unknown> | null;
};

type GroupLookupRow = {
  id: string;
  name: string | null;
};

type RoundLookupRow = {
  id: string;
  name: string | null;
};

type CandidateMatchRow = {
  id: string;
  tournament_id: string | null;
  phase_id: string | null;
  group_id: string | null;
  round_uuid: string | null;
  round_id: string | null;
  category: string | null;
  date_time: string | null;
  status: string | null;
  score: Record<string, unknown> | null;
  home_club_id: string | null;
  away_club_id: string | null;
  tournament: {
    id: string;
    name: string | null;
    slug: string | null;
    category: string | null;
  } | null;
  home_club: {
    id: string;
    name: string | null;
    short_name: string | null;
  } | null;
  away_club: {
    id: string;
    name: string | null;
    short_name: string | null;
  } | null;
};

type CandidateMatch = CandidateMatchRow & {
  matched_by: 'exact_order' | 'swapped_order';
  round_name: string | null;
};

type TournamentSearchRow = {
  id: string;
  name: string | null;
  display_name?: string | null;
  slug?: string | null;
  category?: string | null;
  status?: string | null;
  is_visible?: boolean | null;
  sport_id?: string | null;
  sport?: string | null;
  external_id?: string | null;
  url?: string | null;
};

type DateSearchMatchRow = Omit<CandidateMatchRow, 'tournament'> & {
  tournament: {
    id: string;
    name: string | null;
    slug: string | null;
    category: string | null;
    status?: string | null;
    sport_id?: string | null;
    sport?: string | null;
  } | null;
  round_name: string | null;
};

type SearchFilters = {
  tournament?: string;
  category?: string;
  match_date?: string;
  round?: string;
};

type ResolvedMatchSelection = {
  matchId: string;
  match: MatchWithClubs;
  resolution: {
    matched_by: 'match_id' | 'exact_order';
    home_team?: ReturnType<typeof formatTeamResolution>;
    away_team?: ReturnType<typeof formatTeamResolution>;
  };
};

type StandingsContext = {
  tournament_id: string;
  tournament_name: string;
  tournament_category: string | null;
  phase_id: string;
  phase_name: string;
  phase_type: string | null;
  group_id: string | null;
  group_name: string | null;
};

type StandingsRow = {
  teamId: string;
  team: {
    name: string;
    logo: string | null;
  };
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points_for: number;
  points_against: number;
  difference: number;
  bonus_offensive: number;
  bonus_defensive: number;
  total_points: number;
  form: string[];
  adjustments: number;
  status: string | null;
};

type StandingsSnapshot = {
  context: StandingsContext;
  table: StandingsRow[];
  rules: ReturnType<typeof StandingsEngine.resolveRules>;
  last_calculated_at: string | null;
};

type ManualBonusResolution = {
  homeBonusPoints: number;
  awayBonusPoints: number;
  target: 'home' | 'away' | 'both' | 'none';
  warning: string | null;
};

type PublishingPieceType = 'match_result' | 'match_schedule' | 'daily_matches' | 'standings';

export type ResultsApiAuthResult =
  | { ok: true; reason?: undefined }
  | { ok: false; reason: 'missing_secret' | 'unauthorized' };

export class ResultsApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(message: string, status = 500, code = 'results_api_error', details: unknown = null) {
    super(message);
    this.name = 'ResultsApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato YYYY-MM-DD.');

const normalizedUpdatePayloadSchema = z.object({
  tournament: z.string().min(1).max(160).optional(),
  category: z.string().min(1).max(160).optional(),
  match_id: z.string().uuid('match_id debe ser un identificador valido (UUID).').optional(),
  home_team: z.string().min(1).max(160).optional(),
  away_team: z.string().min(1).max(160).optional(),
  home_score: z.number().int().min(0),
  away_score: z.number().int().min(0),
  match_date: dateSchema.optional(),
  round: z.string().min(1).max(160).optional(),
  status: z.string().min(1).max(40).optional(),
  observations: z.string().max(2000).optional(),
  corrections: z.string().max(2000).optional(),
  source: z.string().max(120).optional(),
  bonus_point: z.boolean().nullable().optional(),
  bonus_target: z.enum(['home', 'away', 'both', 'winner', 'none']).nullable().optional(),
  home_bonus_points: z.number().min(0).nullable().optional(),
  away_bonus_points: z.number().min(0).nullable().optional(),
}).superRefine((payload, ctx) => {
  if (!payload.match_id && (!payload.home_team || !payload.away_team)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['match_id'],
      message: 'Envia match_id o bien home_team y away_team.',
    });
  }
});

const normalizedSearchPayloadSchema = z.object({
  tournament: z.string().min(1).max(160).optional(),
  category: z.string().min(1).max(160).optional(),
  match_id: z.string().uuid('match_id debe ser un identificador valido (UUID).').optional(),
  home_team: z.string().min(1).max(160).optional(),
  away_team: z.string().min(1).max(160).optional(),
  match_date: dateSchema.optional(),
  round: z.string().min(1).max(160).optional(),
  limit: z.number().int().min(1).max(20).optional(),
}).superRefine((payload, ctx) => {
  if (!payload.match_id && (!payload.home_team || !payload.away_team)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['match_id'],
      message: 'Envia match_id o bien home_team y away_team.',
    });
  }
});

const normalizedTournamentSearchPayloadSchema = z.object({
  query: z.string().min(1).max(160).optional(),
  sport: z.string().min(1).max(80).optional(),
  status: z.string().min(1).max(40).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  include_static: z.boolean().optional(),
});

const normalizedMatchesByDatePayloadSchema = z.object({
  date: dateSchema,
  timezone: z.string().min(1).max(120).optional(),
  sport: z.string().min(1).max(80).optional(),
  status: z.string().min(1).max(40).optional(),
  tournament: z.string().min(1).max(160).optional(),
  tournament_id: z.string().min(1).max(120).optional(),
  category: z.string().min(1).max(160).optional(),
  team: z.string().min(1).max(160).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  include_pieces: z.boolean().optional(),
});

const publishingPieceTypeSchema = z.enum(['match_result', 'match_schedule', 'daily_matches', 'standings']);

const normalizedPublishingPiecesPayloadSchema = z.object({
  match_id: z.string().uuid('match_id debe ser un identificador valido (UUID).').optional(),
  date: dateSchema.optional(),
  timezone: z.string().min(1).max(120).optional(),
  tournament: z.string().min(1).max(160).optional(),
  tournament_id: z.string().min(1).max(120).optional(),
  category: z.string().min(1).max(160).optional(),
  round: z.string().min(1).max(160).optional(),
  home_team: z.string().min(1).max(160).optional(),
  away_team: z.string().min(1).max(160).optional(),
  team: z.string().min(1).max(160).optional(),
  piece_types: z.array(publishingPieceTypeSchema).min(1).max(4).optional(),
  limit: z.number().int().min(1).max(20).optional(),
}).superRefine((payload, ctx) => {
  if (!payload.match_id && !payload.date && (!payload.home_team || !payload.away_team)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['match_id'],
      message: 'Envia match_id, date, o bien home_team y away_team.',
    });
  }
});

export type ResultsUpdatePayload = z.infer<typeof normalizedUpdatePayloadSchema> & {
  status: string;
  source: string;
};

export type ResultsSearchPayload = z.infer<typeof normalizedSearchPayloadSchema> & {
  limit: number;
};

export type ResultsTournamentSearchPayload = z.infer<typeof normalizedTournamentSearchPayloadSchema> & {
  limit: number;
  include_static: boolean;
};

export type ResultsMatchesByDatePayload = z.infer<typeof normalizedMatchesByDatePayloadSchema> & {
  timezone: string;
  limit: number;
  include_pieces: boolean;
};

export type ResultsPublishingPiecesPayload = z.infer<typeof normalizedPublishingPiecesPayloadSchema> & {
  timezone: string;
  piece_types: PublishingPieceType[];
  limit: number;
};

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseOptionalInt(value: unknown) {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) ? Math.trunc(numeric) : undefined;
}

function parseOptionalBoolean(value: unknown) {
  return parseBooleanLike(value) ?? undefined;
}

function readStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => readText(item)).filter(Boolean);
  }

  const text = readText(value);
  if (!text) return undefined;
  return text.split(',').map((item) => item.trim()).filter(Boolean);
}

function resolveResultsTimeZone(value: unknown) {
  const candidate = readText(value) || APP_TIMEZONE;
  try {
    const canonical = canonicalizeTimezone(candidate);
    new Intl.DateTimeFormat('en-CA', { timeZone: canonical }).format(new Date());
    return canonical;
  } catch {
    return APP_TIMEZONE;
  }
}

function normalizeLookupValue(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function valuesRoughlyMatch(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeLookupValue(left);
  const b = normalizeLookupValue(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function normalizeStatus(value: unknown) {
  const normalized = readText(value).toLowerCase();
  if (!normalized) return 'final';
  if (['live', 'en vivo', 'playing', 'ongoing', 'in_progress'].includes(normalized)) return 'live';
  if (['scheduled', 'programado', 'pendiente'].includes(normalized)) return 'scheduled';
  if (['final', 'finished', 'completed', 'scored', 'ft'].includes(normalized)) return 'final';
  if (['postponed', 'aplazado'].includes(normalized)) return 'postponed';
  if (['cancelled', 'cancelado'].includes(normalized)) return 'cancelled';
  if (['suspended', 'suspendido'].includes(normalized)) return 'suspended';
  return normalized;
}

function parseRequiredScore(value: unknown) {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) ? Math.trunc(numeric) : Number.NaN;
}

function parseOptionalPointValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : Number.NaN;
}

function parseBooleanLike(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = readText(value).toLowerCase();
  if (!normalized) return null;
  if (['true', '1', 'si', 's', 'yes', 'y', 'bonus', 'con bonus', 'con punto bonus'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'sin bonus', 'sin punto bonus'].includes(normalized)) {
    return false;
  }
  return null;
}

function normalizeBonusTarget(value: unknown): BonusTarget | null {
  const normalized = readText(value).toLowerCase();
  if (!normalized) return null;
  if (['home', 'local', 'casa'].includes(normalized)) return 'home';
  if (['away', 'visitante'].includes(normalized)) return 'away';
  if (['both', 'ambos'].includes(normalized)) return 'both';
  if (['winner', 'ganador', 'winner_team'].includes(normalized)) return 'winner';
  if (['none', 'ninguno', 'sin bonus'].includes(normalized)) return 'none';
  return null;
}

function normalizeBody(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {} as Record<string, unknown>;
  }

  const record = input as Record<string, unknown>;

  if (record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)) {
    return record.payload as Record<string, unknown>;
  }

  if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
    return record.data as Record<string, unknown>;
  }

  return record;
}

function formatValidationIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || 'payload',
    message: issue.message,
  }));
}

function normalizeUpdatePayloadInput(raw: unknown) {
  const body = normalizeBody(raw);
  return {
    tournament: readText(body.tournament ?? body.competition ?? body.league) || undefined,
    category: readText(body.category) || undefined,
    match_id: readText(body.match_id ?? body.matchId) || undefined,
    home_team: readText(body.home_team ?? body.homeTeam) || undefined,
    away_team: readText(body.away_team ?? body.awayTeam) || undefined,
    home_score: parseRequiredScore(body.home_score ?? body.homeScore),
    away_score: parseRequiredScore(body.away_score ?? body.awayScore),
    match_date: readText(body.match_date ?? body.matchDate) || undefined,
    round: readText(body.round ?? body.round_label ?? body.roundLabel ?? body.jornada) || undefined,
    status: normalizeStatus(body.status),
    observations: readText(body.observations ?? body.observation ?? body.notes) || undefined,
    corrections: readText(body.corrections ?? body.correction) || undefined,
    source: readText(body.source) || undefined,
    bonus_point: parseBooleanLike(body.bonus_point ?? body.bonusPoint),
    bonus_target: normalizeBonusTarget(body.bonus_target ?? body.bonusTarget),
    home_bonus_points: parseOptionalPointValue(body.home_bonus_points ?? body.homeBonusPoints),
    away_bonus_points: parseOptionalPointValue(body.away_bonus_points ?? body.awayBonusPoints),
  };
}

function normalizeSearchPayloadInput(raw: unknown) {
  const body = normalizeBody(raw);
  const limitValue = typeof body.limit === 'number' ? body.limit : typeof body.limit === 'string' ? Number(body.limit) : Number.NaN;
  return {
    tournament: readText(body.tournament ?? body.competition ?? body.league) || undefined,
    category: readText(body.category) || undefined,
    match_id: readText(body.match_id ?? body.matchId) || undefined,
    home_team: readText(body.home_team ?? body.homeTeam) || undefined,
    away_team: readText(body.away_team ?? body.awayTeam) || undefined,
    match_date: readText(body.match_date ?? body.matchDate) || undefined,
    round: readText(body.round ?? body.round_label ?? body.roundLabel ?? body.jornada) || undefined,
    limit: Number.isFinite(limitValue) ? Math.trunc(limitValue) : undefined,
  };
}

function normalizeTournamentSearchPayloadInput(raw: unknown) {
  const body = normalizeBody(raw);
  return {
    query: readText(body.query ?? body.search ?? body.tournament) || undefined,
    sport: readText(body.sport ?? body.sport_id ?? body.sportId) || undefined,
    status: readText(body.status) || undefined,
    limit: parseOptionalInt(body.limit),
    include_static: parseOptionalBoolean(body.include_static ?? body.includeStatic),
  };
}

function normalizeMatchesByDatePayloadInput(raw: unknown) {
  const body = normalizeBody(raw);
  return {
    date: readText(body.date ?? body.match_date ?? body.matchDate),
    timezone: resolveResultsTimeZone(body.timezone ?? body.timeZone ?? body.tz),
    sport: readText(body.sport ?? body.sport_id ?? body.sportId) || undefined,
    status: readText(body.status) || undefined,
    tournament: readText(body.tournament ?? body.competition ?? body.league) || undefined,
    tournament_id: readText(body.tournament_id ?? body.tournamentId) || undefined,
    category: readText(body.category) || undefined,
    team: readText(body.team ?? body.club ?? body.equipo) || undefined,
    limit: parseOptionalInt(body.limit),
    include_pieces: parseOptionalBoolean(body.include_pieces ?? body.includePieces),
  };
}

function normalizePublishingPiecesPayloadInput(raw: unknown) {
  const body = normalizeBody(raw);
  return {
    match_id: readText(body.match_id ?? body.matchId) || undefined,
    date: readText(body.date ?? body.match_date ?? body.matchDate) || undefined,
    timezone: resolveResultsTimeZone(body.timezone ?? body.timeZone ?? body.tz),
    tournament: readText(body.tournament ?? body.competition ?? body.league) || undefined,
    tournament_id: readText(body.tournament_id ?? body.tournamentId) || undefined,
    category: readText(body.category) || undefined,
    round: readText(body.round ?? body.round_label ?? body.roundLabel ?? body.jornada) || undefined,
    home_team: readText(body.home_team ?? body.homeTeam) || undefined,
    away_team: readText(body.away_team ?? body.awayTeam) || undefined,
    team: readText(body.team ?? body.club ?? body.equipo) || undefined,
    piece_types: readStringList(body.piece_types ?? body.pieceTypes ?? body.types),
    limit: parseOptionalInt(body.limit),
  };
}

export function parseResultsUpdatePayload(raw: unknown): ResultsUpdatePayload {
  const parsed = normalizedUpdatePayloadSchema.safeParse(normalizeUpdatePayloadInput(raw));
  if (!parsed.success) {
    throw new ResultsApiError(
      'Payload invalido para actualizar resultados.',
      400,
      'invalid_payload',
      { issues: formatValidationIssues(parsed.error) },
    );
  }

  return {
    ...parsed.data,
    status: parsed.data.status ?? 'final',
    source: parsed.data.source || 'results-api',
  };
}

export function parseResultsSearchPayload(raw: unknown): ResultsSearchPayload {
  const parsed = normalizedSearchPayloadSchema.safeParse(normalizeSearchPayloadInput(raw));
  if (!parsed.success) {
    throw new ResultsApiError(
      'Payload invalido para buscar partidos.',
      400,
      'invalid_payload',
      { issues: formatValidationIssues(parsed.error) },
    );
  }

  return {
    ...parsed.data,
    limit: parsed.data.limit ?? 10,
  };
}

export function parseResultsTournamentSearchPayload(raw: unknown): ResultsTournamentSearchPayload {
  const parsed = normalizedTournamentSearchPayloadSchema.safeParse(normalizeTournamentSearchPayloadInput(raw));
  if (!parsed.success) {
    throw new ResultsApiError(
      'Payload invalido para buscar torneos.',
      400,
      'invalid_payload',
      { issues: formatValidationIssues(parsed.error) },
    );
  }

  return {
    ...parsed.data,
    limit: parsed.data.limit ?? 10,
    include_static: parsed.data.include_static ?? true,
  };
}

export function parseResultsMatchesByDatePayload(raw: unknown): ResultsMatchesByDatePayload {
  const parsed = normalizedMatchesByDatePayloadSchema.safeParse(normalizeMatchesByDatePayloadInput(raw));
  if (!parsed.success) {
    throw new ResultsApiError(
      'Payload invalido para buscar partidos por fecha.',
      400,
      'invalid_payload',
      { issues: formatValidationIssues(parsed.error) },
    );
  }

  return {
    ...parsed.data,
    timezone: parsed.data.timezone ?? APP_TIMEZONE,
    limit: parsed.data.limit ?? 50,
    include_pieces: parsed.data.include_pieces ?? false,
  };
}

export function parseResultsPublishingPiecesPayload(raw: unknown): ResultsPublishingPiecesPayload {
  const parsed = normalizedPublishingPiecesPayloadSchema.safeParse(normalizePublishingPiecesPayloadInput(raw));
  if (!parsed.success) {
    throw new ResultsApiError(
      'Payload invalido para pedir piezas publicables.',
      400,
      'invalid_payload',
      { issues: formatValidationIssues(parsed.error) },
    );
  }

  return {
    ...parsed.data,
    timezone: parsed.data.timezone ?? APP_TIMEZONE,
    piece_types: parsed.data.piece_types ?? (parsed.data.date ? ['daily_matches'] : ['match_result', 'standings']),
    limit: parsed.data.limit ?? 10,
  };
}

export async function authorizeResultsApiRequest(headers: Headers): Promise<ResultsApiAuthResult> {
  const authorization = headers.get('authorization');
  const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : null;
  const apiKey = headers.get('x-api-key')?.trim() || null;
  const webhookSecret = headers.get('x-webhook-secret')?.trim() || null;

  const authorized = await matchesResultsApiSecretCandidates([
    bearerToken,
    apiKey,
    webhookSecret,
  ]);

  if (authorized) {
    return { ok: true };
  }

  if (!await hasAnyResultsApiSecretConfigured()) {
    return { ok: false, reason: 'missing_secret' };
  }

  return { ok: false, reason: 'unauthorized' };
}

function isMissingColumnLike(error: unknown) {
  const record = error as { code?: string | null; message?: string | null; details?: string | null } | null;
  if (!record) return false;
  const haystack = `${record.message || ''} ${record.details || ''}`.toLowerCase();
  return record.code === 'PGRST204' || record.code === '42703' || haystack.includes('column');
}

function getTournamentRowSport(row: Pick<TournamentSearchRow, 'sport_id' | 'sport'>) {
  return row.sport_id || row.sport || null;
}

function serializeTournamentSearchRow(row: TournamentSearchRow) {
  const sportId = getTournamentRowSport(row);

  return {
    tournament_id: row.id,
    name: row.name || row.id,
    display_name: row.display_name || row.name || row.id,
    slug: row.slug || null,
    category: row.category || null,
    status: row.status || null,
    sport_id: sportId,
    source: 'database',
    url: row.url || null,
    external_id: row.external_id || null,
  };
}

function serializeStaticTournamentSearchRow(tournament: Record<string, unknown>) {
  const flashScoreIds = tournament.flashScoreIds && typeof tournament.flashScoreIds === 'object'
    ? tournament.flashScoreIds as Record<string, unknown>
    : null;
  const id = String(tournament.id || tournament.name || '');
  const name = String(tournament.name || id);

  return {
    tournament_id: id,
    name,
    display_name: name,
    slug: null,
    category: Array.isArray(tournament.categories) ? tournament.categories.join(', ') : null,
    status: 'published',
    sport_id: typeof tournament.sportId === 'string' ? tournament.sportId : null,
    source: 'static',
    url: typeof tournament.url === 'string' ? tournament.url : null,
    external_id: typeof flashScoreIds?.tournamentId === 'string' ? flashScoreIds.tournamentId : null,
    external_ids: flashScoreIds,
  };
}

function tournamentMatchesSearch(row: {
  name?: string | null;
  display_name?: string | null;
  slug?: string | null;
  category?: string | null;
}, query: string | undefined) {
  if (!query) return true;
  const needle = normalizeLookupValue(query);
  if (!needle) return true;

  return [
    row.name,
    row.display_name,
    row.slug,
    row.category,
  ].some((value) => normalizeLookupValue(value).includes(needle));
}

async function selectTournamentSearchRows(client: ResultsApiClient, payload: ResultsTournamentSearchPayload) {
  const variants = [
    'id, name, display_name, slug, category, status, is_visible, sport_id, sport, external_id, url',
    'id, name, display_name, slug, category, status, is_visible, sport_id, external_id, url',
    'id, name, display_name, slug, category, status, is_visible, sport, external_id, url',
    'id, name, display_name, category, status, is_visible, sport_id, sport',
    'id, name, display_name, status, is_visible, sport_id',
    'id, name, status, is_visible',
  ];
  const fetchLimit = Math.max(100, Math.min(300, payload.limit * 6));
  let lastError: unknown = null;

  for (const columns of variants) {
    let query = client
      .from('tournaments')
      .select(columns)
      .limit(fetchLimit);

    query = query.neq('is_visible', false);

    if (payload.status) {
      query = query.eq('status', payload.status);
    }

    const result = await query.order('name', { ascending: true });
    if (!result.error) {
      return (result.data ?? []) as TournamentSearchRow[];
    }

    lastError = result.error;
    if (!isMissingColumnLike(result.error)) {
      break;
    }
  }

  throw new ResultsApiError('No se pudieron buscar torneos.', 500, 'tournament_search_failed', lastError);
}

export async function searchResultsTournaments(payload: ResultsTournamentSearchPayload) {
  const client = createAdminClient();
  const dbRows = await selectTournamentSearchRows(client, payload);
  const requestedSport = normalizeLookupValue(payload.sport);
  const requestedStatus = normalizeLookupValue(payload.status);
  const databaseTournaments = dbRows
    .filter((row) => {
      const status = normalizeLookupValue(row.status);
      if (status === 'archived' || status === 'deleted') return false;
      if (requestedStatus && status !== requestedStatus) return false;
      if (requestedSport && normalizeLookupValue(getTournamentRowSport(row)) !== requestedSport) return false;
      return tournamentMatchesSearch(row, payload.query);
    })
    .map(serializeTournamentSearchRow);

  const staticTournaments = payload.include_static
    ? [
      ...RUGBY_TOURNAMENTS_INTERNATIONAL,
      ...MOTORSPORT_TOURNAMENTS_INTERNATIONAL,
      ...Object.values(MOTORSPORT_TOURNAMENTS_BY_COUNTRY).flat(),
    ]
      .map((tournament) => serializeStaticTournamentSearchRow(tournament as unknown as Record<string, unknown>))
      .filter((row) => {
        if (requestedSport && normalizeLookupValue(row.sport_id) !== requestedSport) return false;
        return tournamentMatchesSearch(row, payload.query);
      })
    : [];

  const seen = new Set<string>();
  const tournaments = [...databaseTournaments, ...staticTournaments]
    .filter((row) => {
      const key = `${row.source}:${row.tournament_id}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, payload.limit);

  return {
    ok: true,
    count: tournaments.length,
    tournaments,
  };
}

function getUtcDateRangeForLocalDate(date: string, timezone: string) {
  const start = combineLocalDateTimeToUtcIso(date, '00:00', timezone);
  const end = combineLocalDateTimeToUtcIso(addDaysToIsoDate(date, 1), '00:00', timezone);

  if (!start || !end) {
    throw new ResultsApiError('Fecha invalida para buscar partidos.', 400, 'invalid_date');
  }

  return { start, end };
}

function serializeDateSearchMatch(row: DateSearchMatchRow, timezone: string) {
  const score = normalizeScore(row.score);

  return {
    match_id: row.id,
    matched_by: 'date',
    tournament_id: row.tournament_id,
    tournament: row.tournament?.name || null,
    tournament_slug: row.tournament?.slug || null,
    category: row.category || row.tournament?.category || null,
    round: row.round_name,
    match_date: row.date_time ? toInputDateInTimeZone(row.date_time, timezone) : null,
    match_time: row.date_time ? toInputTimeInTimeZone(row.date_time, timezone) : null,
    date_time: row.date_time,
    status: row.status || null,
    sport_id: row.tournament?.sport_id || row.tournament?.sport || null,
    home_team: row.home_club?.name || null,
    away_team: row.away_club?.name || null,
    home_score: score.home,
    away_score: score.away,
  };
}

async function fetchDateSearchMatches(client: ResultsApiClient, payload: ResultsMatchesByDatePayload) {
  const { start, end } = getUtcDateRangeForLocalDate(payload.date, payload.timezone);
  const selectVariants = [
    `
      id,
      tournament_id,
      phase_id,
      group_id,
      round_uuid,
      round_id,
      category,
      date_time,
      status,
      score,
      home_club_id,
      away_club_id,
      tournament:tournaments(id, name, slug, category, status, sport_id, sport),
      home_club:clubs!matches_home_club_id_fkey(id, name, short_name),
      away_club:clubs!matches_away_club_id_fkey(id, name, short_name)
    `,
    `
      id,
      tournament_id,
      phase_id,
      group_id,
      round_uuid,
      round_id,
      category,
      date_time,
      status,
      score,
      home_club_id,
      away_club_id,
      tournament:tournaments(id, name, slug, category, status, sport_id),
      home_club:clubs!matches_home_club_id_fkey(id, name, short_name),
      away_club:clubs!matches_away_club_id_fkey(id, name, short_name)
    `,
    `
      id,
      tournament_id,
      phase_id,
      group_id,
      round_uuid,
      round_id,
      category,
      date_time,
      status,
      score,
      home_club_id,
      away_club_id,
      tournament:tournaments(id, name, slug, category, status),
      home_club:clubs!matches_home_club_id_fkey(id, name, short_name),
      away_club:clubs!matches_away_club_id_fkey(id, name, short_name)
    `,
  ];
  const fetchLimit = Math.max(payload.limit, Math.min(300, payload.limit * 4));
  let lastError: unknown = null;

  for (const columns of selectVariants) {
    let query = client
      .from('matches')
      .select(columns)
      .gte('date_time', start)
      .lt('date_time', end)
      .order('date_time', { ascending: true })
      .limit(fetchLimit);

    if (payload.tournament_id) {
      query = query.eq('tournament_id', payload.tournament_id);
    }

    if (payload.status) {
      query = query.eq('status', normalizeStatus(payload.status));
    }

    const result = await query;
    if (!result.error) {
      const rows = (result.data ?? []) as DateSearchMatchRow[];
      const roundIds = Array.from(new Set(
        rows
          .map((row) => row.round_uuid ?? row.round_id)
          .filter((value): value is string => Boolean(value)),
      ));
      const roundNames = await loadRoundNames(client, roundIds);

      return rows
        .map((row) => ({
          ...row,
          round_name: roundNames.get(row.round_uuid ?? row.round_id ?? '') ?? null,
          matched_by: 'exact_order' as const,
        }))
        .filter((row) => {
          if (payload.tournament && !valuesRoughlyMatch(row.tournament?.name, payload.tournament) && !valuesRoughlyMatch(row.tournament?.slug, payload.tournament)) {
            return false;
          }
          if (payload.sport && normalizeLookupValue(row.tournament?.sport_id || row.tournament?.sport) !== normalizeLookupValue(payload.sport)) {
            return false;
          }
          const rowCategory = row.category || row.tournament?.category || null;
          if (payload.category && !valuesRoughlyMatch(rowCategory, payload.category)) {
            return false;
          }
          if (payload.team && !valuesRoughlyMatch(row.home_club?.name, payload.team) && !valuesRoughlyMatch(row.away_club?.name, payload.team)) {
            return false;
          }
          return true;
        })
        .slice(0, payload.limit);
    }

    lastError = result.error;
    if (!isMissingColumnLike(result.error)) {
      break;
    }
  }

  throw new ResultsApiError('No se pudieron buscar partidos por fecha.', 500, 'matches_by_date_failed', lastError);
}

export async function searchResultsMatchesByDate(payload: ResultsMatchesByDatePayload) {
  const client = createAdminClient();
  const matches = (await fetchDateSearchMatches(client, payload))
    .map((row) => serializeDateSearchMatch(row, payload.timezone));

  return {
    ok: true,
    date: payload.date,
    timezone: payload.timezone,
    count: matches.length,
    matches,
    ...(payload.include_pieces ? { pieces: [buildDailyMatchesPiece(matches, payload)] } : {}),
  };
}

function formatTeamResolution(side: 'home' | 'away', resolution: ClubNameResolution) {
  return {
    side,
    input: resolution.input,
    club_id: resolution.matchedClubId,
    club_name: resolution.matchedClubName,
    short_name: resolution.matchedClubShortName,
    confidence: resolution.confidence,
    score: Number(resolution.score.toFixed(4)),
    ambiguous: resolution.ambiguous,
    alternatives: resolution.alternatives,
  };
}

function normalizeScore(score: unknown) {
  if (score && typeof score === 'object' && !Array.isArray(score)) {
    const record = score as Record<string, unknown>;
    return {
      home: Number(record.home ?? record.home_score ?? 0) || 0,
      away: Number(record.away ?? record.away_score ?? 0) || 0,
    };
  }

  if (Array.isArray(score)) {
    return {
      home: Number(score[0] ?? 0) || 0,
      away: Number(score[1] ?? 0) || 0,
    };
  }

  return { home: 0, away: 0 };
}

function serializeCandidate(candidate: CandidateMatch) {
  const score = normalizeScore(candidate.score);
  return {
    match_id: candidate.id,
    matched_by: candidate.matched_by,
    tournament: candidate.tournament?.name || null,
    tournament_slug: candidate.tournament?.slug || null,
    category: candidate.category || candidate.tournament?.category || null,
    round: candidate.round_name,
    match_date: candidate.date_time ? toInputDateInTimeZone(candidate.date_time, APP_TIMEZONE) : null,
    date_time: candidate.date_time,
    status: candidate.status || null,
    home_team: candidate.home_club?.name || null,
    away_team: candidate.away_club?.name || null,
    home_score: score.home,
    away_score: score.away,
  };
}

function candidateMatchesFilter(candidate: CandidateMatch, filters: SearchFilters) {
  if (filters.tournament && !valuesRoughlyMatch(candidate.tournament?.name, filters.tournament) && !valuesRoughlyMatch(candidate.tournament?.slug, filters.tournament)) {
    return false;
  }

  const candidateCategory = candidate.category || candidate.tournament?.category || null;
  if (filters.category && !valuesRoughlyMatch(candidateCategory, filters.category)) {
    return false;
  }

  if (filters.match_date) {
    const candidateDate = candidate.date_time ? toInputDateInTimeZone(candidate.date_time, APP_TIMEZONE) : '';
    if (candidateDate !== filters.match_date) {
      return false;
    }
  }

  if (filters.round && !valuesRoughlyMatch(candidate.round_name, filters.round)) {
    return false;
  }

  return true;
}

function compareCandidates(left: CandidateMatch, right: CandidateMatch) {
  const leftDate = left.date_time ? new Date(left.date_time).getTime() : 0;
  const rightDate = right.date_time ? new Date(right.date_time).getTime() : 0;
  if (rightDate !== leftDate) return rightDate - leftDate;

  if (left.status !== right.status) {
    return String(right.status || '').localeCompare(String(left.status || ''), 'es');
  }

  return left.id.localeCompare(right.id);
}

async function loadRoundNames(client: ResultsApiClient, roundIds: string[]) {
  if (roundIds.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await client
    .from('tournament_rounds')
    .select('id, name')
    .in('id', roundIds);

  if (error) {
    throw new ResultsApiError('No se pudieron cargar las jornadas del partido.', 500, 'round_lookup_failed', error.message);
  }

  return new Map(((data ?? []) as RoundLookupRow[]).map((row) => [row.id, row.name || row.id]));
}

async function fetchCandidateMatches(
  client: ResultsApiClient,
  homeClubId: string,
  awayClubId: string,
) {
  const selectColumns = `
    id,
    tournament_id,
    phase_id,
    group_id,
    round_uuid,
    round_id,
    category,
    date_time,
    status,
    score,
    home_club_id,
    away_club_id,
    tournament:tournaments(id, name, slug, category),
    home_club:clubs!matches_home_club_id_fkey(id, name, short_name),
    away_club:clubs!matches_away_club_id_fkey(id, name, short_name)
  `;

  const [exactResult, swappedResult] = await Promise.all([
    client
      .from('matches')
      .select(selectColumns)
      .eq('home_club_id', homeClubId)
      .eq('away_club_id', awayClubId)
      .order('date_time', { ascending: false })
      .limit(50),
    client
      .from('matches')
      .select(selectColumns)
      .eq('home_club_id', awayClubId)
      .eq('away_club_id', homeClubId)
      .order('date_time', { ascending: false })
      .limit(20),
  ]);

  if (exactResult.error) {
    throw new ResultsApiError('No se pudieron buscar los partidos del local y visitante.', 500, 'match_lookup_failed', exactResult.error.message);
  }

  if (swappedResult.error) {
    throw new ResultsApiError('No se pudieron buscar partidos alternativos para los equipos.', 500, 'match_lookup_failed', swappedResult.error.message);
  }

  const rawCandidates = [
    ...((exactResult.data ?? []) as CandidateMatchRow[]).map((row) => ({ ...row, matched_by: 'exact_order' as const })),
    ...((swappedResult.data ?? []) as CandidateMatchRow[]).map((row) => ({ ...row, matched_by: 'swapped_order' as const })),
  ];

  const roundIds = Array.from(new Set(
    rawCandidates
      .map((row) => row.round_uuid ?? row.round_id)
      .filter((value): value is string => Boolean(value)),
  ));

  const roundNames = await loadRoundNames(client, roundIds);

  return rawCandidates
    .map((row) => ({
      ...row,
      round_name: roundNames.get(row.round_uuid ?? row.round_id ?? '') ?? null,
    }))
    .sort(compareCandidates);
}

async function resolveMatchByIdentity(
  client: ResultsApiClient,
  payload: Pick<ResultsUpdatePayload | ResultsSearchPayload, 'match_id' | 'home_team' | 'away_team'>,
) {
  if (payload.match_id) {
    const match = await FixtureService.getMatch(payload.match_id);
    if (!match) {
      throw new ResultsApiError('El partido indicado por match_id no existe.', 404, 'match_not_found');
    }

    return {
      match,
      candidateMatches: [] as CandidateMatch[],
      resolution: null,
    };
  }

  const [homeResolution, awayResolution] = await Promise.all([
    resolveClubName(client, payload.home_team || ''),
    resolveClubName(client, payload.away_team || ''),
  ]);

  if (!homeResolution.matchedClubId || !awayResolution.matchedClubId) {
    throw new ResultsApiError(
      'No se pudieron resolver ambos equipos contra el catalogo local.',
      404,
      'team_resolution_failed',
      {
        home_team: formatTeamResolution('home', homeResolution),
        away_team: formatTeamResolution('away', awayResolution),
      },
    );
  }

  if (homeResolution.ambiguous || awayResolution.ambiguous) {
    throw new ResultsApiError(
      'La resolucion de equipos fue ambigua. Ajusta el nombre o envia match_id.',
      409,
      'team_resolution_ambiguous',
      {
        home_team: formatTeamResolution('home', homeResolution),
        away_team: formatTeamResolution('away', awayResolution),
      },
    );
  }

  const candidateMatches = await fetchCandidateMatches(
    client,
    homeResolution.matchedClubId,
    awayResolution.matchedClubId,
  );

  return {
    match: null,
    candidateMatches,
    resolution: {
      home_team: formatTeamResolution('home', homeResolution),
      away_team: formatTeamResolution('away', awayResolution),
    },
  };
}

function assertMatchMatchesPayload(match: MatchWithClubs, payload: Partial<ResultsUpdatePayload>) {
  if (payload.home_team && !valuesRoughlyMatch(match.homeClub?.name, payload.home_team) && !valuesRoughlyMatch(match.homeClub?.shortName, payload.home_team)) {
    throw new ResultsApiError(
      'El match_id existe, pero el equipo local enviado no coincide con el partido encontrado.',
      409,
      'home_team_mismatch',
      {
        expected: match.homeClub?.name || null,
        received: payload.home_team,
      },
    );
  }

  if (payload.away_team && !valuesRoughlyMatch(match.awayClub?.name, payload.away_team) && !valuesRoughlyMatch(match.awayClub?.shortName, payload.away_team)) {
    throw new ResultsApiError(
      'El match_id existe, pero el equipo visitante enviado no coincide con el partido encontrado.',
      409,
      'away_team_mismatch',
      {
        expected: match.awayClub?.name || null,
        received: payload.away_team,
      },
    );
  }

  if (payload.tournament && !valuesRoughlyMatch(match.tournament?.name, payload.tournament)) {
    throw new ResultsApiError(
      'El match_id existe, pero el torneo enviado no coincide con el partido encontrado.',
      409,
      'tournament_mismatch',
      {
        expected: match.tournament?.name || null,
        received: payload.tournament,
      },
    );
  }

  if (payload.category && !valuesRoughlyMatch(match.category, payload.category)) {
    throw new ResultsApiError(
      'El match_id existe, pero la categoria enviada no coincide con el partido encontrado.',
      409,
      'category_mismatch',
      {
        expected: match.category || null,
        received: payload.category,
      },
    );
  }

  if (payload.match_date) {
    const matchDate = toInputDateInTimeZone(match.dateTime, APP_TIMEZONE);
    if (matchDate !== payload.match_date) {
      throw new ResultsApiError(
        'El match_id existe, pero la fecha enviada no coincide con el partido encontrado.',
        409,
        'match_date_mismatch',
        {
          expected: matchDate,
          received: payload.match_date,
        },
      );
    }
  }

  if (payload.round && match.roundLabel && !valuesRoughlyMatch(match.roundLabel, payload.round)) {
    throw new ResultsApiError(
      'El match_id existe, pero la jornada enviada no coincide con el partido encontrado.',
      409,
      'round_mismatch',
      {
        expected: match.roundLabel,
        received: payload.round,
      },
    );
  }
}

export async function searchResultMatches(payload: ResultsSearchPayload) {
  const client = createAdminClient();
  const resolved = await resolveMatchByIdentity(client, payload);

  if (resolved.match) {
    const match = resolved.match;
    const matchDate = toInputDateInTimeZone(match.dateTime, APP_TIMEZONE);
    const serialized = {
      match_id: match.id,
      matched_by: 'match_id',
      tournament: match.tournament?.name || null,
      tournament_slug: null,
      category: match.category || null,
      round: match.roundLabel || null,
      match_date: matchDate,
      date_time: match.dateTime,
      status: match.status,
      home_team: match.homeClub?.name || null,
      away_team: match.awayClub?.name || null,
      home_score: Number(match.score?.home ?? 0),
      away_score: Number(match.score?.away ?? 0),
    };

    assertMatchMatchesPayload(match, payload);

    return {
      ok: true,
      count: 1,
      matches: [serialized],
      resolution: {
        matched_by: 'match_id',
      },
      ...await (async () => {
        try {
          const standings = await resolveStandingsSnapshot(client, match);
          return {
            standings_context: standings.context,
            rules: standings.rules,
          };
        } catch {
          return {};
        }
      })(),
    };
  }

  const exactMatches = resolved.candidateMatches.filter((candidate) => candidate.matched_by === 'exact_order');
  const filteredExactMatches = exactMatches
    .filter((candidate) => candidateMatchesFilter(candidate, payload))
    .slice(0, payload.limit)
    .map(serializeCandidate);

  const reversedMatches = resolved.candidateMatches
    .filter((candidate) => candidate.matched_by === 'swapped_order')
    .filter((candidate) => candidateMatchesFilter(candidate, payload))
    .slice(0, payload.limit)
    .map(serializeCandidate);

  let standingsContextPayload: {
    standings_context?: StandingsContext;
    rules?: ReturnType<typeof StandingsEngine.resolveRules>;
  } = {};

  if (filteredExactMatches.length === 1) {
    const selectedMatch = await FixtureService.getMatch(filteredExactMatches[0].match_id);
    if (selectedMatch) {
      try {
        const standings = await resolveStandingsSnapshot(client, selectedMatch);
        standingsContextPayload = {
          standings_context: standings.context,
          rules: standings.rules,
        };
      } catch {
        standingsContextPayload = {};
      }
    }
  }

  return {
    ok: true,
    count: filteredExactMatches.length,
    matches: filteredExactMatches,
    reversed_matches: reversedMatches,
    resolution: resolved.resolution,
    ...standingsContextPayload,
  };
}

function buildManualBonusResolution(payload: ResultsUpdatePayload): ManualBonusResolution | null {
  if (payload.home_bonus_points !== null && payload.home_bonus_points !== undefined) {
    return {
      homeBonusPoints: payload.home_bonus_points,
      awayBonusPoints: payload.away_bonus_points ?? 0,
      target:
        payload.home_bonus_points > 0 && (payload.away_bonus_points ?? 0) > 0
          ? 'both'
          : (payload.away_bonus_points ?? 0) > 0
            ? 'away'
            : payload.home_bonus_points > 0
              ? 'home'
              : 'none',
      warning: null,
    };
  }

  if (payload.away_bonus_points !== null && payload.away_bonus_points !== undefined) {
    return {
      homeBonusPoints: payload.home_bonus_points ?? 0,
      awayBonusPoints: payload.away_bonus_points,
      target:
        (payload.home_bonus_points ?? 0) > 0 && payload.away_bonus_points > 0
          ? 'both'
          : payload.away_bonus_points > 0
            ? 'away'
            : 'home',
      warning: null,
    };
  }

  if (payload.bonus_point !== true) {
    return null;
  }

  const target = payload.bonus_target ?? 'winner';
  if (target === 'home') return { homeBonusPoints: 1, awayBonusPoints: 0, target: 'home', warning: null };
  if (target === 'away') return { homeBonusPoints: 0, awayBonusPoints: 1, target: 'away', warning: null };
  if (target === 'both') return { homeBonusPoints: 1, awayBonusPoints: 1, target: 'both', warning: null };
  if (target === 'none') return { homeBonusPoints: 0, awayBonusPoints: 0, target: 'none', warning: null };

  if (payload.home_score > payload.away_score) {
    return { homeBonusPoints: 1, awayBonusPoints: 0, target: 'home', warning: null };
  }

  if (payload.away_score > payload.home_score) {
    return { homeBonusPoints: 0, awayBonusPoints: 1, target: 'away', warning: null };
  }

  return {
    homeBonusPoints: 1,
    awayBonusPoints: 1,
    target: 'both',
    warning: 'bonus_point_true_without_target_on_draw',
  };
}

function buildNotesValue(currentNotes: string | null, payload: ResultsUpdatePayload) {
  const noteLines = [
    payload.observations ? `Observaciones integracion: ${payload.observations}` : null,
    payload.corrections ? `Correcciones integracion: ${payload.corrections}` : null,
  ].filter((value): value is string => Boolean(value));

  if (noteLines.length === 0) return undefined;

  const block = [`[${payload.source}]`, ...noteLines].join('\n');
  if (!currentNotes) return block;
  if (currentNotes.includes(block)) return currentNotes;
  return `${currentNotes.trim()}\n\n${block}`;
}

async function resolveSingleMatchSelection(payload: ResultsUpdatePayload): Promise<ResolvedMatchSelection> {
  const client = createAdminClient();
  const resolved = await resolveMatchByIdentity(client, payload);

  if (resolved.match) {
    assertMatchMatchesPayload(resolved.match, payload);
    return {
      matchId: resolved.match.id,
      match: resolved.match,
      resolution: {
        matched_by: 'match_id',
      },
    };
  }

  const exactMatches = resolved.candidateMatches.filter((candidate) => candidate.matched_by === 'exact_order');
  const filteredExactMatches = exactMatches.filter((candidate) => candidateMatchesFilter(candidate, payload));

  if (filteredExactMatches.length === 0) {
    const reversedMatches = resolved.candidateMatches
      .filter((candidate) => candidate.matched_by === 'swapped_order')
      .filter((candidate) => candidateMatchesFilter(candidate, payload));

    if (reversedMatches.length > 0) {
      throw new ResultsApiError(
        'No hay un partido con ese local y visitante, pero si existe uno con los equipos invertidos.',
        409,
        'teams_reversed',
        {
          matches: reversedMatches.map(serializeCandidate),
          resolution: resolved.resolution,
        },
      );
    }

    throw new ResultsApiError(
      'No se encontro un partido que coincida con los filtros enviados.',
      404,
      'match_not_found',
      {
        resolution: resolved.resolution,
      },
    );
  }

  if (filteredExactMatches.length > 1) {
    throw new ResultsApiError(
      'Hay mas de un partido posible para esos equipos. Envia match_id o agrega fecha, torneo o jornada.',
      409,
      'match_ambiguous',
      {
        matches: filteredExactMatches.map(serializeCandidate),
        resolution: resolved.resolution,
      },
    );
  }

  const selected = filteredExactMatches[0];
  const match = await FixtureService.getMatch(selected.id);
  if (!match) {
    throw new ResultsApiError('El partido seleccionado ya no esta disponible.', 404, 'match_not_found');
  }

  return {
    matchId: match.id,
    match,
    resolution: {
      matched_by: 'exact_order',
      home_team: resolved.resolution?.home_team,
      away_team: resolved.resolution?.away_team,
    },
  };
}

async function inferGroupIdFromParticipants(
  client: ResultsApiClient,
  tournamentId: string,
  homeClubId: string | null,
  awayClubId: string | null,
) {
  if (!homeClubId || !awayClubId) return null;

  const { data, error } = await client
    .from('tournament_participants')
    .select('club_id, group_id')
    .eq('tournament_id', tournamentId)
    .in('club_id', [homeClubId, awayClubId]);

  if (error) {
    throw new ResultsApiError('No se pudo resolver el grupo del partido.', 500, 'group_lookup_failed', error.message);
  }

  const rows = (data ?? []) as Array<{ club_id: string | null; group_id: string | null }>;
  const homeGroupId = rows.find((row) => row.club_id === homeClubId)?.group_id ?? null;
  const awayGroupId = rows.find((row) => row.club_id === awayClubId)?.group_id ?? null;

  if (homeGroupId && awayGroupId && homeGroupId === awayGroupId) {
    return homeGroupId;
  }

  return homeGroupId || awayGroupId || null;
}

async function resolveStandingsSnapshot(client: ResultsApiClient, match: MatchWithClubs): Promise<StandingsSnapshot> {
  if (!match.tournamentId || !match.phaseId) {
    throw new ResultsApiError(
      'El partido existe, pero no tiene torneo o fase asociada para recalcular la tabla.',
      409,
      'standings_context_missing',
    );
  }

  const [{ data: tournamentData, error: tournamentError }, { data: phaseData, error: phaseError }] = await Promise.all([
    client
      .from('tournaments')
      .select('id, name, category, ruleset')
      .eq('id', match.tournamentId)
      .single(),
    client
      .from('tournament_phases')
      .select('id, name, phase_type, settings')
      .eq('id', match.phaseId)
      .eq('tournament_id', match.tournamentId)
      .single(),
  ]);

  const tournament = (tournamentData ?? null) as TournamentLookupRow | null;
  const phase = (phaseData ?? null) as PhaseLookupRow | null;

  if (tournamentError || !tournament) {
    throw new ResultsApiError('No se pudo cargar el torneo del partido.', 500, 'tournament_lookup_failed', tournamentError?.message);
  }

  if (phaseError || !phase) {
    throw new ResultsApiError('No se pudo cargar la fase del partido.', 500, 'phase_lookup_failed', phaseError?.message);
  }

  let groupId = match.groupId;
  if (phase.phase_type === 'group_stage' && !groupId) {
    groupId = await inferGroupIdFromParticipants(client, match.tournamentId, match.homeClubId, match.awayClubId);
  }

  if (phase.phase_type === 'group_stage' && !groupId) {
    throw new ResultsApiError(
      'El partido pertenece a una fase de grupos, pero no se pudo resolver su grupo para devolver la tabla.',
      409,
      'group_context_missing',
    );
  }

  let group: GroupLookupRow | null = null;
  if (groupId) {
    const { data: groupData, error: groupError } = await client
      .from('tournament_groups')
      .select('id, name')
      .eq('id', groupId)
      .single();

    if (groupError || !groupData) {
      throw new ResultsApiError('No se pudo cargar el grupo del partido.', 500, 'group_lookup_failed', groupError?.message);
    }

    group = (groupData ?? null) as GroupLookupRow;
  }

  let standingsQuery = client
    .from('tournament_standings')
    .select(`
      club_id,
      position,
      played,
      won,
      drawn,
      lost,
      points,
      scored,
      conceded,
      bonus_points,
      form,
      stats,
      last_updated
    `)
    .eq('tournament_id', tournament.id)
    .eq('phase_id', phase.id)
    .order('position', { ascending: true });

  if (groupId) {
    standingsQuery = standingsQuery.eq('group_id', groupId);
  } else {
    standingsQuery = (standingsQuery as typeof standingsQuery & {
      is: (column: string, value: null) => typeof standingsQuery;
    }).is('group_id', null);
  }

  const { data: standingsRows, error: standingsError } = await standingsQuery;
  if (standingsError) {
    throw new ResultsApiError('No se pudo cargar la tabla recalculada.', 500, 'standings_lookup_failed', standingsError.message);
  }

  const table = ((standingsRows ?? []) as Array<{
    club_id: string;
    position: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    points: number;
    scored: number;
    conceded: number;
    form: string | null;
    stats: Record<string, unknown> | null;
    last_updated: string | null;
  }>).map((row) => ({
    teamId: row.club_id,
    team: {
      name: String(row.stats?.team_name ?? 'Equipo'),
      logo: typeof row.stats?.team_logo === 'string' ? row.stats.team_logo : null,
    },
    position: Number(row.position ?? 0),
    played: Number(row.played ?? 0),
    won: Number(row.won ?? 0),
    drawn: Number(row.drawn ?? 0),
    lost: Number(row.lost ?? 0),
    points_for: Number(row.scored ?? 0),
    points_against: Number(row.conceded ?? 0),
    difference: Number(row.stats?.difference ?? 0),
    bonus_offensive: Number(row.stats?.bonus_offensive ?? 0),
    bonus_defensive: Number(row.stats?.bonus_defensive ?? 0),
    total_points: Number(row.points ?? 0),
    form: row.form ? String(row.form).split('') : [],
    adjustments: Number(row.stats?.adjustments ?? 0),
    status: typeof row.stats?.status === 'string' ? row.stats.status : null,
  }));

  return {
    context: {
      tournament_id: tournament.id,
      tournament_name: tournament.name || tournament.id,
      tournament_category: tournament.category || null,
      phase_id: phase.id,
      phase_name: phase.name || phase.id,
      phase_type: phase.phase_type || null,
      group_id: group?.id || null,
      group_name: group?.name || null,
    },
    table,
    rules: StandingsEngine.resolveRules(phase.settings, tournament.ruleset),
    last_calculated_at: ((standingsRows ?? [])[0] as { last_updated?: string | null } | undefined)?.last_updated ?? null,
  };
}

function getMatchTeamName(match: MatchWithClubs, side: 'home' | 'away') {
  return side === 'home'
    ? match.homeClub?.name || 'Local'
    : match.awayClub?.name || 'Visitante';
}

function getMatchStatusLabel(status: string | null | undefined) {
  const normalized = normalizeStatus(status);
  if (normalized === 'final') return 'Final';
  if (normalized === 'live') return 'En vivo';
  if (normalized === 'scheduled') return 'Programado';
  if (normalized === 'postponed') return 'Postergado';
  if (normalized === 'cancelled') return 'Cancelado';
  if (normalized === 'suspended') return 'Suspendido';
  return status || 'Partido';
}

function buildMatchPiece(match: MatchWithClubs, timezone: string, type: 'match_result' | 'match_schedule') {
  const homeTeam = getMatchTeamName(match, 'home');
  const awayTeam = getMatchTeamName(match, 'away');
  const score = normalizeScore(match.score);
  const date = toInputDateInTimeZone(match.dateTime, timezone);
  const time = toInputTimeInTimeZone(match.dateTime, timezone);
  const tournament = match.tournament?.name || 'G22 Scores';
  const statusLabel = getMatchStatusLabel(match.status);
  const isResult = type === 'match_result';
  const scoreLine = isResult
    ? `${homeTeam} ${score.home}-${score.away} ${awayTeam}`
    : `${homeTeam} vs ${awayTeam}`;
  const title = isResult ? `${statusLabel}: ${scoreLine}` : `${time} - ${scoreLine}`;
  const caption = isResult
    ? `${statusLabel} en ${tournament}: ${scoreLine}.`
    : `${tournament}: ${homeTeam} vs ${awayTeam}, ${date} ${time}${match.venue ? ` en ${match.venue}` : ''}.`;

  return {
    piece_id: `${type}-${match.id}`,
    type,
    status: 'ready',
    title,
    caption,
    whatsapp_text: [
      isResult ? 'Resultado cargado' : 'Partido programado',
      scoreLine,
      `${tournament}${match.roundLabel ? ` - ${match.roundLabel}` : ''}`,
      `${date}${time ? ` ${time}` : ''}`,
    ].filter(Boolean).join('\n'),
    alt_text: `${title}. ${tournament}.`,
    suggested_filename: `g22-${type}-${match.id}`,
    source: {
      match_id: match.id,
      tournament_id: match.tournamentId,
      phase_id: match.phaseId,
      group_id: match.groupId,
    },
    render: {
      status: 'render_payload_ready',
      engine: 'ExportImage',
      template: 'matchStats',
      formats: ['1080x1350', '1080x1920'],
      data: {
        mainTitle: isResult ? statusLabel : 'Proximo partido',
        status: normalizeStatus(match.status) === 'scheduled' ? 'scheduled' : normalizeStatus(match.status) === 'live' ? 'live' : 'final',
        homeTeam,
        awayTeam,
        homeScore: isResult ? score.home : null,
        awayScore: isResult ? score.away : null,
        homeLogo: match.homeClub?.logo || undefined,
        awayLogo: match.awayClub?.logo || undefined,
        tournament,
        tournamentLogo: match.tournament?.logo || undefined,
        date,
        time,
        venue: match.venue || undefined,
        kickoffAt: match.dateTime,
        stats: [],
      },
    },
  };
}

function buildDailyMatchesPiece(
  matches: Array<ReturnType<typeof serializeDateSearchMatch>>,
  payload: Pick<ResultsMatchesByDatePayload, 'date' | 'timezone' | 'tournament'>,
) {
  const tournamentLabel = payload.tournament || (matches.length === 1 ? matches[0].tournament || 'G22 Scores' : 'G22 Scores');
  const lines = matches.map((match) => {
    const time = match.match_time || '--:--';
    const score = normalizeStatus(match.status) === 'scheduled'
      ? 'vs'
      : `${match.home_score}-${match.away_score}`;
    return `${time} ${match.home_team || 'Local'} ${score} ${match.away_team || 'Visitante'}`;
  });

  return {
    piece_id: `daily-matches-${payload.date}`,
    type: 'daily_matches',
    status: 'ready',
    title: `Partidos del ${payload.date}`,
    caption: lines.length > 0
      ? [`Agenda ${payload.date}`, ...lines].join('\n')
      : `No hay partidos cargados para ${payload.date}.`,
    whatsapp_text: lines.length > 0
      ? [`Partidos ${payload.date}`, ...lines].join('\n')
      : `No hay partidos cargados para ${payload.date}.`,
    alt_text: `Agenda de partidos de G22 Scores para ${payload.date}.`,
    suggested_filename: `g22-daily-matches-${payload.date}`,
    source: {
      date: payload.date,
      timezone: payload.timezone,
      match_ids: matches.map((match) => match.match_id),
    },
    render: {
      status: 'render_payload_ready',
      engine: 'ExportImage',
      template: 'dailyMatches',
      formats: ['1080x1350', '1080x1920'],
      data: {
        date: payload.date,
        tournament: tournamentLabel,
        matches: matches.map((match) => ({
          homeTeam: match.home_team || 'Local',
          awayTeam: match.away_team || 'Visitante',
          homeScore: normalizeStatus(match.status) === 'scheduled' ? undefined : match.home_score,
          awayScore: normalizeStatus(match.status) === 'scheduled' ? undefined : match.away_score,
          time: match.match_time || '--:--',
          status: normalizeStatus(match.status) === 'final' ? 'finished' : normalizeStatus(match.status) === 'live' ? 'live' : 'scheduled',
          dateLabel: match.match_date || payload.date,
          kickoffAt: match.date_time,
        })),
      },
    },
  };
}

function buildStandingsPiece(match: MatchWithClubs, standings: StandingsSnapshot) {
  const leader = standings.table[0];
  const title = `Tabla actualizada: ${standings.context.tournament_name}`;
  const caption = leader
    ? `${title}. Lider: ${leader.team.name} con ${leader.total_points} pts.`
    : `${title}.`;

  return {
    piece_id: `standings-${standings.context.tournament_id}-${standings.context.phase_id}-${standings.context.group_id || 'general'}`,
    type: 'standings',
    status: 'ready',
    title,
    caption,
    whatsapp_text: [
      title,
      ...standings.table.slice(0, 8).map((row) => `${row.position}. ${row.team.name} - ${row.total_points} pts`),
    ].join('\n'),
    alt_text: `Tabla de posiciones de ${standings.context.tournament_name}.`,
    suggested_filename: `g22-standings-${standings.context.tournament_id}`,
    source: {
      match_id: match.id,
      tournament_id: standings.context.tournament_id,
      phase_id: standings.context.phase_id,
      group_id: standings.context.group_id,
    },
    render: {
      status: 'render_payload_ready',
      engine: 'ExportImage',
      template: 'standings',
      formats: ['1080x1350', '1080x1920'],
      data: {
        title: standings.context.tournament_name,
        subtitle: [standings.context.phase_name, standings.context.group_name].filter(Boolean).join(' - '),
        tournamentLogo: match.tournament?.logo || undefined,
        rows: standings.table.map((row) => ({
          pos: row.position,
          team: row.team.name,
          teamLogo: row.team.logo || undefined,
          played: row.played,
          won: row.won,
          lost: row.lost,
          diff: row.difference > 0 ? `+${row.difference}` : String(row.difference),
          points: row.total_points,
        })),
      },
    },
  };
}

async function resolveMatchesForPublishingPieces(payload: ResultsPublishingPiecesPayload) {
  if (payload.match_id) {
    const match = await FixtureService.getMatch(payload.match_id);
    return match ? [match] : [];
  }

  if (payload.date) {
    const datePayload: ResultsMatchesByDatePayload = {
      date: payload.date,
      timezone: payload.timezone,
      sport: undefined,
      status: undefined,
      tournament: payload.tournament,
      tournament_id: payload.tournament_id,
      category: payload.category,
      team: payload.team,
      limit: payload.limit,
      include_pieces: false,
    };
    let rows = await fetchDateSearchMatches(createAdminClient(), datePayload);
    if (payload.home_team) {
      rows = rows.filter((row) => valuesRoughlyMatch(row.home_club?.name, payload.home_team));
    }
    if (payload.away_team) {
      rows = rows.filter((row) => valuesRoughlyMatch(row.away_club?.name, payload.away_team));
    }
    const matches = await Promise.all(rows.map((row) => FixtureService.getMatch(row.id)));
    return matches.filter((match): match is MatchWithClubs => Boolean(match));
  }

  const searchResult = await searchResultMatches({
    tournament: payload.tournament,
    category: payload.category,
    home_team: payload.home_team,
    away_team: payload.away_team,
    match_date: undefined,
    round: payload.round,
    limit: payload.limit,
  });
  const matches = await Promise.all(searchResult.matches.map((match) => FixtureService.getMatch(match.match_id)));
  return matches.filter((match): match is MatchWithClubs => Boolean(match));
}

export async function getResultsPublishingPieces(payload: ResultsPublishingPiecesPayload) {
  const client = createAdminClient();
  const matches = await resolveMatchesForPublishingPieces(payload);

  if (matches.length === 0) {
    throw new ResultsApiError('No se encontraron partidos para generar piezas publicables.', 404, 'match_not_found');
  }

  const pieces: Array<Record<string, unknown>> = [];
  const warnings: string[] = [];

  if (payload.piece_types.includes('daily_matches') && !payload.date) {
    warnings.push('daily_matches_requires_date');
  }

  if (payload.piece_types.includes('daily_matches') && payload.date) {
    const serializedMatches = matches.map((match) => ({
      match_id: match.id,
      matched_by: 'date',
      tournament_id: match.tournamentId,
      tournament: match.tournament?.name || null,
      tournament_slug: null,
      category: match.category || null,
      round: match.roundLabel || null,
      match_date: toInputDateInTimeZone(match.dateTime, payload.timezone),
      match_time: toInputTimeInTimeZone(match.dateTime, payload.timezone),
      date_time: match.dateTime,
      status: match.status,
      sport_id: null,
      home_team: match.homeClub?.name || null,
      away_team: match.awayClub?.name || null,
      home_score: Number(match.score?.home ?? 0),
      away_score: Number(match.score?.away ?? 0),
    }));
    pieces.push(buildDailyMatchesPiece(serializedMatches, {
      date: payload.date,
      timezone: payload.timezone,
      tournament: payload.tournament,
    }));
  }

  for (const match of matches) {
    if (payload.piece_types.includes('match_result')) {
      pieces.push(buildMatchPiece(match, payload.timezone, 'match_result'));
    }

    if (payload.piece_types.includes('match_schedule')) {
      pieces.push(buildMatchPiece(match, payload.timezone, 'match_schedule'));
    }

    if (payload.piece_types.includes('standings')) {
      try {
        const standings = await resolveStandingsSnapshot(client, match);
        pieces.push(buildStandingsPiece(match, standings));
      } catch (error) {
        warnings.push(error instanceof ResultsApiError ? error.code : 'standings_unavailable');
      }
    }
  }

  return {
    ok: true,
    count: pieces.length,
    match_count: matches.length,
    pieces,
    warnings,
  };
}

function buildSummary(params: {
  previousMatch: MatchWithClubs;
  updatedMatch: MatchWithClubs;
  previousStandings: StandingsSnapshot;
  nextStandings: StandingsSnapshot;
}) {
  const previousScore = normalizeScore(params.previousMatch.score);
  const nextScore = normalizeScore(params.updatedMatch.score);
  const homeTeamName = params.updatedMatch.homeClub?.name || 'Local';
  const awayTeamName = params.updatedMatch.awayClub?.name || 'Visitante';

  const changes: string[] = [];
  if (previousScore.home !== nextScore.home || previousScore.away !== nextScore.away) {
    changes.push(`Marcador: ${homeTeamName} ${previousScore.home}-${previousScore.away} ${awayTeamName} -> ${nextScore.home}-${nextScore.away}`);
  }

  if (params.previousMatch.status !== params.updatedMatch.status) {
    changes.push(`Estado: ${params.previousMatch.status || 'sin estado'} -> ${params.updatedMatch.status || 'sin estado'}`);
  }

  const previousPositions = new Map(params.previousStandings.table.map((row) => [row.teamId, row.position]));
  const nextPositions = new Map(params.nextStandings.table.map((row) => [row.teamId, row.position]));

  const updatedTeams = [
    {
      id: params.updatedMatch.homeClub?.id || params.updatedMatch.homeClubId || null,
      name: homeTeamName,
    },
    {
      id: params.updatedMatch.awayClub?.id || params.updatedMatch.awayClubId || null,
      name: awayTeamName,
    },
  ];

  updatedTeams.forEach((team) => {
    if (!team.id) return;
    const before = previousPositions.get(team.id);
    const after = nextPositions.get(team.id);
    if (!before || !after || before === after) return;
    const movement = after < before ? 'subio' : 'bajo';
    changes.push(`${team.name} ${movement} del puesto ${before} al ${after}`);
  });

  const previousLeader = params.previousStandings.table[0];
  const nextLeader = params.nextStandings.table[0];
  if (previousLeader?.teamId && nextLeader?.teamId && previousLeader.teamId !== nextLeader.teamId) {
    changes.push(`Nuevo lider: ${nextLeader.team.name}`);
  }

  if (changes.length === 0) {
    changes.push('Tabla recalculada sin cambios visibles de posiciones.');
  }

  return {
    short: changes[0],
    changes,
  };
}

export async function updateResultAndRecalculate(payload: ResultsUpdatePayload) {
  const client = createAdminClient();
  const selection = await resolveSingleMatchSelection(payload);
  const previousMatch = selection.match;
  const previousStandings = await resolveStandingsSnapshot(client, previousMatch);

  const updatePayload: Record<string, unknown> = {
    status: payload.status,
    score: {
      home: payload.home_score,
      away: payload.away_score,
    },
  };

  const nextNotes = buildNotesValue(previousMatch.notes, payload);
  if (nextNotes !== undefined) {
    updatePayload.notes = nextNotes;
  }

  const derivedPointsPatch = await deriveClubAdminPointsPatch(client, previousMatch.id, {
    status: payload.status,
    score: updatePayload.score,
  });

  if (derivedPointsPatch) {
    Object.assign(updatePayload, derivedPointsPatch);
  }

  const manualBonus = buildManualBonusResolution(payload);
  if (manualBonus) {
    updatePayload.homeBonusPoints = manualBonus.homeBonusPoints;
    updatePayload.awayBonusPoints = manualBonus.awayBonusPoints;
    updatePayload.pointsAutocalculated = false;
    updatePayload.pointsOverrideReason = [
      'Results API update',
      payload.source,
      payload.observations ? 'observations_attached' : null,
      payload.corrections ? 'corrections_attached' : null,
    ].filter(Boolean).join(' | ');
  }

  await FixtureService.updateMatch(previousMatch.id, updatePayload, client);

  const recalcResult = await recalculatePhaseStandingsScopes(
    previousStandings.context.tournament_id,
    previousStandings.context.phase_id,
    'general',
  );

  if (!recalcResult.ok) {
    throw new ResultsApiError('No se pudo recalcular la tabla luego de actualizar el partido.', 500, 'standings_recalculate_failed');
  }

  const updatedMatch = await FixtureService.getMatch(previousMatch.id);
  if (!updatedMatch) {
    throw new ResultsApiError('El partido se actualizo, pero no se pudo recargar para la respuesta.', 500, 'match_reload_failed');
  }

  const nextStandings = await resolveStandingsSnapshot(client, updatedMatch);
  const summary = buildSummary({
    previousMatch,
    updatedMatch,
    previousStandings,
    nextStandings,
  });

  return {
    ok: true,
    updated_match: {
      match_id: updatedMatch.id,
      tournament: updatedMatch.tournament?.name || null,
      category: updatedMatch.category || null,
      status: updatedMatch.status,
      match_date: toInputDateInTimeZone(updatedMatch.dateTime, APP_TIMEZONE),
      date_time: updatedMatch.dateTime,
      home_team: updatedMatch.homeClub?.name || null,
      away_team: updatedMatch.awayClub?.name || null,
      home_score: Number(updatedMatch.score?.home ?? 0),
      away_score: Number(updatedMatch.score?.away ?? 0),
      home_bonus_points: updatedMatch.homeBonusPoints ?? null,
      away_bonus_points: updatedMatch.awayBonusPoints ?? null,
      points_autocalculated: updatedMatch.pointsAutocalculated ?? null,
      notes: updatedMatch.notes ?? null,
    },
    standings_updated: true,
    standings_context: nextStandings.context,
    rules: nextStandings.rules,
    table: nextStandings.table,
    summary,
    resolution: selection.resolution,
    warnings: manualBonus?.warning ? [manualBonus.warning] : [],
  };
}

export function toResultsApiError(error: unknown) {
  if (error instanceof ResultsApiError) {
    return error;
  }

  return new ResultsApiError(
    error instanceof Error ? error.message : 'Internal server error',
    500,
    'internal_error',
  );
}
