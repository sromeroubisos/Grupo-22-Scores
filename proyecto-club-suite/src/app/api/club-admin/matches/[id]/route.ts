import { NextRequest, NextResponse } from 'next/server';
import { checkClubMatchAccess } from '@/lib/club-admin/matchAccess';
import { FixtureService } from '@/lib/services/fixtureService';
import {
  fetchMatchCenterMatch,
  persistMatchCenterSupplementalData,
  type MatchCenterClockInput,
} from '@/lib/services/matchCenterService';
import { deriveClubAdminPointsPatch } from '@/lib/services/matchPointsSync';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { recalcAffectedPhases } from '@/lib/server/recalcAffectedPhasesTraced';
import { traceEditRoute, markEditTrace } from '@/lib/perf/editTrace';

export const maxDuration = 30;

async function getWriteClient() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createAdminClient();
  }

  return createClient();
}

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

function resolveRequestedClub(request: NextRequest) {
  return request.nextUrl.searchParams.get('club');
}

function normalizeMatchUpdateFields(source: Record<string, unknown>) {
  const normalized = { ...source };

  const moveField = (from: string, to: string) => {
    if (Object.prototype.hasOwnProperty.call(normalized, from) && !Object.prototype.hasOwnProperty.call(normalized, to)) {
      normalized[to] = normalized[from];
    }
    delete normalized[from];
  };

  moveField('date_time', 'dateTime');
  moveField('round_label', 'roundLabel');
  moveField('broadcast_url', 'streamUrl');
  moveField('replay_url', 'replayUrl');
  moveField('phase_id', 'phaseId');
  moveField('group_id', 'groupId');
  moveField('home_division_id', 'homeSquadId');
  moveField('away_division_id', 'awaySquadId');
  moveField('home_base_points', 'homeBasePoints');
  moveField('away_base_points', 'awayBasePoints');
  moveField('home_bonus_points', 'homeBonusPoints');
  moveField('away_bonus_points', 'awayBonusPoints');
  moveField('points_autocalculated', 'pointsAutocalculated');
  moveField('points_override_reason', 'pointsOverrideReason');

  if (normalized.dateTime === null || normalized.dateTime === '') {
    delete normalized.dateTime;
  }

  return normalized;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const matchId = (await params).id;
    const access = await checkClubMatchAccess(matchId, resolveRequestedClub(request));

    if (!access.allowed) {
      return jsonError('Forbidden', 403);
    }

    const readClient = await getWriteClient();
    const { data, error } = await fetchMatchCenterMatch(readClient, matchId);

    if (error || !data) {
      return jsonError('Match not found', 404);
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonError(message, message === 'Forbidden' ? 403 : 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return traceEditRoute(
    request,
    { routeName: 'PATCH /api/club-admin/matches/[id]', routeType: 'club_admin_match', actorType: 'club_admin' },
    async () => {
  try {
    const matchId = (await params).id;
    markEditTrace({ matchId, responseBeforeDerived: true });
    const access = await checkClubMatchAccess(matchId, resolveRequestedClub(request));

    if (!access.allowed) {
      return jsonError('Forbidden', 403);
    }

    const body = await request.json();
    const { events, eventPatch, lineups, ...rawMatchFields } = body as Record<string, unknown>;
    // `eventPatch` (alta/baja incremental) manda sobre `events` para la
    // ESCRITURA: el reemplazo completo hace upsert + delete de todo lo que no
    // venga en el array, asi que dos operadores concurrentes se borran eventos
    // entre si. `events` se sigue aceptando por compatibilidad (guardado
    // explicito / autosave) y como snapshot de solo lectura para los puntos.
    const normalizedEventPatch = eventPatch && typeof eventPatch === 'object'
      ? eventPatch as { upsert?: unknown[]; deleteIds?: string[] }
      : undefined;
    const matchFields = normalizeMatchUpdateFields(rawMatchFields);
    const writeClient = await getWriteClient();
    const previousMatch = await FixtureService.getMatch(matchId);
    markEditTrace({
      tournamentId: (previousMatch as { tournamentId?: string | null } | null)?.tournamentId ?? null,
    });

    if (Object.prototype.hasOwnProperty.call(matchFields, 'clock')) {
      const supportsClock = await FixtureService.checkMatchColumnSupport('clock', writeClient);
      if (!supportsClock) {
        delete matchFields.clock;
      }
    }

    const shouldAutoSyncPoints =
      !Object.prototype.hasOwnProperty.call(matchFields, 'homeBasePoints') &&
      !Object.prototype.hasOwnProperty.call(matchFields, 'awayBasePoints') &&
      !Object.prototype.hasOwnProperty.call(matchFields, 'homeBonusPoints') &&
      !Object.prototype.hasOwnProperty.call(matchFields, 'awayBonusPoints') &&
      !Object.prototype.hasOwnProperty.call(matchFields, 'pointsAutocalculated') &&
      (
        Object.prototype.hasOwnProperty.call(matchFields, 'status') ||
        Object.prototype.hasOwnProperty.call(matchFields, 'score') ||
        Array.isArray(events)
      );

    // OJO (orden): el calculo de puntos corre ANTES de persistir los eventos.
    // Si `events` no viene, deriveClubAdminPointsPatch los lee de la DB y en un
    // request con `eventPatch` esa lectura todavia no incluye el evento nuevo,
    // dando puntos viejos. Por eso el cliente manda SIEMPRE el snapshot
    // completo en `events` (solo lectura) junto con el `eventPatch` de
    // escritura. Si alguien manda solo eventPatch, avisamos en vez de guardar
    // puntos silenciosamente desactualizados.
    if (shouldAutoSyncPoints && normalizedEventPatch && !Array.isArray(events)) {
      console.warn(
        '[club-admin/matches] eventPatch sin snapshot `events`: se omite el auto-calculo de puntos para no persistir valores previos al patch.',
        { matchId },
      );
    } else if (shouldAutoSyncPoints) {
      const pointsPatch = await deriveClubAdminPointsPatch(writeClient, matchId, {
        status: matchFields.status,
        score: matchFields.score,
        events: Array.isArray(events) ? events : undefined,
      });

      if (pointsPatch) {
        Object.assign(matchFields, pointsPatch);
      }
    }

    if (Object.keys(matchFields).length > 0) {
      await FixtureService.updateMatch(matchId, matchFields, writeClient);
    }

    const supplemental = await persistMatchCenterSupplementalData(writeClient, matchId, {
      // Van los dos a proposito: con `match_events` disponible el servicio usa
      // el patch e ignora el array; si la tabla no existe cae al reemplazo
      // completo sobre la columna JSONB.
      events: Array.isArray(events) ? events : undefined,
      eventPatch: normalizedEventPatch,
      lineups: lineups as { home?: unknown[]; away?: unknown[] } | null | undefined,
      clock: Object.prototype.hasOwnProperty.call(rawMatchFields, 'clock')
        ? rawMatchFields.clock as MatchCenterClockInput
        : undefined,
    });

    const { data, error } = await fetchMatchCenterMatch(writeClient, matchId);

    if (error || !data) {
      return jsonError('Failed to update match. Check server logs for Supabase error details.', 500);
    }

    const nextMatch = await FixtureService.getMatch(matchId);
    recalcAffectedPhases([previousMatch, nextMatch]);

    const matchCenterWarnings =
      lineups !== undefined && !supplemental.persistedLineups
        ? { lineupsNotPersisted: true, ...(!supplemental.persistedClock ? { clockNotPersisted: true } : {}) }
        : !supplemental.persistedClock
          ? { clockNotPersisted: true }
          : null;

    return NextResponse.json(matchCenterWarnings ? { ...data, matchCenterWarnings } : data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonError(message, message === 'Forbidden' ? 403 : 500);
  }
    },
  );
}
