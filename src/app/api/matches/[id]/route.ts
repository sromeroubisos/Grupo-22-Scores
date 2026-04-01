import { NextRequest, NextResponse } from 'next/server';
import { canManageMatchContext, getMatchManagementTarget, requireUserAccessContext } from '@/lib/auth/permissions';
import { EDIT_MEMBERSHIP_ROLES, MANAGEMENT_MEMBERSHIP_ROLES, hasFederationAdminAccess } from '@/lib/auth/roles';
import { FixtureService } from '@/lib/services/fixtureService';
import { createAdminClient } from '@/lib/supabase/admin';
import { getReadClient } from '@/lib/supabase/read';
import { createClient } from '@/lib/supabase/server';
import {
  fetchMatchCenterMatch,
  persistMatchCenterSupplementalData,
} from '@/lib/services/matchCenterService';
import {
  getFlashScoreMatchCommentary,
  getFlashScoreMatchDetails,
  getFlashScoreMatchDraw,
  getFlashScoreMatchH2H,
  getFlashScoreMatchLineups,
  getFlashScoreMatchStandings,
  getFlashScoreMatchStats,
  getFlashScoreMatchSummary,
  getFlashScoreMatchesRaw,
  getFlashScorePlayerStats,
  getFlashScoreStandingsForm,
  getFlashScoreTopScorers,
} from '@/lib/services/flashscore';
import {
  getRugbyApiSportsGame,
  getRugbyApiSportsGamesH2H,
  getRugbyApiSportsStandings,
  parseRugbyApiSportsMatchId,
} from '@/lib/services/rugbyApiSports';
import {
  normalizeRugbyGameForMatchDetail,
  normalizeRugbyGameForTournamentViews,
  normalizeRugbyStandingsRows,
} from '@/lib/services/rugbyApiSportsTransforms';

function isFlashScoreMatchId(matchId: string) {
  return /^[A-Za-z0-9]{8}$/.test(matchId);
}

async function getWriteClient() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createAdminClient();
  }

  return createClient();
}

async function getFlashScoreMatchBundle(matchId: string) {
  const details = await getFlashScoreMatchDetails(matchId);
  const evt = details?.DATA?.EVENT || details;

  if (!evt || !(evt.match_id || evt.EVENT_ID)) {
    return null;
  }

  const sportId = evt.sport?.sport_id || evt.SPORT_ID || 1;
  const tsTotal = evt.timestamp || evt.start_time || evt.START_TIME || evt.time || evt.event_timestamp || 0;
  const startTimeMs = Number(tsTotal) * 1000;
  const nowDays = Math.floor(Date.now() / 86400000);
  const matchDays = Math.floor(startTimeMs / 86400000);
  const matchDayOffset = Math.max(-7, Math.min(7, matchDays - nowDays));

  const results = await Promise.allSettled([
    getFlashScoreMatchSummary(matchId),
    getFlashScoreMatchStats(matchId),
    getFlashScoreMatchH2H(matchId),
    getFlashScoreStandingsForm(matchId),
    getFlashScoreMatchLineups(matchId),
    getFlashScoreMatchStandings(matchId),
    getFlashScoreMatchesRaw(matchDayOffset, sportId),
    getFlashScorePlayerStats(matchId),
    getFlashScoreMatchCommentary(matchId),
    getFlashScoreMatchDraw(matchId),
    getFlashScoreTopScorers(matchId),
  ]);

  const [
    summary,
    stats,
    h2h,
    form,
    lineups,
    standings,
    dayMatches,
    playerStats,
    commentary,
    draw,
    topScorers,
  ] = results.map((result) => (result.status === 'fulfilled' ? result.value : null));

  return {
    source: 'flashscore' as const,
    details,
    summary,
    stats,
    h2h,
    form,
    lineups,
    standings,
    dayMatches,
    playerStats,
    commentary,
    draw,
    topScorers,
  };
}

