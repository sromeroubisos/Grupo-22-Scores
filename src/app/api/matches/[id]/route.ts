import { NextRequest, NextResponse } from 'next/server';
import { canManageMatchContext, getMatchManagementTarget, requireUserAccessContext } from '@/lib/auth/permissions';
import { EDIT_MEMBERSHIP_ROLES, MANAGEMENT_MEMBERSHIP_ROLES, hasFederationAdminAccess } from '@/lib/auth/roles';
import { isMatchVisibleToPublic } from '@/lib/matchReview';
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
  getEspnAmericanFootballMatchBundle,
  parseEspnAmericanFootballMatchId,
} from '@/lib/services/espnAmericanFootball';
import {
  getEspnMotorsportMatchBundle,
  parseEspnMotorsportMatchId,
} from '@/lib/services/espnMotorsport';
import {
  getRugbyApiSportsGame,
  getRugbyApiSportsGamesH2H,
  getRugbyApiSportsStandings,
  parseRugbyApiSportsMatchId,
  toRugbyApiSportsTournamentId,
  type RugbyApiSportsGame,
} from '@/lib/services/rugbyApiSports';
import {
  normalizeRugbyGameForMatchDetail,
  normalizeRugbyGameForTournamentViews,
  normalizeRugbyStandingsRows,
} from '@/lib/services/rugbyApiSportsTransforms';
import {
  applyExternalTournamentOverride,
  getExternalTournamentOverride,
  type ExternalTournamentOverrideRecord,
} from '@/lib/server/externalTournamentOverrides';
import { getExternalMatchLineupOverride } from '@/lib/server/externalMatchLineupOverrides';

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return NextResponse.json(body, {
    ...init,
    headers,
  });
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function getExternalTournamentIdFromEvent(event: Record<string, unknown> | null | undefined) {
  return normalizeString(
    event?.tournament && typeof event.tournament === 'object'
      ? (event.tournament as Record<string, unknown>).tournament_stage_id
        || (event.tournament as Record<string, unknown>).tournament_id
      : null
  ) || normalizeString(event?.TOURNAMENT_STAGE_ID) || normalizeString(event?.TOURNAMENT_ID);
}

