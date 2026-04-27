import { createAdminClient } from '@/lib/supabase/admin';
import { ensureChronologicalSeasonEdgesForCluster } from '@/lib/tournamentSeasonChain';
import { normalizeSlug } from '@/lib/utils/normalize';
import type {
  HistoricalImportClubResolution,
  HistoricalImportConfirmResult,
  HistoricalImportIssue,
  HistoricalImportMatchPreview,
  HistoricalImportPhaseOverride,
  HistoricalImportPhasePreview,
  HistoricalImportPreviewResult,
  HistoricalImportStandingRow,
} from '@/lib/types/historical-tournament-import';

type SupabaseClientLike = ReturnType<typeof createAdminClient>;
type SupabaseErrorLike = { code?: string | null; message?: string | null };
type SupabaseQueryResult<T> = { data: T | null; error: SupabaseErrorLike | null };
type SupabaseMutationResult = { error: SupabaseErrorLike | null };
type UntypedDeleteBuilder = {
  eq: (column: string, value: unknown) => Promise<SupabaseMutationResult>;
};
type UntypedFilterBuilder<T> = PromiseLike<SupabaseQueryResult<T>> & {
  select: (columns?: string) => UntypedFilterBuilder<T>;
  eq: (column: string, value: unknown) => UntypedFilterBuilder<T>;
  in: (column: string, values: unknown[]) => UntypedFilterBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => UntypedFilterBuilder<T>;
  single: () => Promise<SupabaseQueryResult<T>>;
  maybeSingle: () => Promise<SupabaseQueryResult<T>>;
  insert: (payload: unknown) => Promise<SupabaseMutationResult>;
  upsert: (
    payload: unknown,
    options?: { onConflict?: string; ignoreDuplicates?: boolean }
  ) => Promise<SupabaseMutationResult>;
  delete: () => UntypedDeleteBuilder;
};
type UntypedSupabaseClient = {
  from: <T = unknown>(table: string) => UntypedFilterBuilder<T>;
};

type TournamentContext = {
  tournament: {
    id: string;
    name: string;
    display_name: string | null;
    slug: string | null;
    season_id: string | null;
    sport_id: string | null;
    union_id: string | null;
    country_id: string | null;
    country: string | null;
    category: string | null;
    age_grade: string | null;
    format: string | null;
    logo_url: string | null;
    banner_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    region: string | null;
    ruleset: Record<string, unknown> | null;
  };
  clubs: ClubCandidate[];
};

type ClubCandidate = {
  id: string;
  name: string;
  shortName: string | null;
  normalized: string;
  aliases: string[];
  existingParticipant: boolean;
};

type ParticipantAliasRow = {
  club_id: string | null;
  name: string | null;
  short_code: string | null;
  clubs:
    | {
        name: string | null;
        short_name: string | null;
      }
    | Array<{
        name: string | null;
        short_name: string | null;
      }>
    | null;
};

type ParsedMatch = {
  id: string;
  date: string;
  stageLabel: string;
  phaseKey: 'league' | 'playoff';
  roundKey: string;
  roundName: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
};

type ParsedStanding = {
  position: number;
  teamName: string;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scored: number;
  conceded: number;
  difference: number;
  tryBonus: number;
  losingBonus: number;
  note: string | null;
};

type PhaseKey = ParsedMatch['phaseKey'];
type PhaseOverrideMap = Record<string, HistoricalImportPhaseOverride>;
type ResolvedHistoricalTeam = {
  key: string;
  clubId: string;
  clubName: string;
  shortCode: string | null;
  position: number | null;
};

type HistoricalModel = {
  seasonId: string;
  parsedMatches: ParsedMatch[];
  parsedStandings: ParsedStanding[];
  phases: HistoricalImportPhasePreview[];
  clubs: HistoricalImportClubResolution[];
  matches: HistoricalImportMatchPreview[];
  standings: HistoricalImportStandingRow[];
  issues: HistoricalImportIssue[];
  suggestedName: string;
  suggestedDisplayName: string;
  suggestedSlug: string;
  champion: string | null;
  runnerUp: string | null;
  thirdPlace: string | null;
};

type ConfirmParams = {
  baseTournamentId: string;
  actorUserId: string;
  rawText: string;
  overrides?: Record<string, string | null>;
  phaseOverrides?: PhaseOverrideMap;
  tournamentName?: string | null;
  displayName?: string | null;
  slug?: string | null;
  publish?: boolean;
};

