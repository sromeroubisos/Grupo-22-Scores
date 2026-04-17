/**
 * Central helpers for match score display.
 * A match with status 'scheduled' always shows '-' regardless of stored score.
 * Handles both internal Match objects (score: { home, away }) and flat fields (home_score, away_score).
 */

type ScoreInput = {
  status?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  score?: {
    home?: number | null;
    away?: number | null;
    penalties?: {
      home?: number | null;
      away?: number | null;
    } | null;
  } | null;
};

export function isMatchUnplayedForUi(match: ScoreInput): boolean {
  if (match.status === 'scheduled') return true;
  const home = match.score?.home ?? match.home_score;
  const away = match.score?.away ?? match.away_score;
  return home == null || away == null;
}

export function getMatchScoreDisplay(match: ScoreInput): string {
  if (isMatchUnplayedForUi(match)) return '-';
  const home = match.score?.home ?? match.home_score;
  const away = match.score?.away ?? match.away_score;
  return `${home} - ${away}`;
}

export function getMatchPenaltyScore(match: ScoreInput): { home: number; away: number } | null {
  const home = match.score?.penalties?.home;
  const away = match.score?.penalties?.away;

  if (typeof home !== 'number' || typeof away !== 'number') {
    return null;
  }

  return { home, away };
}

export function hasMatchPenaltyShootout(match: ScoreInput): boolean {
  const penalties = getMatchPenaltyScore(match);
  const home = match.score?.home ?? match.home_score;
  const away = match.score?.away ?? match.away_score;

  return Boolean(
    penalties
    && typeof home === 'number'
    && typeof away === 'number'
    && home === away
  );
}

export function getMatchPenaltyScoreForSide(match: ScoreInput, side: 'home' | 'away'): number | null {
  const penalties = getMatchPenaltyScore(match);
  if (!penalties) return null;
  return penalties[side];
}

export function getMatchWinnerByScore(match: ScoreInput): 'home' | 'away' | null {
  if (isMatchUnplayedForUi(match)) return null;

  const home = match.score?.home ?? match.home_score;
  const away = match.score?.away ?? match.away_score;

  if (typeof home !== 'number' || typeof away !== 'number') {
    return null;
  }

  if (home > away) return 'home';
  if (away > home) return 'away';

  const penalties = getMatchPenaltyScore(match);
  if (!penalties) return null;
  if (penalties.home > penalties.away) return 'home';
  if (penalties.away > penalties.home) return 'away';
  return null;
}