function applyFlashScoreTournamentOverrideToDetails(
  details: Record<string, unknown>,
  override: ExternalTournamentOverrideRecord | null,
) {
  if (!override) return details;

  const detailsData = details.DATA;
  if (detailsData && typeof detailsData === 'object') {
    const dataRecord = detailsData as Record<string, unknown>;
    const eventRecord = dataRecord.EVENT;
    if (eventRecord && typeof eventRecord === 'object') {
      const event = eventRecord as Record<string, unknown>;
      const rawTournament = event.tournament;
      if (rawTournament && typeof rawTournament === 'object') {
        return {
          ...details,
          DATA: {
            ...dataRecord,
            EVENT: {
              ...event,
              tournament: applyExternalTournamentOverride(
                rawTournament as Record<string, unknown>,
                override,
              ),
            },
          },
        };
      }
    }
  }

  const rawTournament = details.tournament;
  if (rawTournament && typeof rawTournament === 'object') {
    return {
      ...details,
      tournament: applyExternalTournamentOverride(
        rawTournament as Record<string, unknown>,
        override,
      ),
    };
  }

  return details;
}

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

  const tournamentOverride = await getExternalTournamentOverride(
    getExternalTournamentIdFromEvent(evt as Record<string, unknown>) || '',
  ).catch(() => null);
  const resolvedDetails = applyFlashScoreTournamentOverrideToDetails(
    details as Record<string, unknown>,
    tournamentOverride,
  );

  const sportId = evt.sport?.sport_id || evt.SPORT_ID || 1;
  const tsTotal = evt.timestamp || evt.start_time || evt.START_TIME || evt.time || evt.event_timestamp || 0;
  const startTimeMs = Number(tsTotal) * 1000;
  const nowDays = Math.floor(Date.now() / 86400000);
  const matchDays = Math.floor(startTimeMs / 86400000);
  const rawMatchDayOffset = matchDays - nowDays;
  const canFetchDayMatches = rawMatchDayOffset >= -7 && rawMatchDayOffset <= 7;
  const matchDayOffset = Math.max(-7, Math.min(7, rawMatchDayOffset));

  const results = await Promise.allSettled([
    getFlashScoreMatchSummary(matchId),
    getFlashScoreMatchStats(matchId),
    getFlashScoreMatchH2H(matchId),
    getFlashScoreStandingsForm(matchId),
    getFlashScoreMatchLineups(matchId),
    getFlashScoreMatchStandings(matchId),
    canFetchDayMatches ? getFlashScoreMatchesRaw(matchDayOffset, sportId) : Promise.resolve([]),
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

  const lineupOverride = await getExternalMatchLineupOverride(matchId).catch(() => null);
  const lineupsWithOverride = lineupOverride
    ? {
        ...(lineups && typeof lineups === 'object' ? lineups as Record<string, unknown> : {}),
        home: lineupOverride.lineups.home,
        away: lineupOverride.lineups.away,
      }
    : lineups;

  return {
    source: 'flashscore' as const,
    details: resolvedDetails,
    summary,
    stats,
    h2h,
    form,
    lineups: lineupsWithOverride,
    lineupOverride: lineupOverride
      ? {
          provider: lineupOverride.provider,
          ratedAt: lineupOverride.rated_at,
          ratedBy: lineupOverride.rated_by,
        }
      : null,
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

  const tournamentOverride = game.league?.id
    ? await getExternalTournamentOverride(toRugbyApiSportsTournamentId(game.league.id)).catch(() => null)
    : null;
  const resolvedGame: RugbyApiSportsGame = game.league && tournamentOverride
    ? {
      ...game,
      league: applyExternalTournamentOverride(
        game.league as Record<string, unknown>,
        tournamentOverride,
      ) as RugbyApiSportsGame['league'],
    }
    : game;
  const match = normalizeRugbyGameForMatchDetail(resolvedGame);
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

async function canReadHiddenMatch(matchId: string) {
  try {
    await ensureMatchAccess(matchId, MANAGEMENT_MEMBERSHIP_ROLES);
    return true;
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const matchId = (await params).id;
    const rugbyMatchId = parseRugbyApiSportsMatchId(matchId);
    const espnMatchId = parseEspnAmericanFootballMatchId(matchId);
    const espnMotorsportMatchId = parseEspnMotorsportMatchId(matchId);

    if (rugbyMatchId) {
      const bundle = await getRugbyApiSportsMatchBundle(rugbyMatchId);
      if (!bundle) {
        return jsonNoStore(
          { error: 'Match not found' },
          { status: 404 }
        );
      }

      return jsonNoStore(bundle);
    }

    if (espnMatchId) {
      const bundle = await getEspnAmericanFootballMatchBundle(espnMatchId);
      if (!bundle) {
        return jsonNoStore(
          { error: 'Match not found' },
          { status: 404 }
        );
      }

      return jsonNoStore(bundle);
    }

    if (espnMotorsportMatchId) {
      const bundle = await getEspnMotorsportMatchBundle(matchId);
      if (!bundle) {
        return jsonNoStore(
          { error: 'Match not found' },
          { status: 404 }
        );
      }

      return jsonNoStore(bundle);
    }

    if (isFlashScoreMatchId(matchId)) {
      const bundle = await getFlashScoreMatchBundle(matchId);

      if (!bundle) {
        return jsonNoStore(
          { error: 'Match not found' },
          { status: 404 }
        );
      }

      return jsonNoStore(bundle);
    }

    const readClient = await getReadClient();
    const { data: match, error: matchError } = await fetchMatchCenterMatch(readClient, matchId);

    if (matchError || !match) {
      return jsonNoStore(
        { error: 'Match not found' },
        { status: 404 }
      );
    }

    if (!isMatchVisibleToPublic(match) && !(await canReadHiddenMatch(matchId))) {
      return jsonNoStore(
        { error: 'Match not found' },
        { status: 404 }
      );
    }

    return jsonNoStore(match);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error in GET /api/matches/[id]:', error);
    return jsonNoStore(
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

    const { events, lineups, ...rawMatchFields } = body as Record<string, unknown>;
    const matchFields = { ...rawMatchFields };
    const writeClient = await getWriteClient();

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
      lineups: lineups as { home?: unknown[]; away?: unknown[] } | null | undefined,
      clock: Object.prototype.hasOwnProperty.call(rawMatchFields, 'clock')
        ? rawMatchFields.clock as { minute?: unknown; seconds?: unknown; period?: unknown; running?: unknown; syncedAt?: unknown } | null | undefined
        : undefined,
    });

    const { data: match, error: matchError } = await fetchMatchCenterMatch(writeClient, matchId);

    if (matchError || !match) {
      return NextResponse.json(
        { error: 'Failed to update match. Check server logs for Supabase error details.' },
        { status: 500 }
      );
    }

    const matchCenterWarnings =
      lineups !== undefined && !supplemental.persistedLineups
        ? { lineupsNotPersisted: true, ...(!supplemental.persistedClock ? { clockNotPersisted: true } : {}) }
        : !supplemental.persistedClock
          ? { clockNotPersisted: true }
          : null;

    return NextResponse.json(
      matchCenterWarnings
        ? { ...match, matchCenterWarnings }
        : match
    );
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
