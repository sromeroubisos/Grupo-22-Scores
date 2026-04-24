import { NextRequest, NextResponse } from 'next/server';
import {
  resolveClubName,
  resolveMatchByTeams,
  type ClubNameResolution,
} from '@/lib/integrations/whatsappMatchSync';
import { deriveClubAdminPointsPatch } from '@/lib/services/matchPointsSync';
import { FixtureService } from '@/lib/services/fixtureService';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type MatchWebhookRequest = {
  matchId: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  homeScore: number;
  awayScore: number;
  bonusPoint: boolean | null;
  bonusTarget: 'home' | 'away' | 'both' | 'winner' | 'none' | null;
  homeBonusPoints: number | null;
  awayBonusPoints: number | null;
  status: string;
  source: string;
  message: string | null;
  rowId: string | null;
};

type ManualBonusResolution = {
  homeBonusPoints: number;
  awayBonusPoints: number;
  target: 'home' | 'away' | 'both' | 'none';
  warning: string | null;
};

function jsonError(message: string, status = 500, details?: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      details: details ?? null,
    },
    { status },
  );
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePayload(source: unknown) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {};
  }

  const record = source as Record<string, unknown>;

  if (record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)) {
    return record.payload as Record<string, unknown>;
  }

  if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
    return record.data as Record<string, unknown>;
  }

  return record;
}

function parseRequiredScore(value: unknown, field: string) {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;

  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`El campo ${field} debe ser un numero mayor o igual a 0.`);
  }

  return Math.trunc(numeric);
}

function parseOptionalPointValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;

  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;

  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error('Los bonus manuales deben ser numeros mayores o iguales a 0.');
  }

  return numeric;
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

function normalizeBonusTarget(value: unknown): MatchWebhookRequest['bonusTarget'] {
  const normalized = readText(value).toLowerCase();

  if (!normalized) return null;
  if (['home', 'local', 'casa'].includes(normalized)) return 'home';
  if (['away', 'visitante'].includes(normalized)) return 'away';
  if (['both', 'ambos'].includes(normalized)) return 'both';
  if (['winner', 'ganador', 'winner_team'].includes(normalized)) return 'winner';
  if (['none', 'ninguno', 'sin bonus'].includes(normalized)) return 'none';

  return null;
}

function normalizeStatus(value: unknown) {
  const normalized = readText(value).toLowerCase();

  if (!normalized) return 'final';
  if (['live', 'en vivo', 'playing', 'ongoing', 'in_progress'].includes(normalized)) return 'live';
  if (['scheduled', 'programado', 'pendiente'].includes(normalized)) return 'scheduled';
  if (['final', 'finished', 'completed', 'scored', 'ft'].includes(normalized)) return 'final';
  if (['postponed', 'aplazado'].includes(normalized)) return 'postponed';
  if (['cancelled', 'cancelado'].includes(normalized)) return 'cancelled';

  return normalized;
}

function resolveRequestPayload(rawBody: unknown): MatchWebhookRequest {
  const body = parsePayload(rawBody);

  const matchId = readText(body.matchId ?? body.match_id) || null;
  const homeTeam = readText(body.homeTeam ?? body.home_team) || null;
  const awayTeam = readText(body.awayTeam ?? body.away_team) || null;

  if (!matchId && (!homeTeam || !awayTeam)) {
    throw new Error('Debes enviar matchId o bien homeTeam y awayTeam.');
  }

  return {
    matchId,
    homeTeam,
    awayTeam,
    homeScore: parseRequiredScore(body.homeScore ?? body.home_score, 'homeScore'),
    awayScore: parseRequiredScore(body.awayScore ?? body.away_score, 'awayScore'),
    bonusPoint: parseBooleanLike(body.bonusPoint ?? body.bonus_point),
    bonusTarget: normalizeBonusTarget(body.bonusTarget ?? body.bonus_target),
    homeBonusPoints: parseOptionalPointValue(body.homeBonusPoints ?? body.home_bonus_points),
    awayBonusPoints: parseOptionalPointValue(body.awayBonusPoints ?? body.away_bonus_points),
    status: normalizeStatus(body.status),
    source: readText(body.source) || 'n8n-whatsapp',
    message: readText(body.message ?? body.text ?? body.prompt) || null,
    rowId: readText(body.rowId ?? body.row_id ?? body.id) || null,
  };
}

