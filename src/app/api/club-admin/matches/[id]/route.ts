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
  try {
    const matchId = (await params).id;
    const access = await checkClubMatchAccess(matchId, resolveRequestedClub(request));

    if (!access.allowed) {
      return jsonError('Forbidden', 403);
    }

    const body = await request.json();
    const { events, lineups, ...rawMatchFields } = body as Record<string, unknown>;
    const matchFields = normalizeMatchUpdateFields(rawMatchFields);
    const writeClient = await getWriteClient();

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

    if (shouldAutoSyncPoints) {
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
      events: Array.isArray(events) ? events : undefined,
      lineups: lineups as { home?: unknown[]; away?: unknown[] } | null | undefined,
      clock: Object.prototype.hasOwnProperty.call(rawMatchFields, 'clock')
        ? rawMatchFields.clock as MatchCenterClockInput
        : undefined,
    });

    const { data, error } = await fetchMatchCenterMatch(writeClient, matchId);

    if (error || !data) {
      return jsonError('Failed to update match. Check server logs for Supabase error details.', 500);
    }

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
}
