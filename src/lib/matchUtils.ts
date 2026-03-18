/**
 * Central helpers for match score display.
 * A match with status 'scheduled' always shows '-' regardless of stored score.
 * Handles both internal Match objects (score: { home, away }) and flat fields (home_score, away_score).
 */

type ScoreInput = {
  status?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  score?: { home?: number | null; away?: number | null } | null;
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
