export type PenaltyAwareMatchScore = {
  home?: number | null;
  away?: number | null;
  penalties?: {
    home?: number | null;
    away?: number | null;
  } | null;
};

export type ShootoutAwarePointsRules = {
  win: number;
  draw: number;
  loss: number;
  shootoutWin?: number | null;
  shootoutLoss?: number | null;
};

export type MatchResultCode = 'W' | 'D' | 'L';

function toFiniteNumber(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

export function getPenaltyShootoutWinner(
  score: PenaltyAwareMatchScore | null | undefined,
): 'home' | 'away' | null {
  const home = toFiniteNumber(score?.home);
  const away = toFiniteNumber(score?.away);

  if (home === null || away === null || home !== away) {
    return null;
  }

  const penaltyHome = toFiniteNumber(score?.penalties?.home);
  const penaltyAway = toFiniteNumber(score?.penalties?.away);

  if (penaltyHome === null || penaltyAway === null) {
    return null;
  }

  if (penaltyHome > penaltyAway) return 'home';
  if (penaltyAway > penaltyHome) return 'away';
  return null;
}

export function hasConfiguredShootoutPoints(
  rules: ShootoutAwarePointsRules | null | undefined,
) {
  return (
    toFiniteNumber(rules?.shootoutWin) !== null
    && toFiniteNumber(rules?.shootoutLoss) !== null
  );
}

export function calculateBasePointsFromScore(
  score: PenaltyAwareMatchScore | null | undefined,
  rules: ShootoutAwarePointsRules,
): {
  home: number;
  away: number;
  homeResult: MatchResultCode;
  awayResult: MatchResultCode;
  resolvedByShootout: boolean;
} {
  const home = toFiniteNumber(score?.home) ?? 0;
  const away = toFiniteNumber(score?.away) ?? 0;

  if (home > away) {
    return {
      home: rules.win,
      away: rules.loss,
      homeResult: 'W',
      awayResult: 'L',
      resolvedByShootout: false,
    };
  }

  if (away > home) {
    return {
      home: rules.loss,
      away: rules.win,
      homeResult: 'L',
      awayResult: 'W',
      resolvedByShootout: false,
    };
  }

  const shootoutWinner = getPenaltyShootoutWinner(score);
  const shootoutWin = toFiniteNumber(rules.shootoutWin);
  const shootoutLoss = toFiniteNumber(rules.shootoutLoss);

  if (shootoutWinner && shootoutWin !== null && shootoutLoss !== null) {
    return shootoutWinner === 'home'
      ? {
          home: shootoutWin,
          away: shootoutLoss,
          homeResult: 'W',
          awayResult: 'L',
          resolvedByShootout: true,
        }
      : {
          home: shootoutLoss,
          away: shootoutWin,
          homeResult: 'L',
          awayResult: 'W',
          resolvedByShootout: true,
        };
  }

  return {
    home: rules.draw,
    away: rules.draw,
    homeResult: 'D',
    awayResult: 'D',
    resolvedByShootout: false,
  };
}
