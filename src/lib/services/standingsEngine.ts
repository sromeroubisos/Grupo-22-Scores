export interface PhaseSettings {
  standings?: {
    mode?: 'automatic' | 'assisted_manual' | 'fully_manual';
    editable?: boolean;
    adjustments?: any[];
  };
  points?: {
    win: number;
    draw: number;
    loss: number;
  };
  bonus?: {
    offensive?: any;
    defensive?: any;
  };
  tiebreakers?: (string | { key: string; label?: string; enabled?: boolean; priority?: number })[];
  qualification?: {
    promoted?: number;      // top N qualify / are promoted
    zone?: number;          // next M go to repechaje / playoff zone
    relegated?: number;     // bottom K are relegated / eliminated
  };
}

export class StandingsEngine {
  private static toFiniteNumber(value: unknown): number | null {
    const normalized = typeof value === 'string' && value.trim() === '' ? Number.NaN : Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }

  private static buildLegacyBonusRule(
    enabled: boolean,
    fallback: unknown,
    kind: 'offensive' | 'defensive',
  ) {
    if (!enabled && fallback == null) return null;

    const bonusPoints = this.toFiniteNumber(fallback) ?? 1;

    if (kind === 'offensive') {
      return {
        tries: 4,
        points: bonusPoints,
      };
    }

    return {
      margin: 7,
      points: bonusPoints,
    };
  }

  /**
   * Normalize a tiebreaker entry to its string key.
   */
  static tiebreakerKey(tb: any): string {
    if (!tb) return '';
    if (typeof tb === 'string') return tb;
    return tb?.key || tb?.metric || tb?.id || tb?.value || '';
  }

  /**
   * Resolve rules between phase settings, tournament ruleset, and defaults.
   */
  static resolveRules(phaseSettings: any, tournamentRuleset: any) {
    const defaults = { win: 4, draw: 2, loss: 0 };
    const phasePointsSystem = phaseSettings?.pointsSystem ?? null;
    const tournamentPointsSystem = tournamentRuleset?.pointsSystem ?? null;
    const phaseBonusEnabled = Boolean(
      phasePointsSystem?.allowBonusPoints ||
      phasePointsSystem?.bonusTry != null ||
      phasePointsSystem?.bonusLoss != null,
    );
    const tournamentBonusEnabled = Boolean(
      tournamentPointsSystem?.allowBonusPoints ||
      tournamentRuleset?.pointsBonusTry != null ||
      tournamentRuleset?.pointsBonusLoss != null,
    );
    const resolvedOffensiveBonusRule =
      phaseSettings?.bonus?.offensive ??
      tournamentRuleset?.bonus?.offensive ??
      this.buildLegacyBonusRule(
        phaseBonusEnabled,
        phasePointsSystem?.bonusTry ??
          phasePointsSystem?.behavior?.bonusTry ??
          tournamentPointsSystem?.bonusTry ??
          tournamentRuleset?.pointsBonusTry,
        'offensive',
      ) ??
      this.buildLegacyBonusRule(
        tournamentBonusEnabled,
        tournamentPointsSystem?.bonusTry ?? tournamentRuleset?.pointsBonusTry,
        'offensive',
      );
    const resolvedDefensiveBonusRule =
      phaseSettings?.bonus?.defensive ??
      tournamentRuleset?.bonus?.defensive ??
      this.buildLegacyBonusRule(
        phaseBonusEnabled,
        phasePointsSystem?.bonusLoss ??
          phasePointsSystem?.behavior?.bonusLoss ??
          tournamentPointsSystem?.bonusLoss ??
          tournamentRuleset?.pointsBonusLoss,
        'defensive',
      ) ??
      this.buildLegacyBonusRule(
        tournamentBonusEnabled,
        tournamentPointsSystem?.bonusLoss ?? tournamentRuleset?.pointsBonusLoss,
        'defensive',
      );
    const rawTiebreakers =
      phaseSettings?.tiebreakers ?? tournamentRuleset?.tiebreakers ?? ['points_difference'];

    // Normalise tiebreakers – only keep non-null entries with a valid key
    const tiebreakers = Array.isArray(rawTiebreakers)
      ? rawTiebreakers.filter((t) => {
          const k = this.tiebreakerKey(t);
          return k && k.length > 0;
        })
      : ['points_difference'];

    return {
      points_for_win:
        phaseSettings?.points?.win ??
        phasePointsSystem?.win ??
        tournamentRuleset?.points?.win ??
        tournamentPointsSystem?.win ??
        tournamentRuleset?.pointsWin ??
        defaults.win,
      points_for_draw:
        phaseSettings?.points?.draw ??
        phasePointsSystem?.draw ??
        tournamentRuleset?.points?.draw ??
        tournamentPointsSystem?.draw ??
        tournamentRuleset?.pointsDraw ??
        defaults.draw,
      points_for_loss:
        phaseSettings?.points?.loss ??
        phasePointsSystem?.loss ??
        tournamentRuleset?.points?.loss ??
        tournamentPointsSystem?.loss ??
        tournamentRuleset?.pointsLoss ??
        defaults.loss,
      offensive_bonus_rule: resolvedOffensiveBonusRule,
      defensive_bonus_rule: resolvedDefensiveBonusRule,
      tiebreakers,
      qualification_rules:
        phaseSettings?.qualification ?? tournamentRuleset?.qualification ?? null,
      editable_mode: phaseSettings?.standings?.editable ?? false,
      calculation_mode: phaseSettings?.standings?.mode ?? 'automatic',
      adjustments: phaseSettings?.standings?.adjustments ?? [],
    };
  }

