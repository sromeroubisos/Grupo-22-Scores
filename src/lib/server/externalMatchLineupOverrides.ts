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

const MISSING_TABLE_NAME = 'external_match_lineup_overrides';

export async function getExternalMatchLineupOverride(
  matchId: string,
): Promise<ExternalMatchLineupOverrideRecord | null> {
  const trimmed = String(matchId || '').trim();
  if (!trimmed) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from(MISSING_TABLE_NAME)
    .select('id, provider, lineups, rated_by, rated_at, updated_at')
    .eq('id', trimmed)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error, MISSING_TABLE_NAME)) {
      return null;
    }
    throw new Error(error.message || 'No se pudo leer el override de alineacion externa.');
  }

  if (!data) return null;

  const lineups = data.lineups && typeof data.lineups === 'object' ? data.lineups as Record<string, unknown> : {};
  return {
    id: String(data.id),
    provider: String(data.provider || 'flashscore'),
    lineups: {
      home: Array.isArray(lineups.home) ? (lineups.home as ExternalMatchLineupOverridePlayer[]) : [],
      away: Array.isArray(lineups.away) ? (lineups.away as ExternalMatchLineupOverridePlayer[]) : [],
    },
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
    .from(MISSING_TABLE_NAME)
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
    throw new Error(error?.message || 'No se pudo guardar el override de alineacion externa.');
  }

  const lineups = data.lineups && typeof data.lineups === 'object' ? data.lineups as Record<string, unknown> : {};
  return {
    id: String(data.id),
    provider: String(data.provider || 'flashscore'),
    lineups: {
      home: Array.isArray(lineups.home) ? (lineups.home as ExternalMatchLineupOverridePlayer[]) : [],
      away: Array.isArray(lineups.away) ? (lineups.away as ExternalMatchLineupOverridePlayer[]) : [],
    },
    rated_by: data.rated_by ? String(data.rated_by) : null,
    rated_at: data.rated_at as string,
    updated_at: data.updated_at as string,
  };
}
