import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiErrorStatus, requireGlobalAdminApiContext } from '@/lib/auth/apiAdmin';
import { isSuperAdminRole } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getExternalMatchLineupOverride,
  upsertExternalMatchLineupOverride,
  type ExternalMatchLineupOverridePlayer,
} from '@/lib/server/externalMatchLineupOverrides';
import { isMissingColumnError, isMissingTableError } from '@/lib/utils/supabaseSchema';
import { parseRugbyApiSportsMatchId } from '@/lib/services/rugbyApiSports';
import { parseEspnAmericanFootballMatchId } from '@/lib/services/espnAmericanFootball';
import { parseEspnMotorsportMatchId } from '@/lib/services/espnMotorsport';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FLASHSCORE_ID_PATTERN = /^[A-Za-z0-9]{8}$/;

function jsonError(message: string, status = 500, details?: unknown) {
  return NextResponse.json({ error: message, details: details ?? null }, { status });
}

const RatingSchema = z.union([z.number(), z.null()]).transform((value) => {
  if (value === null) return null;
  if (!Number.isFinite(value)) return null;
  const clamped = Math.min(10, Math.max(0, value));
  return Math.round(clamped * 10) / 10;
});

const PlayerSchema = z.object({
  id: z.string().trim().optional().nullable(),
  number: z.number().int().min(0).max(999),
  name: z.string().trim().min(1, 'name'),
  position: z.string().trim().optional().nullable(),
  role: z.string().trim().optional().nullable(),
  rating: RatingSchema.optional().default(null),
  isCaptain: z.boolean().optional(),
});

const PayloadSchema = z.object({
  lineups: z.object({
    home: z.array(PlayerSchema).max(60),
    away: z.array(PlayerSchema).max(60),
  }),
});

type ParsedPlayer = z.infer<typeof PlayerSchema>;

function detectMatchKind(matchId: string): 'local' | 'flashscore' | 'rugby' | 'espn-football' | 'espn-motorsport' | 'unknown' {
  if (UUID_PATTERN.test(matchId)) return 'local';
  if (FLASHSCORE_ID_PATTERN.test(matchId)) return 'flashscore';
  if (parseRugbyApiSportsMatchId(matchId)) return 'rugby';
  if (parseEspnAmericanFootballMatchId(matchId)) return 'espn-football';
  if (parseEspnMotorsportMatchId(matchId)) return 'espn-motorsport';
  return 'unknown';
}

function toExternalPlayer(player: ParsedPlayer): ExternalMatchLineupOverridePlayer {
  return {
    id: player.id?.trim() || null,
    number: player.number,
    name: player.name,
    position: player.position?.trim() || null,
    role: player.role?.trim() || null,
    rating: player.rating ?? null,
    isCaptain: Boolean(player.isCaptain),
  };
}