  /**
   * Get the stable team identifier from a participant row.
   */
  private static getTeamId(participant: any): string {
    return participant.club_id || participant.id;
  }

  /**
   * Resolve competitive status for a row based on position and qualification rules.
   */
  static resolveStatus(
    position: number,
    totalTeams: number,
    qualificationRules: any,
  ): string | null {
    if (!qualificationRules) return null;

    const promoted: number = qualificationRules.promoted ?? qualificationRules.qualified ?? 0;
    const zone: number = qualificationRules.zone ?? qualificationRules.repechaje ?? 0;
    const relegated: number =
      qualificationRules.relegated ?? qualificationRules.descenso ?? 0;

    if (promoted > 0 && position <= promoted) return 'Clasificado';
    if (zone > 0 && position <= promoted + zone) return 'En Zona';
    if (relegated > 0 && position > totalTeams - relegated) return 'Descenso';
    return null;
  }

  /**
   * Parse match score defensively. Handles {home, away}, {home_score, away_score}, [N, N].
   */
  private static parseScore(score: any): { home: number; away: number } {
    if (!score) return { home: 0, away: 0 };
    if (typeof score === 'object' && !Array.isArray(score)) {
      return {
        home: Number(score.home ?? score.home_score ?? 0),
        away: Number(score.away ?? score.away_score ?? 0),
      };
    }
    if (Array.isArray(score) && score.length >= 2) {
      return { home: Number(score[0]), away: Number(score[1]) };
    }
    return { home: 0, away: 0 };
  }