async function getRugbyApiSportsMatchBundle(matchId: string) {
  const game = await getRugbyApiSportsGame(matchId, 'America/Argentina/Buenos_Aires');
  if (!game) {
    return null;
  }

  const homeId = game.teams?.home?.id;
  const awayId = game.teams?.away?.id;

  const [h2hResult, standingsResult] = await Promise.allSettled([
    homeId && awayId
      ? getRugbyApiSportsGamesH2H({
        homeTeamId: homeId,
        awayTeamId: awayId,
        timezone: 'America/Argentina/Buenos_Aires',
      })
      : Promise.resolve([]),
    game.league?.id && game.league?.season
      ? getRugbyApiSportsStandings({
        league: game.league.id,
        season: game.league.season,
      })
      : Promise.resolve([]),
  ]);

  const match = normalizeRugbyGameForMatchDetail(game);
  const h2h = h2hResult.status === 'fulfilled'
    ? h2hResult.value.map((item) => normalizeRugbyGameForTournamentViews(item))
    : [];
  const standingsRows = standingsResult.status === 'fulfilled'
    ? normalizeRugbyStandingsRows(standingsResult.value)
    : [];

  match.h2h = h2h;
  match.standings = standingsRows.map((row) => ({
    rank: row.position,
    name: row.team_name,
    team_id: row.team_id,
    logo: row.team_logo || '',
    team: row.team_id ? { id: row.team_id, name: row.team_name, logo: row.team_logo || '' } : null,
    matches_played: row.played,
    goal_difference: (row.scored ?? 0) - (row.conceded ?? 0),
    points: row.points,
    played: row.played,
  }));

  return {
    source: 'rugby-api-sports' as const,
    match,
    h2h,
    standings: match.standings,
  };
}

async function ensureMatchAccess(
  matchId: string,
  allowedRoles: ReadonlySet<string>
) {
  const supabase = await createClient();
  const context = await requireUserAccessContext(supabase).catch(() => null);
  if (!context) {
    throw new Error('Unauthorized');
  }

  if (hasFederationAdminAccess(context.rawRole, context.memberships)) {
    return;
  }

  const target = await getMatchManagementTarget(supabase, matchId);

  if (!target || !canManageMatchContext(context, target, allowedRoles)) {
    throw new Error('Forbidden');
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const matchId = (await params).id;
    const rugbyMatchId = parseRugbyApiSportsMatchId(matchId);

    if (rugbyMatchId) {
      const bundle = await getRugbyApiSportsMatchBundle(rugbyMatchId);
      if (!bundle) {
        return NextResponse.json(
          { error: 'Match not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(bundle);
    }

    if (isFlashScoreMatchId(matchId)) {
      const bundle = await getFlashScoreMatchBundle(matchId);

      if (!bundle) {
        return NextResponse.json(
          { error: 'Match not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(bundle);
    }

    const readClient = await getReadClient();
    const { data: match, error: matchError } = await fetchMatchCenterMatch(readClient, matchId);

    if (matchError || !match) {
      return NextResponse.json(
        { error: 'Match not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(match);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error in GET /api/matches/[id]:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const matchId = (await params).id;
    await ensureMatchAccess(matchId, MANAGEMENT_MEMBERSHIP_ROLES);
    const body = await request.json();

    console.log('[API PATCH /matches]', matchId, 'keys:', Object.keys(body));

    const { events, lineups, ...matchFields } = body as Record<string, unknown>;
    const hasFixtureFieldUpdate = Object.keys(matchFields).length > 0;
    const writeClient = await getWriteClient();

    if (hasFixtureFieldUpdate) {
      await FixtureService.updateMatch(matchId, matchFields);
    }

    const supplemental = await persistMatchCenterSupplementalData(writeClient, matchId, {
      events: Array.isArray(events) ? events : undefined,
      lineups: lineups as { home?: unknown[]; away?: unknown[] } | null | undefined,
    });

    const { data: match, error: matchError } = await fetchMatchCenterMatch(writeClient, matchId);

    if (matchError || !match) {
      return NextResponse.json(
        { error: 'Failed to update match. Check server logs for Supabase error details.' },
        { status: 500 }
      );
    }

    if (lineups !== undefined && !supplemental.persistedLineups) {
      match.lineups = supplemental.lineups;
    }

    return NextResponse.json(match);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error in PATCH /api/matches/[id]:', error);
    return NextResponse.json(
      { error: message },
      { status: message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const matchId = (await params).id;
    await ensureMatchAccess(matchId, EDIT_MEMBERSHIP_ROLES);
    const success = await FixtureService.deleteMatch(matchId);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to delete match' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error in DELETE /api/matches/[id]:', error);
    return NextResponse.json(
      { error: message },
      { status: message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500 }
    );
  }
}
