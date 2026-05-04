import {
  countTeamEventMetric,
  countTeamOffensiveMetric,
  resolveOffensiveBonusRule,
} from '@/lib/bonusRuleMetrics';
import { calculateBasePointsFromScore } from '@/lib/standings/matchPoints';

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
    shootoutWin?: number | null;
    shootoutLoss?: number | null;
  };
  bonus?: {
    offensive?: any;
    defensive?: any;
  };
  tiebreakers?: (string | { key: string; label?: string; enabled?: boolean; priority?: number })[];
  qualification?: {
    promoted?: number;
    zone?: number;
    relegated?: number;
  };
}

export interface StandingsCarryOverRow {
  participantId?: string | null;
  teamId?: string | null;
  team?: {
    id?: string | null;
    name?: string | null;
    logo?: string | null;
  } | null;
  played?: number | null;
  won?: number | null;
  drawn?: number | null;
  lost?: number | null;
  points_for?: number | null;
  points_against?: number | null;
  tries_for?: number | null;
  tries_against?: number | null;
  base_points?: number | null;
  bonus_offensive?: number | null;
  bonus_defensive?: number | null;
  adjustments?: number | null;
  total_points?: number | null;
  form?: string[] | string | null;
  sourcePhaseId?: string | null;
  sourcePhaseName?: string | null;
}

