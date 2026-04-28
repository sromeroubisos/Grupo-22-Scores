import {
  calculateMatchPointsPreview,
  resolveMatchPointsRules,
  type MatchPointsRules,
} from '@/lib/standings/matchPointsPreview';
import { fetchMatchCenterMatch, type MatchCenterEventInput } from '@/lib/services/matchCenterService';

type SupabaseLike = {
  from: (table: string) => any;
};

type MatchScoreLike = {
  home?: number | null;
  away?: number | null;
  penalties?: {
    home?: number | null;
    away?: number | null;
  } | null;
};

type MatchEventLike = {
  type: string;
  team: 'home' | 'away' | null;
};

function normalizeScore(score: unknown) {
  const row = score && typeof score === 'object' ? score as MatchScoreLike : {};
  const home = Math.max(0, Number(row.home) || 0);
  const away = Math.max(0, Number(row.away) || 0);
  const penaltyHome = Number(row.penalties?.home);
  const penaltyAway = Number(row.penalties?.away);

  return {
    home,
    away,
    penalties:
      home === away && Number.isFinite(penaltyHome) && Number.isFinite(penaltyAway)
        ? { home: Math.max(0, penaltyHome), away: Math.max(0, penaltyAway) }
        : null,
  };
}

function normalizeEvents(events: MatchCenterEventInput[] | MatchEventLike[]) {
  return (Array.isArray(events) ? events : []).map((event) => ({
    type: String(event?.type || ''),
    team: event?.team === 'home' || event?.team === 'away' ? event.team : null,
  }));
}

function calculateAutocalculatedPoints(
  matchStatus: string,
  score: ReturnType<typeof normalizeScore>,
  events: MatchEventLike[],
  rules: MatchPointsRules,
) {
  const preview = calculateMatchPointsPreview(matchStatus, score, events, rules);

  return {
    homeBasePoints: preview.homeBasePoints,
    awayBasePoints: preview.awayBasePoints,
    homeBonusPoints: preview.homeBonusPoints,
    awayBonusPoints: preview.awayBonusPoints,
    pointsAutocalculated: true,
    pointsOverrideReason: null,
  };
}

async function resolvePointsRules(client: SupabaseLike, match: { phase_id?: string | null; round_id?: string | null; tournament_id?: string | null }) {
  let phaseId = match.phase_id ?? null;

  if (!phaseId && match.round_id) {
    const { data: round } = await client
      .from('tournament_rounds')
      .select('phase_id')
      .eq('id', match.round_id)
      .single();
    phaseId = round?.phase_id ?? null;
  }

  let phaseSettings: Record<string, unknown> | null = null;
  let tournamentId = match.tournament_id ?? null;

  if (phaseId) {
    const { data: phase } = await client
      .from('tournament_phases')
      .select('settings, tournament_id')
      .eq('id', phaseId)
      .single();

    phaseSettings = (phase?.settings as Record<string, unknown> | null) ?? null;
    tournamentId = phase?.tournament_id ?? tournamentId;
  }

  let tournamentRuleset: Record<string, unknown> | null = null;
  if (tournamentId) {
    const { data: tournament } = await client
      .from('tournaments')
      .select('ruleset')
      .eq('id', tournamentId)
      .single();

    tournamentRuleset = (tournament?.ruleset as Record<string, unknown> | null) ?? null;
  }

  return resolveMatchPointsRules(phaseSettings, tournamentRuleset);
}

export async function deriveClubAdminPointsPatch(
  client: SupabaseLike,
  matchId: string,
  payload: {
    status?: unknown;
    score?: unknown;
    events?: MatchCenterEventInput[];
  },
) {
  const { data: match, error } = await client
    .from('matches')
    .select('id, tournament_id, phase_id, round_id, status, score, points_autocalculated')
    .eq('id', matchId)
    .single();

  if (error || !match) {
    throw new Error('El partido que intentas actualizar no existe.');
  }

  if (match.points_autocalculated === false) {
    return null;
  }

  const nextStatus = typeof payload.status === 'string' ? payload.status : match.status;
  const nextScore = normalizeScore(payload.score ?? match.score);
  const nextEvents = Array.isArray(payload.events)
    ? normalizeEvents(payload.events)
    : normalizeEvents((await fetchMatchCenterMatch(client, matchId)).data?.events || []);
  const pointsRules = await resolvePointsRules(client, match);

  return calculateAutocalculatedPoints(nextStatus, nextScore, nextEvents, pointsRules);
}