function getWebhookSecret() {
  return process.env.WHATSAPP_MATCH_WEBHOOK_SECRET || process.env.N8N_MATCH_WEBHOOK_SECRET || null;
}

function isAuthorized(request: NextRequest) {
  const secret = getWebhookSecret();
  if (!secret) {
    return { ok: false as const, reason: 'missing_secret' as const };
  }

  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const headerSecret = request.headers.get('x-webhook-secret');

  if (bearerToken === secret || headerSecret === secret) {
    return { ok: true as const };
  }

  return { ok: false as const, reason: 'unauthorized' as const };
}

function buildManualBonusResolution(payload: MatchWebhookRequest): ManualBonusResolution | null {
  if (payload.homeBonusPoints !== null || payload.awayBonusPoints !== null) {
    return {
      homeBonusPoints: payload.homeBonusPoints ?? 0,
      awayBonusPoints: payload.awayBonusPoints ?? 0,
      target:
        (payload.homeBonusPoints ?? 0) > 0 && (payload.awayBonusPoints ?? 0) > 0
          ? 'both'
          : (payload.awayBonusPoints ?? 0) > 0
            ? 'away'
            : 'home',
      warning: null,
    };
  }

  if (payload.bonusPoint !== true) {
    return null;
  }

  const target = payload.bonusTarget ?? 'winner';

  if (target === 'home') {
    return { homeBonusPoints: 1, awayBonusPoints: 0, target: 'home', warning: null };
  }

  if (target === 'away') {
    return { homeBonusPoints: 0, awayBonusPoints: 1, target: 'away', warning: null };
  }

  if (target === 'both') {
    return { homeBonusPoints: 1, awayBonusPoints: 1, target: 'both', warning: null };
  }

  if (target === 'none') {
    return { homeBonusPoints: 0, awayBonusPoints: 0, target: 'none', warning: null };
  }

  if (payload.homeScore > payload.awayScore) {
    return { homeBonusPoints: 1, awayBonusPoints: 0, target: 'home', warning: null };
  }

  if (payload.awayScore > payload.homeScore) {
    return { homeBonusPoints: 0, awayBonusPoints: 1, target: 'away', warning: null };
  }

  return {
    homeBonusPoints: 1,
    awayBonusPoints: 1,
    target: 'both',
    warning: 'bonus_point_true_without_target_on_draw',
  };
}

function formatTeamResolution(label: string, resolution: ClubNameResolution) {
  return {
    side: label,
    input: resolution.input,
    clubId: resolution.matchedClubId,
    clubName: resolution.matchedClubName,
    shortName: resolution.matchedClubShortName,
    confidence: resolution.confidence,
    score: Number(resolution.score.toFixed(4)),
    ambiguous: resolution.ambiguous,
    alternatives: resolution.alternatives,
  };
}

async function resolveMatchId(adminClient: ReturnType<typeof createAdminClient>, payload: MatchWebhookRequest) {
  if (payload.matchId) {
    return {
      matchId: payload.matchId,
      homeTeamResolution: null,
      awayTeamResolution: null,
      matchedBy: 'match_id' as const,
      ambiguous: false,
      alternatives: [] as Array<Record<string, unknown>>,
    };
  }

  const [homeTeamResolution, awayTeamResolution] = await Promise.all([
    resolveClubName(adminClient, payload.homeTeam || ''),
    resolveClubName(adminClient, payload.awayTeam || ''),
  ]);

  if (!homeTeamResolution.matchedClubId || !awayTeamResolution.matchedClubId) {
    throw new Error('No se pudieron resolver ambos equipos contra el catalogo local.');
  }

  if (homeTeamResolution.ambiguous || awayTeamResolution.ambiguous) {
    return {
      matchId: null,
      homeTeamResolution,
      awayTeamResolution,
      matchedBy: 'team_names' as const,
      ambiguous: true,
      alternatives: [],
    };
  }

  const candidate = await resolveMatchByTeams(adminClient, {
    homeClubId: homeTeamResolution.matchedClubId,
    awayClubId: awayTeamResolution.matchedClubId,
  });

  if (!candidate) {
    return {
      matchId: null,
      homeTeamResolution,
      awayTeamResolution,
      matchedBy: 'team_names' as const,
      ambiguous: false,
      alternatives: [],
    };
  }

  return {
    matchId: candidate.matchId,
    homeTeamResolution,
    awayTeamResolution,
    matchedBy: candidate.matchedBy,
    ambiguous: candidate.ambiguous,
    alternatives: candidate.alternatives,
  };
}