export interface StandingsGenerateOptions {
  carryOverRows?: StandingsCarryOverRow[];
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
      resolveOffensiveBonusRule(phaseSettings?.bonus?.offensive) ??
      resolveOffensiveBonusRule(tournamentRuleset?.bonus?.offensive) ??
      resolveOffensiveBonusRule(
        this.buildLegacyBonusRule(
          phaseBonusEnabled,
          phasePointsSystem?.bonusTry ??
            phasePointsSystem?.behavior?.bonusTry ??
            tournamentPointsSystem?.bonusTry ??
            tournamentRuleset?.pointsBonusTry,
          'offensive',
        ),
      ) ??
      resolveOffensiveBonusRule(
        this.buildLegacyBonusRule(
          tournamentBonusEnabled,
          tournamentPointsSystem?.bonusTry ?? tournamentRuleset?.pointsBonusTry,
          'offensive',
        ),
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

    const tiebreakers = Array.isArray(rawTiebreakers)
      ? rawTiebreakers
          .filter((t) => {
            const k = this.tiebreakerKey(t);
            if (!k || k.length === 0) return false;
            if (typeof t === 'object' && t !== null && 'enabled' in t && (t as any).enabled === false) return false;
            return true;
          })
          .sort((a, b) => {
            const pa = (typeof a === 'object' && a !== null ? (a as any).priority : 0) ?? 0;
            const pb = (typeof b === 'object' && b !== null ? (b as any).priority : 0) ?? 0;
            return pa - pb;
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
      points_for_shootout_win:
        phaseSettings?.points?.shootoutWin ??
        phasePointsSystem?.shootout?.win ??
        phasePointsSystem?.behavior?.shootoutLogic?.win ??
        tournamentRuleset?.points?.shootoutWin ??
        tournamentPointsSystem?.shootout?.win ??
        tournamentPointsSystem?.behavior?.shootoutLogic?.win ??
        tournamentRuleset?.pointsShootoutWin ??
        null,
      points_for_shootout_loss:
        phaseSettings?.points?.shootoutLoss ??
        phasePointsSystem?.shootout?.loss ??
        phasePointsSystem?.behavior?.shootoutLogic?.loss ??
        tournamentRuleset?.points?.shootoutLoss ??
        tournamentPointsSystem?.shootout?.loss ??
        tournamentPointsSystem?.behavior?.shootoutLogic?.loss ??
        tournamentRuleset?.pointsShootoutLoss ??
        null,
      offensive_bonus_rule: resolvedOffensiveBonusRule,
      defensive_bonus_rule: resolvedDefensiveBonusRule,
      tiebreakers,
      qualification_rules:
        phaseSettings?.qualification ?? tournamentRuleset?.qualification ?? null,
      editable_mode: phaseSettings?.standings?.editable ?? false,
      calculation_mode: phaseSettings?.standings?.mode ?? 'automatic',
      adjustments: phaseSettings?.standings?.adjustments ?? [],
      carry_over: phaseSettings?.carryOver ?? null,
    };
  }

  /**
   * Get the stable team identifier from a participant row.
   */
  private static getTeamId(participant: any): string {
    return participant.club_id || participant.id;
  }

  private static getCarryOverTeamId(row: StandingsCarryOverRow): string {
    return String(row.teamId || row.team?.id || row.participantId || '').trim();
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

  private static normalizeTiebreakerMetricKey(rawKey: string): string {
    const key = String(rawKey || '').trim();
    if (!key) return '';

    const compact = key.replace(/[\s_-]/g, '').toLowerCase();

    if (['points', 'pointstable', 'totalpoints', 'competitionpoints'].includes(compact)) {
      return 'points';
    }
    if (['headtohead', 'h2h'].includes(compact)) {
      return 'headToHead';
    }
    if (['pointsdiff', 'pointsdifference', 'pointsdifferential'].includes(compact)) {
      return 'points_difference';
    }
    if (['pointsfor', 'scored', 'goalsfor'].includes(compact)) {
      return 'points_for';
    }
    if (['pointsagainst', 'conceded', 'goalsagainst'].includes(compact)) {
      return 'points_against';
    }
    if (['triesfor'].includes(compact)) return 'tries_for';
    if (['triesagainst', 'triesconceded'].includes(compact)) return 'tries_against';
    if (['triesdiff', 'triesdifference', 'triesdifferential'].includes(compact)) {
      return 'tries_difference';
    }
    if (['won', 'wins'].includes(compact)) return 'won';
    if (['lost', 'losses'].includes(compact)) return 'lost';
    if (['drawn', 'draws'].includes(compact)) return 'drawn';
    if (['bonusoffensive', 'offensivebonus'].includes(compact)) return 'bonus_offensive';
    if (['bonusdefensive', 'defensivebonus'].includes(compact)) return 'bonus_defensive';

    return key;
  }

  private static getMetricValue(row: any, rawKey: string): number | undefined {
    const key = this.normalizeTiebreakerMetricKey(rawKey);

    if (key === 'points') return Number(row.total_points ?? 0);
    if (key === 'points_difference') return Number(row.difference ?? 0);
    if (key === 'points_for') return Number(row.points_for ?? 0);
    if (key === 'points_against') return Number(row.points_against ?? 0);
    if (key === 'tries_for') return Number(row.tries_for ?? 0);
    if (key === 'tries_against') return Number(row.tries_against ?? 0);
    if (key === 'tries_difference') return Number(row.tries_difference ?? 0);
    if (key === 'won') return Number(row.won ?? 0);
    if (key === 'lost') return Number(row.lost ?? 0);
    if (key === 'drawn') return Number(row.drawn ?? 0);
    if (key === 'bonus_offensive') return Number(row.bonus_offensive ?? 0);
    if (key === 'bonus_defensive') return Number(row.bonus_defensive ?? 0);

    return undefined;
  }

  private static compareStableRows(a: any, b: any): number {
    const aKey = String(a.teamId ?? a.participantId ?? a.team?.id ?? a.team?.name ?? '');
    const bKey = String(b.teamId ?? b.participantId ?? b.team?.id ?? b.team?.name ?? '');
    return aKey.localeCompare(bKey);
  }

  private static sortRowsStable(rows: any[]): any[] {
    return [...rows].sort((a, b) => this.compareStableRows(a, b));
  }

  private static groupRowsByMetric(
    rows: any[],
    rawKey: string,
    direction: 'asc' | 'desc',
    metricSource?: Map<string, any> | null,
  ): any[][] {
    const ranked = rows.map((row) => {
      const sourceRow = metricSource?.get(row.teamId) ?? row;
      return {
        row,
        value: this.getMetricValue(sourceRow, rawKey),
      };
    });

    if (ranked.every((entry) => entry.value === undefined)) {
      return [this.sortRowsStable(rows)];
    }

    ranked.sort((left, right) => {
      const leftMissing = left.value === undefined;
      const rightMissing = right.value === undefined;

      if (leftMissing && rightMissing) {
        return this.compareStableRows(left.row, right.row);
      }
      if (leftMissing) return 1;
      if (rightMissing) return -1;
      if (left.value !== right.value) {
        return direction === 'asc'
          ? Number(left.value) - Number(right.value)
          : Number(right.value) - Number(left.value);
      }
      return this.compareStableRows(left.row, right.row);
    });

    const groups: Array<Array<{ row: any; value: number | undefined }>> = [];
    ranked.forEach((entry) => {
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup[0]?.value !== entry.value) {
        groups.push([entry]);
        return;
      }
      lastGroup.push(entry);
    });

    return groups.map((group) => group.map((entry) => entry.row));
  }

  private static buildTableRows(
    participants: any[],
    matches: any[],
    rules: any,
    tableType: string,
    options: StandingsGenerateOptions = {},
  ) {
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
        tries_for: 0,
        tries_against: 0,
        tries_difference: 0,
        difference: 0,
        base_points: 0,
        bonus_offensive: 0,
        bonus_defensive: 0,
        adjustments: 0,
        total_points: 0,
        form: [] as string[],
        status: null as string | null,
        carry_over: null as any,
        _matchIds: [] as string[],
      });
    });

    if (Array.isArray(options.carryOverRows) && options.carryOverRows.length > 0) {
      options.carryOverRows.forEach((row) => {
        const teamId = this.getCarryOverTeamId(row);
        if (!teamId) return;

        const stats = statsMap.get(teamId);
        if (!stats) return;

        const bonusOffensive = this.toFiniteNumber(row.bonus_offensive) ?? 0;
        const bonusDefensive = this.toFiniteNumber(row.bonus_defensive) ?? 0;
        const adjustments = this.toFiniteNumber(row.adjustments) ?? 0;
        const explicitBasePoints = this.toFiniteNumber(row.base_points);
        const explicitTotalPoints = this.toFiniteNumber(row.total_points);
        const basePoints = explicitBasePoints ??
          (explicitTotalPoints !== null
            ? explicitTotalPoints - bonusOffensive - bonusDefensive - adjustments
            : 0);

        stats.played += this.toFiniteNumber(row.played) ?? 0;
        stats.won += this.toFiniteNumber(row.won) ?? 0;
        stats.drawn += this.toFiniteNumber(row.drawn) ?? 0;
        stats.lost += this.toFiniteNumber(row.lost) ?? 0;
        stats.points_for += this.toFiniteNumber(row.points_for) ?? 0;
        stats.points_against += this.toFiniteNumber(row.points_against) ?? 0;
        stats.tries_for += this.toFiniteNumber(row.tries_for) ?? 0;
        stats.tries_against += this.toFiniteNumber(row.tries_against) ?? 0;
        stats.base_points += basePoints;
        stats.bonus_offensive += bonusOffensive;
        stats.bonus_defensive += bonusDefensive;
        stats.adjustments += adjustments;

        const form = Array.isArray(row.form)
          ? row.form
          : typeof row.form === 'string'
            ? row.form.split('')
            : [];
        stats.form.push(...form.filter(Boolean));

        stats.carry_over = {
          source_phase_id: row.sourcePhaseId ?? null,
          source_phase_name: row.sourcePhaseName ?? null,
          played: (stats.carry_over?.played ?? 0) + (this.toFiniteNumber(row.played) ?? 0),
          points: (stats.carry_over?.points ?? 0) + (explicitTotalPoints ?? basePoints + bonusOffensive + bonusDefensive + adjustments),
        };
      });
    }

    const finalMatches = matches.filter((m) =>
      ['final', 'finished', 'ft'].includes(String(m.status ?? '').toLowerCase()),
    );
    finalMatches.sort(
      (a, b) =>
        new Date(a.date_time || 0).getTime() - new Date(b.date_time || 0).getTime(),
    );

    finalMatches.forEach((m) => {
      const homeId: string = m.home_club_id || m.home_participant_id;
      const awayId: string = m.away_club_id || m.away_participant_id;

      const homeStats = statsMap.get(homeId);
      const awayStats = statsMap.get(awayId);

      if (!homeStats || !awayStats) return;

      const { home: homeScore, away: awayScore } = this.parseScore(m.score);
      const homeTries = countTeamEventMetric(m.score, m.events, 'home', 'try');
      const awayTries = countTeamEventMetric(m.score, m.events, 'away', 'try');
      const hasManualPoints = m.points_autocalculated === false;
      const {
        home: homeBasePoints,
        away: awayBasePoints,
        homeResult,
        awayResult,
      } = calculateBasePointsFromScore(m.score, {
        win: Number(rules.points_for_win ?? 0),
        draw: Number(rules.points_for_draw ?? 0),
        loss: Number(rules.points_for_loss ?? 0),
        shootoutWin: rules.points_for_shootout_win ?? null,
        shootoutLoss: rules.points_for_shootout_loss ?? null,
      });

      if (tableType === 'general' || tableType === 'home') {
        homeStats.played += 1;
        homeStats.points_for += homeScore;
        homeStats.points_against += awayScore;
        homeStats.tries_for += homeTries;
        homeStats.tries_against += awayTries;
        homeStats._matchIds.push(m.id);

        if (homeResult === 'W') {
          homeStats.won += 1;
        } else if (homeResult === 'L') {
          homeStats.lost += 1;
          if (!hasManualPoints && rules.defensive_bonus_rule) {
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

        if (!hasManualPoints && rules.offensive_bonus_rule) {
          const threshold = Number(rules.offensive_bonus_rule.threshold ?? 4);
          const points = Number(rules.offensive_bonus_rule.points ?? 1);
          const offensiveMetric = countTeamOffensiveMetric(m.score, m.events, 'home', rules.offensive_bonus_rule);
          if (offensiveMetric >= threshold) homeStats.bonus_offensive += Number.isFinite(points) ? points : 1;
        }
        if (hasManualPoints) {
          homeStats.adjustments += Number(m.home_bonus_points ?? 0);
        }
      }

      if (tableType === 'general' || tableType === 'away') {
        awayStats.played += 1;
        awayStats.points_for += awayScore;
        awayStats.points_against += homeScore;
        awayStats.tries_for += awayTries;
        awayStats.tries_against += homeTries;
        awayStats._matchIds.push(m.id);

        if (awayResult === 'W') {
          awayStats.won += 1;
        } else if (awayResult === 'L') {
          awayStats.lost += 1;
          if (!hasManualPoints && rules.defensive_bonus_rule) {
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
          const threshold = Number(rules.offensive_bonus_rule.threshold ?? 4);
          const points = Number(rules.offensive_bonus_rule.points ?? 1);
          const offensiveMetric = countTeamOffensiveMetric(m.score, m.events, 'away', rules.offensive_bonus_rule);
          if (offensiveMetric >= threshold) awayStats.bonus_offensive += Number.isFinite(points) ? points : 1;
        }
        if (hasManualPoints) {
          awayStats.adjustments += Number(m.away_bonus_points ?? 0);
        }
      }
    });

    if (Array.isArray(rules.adjustments)) {
      rules.adjustments.forEach((a: any) => {
        const stats = statsMap.get(a.team_id) || statsMap.get(a.club_id);
        if (stats) stats.adjustments += Number(a.points_delta ?? 0);
      });
    }

    return Array.from(statsMap.values()).map((stats) => {
      stats.difference = stats.points_for - stats.points_against;
      stats.tries_difference = stats.tries_for - stats.tries_against;
      stats.total_points =
        stats.base_points + stats.bonus_offensive + stats.bonus_defensive + stats.adjustments;
      if (stats.form.length > 5) stats.form = stats.form.slice(-5);
      return stats;
    });
  }

  private static buildHeadToHeadMetricSource(
    rows: any[],
    matches: any[],
    rules: any,
    tableType: string,
  ): { hasMatches: boolean; statsByTeamId: Map<string, any> } {
    const tiedTeamIds = new Set(rows.map((row) => String(row.teamId ?? '')));
    const relevantMatches = matches.filter((match) => {
      const homeId = String(match.home_club_id || match.home_participant_id || '');
      const awayId = String(match.away_club_id || match.away_participant_id || '');
      return tiedTeamIds.has(homeId) && tiedTeamIds.has(awayId);
    });

    if (relevantMatches.length === 0) {
      return {
        hasMatches: false,
        statsByTeamId: new Map<string, any>(),
      };
    }

    const headToHeadParticipants = rows.map((row) => ({
      id: row.participantId ?? row.teamId,
      club_id: row.teamId,
      name: row.team?.name ?? 'Equipo',
      clubs: {
        name: row.team?.name ?? 'Equipo',
        logo_url: row.team?.logo ?? null,
      },
    }));

    const headToHeadRows = this.buildTableRows(
      headToHeadParticipants,
      relevantMatches,
      {
        ...rules,
        adjustments: [],
      },
      tableType,
    );

    return {
      hasMatches: true,
      statsByTeamId: new Map(headToHeadRows.map((row) => [row.teamId, row])),
    };
  }

  private static resolveTieGroup(
    rows: any[],
    tiebreakers: any[],
    matches: any[],
    rules: any,
    tableType: string,
    metricSource: Map<string, any> | null = null,
    startAt: number = 0,
  ): any[] {
    if (rows.length <= 1) return rows;

    for (let index = startAt; index < tiebreakers.length; index += 1) {
      const tb = tiebreakers[index];
      const key = this.normalizeTiebreakerMetricKey(this.tiebreakerKey(tb));
      if (!key) continue;

      const direction: 'asc' | 'desc' =
        typeof tb === 'object' && tb !== null && (tb as any).order === 'asc'
          ? 'asc'
          : 'desc';

      if (key === 'headToHead') {
        const headToHeadSource = this.buildHeadToHeadMetricSource(rows, matches, rules, tableType);
        if (!headToHeadSource.hasMatches) continue;

        const groupedByHeadToHead = this.groupRowsByMetric(
          rows,
          'points',
          direction,
          headToHeadSource.statsByTeamId,
        );

        return groupedByHeadToHead.flatMap((group) =>
          group.length > 1
            ? this.resolveTieGroup(
                group,
                tiebreakers,
                matches,
                rules,
                tableType,
                headToHeadSource.statsByTeamId,
                index + 1,
              )
            : group,
        );
      }

      const grouped = this.groupRowsByMetric(rows, key, direction, metricSource);
      if (grouped.length === 1) continue;

      return grouped.flatMap((group) =>
        group.length > 1
          ? this.resolveTieGroup(group, tiebreakers, matches, rules, tableType, metricSource, index + 1)
          : group,
      );
    }

    return this.sortRowsStable(rows);
  }

  private static sortTable(
    rows: any[],
    matches: any[],
    rules: any,
    tableType: string,
  ): any[] {
    const base = [...rows].sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points;
      return this.compareStableRows(a, b);
    });

    const groupedByPoints: any[][] = [];
    base.forEach((row) => {
      const lastGroup = groupedByPoints[groupedByPoints.length - 1];
      if (!lastGroup || Number(lastGroup[0]?.total_points ?? 0) !== Number(row.total_points ?? 0)) {
        groupedByPoints.push([row]);
        return;
      }
      lastGroup.push(row);
    });

    const tiebreakers = Array.isArray(rules?.tiebreakers) ? rules.tiebreakers : [];
    return groupedByPoints.flatMap((group) =>
      group.length > 1
        ? this.resolveTieGroup(group, tiebreakers, matches, rules, tableType)
        : group,
    );
  }

  /**
   * Calculate standings given participants, matches and resolved rules.
   */
  static generateTable(
    participants: any[],
    matches: any[],
    rules: any,
    tableType: string = 'general',
    options: StandingsGenerateOptions = {},
  ) {
    const table = this.buildTableRows(participants, matches, rules, tableType, options);
    const sortedTable = this.sortTable(table, matches, rules, tableType);

    const totalTeams = sortedTable.length;
    sortedTable.forEach((row, index) => {
      row.position = index + 1;
      row.status = this.resolveStatus(row.position, totalTeams, rules.qualification_rules);
    });

    return sortedTable;
  }
}
