import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { FixtureService } from '@/lib/services/fixtureService';
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

function isFlashScoreMatchId(matchId: string) {
  return /^[A-Za-z0-9]{8}$/.test(matchId);
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const matchId = (await params).id;

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

    const match = await FixtureService.getMatch(matchId);

    if (!match) {
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
    await requireAdminApiUser();
    const matchId = (await params).id;
    const body = await request.json();

    console.log('[API PATCH /matches]', matchId, 'keys:', Object.keys(body));

    // FixtureService expects camelCase keys for its known fields,
    // but events and lineups are passed through directly
    const match = await FixtureService.updateMatch(matchId, body);

    if (!match) {
      return NextResponse.json(
        { error: 'Failed to update match. Check server logs for Supabase error details.' },
        { status: 500 }
      );
    }

    return NextResponse.json(match);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error in PATCH /api/matches/[id]:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApiUser();
    const matchId = (await params).id;
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
      { status: 500 }
    );
  }
}