export async function POST(request: NextRequest) {
  const auth = isAuthorized(request);
  if (!auth.ok) {
    if (auth.reason === 'missing_secret') {
      return jsonError('Falta configurar WHATSAPP_MATCH_WEBHOOK_SECRET o N8N_MATCH_WEBHOOK_SECRET.', 500);
    }

    return jsonError('Unauthorized', 401);
  }

  try {
    const payload = resolveRequestPayload(await request.json());
    const adminClient = createAdminClient();
    const matchResolution = await resolveMatchId(adminClient, payload);

    if (!matchResolution.matchId) {
      return jsonError(
        matchResolution.ambiguous
          ? 'La resolucion de equipos fue ambigua. Ajusta el nombre o envia matchId.'
          : 'No se encontro un partido local para los equipos enviados.',
        matchResolution.ambiguous ? 409 : 404,
        {
          homeTeam: matchResolution.homeTeamResolution
            ? formatTeamResolution('home', matchResolution.homeTeamResolution)
            : null,
          awayTeam: matchResolution.awayTeamResolution
            ? formatTeamResolution('away', matchResolution.awayTeamResolution)
            : null,
        },
      );
    }

    const score = {
      home: payload.homeScore,
      away: payload.awayScore,
    };

    const updatePayload: Record<string, unknown> = {
      status: payload.status,
      score,
    };

    const derivedPointsPatch = await deriveClubAdminPointsPatch(adminClient, matchResolution.matchId, {
      status: payload.status,
      score,
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
        'Manual webhook update',
        payload.source,
        payload.rowId ? `row:${payload.rowId}` : null,
        payload.message ? 'message_attached' : null,
      ].filter(Boolean).join(' | ');
    }

    const updatedMatch = await FixtureService.updateMatch(
      matchResolution.matchId,
      updatePayload,
      adminClient,
    );

    if (!updatedMatch) {
      return jsonError('No se pudo actualizar el partido.', 500);
    }

    const hydratedMatch = await FixtureService.getMatch(matchResolution.matchId);
    const responseMatch = hydratedMatch ?? updatedMatch;
    const resolvedHomeTeamName = hydratedMatch?.homeClub?.name || payload.homeTeam || 'Local';
    const resolvedAwayTeamName = hydratedMatch?.awayClub?.name || payload.awayTeam || 'Visitante';

    return NextResponse.json({
      ok: true,
      message: `Partido actualizado: ${resolvedHomeTeamName} ${score.home} - ${score.away} ${resolvedAwayTeamName}`,
      rowId: payload.rowId,
      source: payload.source,
      match: {
        id: responseMatch.id,
        status: responseMatch.status,
        tournament: hydratedMatch?.tournament?.name || null,
        dateTime: responseMatch.dateTime,
        homeTeam: resolvedHomeTeamName,
        awayTeam: resolvedAwayTeamName,
        score: responseMatch.score,
        homeBonusPoints: responseMatch.homeBonusPoints ?? null,
        awayBonusPoints: responseMatch.awayBonusPoints ?? null,
        pointsAutocalculated: responseMatch.pointsAutocalculated ?? null,
        pointsOverrideReason: responseMatch.pointsOverrideReason ?? null,
      },
      resolution: {
        matchedBy: matchResolution.matchedBy,
        ambiguousCandidateSelection: matchResolution.ambiguous,
        alternatives: matchResolution.alternatives,
        homeTeam: matchResolution.homeTeamResolution
          ? formatTeamResolution('home', matchResolution.homeTeamResolution)
          : null,
        awayTeam: matchResolution.awayTeamResolution
          ? formatTeamResolution('away', matchResolution.awayTeamResolution)
          : null,
      },
      bonus: {
        requested: payload.bonusPoint,
        target: payload.bonusTarget,
        appliedHomeBonusPoints: responseMatch.homeBonusPoints ?? null,
        appliedAwayBonusPoints: responseMatch.awayBonusPoints ?? null,
        warning: manualBonus?.warning ?? null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonError(message, 500);
  }
}
