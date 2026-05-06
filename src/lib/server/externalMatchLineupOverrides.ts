import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';

export type ExternalMatchLineupOverridePlayer = {
  id?: string | null;
  number: number;
  name: string;
  position?: string | null;
  role?: string | null;
  rating: number | null;
  isCaptain?: boolean;
};

export type ExternalMatchLineupOverrideRecord = {
  id: string;
  provider: string;
  lineups: {
    home: ExternalMatchLineupOverridePlayer[];
    away: ExternalMatchLineupOverridePlayer[];
  };
  rated_by: string | null;
  rated_at: string;
  updated_at: string;
};

const MATCH_LINEUP_OVERRIDES_TABLE = 'external_match_lineup_overrides';
const STANDINGS_OVERRIDES_FALLBACK_TABLE = 'external_tournament_standings_overrides';
const FALLBACK_ID_PREFIX = 'match-lineup:';
const FALLBACK_KIND = 'match_lineup_override';

function normalizeLineups(raw: unknown) {
  const lineups = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    home: Array.isArray(lineups.home) ? (lineups.home as ExternalMatchLineupOverridePlayer[]) : [],
    away: Array.isArray(lineups.away) ? (lineups.away as ExternalMatchLineupOverridePlayer[]) : [],
  };
}

function buildFallbackId(matchId: string) {
  return `${FALLBACK_ID_PREFIX}${matchId}`;
}

function parseFallbackRecord(
  matchId: string,
  row: Record<string, unknown> | null | undefined,
): ExternalMatchLineupOverrideRecord | null {
  if (!row) return null;
  const groups = Array.isArray(row.groups) ? row.groups : [];
  const payload = groups.find((group) => (
    group &&
    typeof group === 'object' &&
    (group as Record<string, unknown>).kind === FALLBACK_KIND
  )) as Record<string, unknown> | undefined;

  if (!payload) return null;

  return {
    id: matchId,
    provider: String(payload.provider || 'external-api'),
    lineups: normalizeLineups(payload.lineups),
    rated_by: payload.rated_by ? String(payload.rated_by) : null,
    rated_at: String(payload.rated_at || row.updated_at || new Date().toISOString()),
    updated_at: String(payload.updated_at || row.updated_at || new Date().toISOString()),
  };
}

async function getFallbackExternalMatchLineupOverride(
  matchId: string,
): Promise<ExternalMatchLineupOverrideRecord | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(STANDINGS_OVERRIDES_FALLBACK_TABLE)
    .select('id, groups, updated_at')
    .eq('id', buildFallbackId(matchId))
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error, STANDINGS_OVERRIDES_FALLBACK_TABLE)) return null;
    throw new Error(error.message || 'No se pudo leer el override de alineacion externa.');
  }

  return parseFallbackRecord(matchId, data as Record<string, unknown> | null);
}

async function upsertFallbackExternalMatchLineupOverride(input: {
  matchId: string;
  provider: string;
  lineups: {
    home: ExternalMatchLineupOverridePlayer[];
    away: ExternalMatchLineupOverridePlayer[];
  };
  ratedBy: string;
  now: string;
}): Promise<ExternalMatchLineupOverrideRecord> {
  const admin = createAdminClient();
  const payload = {
    kind: FALLBACK_KIND,
    provider: input.provider,
    lineups: input.lineups,
    rated_by: input.ratedBy,
    rated_at: input.now,
    updated_at: input.now,
  };

  const { data, error } = await admin
    .from(STANDINGS_OVERRIDES_FALLBACK_TABLE)
    .upsert(
      {
        id: buildFallbackId(input.matchId),
        source: `match-lineup:${input.provider}`,
        groups: [payload],
        assignments: [],
        labels: [],
        updated_at: input.now,
      },
      { onConflict: 'id' },
    )
    .select('id, groups, updated_at')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'No se pudo guardar el override de alineacion externa.');
  }

  const parsed = parseFallbackRecord(input.matchId, data as Record<string, unknown>);
  if (!parsed) {
    throw new Error('No se pudo guardar el override de alineacion externa.');
  }

  return parsed;
}

export async function getExternalMatchLineupOverride(
  matchId: string,
): Promise<ExternalMatchLineupOverrideRecord | null> {
  const trimmed = String(matchId || '').trim();
  if (!trimmed) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from(MATCH_LINEUP_OVERRIDES_TABLE)
    .select('id, provider, lineups, rated_by, rated_at, updated_at')
    .eq('id', trimmed)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error, MATCH_LINEUP_OVERRIDES_TABLE)) {
      return getFallbackExternalMatchLineupOverride(trimmed);
    }
    throw new Error(error.message || 'No se pudo leer el override de alineacion externa.');
  }

  if (!data) return getFallbackExternalMatchLineupOverride(trimmed);

  return {
    id: String(data.id),
    provider: String(data.provider || 'flashscore'),
    lineups: normalizeLineups(data.lineups),
    rated_by: data.rated_by ? String(data.rated_by) : null,
    rated_at: data.rated_at as string,
    updated_at: data.updated_at as string,
  };
}

export async function upsertExternalMatchLineupOverride(input: {
  matchId: string;
  provider: string;
  lineups: {
    home: ExternalMatchLineupOverridePlayer[];
    away: ExternalMatchLineupOverridePlayer[];
  };
  ratedBy: string;
}): Promise<ExternalMatchLineupOverrideRecord> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from(MATCH_LINEUP_OVERRIDES_TABLE)
    .upsert(
      {
        id: input.matchId,
        provider: input.provider,
        lineups: input.lineups,
        rated_by: input.ratedBy,
        rated_at: now,
        updated_at: now,
      },
      { onConflict: 'id' },
    )
    .select('id, provider, lineups, rated_by, rated_at, updated_at')
    .single();

  if (error || !data) {
    if (error && isMissingTableError(error, MATCH_LINEUP_OVERRIDES_TABLE)) {
      return upsertFallbackExternalMatchLineupOverride({
        ...input,
        now,
      });
    }
    throw new Error(error?.message || 'No se pudo guardar el override de alineacion externa.');
  }

  return {
    id: String(data.id),
    provider: String(data.provider || 'flashscore'),
    lineups: normalizeLineups(data.lineups),
    rated_by: data.rated_by ? String(data.rated_by) : null,
    rated_at: data.rated_at as string,
    updated_at: data.updated_at as string,
  };
}