async function writeAuditLog(input: {
  matchId: string;
  actorId: string;
  before: unknown;
  after: unknown;
  sourceBefore: string | null;
  sourceAfter: string | null;
}) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('lineup_rating_audit').insert({
      match_id: input.matchId,
      actor_id: input.actorId,
      before_lineups: input.before ?? null,
      after_lineups: input.after ?? null,
      source_before: input.sourceBefore,
      source_after: input.sourceAfter,
    });
    if (error && !isMissingTableError(error, 'lineup_rating_audit')) {
      console.error('[lineup-ratings] audit insert failed:', error);
    }
  } catch (err) {
    console.error('[lineup-ratings] audit log failed:', err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Strict: only `super_admin`. The shared helper allows admin_general too;
  // the spec restricts this action to Super Admin specifically.
  let actorUserId: string;
  try {
    const context = await requireGlobalAdminApiContext();
    if (!isSuperAdminRole(context.role)) {
      return jsonError('Forbidden', 403);
    }
    actorUserId = context.userId;
  } catch (error) {
    return jsonError('Unauthorized', getApiErrorStatus(error, 401));
  }

  try {
    const matchId = (await params).id;
    if (!matchId) return jsonError('Match id requerido.', 400);

    const rawBody = await request.json().catch(() => ({}));
    const parsed = PayloadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError('Payload invalido.', 400, parsed.error.issues);
    }

    const homePlayers = parsed.data.lineups.home.map(toExternalPlayer);
    const awayPlayers = parsed.data.lineups.away.map(toExternalPlayer);

    const kind = detectMatchKind(matchId);

    if (kind === 'unknown') {
      return jsonError('Tipo de partido no soportado para edicion de puntajes.', 409, { code: 'UNSUPPORTED_SOURCE' });
    }

    if (kind === 'espn-motorsport') {
      return jsonError('Los eventos de motorsport no admiten alineaciones.', 409, { code: 'UNSUPPORTED_SPORT' });
    }

    if (kind === 'local') {
      const admin = createAdminClient();

      const { data: existing, error: fetchError } = await admin
        .from('matches')
        .select('id, lineups, lineups_source')
        .eq('id', matchId)
        .maybeSingle();

      if (fetchError) {
        return jsonError('No se pudo leer el partido.', 500, fetchError.message);
      }
      if (!existing) {
        return jsonError('Partido no encontrado.', 404);
      }

      const beforeLineups = existing.lineups ?? null;
      const beforeSource = (existing as { lineups_source?: string | null }).lineups_source ?? null;

      const newLineups = { home: homePlayers, away: awayPlayers };

      const updates: Record<string, unknown> = { lineups: newLineups };
      // We tag local matches as 'local' once they have an explicit source set,
      // to differentiate untouched matches (NULL) from those edited by Super Admin.
      const desiredSource = beforeSource === 'api_override' ? 'api_override' : 'local';
      updates.lineups_source = desiredSource;
      updates.lineups_rated_by = actorUserId;
      updates.lineups_rated_at = new Date().toISOString();

      let { error: updateError } = await admin
        .from('matches')
        .update(updates)
        .eq('id', matchId);

      // Defensive: tolerate environments where the migration has not been applied yet.
      if (updateError && (
        isMissingColumnError(updateError, 'lineups_source') ||
        isMissingColumnError(updateError, 'lineups_rated_by') ||
        isMissingColumnError(updateError, 'lineups_rated_at')
      )) {
        const fallback: Record<string, unknown> = { lineups: newLineups };
        const retry = await admin.from('matches').update(fallback).eq('id', matchId);
        updateError = retry.error;
      }

      if (updateError) {
        return jsonError('No se pudieron guardar los puntajes.', 500, updateError.message);
      }

      await writeAuditLog({
        matchId,
        actorId: actorUserId,
        before: beforeLineups,
        after: newLineups,
        sourceBefore: beforeSource,
        sourceAfter: desiredSource,
      });

      return NextResponse.json({
        ok: true,
        kind: 'local',
        lineups: newLineups,
        lineups_source: desiredSource,
      });
    }

    // External: FlashScore / Rugby / ESPN football. Persist into override table.
    const provider =
      kind === 'flashscore' ? 'flashscore'
      : kind === 'rugby' ? 'rugby-api-sports'
      : 'espn';

    const previous = await getExternalMatchLineupOverride(matchId).catch(() => null);
    const beforeLineups = previous?.lineups ?? null;

    let saved;
    try {
      saved = await upsertExternalMatchLineupOverride({
        matchId,
        provider,
        lineups: { home: homePlayers, away: awayPlayers },
        ratedBy: actorUserId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar el override.';
      // If the table is missing, surface a clear migration-required error.
      if (err instanceof Error && /external_match_lineup_overrides/.test(err.message) && /does not exist|schema cache/i.test(err.message)) {
        return jsonError('La base de datos aun no tiene la tabla external_match_lineup_overrides. Aplica la migracion.', 409, { code: 'MIGRATION_REQUIRED' });
      }
      return jsonError(message, 500);
    }

    await writeAuditLog({
      matchId,
      actorId: actorUserId,
      before: beforeLineups,
      after: saved.lineups,
      sourceBefore: previous ? 'api_override' : null,
      sourceAfter: 'api_override',
    });

    return NextResponse.json({
      ok: true,
      kind: 'external',
      provider,
      lineups: saved.lineups,
      lineups_source: 'api_override',
      rated_at: saved.rated_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[PATCH /api/admin/super/matches/[id]/lineup-ratings]:', error);
    return jsonError(message, 500);
  }
}