const STANDINGS_HEADER_REGEX = /^pos\.?\b/i;
const DATE_STAGE_REGEX = /^(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(.+)$/;
const SCORE_AT_END_REGEX = /(\d+)\s*-\s*(\d+)\s*$/;
const RELATION_DESCRIPTION_PREFIX = 'Temporada historica importada';

export class HistoricalTournamentImportService {
  static async preview(baseTournamentId: string, rawText: string): Promise<HistoricalImportPreviewResult> {
    const supabase = createAdminClient();
    const context = await this.loadContext(supabase, baseTournamentId);
    const model = this.buildModel(context, rawText, {});

    return {
      ok: !model.issues.some((issue) => issue.severity === 'error'),
      summary: {
        seasonId: model.seasonId,
        suggestedName: model.suggestedName,
        suggestedDisplayName: model.suggestedDisplayName,
        suggestedSlug: model.suggestedSlug,
        matchesCount: model.matches.length,
        standingsCount: model.standings.length,
        teamsCount: model.clubs.length,
        unresolvedTeams: model.clubs.filter((club) => !club.matchedClubId).length,
        champion: model.champion,
        runnerUp: model.runnerUp,
        thirdPlace: model.thirdPlace,
      },
      issues: model.issues,
      phases: model.phases,
      clubs: model.clubs,
      matches: model.matches,
      standings: model.standings,
    };
  }

  static async confirm(params: ConfirmParams): Promise<HistoricalImportConfirmResult> {
    const supabase = createAdminClient();
    const db = supabase as unknown as UntypedSupabaseClient;
    const context = await this.loadContext(supabase, params.baseTournamentId);
    const model = this.buildModel(context, params.rawText, params.overrides || {}, params.phaseOverrides || {});
    const warnings = model.issues
      .filter((issue) => issue.severity !== 'error')
      .map((issue) => issue.message);

    const unresolved = model.clubs.filter((club) => !club.matchedClubId);
    if (model.issues.some((issue) => issue.severity === 'error') || unresolved.length > 0) {
      return {
        ok: false,
        tournamentId: null,
        relationCreated: false,
        created: { participants: 0, phases: 0, rounds: 0, matches: 0, standings: 0 },
        warnings: [
          ...warnings,
          ...unresolved.map((club) => `Falta resolver el club "${club.sourceName}".`),
        ],
      };
    }

    const requestedSlug = this.readText(params.slug) || model.suggestedSlug;
    const uniqueSlug = await this.ensureUniqueSlug(supabase, requestedSlug);
    const publish = params.publish === true;
    const importedTournamentId = crypto.randomUUID();
    const now = new Date().toISOString();
    const targetName = this.readText(params.tournamentName) || model.suggestedName;
    const targetDisplayName = this.readText(params.displayName) || model.suggestedDisplayName;
    const resolvedClubIds = new Map(
      model.clubs
        .filter((club): club is HistoricalImportClubResolution & { matchedClubId: string } => Boolean(club.matchedClubId))
        .map((club) => [club.normalizedName, club.matchedClubId as string])
    );
    const sameClubMatches = model.parsedMatches.filter((match) => {
      const homeClubId = resolvedClubIds.get(this.normalizeKey(match.homeTeam));
      const awayClubId = resolvedClubIds.get(this.normalizeKey(match.awayTeam));
      return Boolean(homeClubId && awayClubId && homeClubId === awayClubId);
    });

    if (sameClubMatches.length > 0) {
      return {
        ok: false,
        tournamentId: null,
        relationCreated: false,
        created: { participants: 0, phases: 0, rounds: 0, matches: 0, standings: 0 },
        warnings: [
          ...warnings,
          ...sameClubMatches.slice(0, 5).map((match) =>
            `El partido "${match.homeTeam} - ${match.awayTeam}" resuelve ambos lados al mismo club.`
          ),
        ],
      };
    }

    const teamRows = this.buildResolvedTeams(model, resolvedClubIds);
    const leagueNeeded = model.parsedStandings.length > 0 || model.parsedMatches.some((match) => match.phaseKey === 'league');
    const playoffNeeded = model.parsedMatches.some((match) => match.phaseKey === 'playoff');
    const startDate = model.parsedMatches.length ? model.parsedMatches[0].date : null;
    const endDate = model.parsedMatches.length ? model.parsedMatches[model.parsedMatches.length - 1].date : null;
    const phaseByKey = new Map(model.phases.map((phase) => [phase.key, phase]));
    let tournamentInserted = false;

    try {
      const { error: tournamentError } = await db
        .from('tournaments')
        .insert({
          id: importedTournamentId,
          name: targetName,
          display_name: targetDisplayName,
          slug: uniqueSlug,
          season_id: model.seasonId,
          sport_id: context.tournament.sport_id,
          union_id: context.tournament.union_id,
          country_id: context.tournament.country_id,
          country: context.tournament.country,
          category: context.tournament.category,
          age_grade: context.tournament.age_grade,
          format: context.tournament.format,
          logo_url: context.tournament.logo_url,
          banner_url: context.tournament.banner_url,
          primary_color: context.tournament.primary_color,
          secondary_color: context.tournament.secondary_color,
          region: context.tournament.region,
          ruleset: context.tournament.ruleset,
          is_popular: false,
          is_visible: publish,
          status: publish ? 'published' : 'draft',
          created_at: now,
          updated_at: now,
        });

      if (tournamentError) {
        throw new Error(tournamentError.message || 'No se pudo crear el torneo historico.');
      }
      tournamentInserted = true;

      const seasonRecord = await this.createSeasonRecord(supabase, {
        tournamentId: importedTournamentId,
        seasonId: model.seasonId,
        teamsCount: teamRows.length,
        startDate,
        endDate,
      });
      if (!seasonRecord.ok && seasonRecord.message) {
        warnings.push(seasonRecord.message);
      }

      const participantInserts = teamRows.map((team) => ({
        tournament_id: importedTournamentId,
        club_id: team.clubId,
        name: team.clubName,
        type: 'club',
        status: 'active',
        seed: team.position,
        short_code: team.shortCode,
        notes: null,
        created_at: now,
        updated_at: now,
      }));

      const { error: participantError } = await db.from('tournament_participants').insert(participantInserts);
      if (participantError) {
        throw new Error(participantError.message || 'No se pudieron crear los participantes.');
      }

      const phaseBlueprints = [
        leagueNeeded
          ? {
              key: 'league' as const,
              name: phaseByKey.get('league')?.name || 'Temporada regular',
              phase_type: phaseByKey.get('league')?.phaseType || 'league',
              order_index: 1,
              is_active: true,
              settings: {
                source: 'historical_import',
                imported: true,
                standings: {
                  mode: 'fully_manual',
                  editable: false,
                },
              },
            }
          : null,
        playoffNeeded
          ? {
              key: 'playoff' as const,
              name: phaseByKey.get('playoff')?.name || 'Playoffs',
              phase_type: phaseByKey.get('playoff')?.phaseType || 'playoff',
              order_index: leagueNeeded ? 2 : 1,
              is_active: !leagueNeeded,
              settings: {
                source: 'historical_import',
                imported: true,
              },
            }
          : null,
      ].filter(Boolean) as Array<{
        key: 'league' | 'playoff';
        name: string;
        phase_type: string;
        order_index: number;
        is_active: boolean;
        settings: Record<string, unknown>;
      }>;

      // Generate IDs first, then insert all phases / rounds in a single
      // batch each. Previously this loop fired one round-trip per phase and
      // per round, which dominated the import time on tournaments with many
      // matchdays.
      const phaseIdByKey = new Map<'league' | 'playoff', string>();
      const phaseRows = phaseBlueprints.map((phase) => {
        const phaseId = crypto.randomUUID();
        phaseIdByKey.set(phase.key, phaseId);
        return {
          id: phaseId,
          tournament_id: importedTournamentId,
          name: phase.name,
          phase_type: phase.phase_type,
          order_index: phase.order_index,
          is_active: phase.is_active,
          settings: phase.settings,
          start_date: startDate,
          end_date: endDate,
          created_at: now,
          updated_at: now,
        };
      });

      if (phaseRows.length > 0) {
        const { error: phasesError } = await this.insertManyWithOptionalColumns(
          db,
          'tournament_phases',
          phaseRows,
          ['start_date', 'end_date', 'settings', 'created_at', 'updated_at']
        );
        if (phasesError) {
          throw new Error(phasesError.message || 'No se pudieron crear las fases del torneo.');
        }
      }

      const roundBlueprints = this.buildRoundBlueprints(model);
      const roundIdByKey = new Map<string, string>();
      const roundRows: Record<string, unknown>[] = [];
      for (const round of roundBlueprints) {
        const phaseId = phaseIdByKey.get(round.phaseKey);
        if (!phaseId) continue;
        const roundId = crypto.randomUUID();
        roundIdByKey.set(round.key, roundId);
        roundRows.push({
          id: roundId,
          phase_id: phaseId,
          name: round.name,
          order_index: round.orderIndex,
          start_date: round.date,
          end_date: round.date,
          is_completed: true,
          notes: round.notes,
          created_at: now,
          updated_at: now,
        });
      }

      if (roundRows.length > 0) {
        const { error: roundsError } = await this.insertManyWithOptionalColumns(
          db,
          'tournament_rounds',
          roundRows,
          ['start_date', 'end_date', 'is_completed', 'notes', 'created_at', 'updated_at']
        );
        if (roundsError) {
          throw new Error(roundsError.message || 'No se pudieron crear las jornadas del torneo.');
        }
      }

      const scoreRules = this.resolvePointsRules(context.tournament.ruleset);
      const matchInserts = model.parsedMatches.map((match) => {
        const homeClubId = resolvedClubIds.get(this.normalizeKey(match.homeTeam)) || null;
        const awayClubId = resolvedClubIds.get(this.normalizeKey(match.awayTeam)) || null;
        const phaseId = phaseIdByKey.get(match.phaseKey) || null;
        const roundId = roundIdByKey.get(match.roundKey) || null;
        const basePoints = this.calculateBasePoints(match.homeScore, match.awayScore, scoreRules);

        return {
          id: crypto.randomUUID(),
          tournament_id: importedTournamentId,
          phase_id: phaseId,
          round_uuid: roundId,
          group_id: null,
          home_club_id: homeClubId,
          away_club_id: awayClubId,
          date_time: this.toMiddayIso(match.date),
          venue: null,
          status: 'final',
          score: { home: match.homeScore, away: match.awayScore },
          notes: `Importado desde ${match.stageLabel}`,
          home_base_points: basePoints.home,
          away_base_points: basePoints.away,
          home_bonus_points: 0,
          away_bonus_points: 0,
          points_autocalculated: true,
          points_override_reason: null,
          created_at: now,
          updated_at: now,
        };
      });

      if (matchInserts.length > 0) {
        const { error: matchesError } = await db.from('matches').insert(matchInserts);
        if (matchesError) {
          throw new Error(matchesError.message || 'No se pudieron crear los partidos.');
        }
      }

      const standingsPhaseId = phaseIdByKey.get('league') || null;
      let standingsInsertedCount = 0;
      if (standingsPhaseId && model.parsedStandings.length > 0) {
        const seenStandingClubIds = new Set<string>();
        const standingsInserts = model.parsedStandings.flatMap((row) => {
          const clubId = resolvedClubIds.get(this.normalizeKey(row.teamName));
          if (!clubId) return [];
          if (seenStandingClubIds.has(clubId)) {
            warnings.push(`Se omitio una fila duplicada de tabla para "${row.teamName}".`);
            return [];
          }
          seenStandingClubIds.add(clubId);
          return [{
            id: crypto.randomUUID(),
            tournament_id: importedTournamentId,
            phase_id: standingsPhaseId,
            group_id: null,
            club_id: clubId,
            position: row.position,
            played: row.played,
            won: row.won,
            drawn: row.drawn,
            lost: row.lost,
            points: row.points,
            scored: row.scored,
            conceded: row.conceded,
            bonus_points: row.tryBonus + row.losingBonus,
            form: null,
            streak: null,
            stats: {
              imported: true,
              difference: row.difference,
              try_bonus: row.tryBonus,
              losing_bonus: row.losingBonus,
              note: row.note,
              team_name: row.teamName,
              status: row.note,
            },
            last_updated: now,
          }];
        });

        standingsInsertedCount = standingsInserts.length;
        if (standingsInserts.length > 0) {
          const { error: standingsError } = await db.from('tournament_standings').insert(standingsInserts);
          if (standingsError) {
            throw new Error(standingsError.message || 'No se pudo guardar la tabla importada.');
          }
        }
      }

      await this.learnAliases(supabase, model.clubs);

      /* previous_season: source = edicion mas vieja, target = edicion mas nueva (el torneo base desde el que importaste). */
      const relationResult = await this.createSeasonRelation(
        supabase,
        importedTournamentId,
        params.baseTournamentId,
        model.seasonId
      );
      const relationCreated = relationResult.ok;
      if (!relationCreated && relationResult.message) {
        warnings.push(relationResult.message);
      }

      try {
        await ensureChronologicalSeasonEdgesForCluster(db as any, importedTournamentId);
      } catch {
        warnings.push('No se pudo sincronizar la cadena automatica de temporadas (revisa tournament_relations).');
      }

      await this.writeAudit(supabase, params.actorUserId, importedTournamentId, {
        scope: 'historical_import',
        source_tournament_id: params.baseTournamentId,
        season_id: model.seasonId,
        champion: model.champion,
        runner_up: model.runnerUp,
        teams: teamRows.length,
        matches: matchInserts.length,
        standings: standingsInsertedCount,
        relation_created: relationCreated,
      });

      await this.writeAudit(supabase, params.actorUserId, params.baseTournamentId, {
        scope: 'historical_import',
        imported_tournament_id: importedTournamentId,
        season_id: model.seasonId,
        relation_created: relationCreated,
      });

      return {
        ok: true,
        tournamentId: importedTournamentId,
        relationCreated,
        created: {
          participants: participantInserts.length,
          phases: phaseBlueprints.length,
          rounds: roundBlueprints.length,
          matches: matchInserts.length,
          standings: standingsInsertedCount,
        },
        warnings,
      };
    } catch (error) {
      if (tournamentInserted) {
        await this.cleanupImportedTournament(supabase, importedTournamentId);
      }
      throw error;
    }
  }

  private static async loadContext(supabase: SupabaseClientLike, baseTournamentId: string): Promise<TournamentContext> {
    const db = supabase as unknown as UntypedSupabaseClient;
    const [{ data: tournament, error: tournamentError }, { data: participants, error: participantsError }] = await Promise.all([
      db
        .from<TournamentContext['tournament']>('tournaments')
        .select('id, name, display_name, slug, season_id, sport_id, union_id, country_id, country, category, age_grade, format, logo_url, banner_url, primary_color, secondary_color, region, ruleset')
        .eq('id', baseTournamentId)
        .single(),
      db
        .from<ParticipantAliasRow[]>('tournament_participants')
        .select('club_id, name, short_code, clubs:club_id(id, name, short_name)')
        .eq('tournament_id', baseTournamentId),
    ]);

    if (tournamentError || !tournament) {
      throw new Error('No se pudo cargar el torneo base para la importacion historica.');
    }

    if (participantsError) {
      throw new Error('No se pudieron cargar los participantes del torneo base.');
    }

    let clubsQuery = db
      .from<Array<{ id: string; name: string; short_name: string | null; union_id: string | null }>>('clubs')
      .select('id, name, short_name, union_id')
      .order('name', { ascending: true });
    if (tournament.union_id) {
      clubsQuery = clubsQuery.eq('union_id', tournament.union_id);
    }

    const { data: clubs, error: clubsError } = await clubsQuery;
    if (clubsError) {
      throw new Error('No se pudieron cargar los clubes candidatos para la importacion.');
    }

    const clubIds = (clubs || []).map((club) => club.id);
    const { data: clubAliases } = clubIds.length > 0
      ? await db.from<Array<{ club_id: string; alias: string }>>('club_aliases').select('club_id, alias').in('club_id', clubIds)
      : { data: [] as Array<{ club_id: string; alias: string }> };

    const participantRows = (participants || []) as ParticipantAliasRow[];
    const participantClubIds = new Set(
      participantRows
        .map((participant) => participant.club_id)
        .filter((clubId): clubId is string => Boolean(clubId))
    );
    const participantMap = new Map<string, Array<{ name: string | null; shortCode: string | null }>>();
    participantRows.forEach((participant) => {
      if (!participant.club_id) return;
      const clubData = Array.isArray(participant.clubs) ? participant.clubs[0] : participant.clubs;
      const list = participantMap.get(participant.club_id) || [];
      list.push({
        name: participant.name || clubData?.name || null,
        shortCode: participant.short_code || clubData?.short_name || null,
      });
      participantMap.set(participant.club_id, list);
    });

    const aliasMap = new Map<string, string[]>();
    (clubAliases || []).forEach((row) => {
      const list = aliasMap.get(row.club_id) || [];
      list.push(row.alias);
      aliasMap.set(row.club_id, list);
    });

    return {
      tournament: tournament as TournamentContext['tournament'],
      clubs: (clubs || []).map((club) => {
        const participantAliases = participantMap.get(club.id) || [];
        const aliases = [
          club.name,
          club.short_name,
          ...participantAliases.flatMap((participant) => [participant.name, participant.shortCode]),
          ...(aliasMap.get(club.id) || []),
        ]
          .filter(Boolean)
          .map((value) => this.normalizeKey(String(value)));

        return {
          id: club.id,
          name: club.name,
          shortName: club.short_name,
          normalized: this.normalizeKey(club.name),
          aliases: Array.from(new Set(aliases)),
          existingParticipant: participantClubIds.has(club.id),
        };
      }),
    };
  }

  private static buildModel(
    context: TournamentContext,
    rawText: string,
    overrides: Record<string, string | null>,
    phaseOverrides: PhaseOverrideMap = {}
  ): HistoricalModel {
    const issues: HistoricalImportIssue[] = [];
    const lines = rawText
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.replace(/\u00a0/g, ' ').trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return {
        seasonId: context.tournament.season_id || String(new Date().getFullYear()),
        parsedMatches: [],
        parsedStandings: [],
        phases: [],
        clubs: [],
        matches: [],
        standings: [],
        issues: [{ severity: 'error', code: 'empty_text', message: 'Pega el texto historico antes de analizar.' }],
        suggestedName: context.tournament.name,
        suggestedDisplayName: context.tournament.display_name || context.tournament.name,
        suggestedSlug: context.tournament.slug || normalizeSlug(context.tournament.name),
        champion: null,
        runnerUp: null,
        thirdPlace: null,
      };
    }

    const standingsHeaderIndex = lines.findIndex((line) => STANDINGS_HEADER_REGEX.test(line));
    const scheduleLines = standingsHeaderIndex >= 0 ? lines.slice(0, standingsHeaderIndex) : lines;
    const standingsLines = standingsHeaderIndex >= 0 ? lines.slice(standingsHeaderIndex + 1) : [];
    const parsedMatches = this.parseSchedule(scheduleLines, issues);
    const parsedStandings = this.parseStandings(standingsLines, issues);
    const seasonId = this.detectSeasonId(parsedMatches, context.tournament.season_id);

    if (parsedMatches.length === 0) {
      issues.push({
        severity: 'error',
        code: 'no_matches_detected',
        message: 'No se detectaron partidos en el bloque Match Schedule.',
      });
    }

    if (parsedStandings.length === 0) {
      issues.push({
        severity: 'warning',
        code: 'no_standings_detected',
        message: 'No se detecto una tabla de posiciones importable. El torneo se creara sin standings persistidos.',
      });
    }

    const teamCounts = new Map<string, number>();
    parsedMatches.forEach((match) => {
      teamCounts.set(this.normalizeKey(match.homeTeam), (teamCounts.get(this.normalizeKey(match.homeTeam)) || 0) + 1);
      teamCounts.set(this.normalizeKey(match.awayTeam), (teamCounts.get(this.normalizeKey(match.awayTeam)) || 0) + 1);
    });
    parsedStandings.forEach((row) => {
      teamCounts.set(this.normalizeKey(row.teamName), Math.max(teamCounts.get(this.normalizeKey(row.teamName)) || 0, 1));
    });

    const clubs = Array.from(teamCounts.entries())
      .map(([normalizedName, sourceCount]) => {
        const sourceName = this.resolveSourceName(parsedMatches, parsedStandings, normalizedName);
        return this.resolveClub(sourceName, sourceCount, context.clubs, overrides);
      })
      .sort((left, right) => left.sourceName.localeCompare(right.sourceName));

    const unresolvedTeams = clubs.filter((club) => !club.matchedClubId);
    if (unresolvedTeams.length > 0) {
      issues.push({
        severity: 'warning',
        code: 'unresolved_teams',
        message: `${unresolvedTeams.length} clubes requieren revision manual antes de importar.`,
      });
    }

    const championData = this.inferPodium(parsedMatches, parsedStandings);
    return {
      seasonId,
      parsedMatches,
      parsedStandings,
      phases: this.summarizePhases(parsedMatches, phaseOverrides, parsedStandings.length > 0),
      clubs,
      matches: parsedMatches.map((match) => ({
        id: match.id,
        phaseKey: match.phaseKey,
        phaseName: this.resolvePhaseConfig(match.phaseKey, phaseOverrides).name,
        roundName: match.roundName,
        roundDate: match.date,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
      })),
      standings: parsedStandings.map((row) => {
        const club = clubs.find((clubItem) => clubItem.normalizedName === this.normalizeKey(row.teamName));
        return {
          position: row.position,
          teamName: row.teamName,
          matchedClubId: club?.matchedClubId || null,
          matchedClubName: club?.matchedClubName || null,
          points: row.points,
          played: row.played,
          won: row.won,
          drawn: row.drawn,
          lost: row.lost,
          scored: row.scored,
          conceded: row.conceded,
          difference: row.difference,
          tryBonus: row.tryBonus,
          losingBonus: row.losingBonus,
          note: row.note,
        };
      }),
      issues: this.deduplicateIssues(issues),
      suggestedName: this.suggestTournamentName(context.tournament.name, context.tournament.season_id, seasonId),
      suggestedDisplayName: this.suggestTournamentName(
        context.tournament.display_name || context.tournament.name,
        context.tournament.season_id,
        seasonId
      ),
      suggestedSlug: this.suggestSlug(context.tournament.slug, context.tournament.name, context.tournament.season_id, seasonId),
      champion: championData.champion,
      runnerUp: championData.runnerUp,
      thirdPlace: championData.thirdPlace,
    };
  }

  private static parseSchedule(lines: string[], issues: HistoricalImportIssue[]): ParsedMatch[] {
    const matches: ParsedMatch[] = [];
    let currentDate: string | null = null;
    let currentLabel: string | null = null;

    for (const line of lines) {
      if (/^match schedule$/i.test(line)) continue;

      const headerMatch = line.match(DATE_STAGE_REGEX);
      if (headerMatch) {
        currentDate = this.toIsoDate(headerMatch[1]);
        currentLabel = headerMatch[2].trim();
        continue;
      }

      if (!currentDate || !currentLabel) continue;
      const parsed = this.parseMatchLine(line);
      if (!parsed) {
        issues.push({
          severity: 'warning',
          code: 'unparsed_match_line',
          message: `No se pudo interpretar la linea de partido: "${line}".`,
        });
        continue;
      }

      const phaseKey = this.isLeagueLabel(currentLabel) ? 'league' : 'playoff';
      const roundName = phaseKey === 'league' ? currentDate : currentLabel;
      const roundKey = phaseKey === 'league'
        ? `league:${currentDate}`
        : `playoff:${currentDate}:${this.normalizeKey(currentLabel)}`;

      matches.push({
        id: crypto.randomUUID(),
        date: currentDate,
        stageLabel: currentLabel,
        phaseKey,
        roundKey,
        roundName,
        homeTeam: parsed.homeTeam,
        awayTeam: parsed.awayTeam,
        homeScore: parsed.homeScore,
        awayScore: parsed.awayScore,
      });
    }

    return matches.sort((left, right) => {
      if (left.date !== right.date) return left.date.localeCompare(right.date);
      return left.roundKey.localeCompare(right.roundKey);
    });
  }

  private static parseStandings(lines: string[], issues: HistoricalImportIssue[]): ParsedStanding[] {
    return lines.flatMap((line) => {
      const parsed = this.parseStandingLine(line);
      if (parsed) return [parsed];
      if (line.trim()) {
        issues.push({
          severity: 'warning',
          code: 'unparsed_standing_line',
          message: `No se pudo interpretar la fila de tabla: "${line}".`,
        });
      }
      return [];
    });
  }

  private static parseMatchLine(line: string): { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number } | null {
    const scoreMatch = line.match(SCORE_AT_END_REGEX);
    if (!scoreMatch || scoreMatch.index === undefined) return null;

    const teamsPart = line.slice(0, scoreMatch.index).trim().replace(/\t+/g, ' ');
    const compactTeamsPart = teamsPart.replace(/\s{2,}/g, '  ');
    let separatorIndex = compactTeamsPart.indexOf(' -  ');
    let separatorLength = 4;

    if (separatorIndex < 0) {
      separatorIndex = teamsPart.indexOf(' - ');
      separatorLength = 3;
    }

    if (separatorIndex < 0) return null;

    const homeTeam = teamsPart.slice(0, separatorIndex).trim();
    const awayTeam = teamsPart.slice(separatorIndex + separatorLength).trim();
    if (!homeTeam || !awayTeam) return null;

    return {
      homeTeam,
      awayTeam,
      homeScore: Number(scoreMatch[1]),
      awayScore: Number(scoreMatch[2]),
    };
  }

  private static parseStandingLine(line: string): ParsedStanding | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    const positionMatch = trimmed.match(/^(\d+)\s+/);
    if (!positionMatch) return null;

    const tokens = trimmed.slice(positionMatch[0].length).split(/\s+/);
    let numericStart = -1;
    for (let index = 0; index <= tokens.length - 10; index += 1) {
      if (tokens.slice(index, index + 10).every((token) => /^-?\d+$/.test(token))) {
        numericStart = index;
        break;
      }
    }

    if (numericStart <= 0) return null;

    const teamName = tokens.slice(0, numericStart).join(' ').trim();
    if (!teamName) return null;

    const numeric = tokens.slice(numericStart, numericStart + 10).map((token) => Number(token));
    const note = tokens.slice(numericStart + 10).join(' ').trim() || null;

    return {
      position: Number(positionMatch[1]),
      teamName,
      points: numeric[0],
      played: numeric[1],
      won: numeric[2],
      drawn: numeric[3],
      lost: numeric[4],
      scored: numeric[5],
      conceded: numeric[6],
      difference: numeric[7],
      tryBonus: numeric[8],
      losingBonus: numeric[9],
      note,
    };
  }

  private static resolveClub(
    sourceName: string,
    sourceCount: number,
    candidates: ClubCandidate[],
    overrides: Record<string, string | null>
  ): HistoricalImportClubResolution {
    const normalizedName = this.normalizeKey(sourceName);
    const manualClubId = overrides[normalizedName];
    const ranked = candidates
      .map((candidate) => {
        const exact = candidate.normalized === normalizedName;
        const aliasExact = candidate.aliases.includes(normalizedName);
        const score = exact || aliasExact
          ? 1
          : Math.max(
              this.similarity(normalizedName, candidate.normalized),
              ...candidate.aliases.map((alias) => this.similarity(normalizedName, alias)),
              0
            );
        return {
          candidate,
          score,
          matchType: exact ? 'exact' : aliasExact ? 'alias' : score >= 0.88 ? 'fuzzy' : 'unresolved',
        };
      })
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return Number(right.candidate.existingParticipant) - Number(left.candidate.existingParticipant);
      });

    const options = ranked.slice(0, 6).map((item) => ({
      id: item.candidate.id,
      name: item.candidate.name,
      shortName: item.candidate.shortName,
    }));

    if (manualClubId) {
      const manual = candidates.find((candidate) => candidate.id === manualClubId) || null;
      return {
        sourceName,
        normalizedName,
        matchedClubId: manual?.id || manualClubId,
        matchedClubName: manual?.name || null,
        matchedClubShortName: manual?.shortName || null,
        confidence: manual ? 'alta' : 'media',
        matchType: 'manual',
        sourceCount,
        existingParticipant: manual?.existingParticipant || false,
        options,
      };
    }

    const best = ranked[0];
    if (!best || best.score < 0.75) {
      return {
        sourceName,
        normalizedName,
        matchedClubId: null,
        matchedClubName: null,
        matchedClubShortName: null,
        confidence: 'sin_match',
        matchType: 'unresolved',
        sourceCount,
        existingParticipant: false,
        options,
      };
    }

    return {
      sourceName,
      normalizedName,
      matchedClubId: best.candidate.id,
      matchedClubName: best.candidate.name,
      matchedClubShortName: best.candidate.shortName,
      confidence: best.score >= 0.95 ? 'alta' : best.score >= 0.86 ? 'media' : 'baja',
      matchType: best.matchType as HistoricalImportClubResolution['matchType'],
      sourceCount,
      existingParticipant: best.candidate.existingParticipant,
      options,
    };
  }

  private static summarizePhases(
    matches: ParsedMatch[],
    phaseOverrides: PhaseOverrideMap = {},
    includeStandingsLeague = false
  ): HistoricalImportPhasePreview[] {
    const grouped = new Map<string, HistoricalImportPhasePreview>();
    const roundsByPhase = new Map<string, Set<string>>();

    for (const match of matches) {
      const phaseConfig = this.resolvePhaseConfig(match.phaseKey, phaseOverrides);
      const current = grouped.get(match.phaseKey);
      const rounds = roundsByPhase.get(match.phaseKey) || new Set<string>();
      rounds.add(match.roundKey);
      roundsByPhase.set(match.phaseKey, rounds);

      if (!current) {
        grouped.set(match.phaseKey, {
          key: match.phaseKey,
          name: phaseConfig.name,
          phaseType: phaseConfig.phaseType,
          roundCount: 1,
          matchCount: 1,
          startDate: match.date,
          endDate: match.date,
        });
        continue;
      }

      current.matchCount += 1;
      current.startDate = current.startDate && current.startDate < match.date ? current.startDate : match.date;
      current.endDate = current.endDate && current.endDate > match.date ? current.endDate : match.date;
    }

    if (includeStandingsLeague && !grouped.has('league')) {
      const phaseConfig = this.resolvePhaseConfig('league', phaseOverrides);
      grouped.set('league', {
        key: 'league',
        name: phaseConfig.name,
        phaseType: phaseConfig.phaseType,
        roundCount: 0,
        matchCount: 0,
        startDate: null,
        endDate: null,
      });
    }

    const phaseOrder = (key: string) => (key === 'league' ? 1 : 2);
    return Array.from(grouped.values())
      .sort((left, right) => phaseOrder(left.key) - phaseOrder(right.key))
      .map((phase) => ({
        ...phase,
        roundCount: roundsByPhase.get(phase.key)?.size || 0,
      }));
  }

  private static inferPodium(matches: ParsedMatch[], standings: ParsedStanding[]) {
    const finalMatch = matches.find((match) => this.normalizeKey(match.stageLabel) === 'final');
    const thirdPlaceMatch = matches.find((match) => {
      const label = this.normalizeKey(match.stageLabel);
      return label.includes('3rd place') || label.includes('third place');
    });

    const champion = finalMatch
      ? (finalMatch.homeScore > finalMatch.awayScore ? finalMatch.homeTeam : finalMatch.awayTeam)
      : standings[0]?.teamName || null;
    const runnerUp = finalMatch
      ? (finalMatch.homeScore > finalMatch.awayScore ? finalMatch.awayTeam : finalMatch.homeTeam)
      : standings[1]?.teamName || null;
    const thirdPlace = thirdPlaceMatch
      ? (thirdPlaceMatch.homeScore > thirdPlaceMatch.awayScore ? thirdPlaceMatch.homeTeam : thirdPlaceMatch.awayTeam)
      : standings[2]?.teamName || null;

    return { champion, runnerUp, thirdPlace };
  }

  private static buildRoundBlueprints(model: HistoricalModel) {
    const rounds: Array<{ key: string; phaseKey: 'league' | 'playoff'; name: string; orderIndex: number; date: string | null; notes: string | null }> = [];
    const leagueDates = Array.from(new Set(model.parsedMatches.filter((match) => match.phaseKey === 'league').map((match) => match.date))).sort();
    leagueDates.forEach((date, index) => {
      rounds.push({
        key: `league:${date}`,
        phaseKey: 'league',
        name: `Fecha ${index + 1}`,
        orderIndex: index + 1,
        date,
        notes: `Importada desde Regular season (${date})`,
      });
    });

    const playoffRoundEntries = new Map<string, { label: string; date: string }>();
    model.parsedMatches
      .filter((match) => match.phaseKey === 'playoff')
      .forEach((match) => {
        if (!playoffRoundEntries.has(match.roundKey)) {
          playoffRoundEntries.set(match.roundKey, {
            label: match.stageLabel,
            date: match.date,
          });
        }
      });

    Array.from(playoffRoundEntries.entries())
      .sort((left, right) => {
        if (left[1].date !== right[1].date) return left[1].date.localeCompare(right[1].date);
        return left[1].label.localeCompare(right[1].label);
      })
      .forEach(([key, value], index) => {
        rounds.push({
          key,
          phaseKey: 'playoff',
          name: value.label,
          orderIndex: index + 1,
          date: value.date,
          notes: `Importada desde ${value.label} (${value.date})`,
        });
      });

    return rounds;
  }

  private static buildResolvedTeams(model: HistoricalModel, resolvedClubIds: Map<string, string>): ResolvedHistoricalTeam[] {
    const teamsFromStandings = model.parsedStandings.flatMap((row) => {
      const clubId = resolvedClubIds.get(this.normalizeKey(row.teamName));
      if (!clubId) return [];
      return [{
        key: this.normalizeKey(row.teamName),
        clubId,
        clubName: model.clubs.find((club) => club.normalizedName === this.normalizeKey(row.teamName))?.matchedClubName || row.teamName,
        shortCode: model.clubs.find((club) => club.normalizedName === this.normalizeKey(row.teamName))?.matchedClubShortName || null,
        position: row.position,
      }];
    });

    const missingFromMatches = model.clubs
      .filter((club) => !teamsFromStandings.some((team) => team.key === club.normalizedName))
      .flatMap((club) => {
        const clubId = resolvedClubIds.get(club.normalizedName);
        if (!clubId) return [];
        return [{
          key: club.normalizedName,
          clubId,
          clubName: club.matchedClubName || club.sourceName,
          shortCode: club.matchedClubShortName,
          position: null,
        }];
      });

    const dedupedByClubId = new Map<string, ResolvedHistoricalTeam>();
    [...teamsFromStandings, ...missingFromMatches].forEach((team) => {
      const existing = dedupedByClubId.get(team.clubId);
      if (!existing) {
        dedupedByClubId.set(team.clubId, team);
        return;
      }
      if (existing.position === null && team.position !== null) {
        dedupedByClubId.set(team.clubId, team);
      }
    });

    return Array.from(dedupedByClubId.values());
  }

  private static async ensureUniqueSlug(supabase: SupabaseClientLike, baseSlug: string): Promise<string> {
    const db = supabase as unknown as UntypedSupabaseClient;
    const normalizedBase = normalizeSlug(baseSlug) || `historical-${Date.now()}`;
    let candidate = normalizedBase;
    let suffix = 1;

    while (true) {
      const { data } = await db.from<{ id: string }>('tournaments').select('id').eq('slug', candidate).maybeSingle();
      if (!data) return candidate;
      suffix += 1;
      candidate = `${normalizedBase}-${suffix}`;
    }
  }

  private static async createSeasonRecord(
    supabase: SupabaseClientLike,
    params: {
      tournamentId: string;
      seasonId: string;
      teamsCount: number;
      startDate: string | null;
      endDate: string | null;
    }
  ): Promise<{ ok: boolean; message?: string }> {
    const db = supabase as unknown as UntypedSupabaseClient;
    const { error } = await db.from('seasons').upsert({
      tournament_id: params.tournamentId,
      season_id: params.seasonId,
      teams_count: params.teamsCount,
      is_active: false,
      start_date: params.startDate,
      end_date: params.endDate,
    }, { onConflict: 'season_id,tournament_id' });

    if (!error) return { ok: true };
    if (this.isMissingTableError(error, 'seasons')) {
      return { ok: false, message: 'La temporada se creo, pero falta la tabla seasons para guardar metadata historica.' };
    }
    return { ok: false, message: `La temporada se creo, pero no se pudo guardar metadata en seasons: ${error.message}` };
  }

  private static async createSeasonRelation(
    supabase: SupabaseClientLike,
    sourceTournamentId: string,
    targetTournamentId: string,
    seasonId: string
  ): Promise<{ ok: boolean; message?: string }> {
    try {
      const db = supabase as unknown as UntypedSupabaseClient;
      const { error } = await db.from('tournament_relations').upsert({
        source_tournament_id: sourceTournamentId,
        target_tournament_id: targetTournamentId,
        relation_type: 'previous_season',
        relation_direction: 'reference',
        status: 'active',
        description: `${RELATION_DESCRIPTION_PREFIX} ${seasonId}`,
      }, { onConflict: 'source_tournament_id,target_tournament_id,relation_type' });

      if (!error) return { ok: true };
      if (this.isMissingTableError(error, 'tournament_relations')) {
        return { ok: false, message: 'La temporada se creo, pero falta la tabla tournament_relations para vincularla al torneo actual.' };
      }
      return { ok: false, message: `La temporada se creo, pero no se pudo crear el vinculo historico: ${error.message}` };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error
          ? `La temporada se creo, pero no se pudo crear el vinculo historico: ${error.message}`
          : 'La temporada se creo, pero no se pudo crear el vinculo historico.',
      };
    }
  }

  private static async cleanupImportedTournament(supabase: SupabaseClientLike, tournamentId: string) {
    try {
      const db = supabase as unknown as UntypedSupabaseClient;
      await db.from('tournaments').delete().eq('id', tournamentId);
    } catch {
      // Best-effort rollback. The original creation error is more useful to the caller.
    }
  }

  private static async learnAliases(supabase: SupabaseClientLike, clubs: HistoricalImportClubResolution[]) {
    const rows = clubs
      .filter((club): club is HistoricalImportClubResolution & { matchedClubId: string } => Boolean(club.matchedClubId))
      .map((club) => ({
        club_id: club.matchedClubId as string,
        alias: club.normalizedName,
      }));

    if (rows.length === 0) return;

    try {
      const db = supabase as unknown as UntypedSupabaseClient;
      await db.from('club_aliases').upsert(rows, { onConflict: 'club_id,alias', ignoreDuplicates: true });
    } catch {
      // Alias learning should not block the import.
    }
  }

  private static async writeAudit(
    supabase: SupabaseClientLike,
    actorUserId: string,
    entityId: string,
    changes: Record<string, unknown>
  ) {
    try {
      const db = supabase as unknown as UntypedSupabaseClient;
      await db.from('admin_audit_log').insert({
        actor_user_id: actorUserId,
        entity_type: 'tournament',
        entity_id: entityId,
        action: 'update',
        changes,
        source: 'historical-season-import',
      });
    } catch {
      // Audit should not block the import.
    }
  }

  private static detectSeasonId(matches: ParsedMatch[], fallbackSeasonId: string | null) {
    return matches[0]?.date?.slice(0, 4) || fallbackSeasonId || String(new Date().getFullYear());
  }

  private static suggestTournamentName(name: string, currentSeasonId: string | null, nextSeasonId: string) {
    if (currentSeasonId && name.includes(currentSeasonId)) {
      return name.replace(currentSeasonId, nextSeasonId);
    }
    const yearMatch = name.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      const start = yearMatch.index || 0;
      return `${name.slice(0, start)}${nextSeasonId}${name.slice(start + yearMatch[0].length)}`.trim();
    }
    return `${name} ${nextSeasonId}`.trim();
  }

  private static suggestSlug(
    slug: string | null,
    name: string,
    currentSeasonId: string | null,
    nextSeasonId: string
  ) {
    const base = slug || normalizeSlug(name);
    if (currentSeasonId && base.includes(currentSeasonId)) {
      return normalizeSlug(base.replace(currentSeasonId, nextSeasonId));
    }
    const yearMatch = base.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      const start = yearMatch.index || 0;
      return normalizeSlug(`${base.slice(0, start)}${nextSeasonId}${base.slice(start + yearMatch[0].length)}`);
    }
    return normalizeSlug(`${base}-${nextSeasonId}`);
  }

  private static resolveSourceName(matches: ParsedMatch[], standings: ParsedStanding[], normalizedName: string) {
    const fromStandings = standings.find((row) => this.normalizeKey(row.teamName) === normalizedName)?.teamName;
    if (fromStandings) return fromStandings;
    const fromMatches = matches.find((match) =>
      this.normalizeKey(match.homeTeam) === normalizedName || this.normalizeKey(match.awayTeam) === normalizedName
    );
    if (!fromMatches) return normalizedName;
    return this.normalizeKey(fromMatches.homeTeam) === normalizedName ? fromMatches.homeTeam : fromMatches.awayTeam;
  }

  private static calculateBasePoints(homeScore: number, awayScore: number, rules: { win: number; draw: number; loss: number }) {
    if (homeScore > awayScore) return { home: rules.win, away: rules.loss };
    if (homeScore < awayScore) return { home: rules.loss, away: rules.win };
    return { home: rules.draw, away: rules.draw };
  }

  private static resolvePointsRules(ruleset: Record<string, unknown> | null) {
    const points = (ruleset?.points || {}) as { win?: number; draw?: number; loss?: number };
    return {
      win: Number(points.win ?? 4),
      draw: Number(points.draw ?? 2),
      loss: Number(points.loss ?? 0),
    };
  }

  private static isLeagueLabel(label: string) {
    const normalized = this.normalizeKey(label);
    return normalized.includes('regular season') || normalized.includes('league');
  }

  private static resolvePhaseConfig(phaseKey: PhaseKey, phaseOverrides: PhaseOverrideMap = {}) {
    const override = phaseOverrides[phaseKey];
    const defaultPhaseType = phaseKey === 'league' ? 'league' : 'playoff';
    const phaseType = override?.phaseType === 'league' || override?.phaseType === 'playoff'
      ? override.phaseType
      : defaultPhaseType;

    return {
      name: this.readText(override?.name) || (phaseKey === 'league' ? 'Temporada regular' : 'Playoffs'),
      phaseType,
    };
  }

  private static toIsoDate(rawDate: string) {
    const match = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return rawDate;
    return `${match[3]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[1])).padStart(2, '0')}`;
  }

  private static toMiddayIso(date: string) {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0)).toISOString();
  }

  private static normalizeKey(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private static similarity(left: string, right: string): number {
    if (left === right) return 1;
    if (!left || !right) return 0;
    const pairs = (value: string) =>
      Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2));
    const leftPairs = pairs(left);
    const rightPairs = pairs(right);
    const bag = new Map<string, number>();
    rightPairs.forEach((pair) => bag.set(pair, (bag.get(pair) || 0) + 1));
    let overlap = 0;
    leftPairs.forEach((pair) => {
      const count = bag.get(pair) || 0;
      if (count > 0) {
        overlap += 1;
        bag.set(pair, count - 1);
      }
    });
    return leftPairs.length + rightPairs.length === 0
      ? 0
      : (2 * overlap) / (leftPairs.length + rightPairs.length);
  }

  private static deduplicateIssues(issues: HistoricalImportIssue[]) {
    const seen = new Set<string>();
    return issues.filter((issue) => {
      const key = `${issue.severity}:${issue.code}:${issue.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private static isMissingTableError(error: { code?: string | null; message?: string | null } | null | undefined, tableName: string) {
    if (!error) return false;
    const message = String(error.message || '').toLowerCase();
    return error.code === '42P01' || message.includes(tableName.toLowerCase());
  }

  // Detects "Could not find the 'X' column of 'Y' in the schema cache" /
  // "column ... does not exist" errors so callers can retry with a
  // sanitized payload when an optional column is missing on the remote DB.
  private static missingColumnFromError(
    error: { code?: string | null; message?: string | null } | null | undefined
  ): string | null {
    if (!error) return null;
    const message = String(error.message || '');
    const schemaCacheMatch = message.match(/Could not find the '([^']+)' column/i);
    if (schemaCacheMatch) return schemaCacheMatch[1];
    const pgMissingMatch = message.match(/column "([^"]+)" of relation/i);
    if (pgMissingMatch) return pgMissingMatch[1];
    if (error.code === '42703' || error.code === 'PGRST204') {
      const fallback = message.match(/'([^']+)'/);
      if (fallback) return fallback[1];
    }
    return null;
  }

  // Inserts a row, automatically retrying without optional columns that the
  // remote schema doesn't currently know about. This makes the importer
  // tolerant to environments where late additions like start_date / end_date
  // / settings haven't been applied yet.
  private static async insertWithOptionalColumns<T extends Record<string, unknown>>(
    db: UntypedSupabaseClient,
    table: string,
    payload: T,
    optionalColumns: ReadonlyArray<keyof T & string>
  ): Promise<SupabaseMutationResult> {
    let attempt: Record<string, unknown> = { ...payload };
    const removed = new Set<string>();
    for (let i = 0; i <= optionalColumns.length; i++) {
      const result = await db.from(table).insert(attempt);
      if (!result.error) return result;
      const missing = this.missingColumnFromError(result.error);
      if (!missing) return result;
      const removable = optionalColumns.find(
        (column) => column === missing && !removed.has(column)
      );
      if (!removable) return result;
      removed.add(removable);
      const { [removable]: _omitted, ...rest } = attempt as Record<string, unknown>;
      attempt = rest;
    }
    return await db.from(table).insert(attempt);
  }

  // Bulk version of insertWithOptionalColumns. Inserts an array of rows with
  // the same shape and retries dropping optional columns from ALL rows when
  // the remote schema is missing them. Avoids the N+1 round-trip pattern of
  // calling insertWithOptionalColumns inside a for-loop for phases / rounds.
  private static async insertManyWithOptionalColumns<T extends Record<string, unknown>>(
    db: UntypedSupabaseClient,
    table: string,
    rows: T[],
    optionalColumns: ReadonlyArray<keyof T & string>
  ): Promise<SupabaseMutationResult> {
    if (rows.length === 0) {
      return { error: null } as SupabaseMutationResult;
    }
    let attempts: Record<string, unknown>[] = rows.map((row) => ({ ...row }));
    const removed = new Set<string>();
    for (let i = 0; i <= optionalColumns.length; i++) {
      const result = await db.from(table).insert(attempts);
      if (!result.error) return result;
      const missing = this.missingColumnFromError(result.error);
      if (!missing) return result;
      const removable = optionalColumns.find(
        (column) => column === missing && !removed.has(column)
      );
      if (!removable) return result;
      removed.add(removable);
      attempts = attempts.map((row) => {
        const { [removable]: _omitted, ...rest } = row as Record<string, unknown>;
        return rest;
      });
    }
    return await db.from(table).insert(attempts);
  }

  private static readText(value: string | null | undefined) {
    const text = String(value || '').trim();
    return text || null;
  }
}
