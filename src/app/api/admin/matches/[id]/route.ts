import { NextRequest, NextResponse } from 'next/server';
import { EDIT_MEMBERSHIP_ROLES, MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { FixtureService } from '@/lib/services/fixtureService';
import {
  fetchMatchCenterMatch,
  persistMatchCenterSupplementalData,
} from '@/lib/services/matchCenterService';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { ensureMatchManagementAccess } from '@/lib/server/matchCenterAdmin';
import { recalcAffectedPhases } from '@/lib/server/recalcAffectedPhasesTraced';
import { traceEditRoute, markEditTrace } from '@/lib/perf/editTrace';
import { isUuid } from '@/lib/utils/postgrest';

async function getWriteClient() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createAdminClient();
  }

  return createClient();
}

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  void request;

  try {
    const matchId = (await params).id;
    await ensureMatchManagementAccess(matchId, MANAGEMENT_MEMBERSHIP_ROLES);
    const readClient = await getWriteClient();
    const { data, error } = await fetchMatchCenterMatch(readClient, matchId);

    if (error || !data) {
      return jsonError('Match not found', 404);
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonError(
      message,
      message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : message === 'Match not found' ? 404 : 500,
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Etapa 0: instrumentación común (no-op salvo PERF_EDIT_TRACE=true). El
  // wrapper captura requestId, estado HTTP y errores; el handler marca los IDs.
  return traceEditRoute(
    request,
    { routeName: 'PATCH /api/admin/matches/[id]', routeType: 'super_admin_match', actorType: 'super_admin' },
    async () => {
      try {
        const matchId = (await params).id;
        if (!isUuid(matchId)) {
          return jsonError('Invalid match id', 400);
        }
        markEditTrace({ matchId, responseBeforeDerived: true });
        const compactResponse = request.nextUrl.searchParams.get('response') === 'compact';
        await ensureMatchManagementAccess(matchId, MANAGEMENT_MEMBERSHIP_ROLES);
        const body = await request.json();
        const { events, eventPatch, lineups, ...rawMatchFields } = body as Record<string, unknown>;
        const matchFields = { ...rawMatchFields };
        const writeClient = await getWriteClient();
        const previousMatch = await FixtureService.getMatchScope(matchId);
        markEditTrace({
          tournamentId: (previousMatch as { tournamentId?: string | null } | null)?.tournamentId ?? null,
        });

        if (Object.prototype.hasOwnProperty.call(matchFields, 'clock')) {
          const supportsClock = await FixtureService.checkMatchColumnSupport('clock', writeClient);
          if (!supportsClock) {
            delete matchFields.clock;
          }
        }

        const hasFixtureFieldUpdate = Object.keys(matchFields).length > 0;

        if (hasFixtureFieldUpdate) {
          await FixtureService.updateMatch(matchId, matchFields, writeClient);
        }

        const supplemental = await persistMatchCenterSupplementalData(writeClient, matchId, {
          events: Array.isArray(events) ? events : undefined,
          eventPatch: eventPatch && typeof eventPatch === 'object'
            ? eventPatch as { upsert?: unknown[]; deleteIds?: string[] }
            : undefined,
          lineups: lineups as { home?: unknown[]; away?: unknown[] } | null | undefined,
          clock: Object.prototype.hasOwnProperty.call(rawMatchFields, 'clock')
            ? rawMatchFields.clock as { minute?: unknown; seconds?: unknown; period?: unknown; running?: unknown; syncedAt?: unknown } | null | undefined
            : undefined,
        });

        const matchCenterWarnings =
          lineups !== undefined && !supplemental.persistedLineups
            ? { lineupsNotPersisted: true, ...(!supplemental.persistedClock ? { clockNotPersisted: true } : {}) }
            : !supplemental.persistedClock
              ? { clockNotPersisted: true }
              : null;

        // Recalc standings (and carry-over dependents) for the phase before and
        // after the edit — covers score/status changes and the rare case where
        // the match was moved to a different phase.
        const nextMatch = await FixtureService.getMatchScope(matchId);
        recalcAffectedPhases([previousMatch, nextMatch]);

        if (compactResponse) {
          return NextResponse.json({
            id: matchId,
            compact: true,
            ...(matchCenterWarnings ? { matchCenterWarnings } : {}),
          });
        }

        const { data, error } = await fetchMatchCenterMatch(writeClient, matchId);
        if (error || !data) {
          return jsonError('Failed to update match. Check server logs for Supabase error details.', 500);
        }

        return NextResponse.json(matchCenterWarnings ? { ...data, matchCenterWarnings } : data);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
        return jsonError(message, status);
      }
    },
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  void request;

  try {
    const matchId = (await params).id;
    if (!isUuid(matchId)) {
      return jsonError('Invalid match id', 400);
    }
    await ensureMatchManagementAccess(matchId, EDIT_MEMBERSHIP_ROLES);
    const previousMatch = await FixtureService.getMatchScope(matchId);
    const success = await FixtureService.deleteMatch(matchId);

    if (!success) {
      return jsonError('Failed to delete match', 500);
    }

    recalcAffectedPhases([previousMatch]);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonError(
      message,
      message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500,
    );
  }
}