  /**
   * Calculate standings given participants, matches and resolved rules.
   */
  static generateTable(
    participants: any[],
    matches: any[],
    rules: any,
    tableType: string = 'general',
  ) {
    // 1. Initialise stat map
    const statsMap = new Map<string, any>();

    participants.forEach((p) => {
      const teamId = this.getTeamId(p);
      statsMap.set(teamId, {
        participantId: p.id,
        teamId,
        team: {
          id: teamId,
          name: p.clubs?.name || p.name || 'Equipo',
          logo: p.clubs?.logo_url || null,
        },
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        points_for: 0,
        points_against: 0,
        difference: 0,
        base_points: 0,
        bonus_offensive: 0,
        bonus_defensive: 0,
        adjustments: 0,
        total_points: 0,
        form: [] as string[],
        status: null as string | null,
        _matchIds: [] as string[], // for head-to-head lookups
      });
    });

    // 2. Process final matches (route already filters, but be defensive)
    const finalMatches = matches.filter((m) => m.status === 'final');
    finalMatches.sort(
      (a, b) =>
        new Date(a.date_time || 0).getTime() - new Date(b.date_time || 0).getTime(),
    );

    finalMatches.forEach((m) => {
      const homeId: string = m.home_club_id || m.home_participant_id;
      const awayId: string = m.away_club_id || m.away_participant_id;

      const homeStats = statsMap.get(homeId);
      const awayStats = statsMap.get(awayId);

      // Skip if either side is not a tracked participant
      if (!homeStats || !awayStats) return;

      const { home: homeScore, away: awayScore } = this.parseScore(m.score);
      const homeTries: number = Number(m.score?.homeTries ?? 0);
      const awayTries: number = Number(m.score?.awayTries ?? 0);
      const hasManualPoints = m.points_autocalculated === false;
      let homeBasePoints = rules.points_for_draw;
      let awayBasePoints = rules.points_for_draw;
      let homeResult = 'D';
      let awayResult = 'D';

      if (homeScore > awayScore) {
        homeBasePoints = rules.points_for_win;
        awayBasePoints = rules.points_for_loss;
        homeResult = 'W';
        awayResult = 'L';
      } else if (homeScore < awayScore) {
        homeBasePoints = rules.points_for_loss;
        awayBasePoints = rules.points_for_win;
        homeResult = 'L';
        awayResult = 'W';
      }

      // HOME side stats
      if (tableType === 'general' || tableType === 'home') {
        homeStats.played += 1;
        homeStats.points_for += homeScore;
        homeStats.points_against += awayScore;
        homeStats._matchIds.push(m.id);

        if (homeResult === 'W') {
          homeStats.won += 1;
        } else if (homeResult === 'L') {
          homeStats.lost += 1;
          // Defensive bonus: lost by ≤ threshold (default 7 pts)
          if (!hasManualPoints && rules.defensive_bonus_rule && homeResult === 'L') {
            const margin = rules.defensive_bonus_rule?.margin ?? 7;
            const points = Number(rules.defensive_bonus_rule?.points ?? rules.defensive_bonus_rule?.value ?? 1);
            if (awayScore - homeScore <= margin) homeStats.bonus_defensive += Number.isFinite(points) ? points : 1;
          }
        } else {
          homeStats.drawn += 1;
        }

        homeStats.base_points += hasManualPoints
          ? Number(m.home_base_points ?? homeBasePoints)
          : homeBasePoints;
        homeStats.form.push(homeResult);

        // Offensive bonus: scored ≥ threshold tries (default 4)
        if (!hasManualPoints && rules.offensive_bonus_rule) {
          const threshold = rules.offensive_bonus_rule?.tries ?? rules.offensive_bonus_rule?.threshold ?? 4;
          const points = Number(rules.offensive_bonus_rule?.points ?? rules.offensive_bonus_rule?.value ?? 1);
          if (homeTries >= threshold) homeStats.bonus_offensive += Number.isFinite(points) ? points : 1;
        }
        if (hasManualPoints) {
          homeStats.adjustments += Number(m.home_bonus_points ?? 0);
        }
      }

      // AWAY side stats
      if (tableType === 'general' || tableType === 'away') {
        awayStats.played += 1;
        awayStats.points_for += awayScore;
        awayStats.points_against += homeScore;
        awayStats._matchIds.push(m.id);

        if (awayResult === 'W') {
          awayStats.won += 1;
        } else if (awayResult === 'L') {
          awayStats.lost += 1;
          if (!hasManualPoints && rules.defensive_bonus_rule && awayResult === 'L') {
            const margin = rules.defensive_bonus_rule?.margin ?? 7;
            const points = Number(rules.defensive_bonus_rule?.points ?? rules.defensive_bonus_rule?.value ?? 1);
            if (homeScore - awayScore <= margin) awayStats.bonus_defensive += Number.isFinite(points) ? points : 1;
          }
        } else {
          awayStats.drawn += 1;
        }

        awayStats.base_points += hasManualPoints
          ? Number(m.away_base_points ?? awayBasePoints)
          : awayBasePoints;
        awayStats.form.push(awayResult);

        if (!hasManualPoints && rules.offensive_bonus_rule) {
          const threshold = rules.offensive_bonus_rule?.tries ?? rules.offensive_bonus_rule?.threshold ?? 4;
          const points = Number(rules.offensive_bonus_rule?.points ?? rules.offensive_bonus_rule?.value ?? 1);
          if (awayTries >= threshold) awayStats.bonus_offensive += Number.isFinite(points) ? points : 1;
        }
        if (hasManualPoints) {
          awayStats.adjustments += Number(m.away_bonus_points ?? 0);
        }
      }
    });

    // 3. Apply manual adjustments
    if (Array.isArray(rules.adjustments)) {
      rules.adjustments.forEach((a: any) => {
        const stats = statsMap.get(a.team_id) || statsMap.get(a.club_id);
        if (stats) stats.adjustments += Number(a.points_delta ?? 0);
      });
    }

    // 4. Compute derived fields
    const table = Array.from(statsMap.values()).map((stats) => {
      stats.difference = stats.points_for - stats.points_against;
      stats.total_points =
        stats.base_points + stats.bonus_offensive + stats.bonus_defensive + stats.adjustments;
      if (stats.form.length > 5) stats.form = stats.form.slice(-5);
      return stats;
    });

    // 5. Sort by total_points + tiebreakers
    table.sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points;

      for (const tb of rules.tiebreakers) {
        const key = this.tiebreakerKey(tb);
        if (key === 'points_difference' || key === 'points_diff') {
          if (b.difference !== a.difference) return b.difference - a.difference;
        } else if (key === 'points_for' || key === 'scored') {
          if (b.points_for !== a.points_for) return b.points_for - a.points_for;
        } else if (key === 'wins') {
          if (b.won !== a.won) return b.won - a.won;
        }
        // head_to_head_result – requires match data; deferred
      }
      return 0;
    });

    // 6. Assign position + status
    const totalTeams = table.length;
    table.forEach((row, index) => {
      row.position = index + 1;
      row.status = this.resolveStatus(row.position, totalTeams, rules.qualification_rules);
    });

    return table;
  }
}
