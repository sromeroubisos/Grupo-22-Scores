/**
 * Fixture Service
 * Backend service for managing tournament fixtures
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { getReadClient } from '@/lib/supabase/read';
import { createClient } from '@/lib/supabase/server';
import {
  getMatchRankingSnapshot,
  syncClubRankingsForMatchUpdate,
} from '@/lib/server/clubRankings';
import {
  invalidateMatchesFeedCaches,
  type MatchesFeedInvalidationScope,
} from '@/lib/server/matchesFeedInvalidation';
import { isMatchRosterLocked } from '@/lib/tournament/fixedRoster';
import {
  deriveFixedRosterLineups,
  loadFixedRosterConfigForMatch,
  resolveMatchPhaseOrderIndex,
} from '@/lib/services/fixedRosterLineups';
import {
  APP_TIMEZONE,
  addDaysToIsoDate,
  combineLocalDateTimeToUtcIso,
  ensureUtcDateTimeString,
  formatDateKey,
  toInputDateInTimeZone,
  toInputTimeInTimeZone,
} from '@/lib/timezone';
import {
  ensurePlayoffBracketMatches,
  getPlayoffTeamsCount,
  isPlayoffPhaseType,
  resolvePlayoffStagesForTeams,
  syncPlayoffStagesToRounds,
} from '@/lib/server/playoffStages';
import { generatePlayoffBracket } from '@/lib/server/playoffBracket';
import { resolveMatchAdvancement } from '@/lib/server/resolveMatchAdvancement';
import { reseedPlayoffBracket } from '@/lib/server/playoffBracket';
import { readPlayoffSeedingConfig } from '@/lib/playoff/seedingFromStandings';
import type { PlayoffBuilderConfig } from '@/lib/playoff/templates';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';
import { assertTournamentNotSyncLocked } from '@/lib/services/tournamentSyncLock';
import { assertUuid, isUuid } from '@/lib/utils/postgrest';
import { isFinalStandingsStatus } from '@/lib/standings/matchScope';
import { traceStageStart, traceStageEnd, markEditTrace, appendEditTraceFact } from '@/lib/perf/editTrace';
import { isDerivedRecalcSkipped } from '@/lib/perf/labFlags';
import type {
  TournamentFixture,
  TournamentPhase,
  TournamentRound,
  Match,
  MatchWithClubs,
  PhaseWithRounds,
  RoundWithMatches,
  MatchFormData,
  RoundFormData,
  PhaseFormData,
  FixtureGenerationParams,
  MassRescheduleParams,
} from '@/lib/types/fixture';

type PhaseContext = {
  id: string;
  tournament_id: string;
  season_id?: string | null;
  phase_type?: string | null;
};

type MatchFeedInvalidationSource = {
  effective_date?: string | null;
  date_time?: string | Date | null;
  sport_id?: string | null;
  sport?: string | null;
};

export class FixtureService {
  private static _supportsRoundLabel: boolean | null = null;
  private static _matchColumnSupport = new Map<string, { value: boolean; at: number; ttl?: number }>();
  private static _matchColumnInFlight = new Map<string, Promise<boolean>>();
  private static _matchColumnFailOpen = new Map<string, { streak: number; total: number }>();
  private static _warnedWriteFallback = false;

  /** Vida por defecto del cache de introspección de schema por instancia. Escape
   *  hatch: bajá FIXTURE_SCHEMA_CACHE_TTL_MS para forzar re-sondeo sin redeploy. */
  private static schemaCacheTtlMs(): number {
    const v = Number(process.env.FIXTURE_SCHEMA_CACHE_TTL_MS);
    return Number.isFinite(v) && v > 0 ? v : 6 * 60 * 60 * 1000; // 6h
  }

  private static getMatchRoundId(match: { round_uuid?: string | null; round_id?: string | null }) {
    return match.round_uuid ?? match.round_id ?? null;
  }

  private static normalizeFeedScopeSport(value: string | null | undefined) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return normalized || null;
  }

  private static getEffectiveDateForFeedScope(value: string | Date | null | undefined) {
    if (!value) return null;
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return null;
    return formatDateKey(date, APP_TIMEZONE);
  }

  private static getMatchFeedInvalidationScope(
    match: MatchFeedInvalidationSource | null | undefined,
  ): MatchesFeedInvalidationScope | null {
    if (!match) return null;

    const effectiveDate = match.effective_date || this.getEffectiveDateForFeedScope(match.date_time);
    if (!effectiveDate) return null;

    return {
      effectiveDate,
      sport: this.normalizeFeedScopeSport(match.sport_id ?? match.sport ?? null),
    };
  }

  private static getMatchFeedInvalidationScopes(
    matches: Array<MatchFeedInvalidationSource | null | undefined>,
  ): MatchesFeedInvalidationScope[] {
    const byKey = new Map<string, MatchesFeedInvalidationScope>();

    for (const match of matches) {
      const scope = this.getMatchFeedInvalidationScope(match);
      if (!scope?.effectiveDate) continue;

      const sport = this.normalizeFeedScopeSport(scope.sport ?? null);
      byKey.set(`${scope.effectiveDate}|${sport || '*'}`, {
        effectiveDate: scope.effectiveDate,
        sport,
      });
    }

    const dateOnlyScopes = new Set(
      Array.from(byKey.values())
        .filter((scope) => !scope.sport)
        .map((scope) => scope.effectiveDate),
    );

    return Array.from(byKey.values())
      .filter((scope) => !scope.sport || !dateOnlyScopes.has(scope.effectiveDate));
  }

  private static async invalidatePublicMatchesFeed(
    client?: any,
    scopes?: MatchesFeedInvalidationScope[],
  ) {
    try {
      await invalidateMatchesFeedCaches(client, scopes);
    } catch (error) {
      console.error('[FixtureService] Failed to invalidate public matches feed cache:', error);
    }
  }

  private static async getWriteClient() {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return createAdminClient();
    }

    if (!this._warnedWriteFallback) {
      console.warn('[FixtureService] SUPABASE_SERVICE_ROLE_KEY missing. Falling back to session client for fixture writes.');
      this._warnedWriteFallback = true;
    }

    return createClient();
  }

  private static async selectMatchForUpdate(
    supabase: any,
    matchId: string,
  ) {
    const variants = [
      'id, tournament_id, season_id, phase_id, round_uuid, round_id, group_id, home_club_id, away_club_id, date_time, sport_id, sport, status, score, clock, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason',
      'id, tournament_id, season_id, phase_id, round_uuid, round_id, group_id, home_club_id, away_club_id, date_time, sport, status, score, clock, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason',
      'id, tournament_id, season_id, phase_id, round_uuid, round_id, group_id, home_club_id, away_club_id, date_time, status, score, clock, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason',
      'id, tournament_id, phase_id, round_uuid, round_id, group_id, home_club_id, away_club_id, date_time, status, score, clock',
      'id, tournament_id, phase_id, round_id, group_id, home_club_id, away_club_id, date_time, status, score',
      'id, tournament_id, phase_id, home_club_id, away_club_id, date_time, status, score',
    ];

    let lastError: { message?: string | null; details?: string | null; code?: string | null } | null = null;

    for (const columns of variants) {
      const result = await supabase
        .from('matches')
        .select(columns)
        .eq('id', matchId)
        .single();

      if (!result.error && result.data) {
        return { data: result.data, error: null };
      }

      lastError = result.error;
      const selectedColumns = columns.split(',').map((value) => value.trim()).filter(Boolean);
      const hasMissingColumn = selectedColumns.some((column) => isMissingColumnError(result.error, column));

      if (!hasMissingColumn) {
        return { data: null, error: result.error };
      }
    }

    return { data: null, error: lastError };
  }

  private static async selectMatchesForFeedInvalidationByRound(
    supabase: any,
    roundId: string,
  ): Promise<MatchFeedInvalidationSource[]> {
    const variants = [
      'id, date_time, sport_id, sport',
      'id, date_time, sport',
      'id, date_time',
    ];

    for (const columns of variants) {
      const result = await supabase
        .from('matches')
        .select(columns)
        .or(`round_uuid.eq.${roundId},round_id.eq.${roundId}`);

      if (!result.error) {
        return result.data ?? [];
      }

      const selectedColumns = columns.split(',').map((value) => value.trim()).filter(Boolean);
      const hasMissingColumn = selectedColumns.some((column) => isMissingColumnError(result.error, column));

      if (!hasMissingColumn) {
        console.error('[FixtureService] Error fetching matches for feed invalidation:', result.error);
        return [];
      }
    }

    return [];
  }

  private static async syncClubRankingsAfterMatchChange(
    matchId: string,
    previousMatch?: Awaited<ReturnType<typeof getMatchRankingSnapshot>>,
  ) {
    try {
      await syncClubRankingsForMatchUpdate(matchId, previousMatch ?? null);
    } catch (error) {
      console.error('[FixtureService] Club ranking sync failed:', { matchId, error });
    }
  }

  private static areComparableValuesEqual(left: unknown, right: unknown) {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }

  private static shouldSyncRankingsAfterUpdate(
    existingMatch: {
      phase_id?: string | null;
      round_uuid?: string | null;
      round_id?: string | null;
      group_id?: string | null;
      home_club_id?: string | null;
      away_club_id?: string | null;
      status?: string | null;
      score?: unknown;
      home_base_points?: number | null;
      away_base_points?: number | null;
      home_bonus_points?: number | null;
      away_bonus_points?: number | null;
      points_autocalculated?: boolean | null;
      points_override_reason?: string | null;
    },
    updateData: Record<string, unknown>,
  ) {
    if (
      updateData.home_division_id !== undefined ||
      updateData.away_division_id !== undefined ||
      updateData.category !== undefined
    ) {
      return true;
    }

    const comparablePairs: Array<[unknown, unknown]> = [
      [updateData.phase_id, existingMatch.phase_id],
      [updateData.round_uuid, this.getMatchRoundId(existingMatch)],
      [updateData.group_id, existingMatch.group_id],
      [updateData.home_club_id, existingMatch.home_club_id],
      [updateData.away_club_id, existingMatch.away_club_id],
      [updateData.status, existingMatch.status],
      [updateData.score, existingMatch.score],
      [updateData.home_base_points, existingMatch.home_base_points],
      [updateData.away_base_points, existingMatch.away_base_points],
      [updateData.home_bonus_points, existingMatch.home_bonus_points],
      [updateData.away_bonus_points, existingMatch.away_bonus_points],
      [updateData.points_autocalculated, existingMatch.points_autocalculated],
      [updateData.points_override_reason, existingMatch.points_override_reason],
    ];

    return comparablePairs.some(([nextValue, currentValue]) => (
      nextValue !== undefined && !this.areComparableValuesEqual(nextValue, currentValue)
    ));
  }

  private static async assertPhaseBelongsToTournament(
    supabase: any,
    tournamentId: string,
    phaseId: string
  ): Promise<PhaseContext> {
    const { data: phase, error } = await supabase
      .from('tournament_phases')
      .select('id, tournament_id, season_id, phase_type')
      .eq('id', phaseId)
      .single();

    if (error || !phase) {
      throw new Error('La fase seleccionada no existe.');
    }

    if (phase.tournament_id !== tournamentId) {
      throw new Error('La fase seleccionada no pertenece al torneo activo.');
    }

    return phase;
  }

  private static async assertRoundBelongsToPhase(
    supabase: any,
    phaseId: string,
    roundId: string | null | undefined
  ): Promise<void> {
    if (!roundId) return;

    const { data: round, error } = await supabase
      .from('tournament_rounds')
      .select('id, phase_id')
      .eq('id', roundId)
      .single();

    if (error || !round) {
      throw new Error('La jornada seleccionada no existe.');
    }

    if (round.phase_id !== phaseId) {
      throw new Error('La jornada seleccionada no pertenece a la fase activa.');
    }
  }

  private static async assertClubReferences(
    supabase: any,
    clubIds: Array<string | null | undefined>
  ): Promise<void> {
    const uniqueClubIds = Array.from(new Set(clubIds.filter((clubId): clubId is string => Boolean(clubId))));

    if (uniqueClubIds.length === 0) {
      throw new Error('Debes seleccionar al menos un equipo válido.');
    }

    const { data: clubs, error } = await supabase
      .from('clubs')
      .select('id')
      .in('id', uniqueClubIds);

    if (error) {
      throw new Error(`No se pudieron validar los equipos seleccionados: ${error.message}`);
    }

    if ((clubs || []).length !== uniqueClubIds.length) {
      throw new Error('Uno o más equipos seleccionados no existen en la base de datos.');
    }
  }

  private static async assertMatchContext(
    supabase: any,
    context: {
      tournamentId: string;
      phaseId: string;
      roundId?: string | null;
      homeClubId: string | null;
      awayClubId: string | null;
    }
  ): Promise<PhaseContext> {
    const phase = await this.assertPhaseBelongsToTournament(supabase, context.tournamentId, context.phaseId);
    const isPlayoff = isPlayoffPhaseType(phase.phase_type);

    // Playoff/knockout brackets legitimately hold placeholder matches (TBD slots)
    // whose teams are only known once previous rounds resolve. Those can be
    // scheduled/edited without teams; league matches still require both.
    if (!isPlayoff && (!context.homeClubId || !context.awayClubId)) {
      throw new Error('Debes seleccionar ambos equipos del partido.');
    }
    if (isPlayoff && !context.roundId) {
      throw new Error('Para una fase playoff debes seleccionar una etapa de eliminacion definida.');
    }
    await this.assertRoundBelongsToPhase(supabase, context.phaseId, context.roundId);
    const clubReferences = [context.homeClubId, context.awayClubId].filter(
      (clubId): clubId is string => Boolean(clubId),
    );
    if (clubReferences.length > 0) {
      await this.assertClubReferences(supabase, clubReferences);
    }

    return phase;
  }

  /**
   * Check if the round_label column exists in the matches table.
   * Caches the result to avoid redundant queries.
   */
  static async checkRoundLabelSupport(providedClient?: any): Promise<boolean> {
    if (this._supportsRoundLabel !== null) return this._supportsRoundLabel;

    try {
      const supabase = providedClient ?? await createClient();
      console.log('[FixtureService] Checking round_label support in schema...');

      const { error } = await supabase
        .from('matches')
        .select('round_label')
        .limit(0);

      if (error) {
        if (error.code === 'PGRST204' || error.message.includes('column') || error.message.includes('round_label')) {
          console.warn('[FixtureService] round_label column NOT found. Support disabled.');
          this._supportsRoundLabel = false;
        } else {
          console.error('[FixtureService] Unexpected error checking round_label support:', error.message);
          return false;
        }
      } else {
        console.log('[FixtureService] round_label column found. Support enabled.');
        this._supportsRoundLabel = true;
      }
    } catch (e) {
      console.error('[FixtureService] Exception checking round_label support:', e);
      return false;
    }

    return this._supportsRoundLabel ?? false;
  }

  static async checkMatchColumnSupport(column: string, providedClient?: any): Promise<boolean> {
    const cached = this._matchColumnSupport.get(column);
    if (cached && Date.now() - cached.at < (cached.ttl ?? this.schemaCacheTtlMs())) {
      return cached.value;
    }

    // Dedup in-flight: requests concurrentes en la misma instancia comparten un
    // único sondeo (incluido su retry). El sondeo es de SCHEMA (existencia de
    // columna), invariante al scope del cliente, así que compartir el
    // providedClient del primer caller no cambia el resultado.
    const inFlight = this._matchColumnInFlight.get(column);
    if (inFlight) return inFlight;

    const probe = (async (): Promise<boolean> => {
      const runSelect = async (): Promise<{ error: any }> => {
        try {
          const supabase = providedClient ?? await createClient();
          const { error } = await supabase.from('matches').select(column).limit(0);
          return { error };
        } catch (e) {
          return { error: e };
        }
      };

      // Cachea un resultado DEFINITIVO y resetea el estado del breaker.
      const cacheDefinitive = (value: boolean) => {
        this._matchColumnSupport.set(column, { value, at: Date.now() });
        this._matchColumnFailOpen.delete(column);
      };

      try {
        let { error } = await runSelect();

        // Missing-column real → definitivo: cachear false, sin retry.
        if (error && isMissingColumnError(error, column)) {
          cacheDefinitive(false);
          return false;
        }

        // Error NO-missing-column (incluye excepción) → UN retry, backoff corto.
        if (error) {
          await new Promise((r) => setTimeout(r, 150));
          ({ error } = await runSelect());
        }

        if (!error) {
          cacheDefinitive(true);
          return true;
        }
        if (isMissingColumnError(error, column)) {
          cacheDefinitive(false);
          return false;
        }

        // Sondeo + retry fallaron por causa no-missing-column → FAIL-OPEN (asumir
        // presente) SIN cachear, para no enmascarar un false legítimo: el próximo
        // save re-sondea. Circuit breaker: si la columna cae en fail-open N veces
        // seguidas (degradación sostenida de PostgREST), cacheamos true con TTL
        // CORTO (60s) para dejar de martillar; el TTL garantiza re-sondeo, así un
        // false real se detecta apenas PostgREST se recupera.
        const errMsg = (error && (error.message ?? String(error))) || 'desconocido';
        const fo = this._matchColumnFailOpen.get(column) ?? { streak: 0, total: 0 };
        fo.streak += 1;
        fo.total += 1;
        this._matchColumnFailOpen.set(column, fo);

        const BREAKER_THRESHOLD = 3;
        const BREAKER_TTL_MS = 60_000;
        if (fo.streak >= BREAKER_THRESHOLD) {
          // Engancha el breaker: mientras dure el TTL corto no se vuelve a sondear
          // (el warn no se repite por-save porque el cache corta antes del probe).
          this._matchColumnSupport.set(column, { value: true, at: Date.now(), ttl: BREAKER_TTL_MS });
          console.warn(
            `[SCHEMA_PROBE_FALLBACK] columna="${column}" breaker ENGAGED ~${BREAKER_TTL_MS / 1000}s ` +
              `(fail-opens seguidos=${fo.streak}, total_instancia=${fo.total}); asumida presente:`,
            errMsg,
          );
        } else {
          console.warn(
            `[SCHEMA_PROBE_FALLBACK] columna="${column}" fail-open ` +
              `(seguidos=${fo.streak}, total_instancia=${fo.total}); asumida presente:`,
            errMsg,
          );
        }
        return true;
      } finally {
        this._matchColumnInFlight.delete(column);
      }
    })();

    this._matchColumnInFlight.set(column, probe);
    return probe;
  }

  /**
   * Get complete fixture structure for a tournament
   */
  static async getTournamentFixture(tournamentId: string, seasonId?: string | null): Promise<TournamentFixture | null> {
    const supabase = await getReadClient();
    const scopedSeasonId = seasonId?.trim() || null;
    // Cota dura de partidos por fixture: un torneo/temporada real no la alcanza.
    // +1 detecta el exceso sin un COUNT extra (evita corte silencioso).
    const FIXTURE_MATCH_CAP = 1000;

    // OJO: tournament_phases NO tiene start_date/end_date (esas columnas viven en
    // tournament_rounds). Pedirlas devuelve 42703 y tumba TODO el fixture: la query
    // falla, este metodo retorna null y la ruta cae al payload de emergencia (fases
    // sin jornadas ni partidos). No las agregues sin migracion previa.
    let phasesQuery = supabase
      .from('tournament_phases')
      .select('id, tournament_id, name, phase_type, order_index, is_active, settings, created_at, updated_at')
      .eq('tournament_id', tournamentId)
      .order('order_index', { ascending: true });

    if (scopedSeasonId) {
      phasesQuery = phasesQuery.eq('season_id', scopedSeasonId);
    }

    const [
      { data: tournament, error: tournamentError },
      { data: phases, error: phasesError },
    ] = await Promise.all([
      // 1. Get tournament info (FIX: removed non-existent 'season' column)
      supabase
        .from('tournaments')
        .select('id, name')
        .eq('id', tournamentId)
        .single(),
      // 2. Get phases
      phasesQuery,
    ]);

    if (tournamentError || !tournament) {
      console.error(`[FixtureService] Tournament not found for ID: ${tournamentId}`, tournamentError);
      return null;
    }

    console.log(`[FixtureService] Tournament found: ${tournament.name}`);

    if (phasesError) {
      console.error(`[FixtureService] Error fetching phases for tournament ${tournamentId}:`, phasesError);
      return null;
    }

    const phaseIds = (phases || []).map((phase) => phase.id);

    // 3-5. Load the remaining fixture data in parallel to keep the admin workspace responsive.
    const roundsPromise = phaseIds.length > 0
      ? supabase
        .from('tournament_rounds')
        .select('*')
        .in('phase_id', phaseIds)
        .order('order_index', { ascending: true })
      : Promise.resolve({ data: [], error: null });

    let matchesQuery = supabase
      .from('matches')
      .select(`
          id, tournament_id, round_uuid, round_id, phase_id, group_id,
          date_time, venue, status, score,
          referee, pitch, category,
          round_label, notes,
          broadcast_url, replay_url,
          home_division_id, away_division_id,
          home_club_id, away_club_id,
          home_base_points, away_base_points,
          home_bonus_points, away_bonus_points,
          points_autocalculated, points_override_reason,
          home_club:clubs!matches_home_club_id_fkey(id, name, short_name),
          away_club:clubs!matches_away_club_id_fkey(id, name, short_name)
        `)
      .eq('tournament_id', tournamentId)
      .order('date_time', { ascending: true })
      .limit(FIXTURE_MATCH_CAP + 1);

    let participantsQuery = supabase
      .from('tournament_participants')
      .select('id, club_id, name, short_code, clubs:club_id(logo_url)')
      .eq('tournament_id', tournamentId)
      .eq('status', 'active');

    if (scopedSeasonId) {
      matchesQuery = matchesQuery.eq('season_id', scopedSeasonId);
      participantsQuery = participantsQuery.eq('season_id', scopedSeasonId);
    }

    const [
      { data: allRounds, error: roundsError },
      { data: allMatches, error: matchesError },
      { data: participants, error: participantsError },
    ] = await Promise.all([
      roundsPromise,
      // 4. Get ALL matches for this tournament directly by tournament_id
      // This captures even "orphaned" matches and is much more efficient.
      // Explicit columns exclude heavy JSONB fields (events, lineups, weather, clock)
      // that are not needed for the fixture list view.
      matchesQuery,
      // 5. Get participants
      participantsQuery,
    ]);

    if (roundsError) {
      console.error('[FixtureService] Error fetching all rounds:', roundsError);
    }

    if (matchesError) {
      console.error('[FixtureService] Error fetching all matches:', matchesError);
    }

    if (participantsError) {
      console.error('Error fetching participants:', participantsError);
    }

    // 6. Map everything together in-memory
    const mappedParticipants = (participants || []).map(p => this.mapParticipant(p));
    const clubLogos = new Map<string, string | null>(
      mappedParticipants
        .filter((participant: any): participant is { clubId: string; logo?: string | null } =>
          typeof participant.clubId === 'string' && participant.clubId.length > 0
        )
        .map((participant) => [participant.clubId, participant.logo ?? null] as [string, string | null]),
    );
    const rawMatches = allMatches || [];
    const matchesTruncated = rawMatches.length > FIXTURE_MATCH_CAP;
    if (matchesTruncated) {
      console.warn(`[FixtureService] Fixture de ${tournamentId} supera ${FIXTURE_MATCH_CAP} partidos; devuelvo los primeros ${FIXTURE_MATCH_CAP}. La UI debe paginar/avisar (matchesTruncated).`);
    }
    const mappedMatches = rawMatches.slice(0, FIXTURE_MATCH_CAP).map(m => this.mapMatchWithClubs(m, clubLogos));
    const mappedRounds = (allRounds || []).map(r => this.mapRound(r));

    const phasesWithRounds: PhaseWithRounds[] = (phases || []).map((phase, index) => {
      const phaseRounds = mappedRounds.filter(r => r.phaseId === phase.id);

      const roundsWithMatches: RoundWithMatches[] = phaseRounds.map(round => {
        const roundMatches = mappedMatches.filter(m => m.roundId === round.id);
        return {
          ...round,
          matches: roundMatches,
          matchCount: roundMatches.length
        };
      });

      // Find orphaned matches for this phase
      let orphanedMatches = mappedMatches.filter(m => m.phaseId === phase.id && !m.roundId);

      // Include completely unknown orphans in the first phase
      if (index === 0) {
        const tournamentOrphans = mappedMatches.filter(m => !m.phaseId && !m.roundId);
        orphanedMatches = [...orphanedMatches, ...tournamentOrphans];
      }

      if (orphanedMatches.length > 0) {
        roundsWithMatches.push({
          id: `orphaned-${phase.id}`,
          phaseId: phase.id,
          name: 'Partidos sin jornada',
          orderIndex: 999,
          isCompleted: false,
          startDate: null,
          endDate: null,
          notes: 'Partidos importados o creados sin una jornada asignada.',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          matches: orphanedMatches,
          matchCount: orphanedMatches.length
        });
      }

      return {
        ...this.mapPhase(phase),
        rounds: roundsWithMatches,
        roundCount: roundsWithMatches.length
      };
    });

    // 7. Determine current phase and round
    const currentPhase = phasesWithRounds.find((p) => p.isActive) || phasesWithRounds[0];
    const currentRound = currentPhase?.rounds.find((r) => !r.isCompleted) || currentPhase?.rounds[0];

    return {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      tournamentSeason: scopedSeasonId,
      currentPhaseId: currentPhase?.id || null,
      currentRoundId: currentRound?.id || null,
      phases: phasesWithRounds,
      participants: mappedParticipants,
      matchesTruncated,
    };
  }

  /**
   * Get rounds for a specific phase with their matches.
   * Fetches rounds and matches in parallel (2 queries total, not N+1).
   */
  static async getRoundsForPhase(phaseId: string): Promise<RoundWithMatches[] | null> {
    const supabase = await getReadClient();

    const [{ data: rounds, error: roundsError }, { data: allMatches, error: matchesError }] =
      await Promise.all([
        supabase
          .from('tournament_rounds')
          .select('*')
          .eq('phase_id', phaseId)
          .order('order_index', { ascending: true }),
        supabase
          .from('matches')
          .select(`
            id, tournament_id, round_uuid, round_id, phase_id, group_id,
            date_time, venue, status, score,
            referee, pitch, category,
            round_label, notes,
            broadcast_url, replay_url,
            home_division_id, away_division_id,
            home_club_id, away_club_id,
            home_base_points, away_base_points,
            home_bonus_points, away_bonus_points,
            points_autocalculated, points_override_reason,
            home_club:clubs!matches_home_club_id_fkey(id, name, short_name, logo:logo_url),
            away_club:clubs!matches_away_club_id_fkey(id, name, short_name, logo:logo_url)
          `)
          .eq('phase_id', phaseId)
          .order('date_time', { ascending: true }),
      ]);

    if (roundsError) {
      console.error('Error fetching rounds:', roundsError);
      return null;
    }

    if (matchesError) {
      console.error('Error fetching matches for phase:', matchesError);
    }

    // Group matches by round_uuid in memory — avoids N+1
    const matchesByRound = new Map<string, any[]>();
    for (const m of allMatches || []) {
      const key = this.getMatchRoundId(m) ?? '__orphan__';
      if (!matchesByRound.has(key)) matchesByRound.set(key, []);
      matchesByRound.get(key)!.push(m);
    }

    return (rounds || []).map((round) => {
      const matches = (matchesByRound.get(round.id) || []).map((m) => this.mapMatchWithClubs(m));
      return {
        ...this.mapRound(round),
        matches,
        matchCount: matches.length,
      };
    });
  }

  /**
   * Get a specific match by ID with club details
   */
  static async getMatch(matchId: string): Promise<MatchWithClubs | null> {
    if (!isUuid(matchId)) return null;
    const supabase = await getReadClient();

    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select(`
        *,
        home_club:clubs!matches_home_club_id_fkey(id, name, short_name, logo:logo_url),
        away_club:clubs!matches_away_club_id_fkey(id, name, short_name, logo:logo_url),
        tournament:tournaments(id, name, logo:logo_url)
      `)
      .eq('id', matchId)
      .single();

    if (matchError || !match) {
      console.error('Error fetching match:', matchError);
      return null;
    }

    return this.mapMatchWithClubs(match);
  }

  /**
   * Slim scope read para el path de escritura por evento: SOLO las columnas que
   * consumen recalcAffectedPhases (tournamentId/phaseId), el gate de standings
   * por status y la invalidación por date/sport. Evita el select('*') + 3 joins
   * (con los JSONB events/lineups/clock) de getMatch en el prev/next.
   * Devuelve las claves en camelCase para ser drop-in de getMatch en esos usos.
   */
  static async getMatchScope(matchId: string): Promise<{
    id: string;
    tournamentId: string | null;
    phaseId: string | null;
    dateTime: string | null;
    sportId: string | null;
    status: string | null;
    seasonId: string | null;
  } | null> {
    if (!isUuid(matchId)) return null;
    const supabase = await getReadClient();

    const { data, error } = await supabase
      .from('matches')
      .select('id, tournament_id, phase_id, date_time, sport_id, status, season_id')
      .eq('id', matchId)
      .single();

    if (error || !data) {
      console.error('Error fetching match scope:', error);
      return null;
    }

    const row = data as any;
    return {
      id: row.id,
      tournamentId: row.tournament_id ?? null,
      phaseId: row.phase_id ?? null,
      dateTime: row.date_time ?? null,
      sportId: row.sport_id ?? null,
      status: row.status ?? null,
      seasonId: row.season_id ?? null,
    };
  }

  /**
   * Get matches for a specific round
   */
  static async getMatchesForRound(roundId: string): Promise<MatchWithClubs[] | null> {
    if (!isUuid(roundId)) return null;
    const supabase = await getReadClient();

    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select(`
        *,
        home_club:clubs!matches_home_club_id_fkey(id, name, short_name, logo:logo_url),
        away_club:clubs!matches_away_club_id_fkey(id, name, short_name, logo:logo_url)
      `)
      .or(`round_uuid.eq.${roundId},round_id.eq.${roundId}`)
      .order('date_time', { ascending: true });

    if (matchesError) {
      console.error('Error fetching matches:', matchesError);
      return null;
    }

    return (matches || []).map((m: any) => this.mapMatchWithClubs(m));
  }

  /**
   * Find or create a round by its label within a phase.
   * This ensures manual matches are always associated with a round.
   */
  static async findOrCreateRound(phaseId: string, roundLabel: string): Promise<string | null> {
    if (!roundLabel) return null;

    const supabase = await this.getWriteClient();

    const { data: phaseContext } = await supabase
      .from('tournament_phases')
      .select('season_id, phase_type')
      .eq('id', phaseId)
      .maybeSingle();

    // 1. Try to find existing round with this name in this phase
    const { data: existing } = await supabase
      .from('tournament_rounds')
      .select('id')
      .eq('phase_id', phaseId)
      .eq('name', roundLabel)
      .maybeSingle();

    if (existing) return existing.id;

    if (isPlayoffPhaseType(phaseContext?.phase_type)) {
      console.warn('[FixtureService] Refusing to auto-create playoff stage from free label.');
      return null;
    }

    // 2. Not found, create it
    // We need an order_index. Let's find the max one.
    const { data: maxRound } = await supabase
      .from('tournament_rounds')
      .select('order_index')
      .eq('phase_id', phaseId)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = (maxRound?.order_index || 0) + 1;

    const roundPayload = {
      phase_id: phaseId,
      season_id: phaseContext?.season_id ?? null,
      name: roundLabel,
      order_index: nextOrder,
      status: 'draft'
    };

    // B2: atomic upsert on (phase_id, name) so two concurrent imports can't
    // create duplicate rounds between the SELECT above and this write. If the
    // unique index migration hasn't been applied yet, Postgres rejects the
    // ON CONFLICT target (42P10) — fall back to the previous plain insert.
    let { data: newRound, error: createError } = await supabase
      .from('tournament_rounds')
      .upsert(roundPayload, { onConflict: 'phase_id,name' })
      .select('id')
      .single();

    if (createError && (createError.code === '42P10' || /no unique or exclusion constraint/i.test(createError.message || ''))) {
      ({ data: newRound, error: createError } = await supabase
        .from('tournament_rounds')
        .insert(roundPayload)
        .select('id')
        .single());
    }

    if (createError || !newRound) {
      console.error('[FixtureService] Error creating round automatically:', createError);
      return null;
    }

    return newRound.id;
  }

  /**
   * Create a new match
   */
  static async createMatch(data: MatchFormData & { tournamentId: string }): Promise<Match | null> {
    const supabase = await this.getWriteClient();

    if (!data.dateTime) {
      throw new Error('Debes seleccionar una fecha para el partido.');
    }

    const normalizedDateTime = ensureUtcDateTimeString(data.dateTime, APP_TIMEZONE);
    if (!normalizedDateTime) {
      throw new Error('La fecha del partido no es valida.');
    }

    // Validation: teams must be different (only when both are defined; playoff
    // placeholder matches may have one or both sides still TBD).
    if (data.homeClubId && data.awayClubId && data.homeClubId === data.awayClubId) {
      throw new Error('El equipo local y el visitante no pueden ser el mismo.');
    }

    const [
      supportsRoundLabel,
      supportsHomeDivision,
      supportsAwayDivision,
      supportsCategory,
      supportsReferee,
      supportsPitch,
      supportsBroadcastUrl,
      supportsReplayUrl,
      supportsHomeBasePoints,
      supportsAwayBasePoints,
      supportsHomeBonusPoints,
      supportsAwayBonusPoints,
      supportsPointsAutocalculated,
      supportsPointsOverrideReason,
    ] = await Promise.all([
      this.checkRoundLabelSupport(supabase),
      data.homeSquadId ? this.checkMatchColumnSupport('home_division_id', supabase) : Promise.resolve(false),
      data.awaySquadId ? this.checkMatchColumnSupport('away_division_id', supabase) : Promise.resolve(false),
      data.category ? this.checkMatchColumnSupport('category', supabase) : Promise.resolve(false),
      data.referee !== undefined ? this.checkMatchColumnSupport('referee', supabase) : Promise.resolve(false),
      data.pitch !== undefined ? this.checkMatchColumnSupport('pitch', supabase) : Promise.resolve(false),
      data.streamUrl !== undefined ? this.checkMatchColumnSupport('broadcast_url', supabase) : Promise.resolve(false),
      data.replayUrl !== undefined ? this.checkMatchColumnSupport('replay_url', supabase) : Promise.resolve(false),
      data.homeBasePoints !== undefined ? this.checkMatchColumnSupport('home_base_points', supabase) : Promise.resolve(false),
      data.awayBasePoints !== undefined ? this.checkMatchColumnSupport('away_base_points', supabase) : Promise.resolve(false),
      data.homeBonusPoints !== undefined ? this.checkMatchColumnSupport('home_bonus_points', supabase) : Promise.resolve(false),
      data.awayBonusPoints !== undefined ? this.checkMatchColumnSupport('away_bonus_points', supabase) : Promise.resolve(false),
      data.pointsAutocalculated !== undefined ? this.checkMatchColumnSupport('points_autocalculated', supabase) : Promise.resolve(false),
      data.pointsOverrideReason !== undefined ? this.checkMatchColumnSupport('points_override_reason', supabase) : Promise.resolve(false),
    ]);
    console.log(`[FixtureService] createMatch - round_label: ${supportsRoundLabel}`);

    const phaseForRound = await this.assertPhaseBelongsToTournament(supabase, data.tournamentId, data.phaseId);

    // Automated Round Management: if roundId is missing but label exists, find or create it.
    let finalRoundId = data.roundId;
    if (isPlayoffPhaseType(phaseForRound.phase_type) && !finalRoundId) {
      throw new Error('Para una fase playoff debes seleccionar una etapa de eliminacion definida.');
    }
    if (!finalRoundId && data.phaseId && data.roundLabel) {
      console.log(`[FixtureService] Attempting to find/create round for label: ${data.roundLabel}`);
      finalRoundId = await this.findOrCreateRound(data.phaseId, data.roundLabel);
    }

    const phaseContext = await this.assertMatchContext(supabase, {
      tournamentId: data.tournamentId,
      phaseId: data.phaseId,
      roundId: finalRoundId,
      homeClubId: data.homeClubId,
      awayClubId: data.awayClubId,
    });

    // Explicit whitelist for base columns strictly matching public.matches
    const insertData: any = {
      phase_id: data.phaseId,
      group_id: data.groupId || null,
      tournament_id: data.tournamentId,
      round_uuid: finalRoundId,
      home_club_id: data.homeClubId,
      away_club_id: data.awayClubId,
      date_time: normalizedDateTime,
      venue: data.venue,
      status: data.status,
      notes: data.notes || null,
      score: data.score || { home: 0, away: 0 },
    };

    if (phaseContext.season_id) {
      insertData.season_id = phaseContext.season_id;
    }

    if (supportsHomeBasePoints && data.homeBasePoints !== undefined) insertData.home_base_points = data.homeBasePoints;
    if (supportsAwayBasePoints && data.awayBasePoints !== undefined) insertData.away_base_points = data.awayBasePoints;
    if (supportsHomeBonusPoints && data.homeBonusPoints !== undefined) insertData.home_bonus_points = data.homeBonusPoints;
    if (supportsAwayBonusPoints && data.awayBonusPoints !== undefined) insertData.away_bonus_points = data.awayBonusPoints;
    if (supportsPointsAutocalculated && data.pointsAutocalculated !== undefined) insertData.points_autocalculated = data.pointsAutocalculated;
    if (supportsPointsOverrideReason && data.pointsOverrideReason !== undefined) insertData.points_override_reason = data.pointsOverrideReason;

    if (supportsRoundLabel) {
      insertData.round_label = data.roundLabel || null;
    }

    if (supportsHomeDivision) {
      insertData.home_division_id = data.homeSquadId || null;
    }

    if (supportsAwayDivision) {
      insertData.away_division_id = data.awaySquadId || null;
    }

    if (supportsCategory) {
      insertData.category = data.category || null;
    }

    if (supportsReferee && data.referee !== undefined) {
      insertData.referee = data.referee || null;
    }

    if (supportsPitch && data.pitch !== undefined) {
      insertData.pitch = data.pitch || null;
    }

    if (supportsBroadcastUrl && data.streamUrl !== undefined) {
      insertData.broadcast_url = data.streamUrl || null;
    }

    if (supportsReplayUrl && data.replayUrl !== undefined) {
      insertData.replay_url = data.replayUrl || null;
    }

    // Fixed roster: pre-seed the lineup from the team's registered roster so the
    // new match opens with the 23 already loaded. Best-effort — on any failure
    // we skip it and the match-center read path derives it lazily instead.
    if (phaseContext.season_id) {
      try {
        const fixedCfg = await loadFixedRosterConfigForMatch(
          supabase,
          data.tournamentId,
          phaseContext.season_id,
        );
        if (fixedCfg.enabled) {
          const statusLocked = isMatchRosterLocked({ status: data.status });
          let locked = statusLocked;
          if (!statusLocked && fixedCfg.lockOrderIndex !== null) {
            const matchPhaseOrderIndex = await resolveMatchPhaseOrderIndex(
              supabase,
              data.phaseId || null,
              finalRoundId || null,
            );
            locked = isMatchRosterLocked({
              status: data.status,
              matchPhaseOrderIndex,
              lockOrderIndex: fixedCfg.lockOrderIndex,
            });
          }
          if (!locked && (await this.checkMatchColumnSupport('lineups', supabase))) {
            const derived = await deriveFixedRosterLineups(
              supabase,
              {
                seasonId: phaseContext.season_id,
                homeClubId: data.homeClubId || null,
                homeTeamId: null,
                awayClubId: data.awayClubId || null,
                awayTeamId: null,
              },
              fixedCfg,
            );
            if (derived) {
              insertData.lineups = {
                fixedRosterDerived: true,
                home: derived.home,
                away: derived.away,
              };
            }
          }
        }
      } catch (seedError) {
        console.error('[FixtureService] fixed-roster lineup seed skipped:', seedError);
      }
    }

    const { data: match, error } = await supabase
      .from('matches')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[FixtureService] Error creating match:', { error, insertData });
      throw new Error(error.message);
    }

    if (!match?.id || match.tournament_id !== data.tournamentId || match.phase_id !== data.phaseId) {
      console.error('[FixtureService] Match insert returned inconsistent data:', match);
      throw new Error('El partido se creó con datos incompletos. Revisá la configuración de la base.');
    }

    await this.syncClubRankingsAfterMatchChange(match.id);
    await this.invalidatePublicMatchesFeed(supabase, this.getMatchFeedInvalidationScopes([match]));
    return this.mapMatch(match);
  }

  /**
   * Update a match
   */
  static async updateMatch(
    matchId: string,
    data: Partial<MatchFormData>,
    providedClient?: any,
  ): Promise<Match | null> {
    if (!isUuid(matchId)) {
      throw new Error('El partido que intentás actualizar no existe.');
    }
    const supabase = providedClient ?? await this.getWriteClient();

    // Etapa 0 (medición): mide la validación + lecturas de snapshots.
    traceStageStart('validate_snapshots');

    const [
      supportsRoundLabel,
      supportsHomeDivision,
      supportsAwayDivision,
      supportsCategory,
      supportsReferee,
      supportsPitch,
      supportsBroadcastUrl,
      supportsReplayUrl,
      supportsClock,
      supportsHomeBasePoints,
      supportsAwayBasePoints,
      supportsHomeBonusPoints,
      supportsAwayBonusPoints,
      supportsPointsAutocalculated,
      supportsPointsOverrideReason,
    ] = await Promise.all([
      this.checkRoundLabelSupport(supabase),
      data.homeSquadId !== undefined ? this.checkMatchColumnSupport('home_division_id', supabase) : Promise.resolve(false),
      data.awaySquadId !== undefined ? this.checkMatchColumnSupport('away_division_id', supabase) : Promise.resolve(false),
      data.category !== undefined ? this.checkMatchColumnSupport('category', supabase) : Promise.resolve(false),
      data.referee !== undefined ? this.checkMatchColumnSupport('referee', supabase) : Promise.resolve(false),
      data.pitch !== undefined ? this.checkMatchColumnSupport('pitch', supabase) : Promise.resolve(false),
      data.streamUrl !== undefined ? this.checkMatchColumnSupport('broadcast_url', supabase) : Promise.resolve(false),
      data.replayUrl !== undefined ? this.checkMatchColumnSupport('replay_url', supabase) : Promise.resolve(false),
      data.clock !== undefined ? this.checkMatchColumnSupport('clock', supabase) : Promise.resolve(false),
      data.homeBasePoints !== undefined ? this.checkMatchColumnSupport('home_base_points', supabase) : Promise.resolve(false),
      data.awayBasePoints !== undefined ? this.checkMatchColumnSupport('away_base_points', supabase) : Promise.resolve(false),
      data.homeBonusPoints !== undefined ? this.checkMatchColumnSupport('home_bonus_points', supabase) : Promise.resolve(false),
      data.awayBonusPoints !== undefined ? this.checkMatchColumnSupport('away_bonus_points', supabase) : Promise.resolve(false),
      data.pointsAutocalculated !== undefined ? this.checkMatchColumnSupport('points_autocalculated', supabase) : Promise.resolve(false),
      data.pointsOverrideReason !== undefined ? this.checkMatchColumnSupport('points_override_reason', supabase) : Promise.resolve(false),
    ]);
    console.log(`[FixtureService] updateMatch - round_label: ${supportsRoundLabel}`);

    const { data: existingMatch, error: existingMatchError } = await this.selectMatchForUpdate(supabase, matchId);

    if (existingMatchError || !existingMatch) {
      throw new Error('El partido que intentás actualizar no existe.');
    }

    const updateData: any = {};
    const requiresContextValidation =
      data.phaseId !== undefined ||
      data.roundId !== undefined ||
      data.roundLabel !== undefined ||
      data.homeClubId !== undefined ||
      data.awayClubId !== undefined;
    const nextPhaseIdForRound = data.phaseId ?? existingMatch.phase_id;
    const targetPhaseForRound = requiresContextValidation && nextPhaseIdForRound
      ? await this.assertPhaseBelongsToTournament(supabase, existingMatch.tournament_id, nextPhaseIdForRound)
      : null;

    // Automated Round Management for updates
    if (data.roundId !== undefined) {
      updateData.round_uuid = data.roundId || null;
    } else if (data.roundLabel !== undefined && data.roundLabel && nextPhaseIdForRound && !isPlayoffPhaseType(targetPhaseForRound?.phase_type)) {
      updateData.round_uuid = await this.findOrCreateRound(nextPhaseIdForRound, data.roundLabel);
    }

    const nextHomeClubId = data.homeClubId ?? existingMatch.home_club_id;
    const nextAwayClubId = data.awayClubId ?? existingMatch.away_club_id;

    // Only enforce distinct teams when both sides are set. Playoff placeholder
    // matches can keep one or both sides empty (TBD) while editing the schedule.
    if (nextHomeClubId && nextAwayClubId && nextHomeClubId === nextAwayClubId) {
      throw new Error('El equipo local y el visitante no pueden ser el mismo.');
    }

    let nextPhaseContext: PhaseContext | null = null;

    if (requiresContextValidation) {
      const nextPhaseId = nextPhaseIdForRound;
      if (!nextPhaseId) {
        throw new Error('El partido debe pertenecer a una fase.');
      }

      nextPhaseContext = await this.assertMatchContext(supabase, {
        tournamentId: existingMatch.tournament_id,
        phaseId: nextPhaseId,
        roundId: updateData.round_uuid !== undefined ? updateData.round_uuid : this.getMatchRoundId(existingMatch),
        homeClubId: nextHomeClubId,
        awayClubId: nextAwayClubId,
      });
    }

    if (data.homeClubId !== undefined) updateData.home_club_id = data.homeClubId;
    if (data.awayClubId !== undefined) updateData.away_club_id = data.awayClubId;

    // Playoff matches start hidden as TBD placeholders: both the bracket
    // builder (playoffBracket) and the stage-slot generator (playoffStages)
    // create them with is_visible=false until both opponents are known. The
    // automatic advancement path keeps this in sync, but a *manual* edit that
    // fills in both teams must flip it too — otherwise the fixture stays
    // invisible on the home page despite having a real date and both clubs.
    if (
      (data.homeClubId !== undefined || data.awayClubId !== undefined) &&
      isPlayoffPhaseType(targetPhaseForRound?.phase_type)
    ) {
      updateData.is_visible = Boolean(nextHomeClubId) && Boolean(nextAwayClubId);
    }

    if (data.dateTime !== undefined) {
      const normalizedDateTime = ensureUtcDateTimeString(data.dateTime, APP_TIMEZONE);
      if (!normalizedDateTime) {
        throw new Error('La fecha del partido no es valida.');
      }
      updateData.date_time = normalizedDateTime;
    }
    if (data.venue !== undefined) updateData.venue = data.venue;
    if (data.status) {
      updateData.status = data.status;
    }

    if (supportsRoundLabel && data.roundLabel !== undefined) {
      updateData.round_label = data.roundLabel;
    }

    if (supportsHomeDivision && data.homeSquadId !== undefined) {
      updateData.home_division_id = data.homeSquadId || null;
    }

    if (supportsAwayDivision && data.awaySquadId !== undefined) {
      updateData.away_division_id = data.awaySquadId || null;
    }

    if (supportsCategory && data.category !== undefined) {
      updateData.category = data.category || null;
    }

    if (supportsReferee && data.referee !== undefined) {
      updateData.referee = data.referee || null;
    }

    if (supportsPitch && data.pitch !== undefined) {
      updateData.pitch = data.pitch || null;
    }

    if (data.phaseId) updateData.phase_id = data.phaseId;
    if (nextPhaseContext?.season_id) updateData.season_id = nextPhaseContext.season_id;
    if (data.groupId !== undefined) updateData.group_id = data.groupId;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (supportsBroadcastUrl && data.streamUrl !== undefined) updateData.broadcast_url = data.streamUrl || null;
    if (supportsReplayUrl && data.replayUrl !== undefined) updateData.replay_url = data.replayUrl || null;
    if (data.score !== undefined) updateData.score = data.score;
    if (supportsClock && data.clock !== undefined) updateData.clock = data.clock;
    if (supportsHomeBasePoints && data.homeBasePoints !== undefined) updateData.home_base_points = data.homeBasePoints;
    if (supportsAwayBasePoints && data.awayBasePoints !== undefined) updateData.away_base_points = data.awayBasePoints;
    if (supportsHomeBonusPoints && data.homeBonusPoints !== undefined) updateData.home_bonus_points = data.homeBonusPoints;
    if (supportsAwayBonusPoints && data.awayBonusPoints !== undefined) updateData.away_bonus_points = data.awayBonusPoints;
    if (supportsPointsAutocalculated && data.pointsAutocalculated !== undefined) updateData.points_autocalculated = data.pointsAutocalculated;
    if (supportsPointsOverrideReason && data.pointsOverrideReason !== undefined) updateData.points_override_reason = data.pointsOverrideReason;

    // Guard: if nothing to update (e.g. only events/lineups were sent but those columns
    // were removed in schema simplification), skip the UPDATE to avoid PostgREST returning
    // 0 rows which causes .single() to throw "Cannot coerce the result to a single JSON object".
    if (Object.keys(updateData).length === 0) {
      const { data: fullMatch, error: fetchErr } = await supabase
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single();
      if (fetchErr || !fullMatch) throw new Error('No se pudo obtener el partido.');
      return this.mapMatch(fullMatch);
    }

    // Gate por status final: advancement, reseed y ranking-sync solo pueden
    // cambiar algo cuando el partido es (o era) final — un evento en vivo no
    // avanza bracket, no reseedea ni afecta rankings (cuentan solo finales).
    // Mismo criterio que el gate de standings (#1b). Ahorra ~6-10 round-trips
    // sincrónicos por evento en vivo.
    const prevStatus = existingMatch.status ?? null;
    const nextStatus = data.status !== undefined ? data.status : (existingMatch.status ?? null);
    const finalRelevant = isFinalStandingsStatus(prevStatus) || isFinalStandingsStatus(nextStatus);

    const shouldSyncRankings = this.shouldSyncRankingsAfterUpdate(existingMatch, updateData) && finalRelevant;
    const previousRankingSnapshot = shouldSyncRankings
      ? await getMatchRankingSnapshot(matchId)
      : null;

    traceStageEnd('validate_snapshots');
    traceStageStart('match_update');
    const { data: match, error } = await supabase
      .from('matches')
      .update(updateData)
      .eq('id', matchId)
      .select()
      .single();
    traceStageEnd('match_update');

    if (error) {
      console.error('[FixtureService] Error updating match:', { error, matchId, updateData });
      throw new Error(error.message);
    }

    markEditTrace({ shouldSyncRankings });
    if (shouldSyncRankings) {
      if (isDerivedRecalcSkipped('ranking')) {
        appendEditTraceFact('skippedDerived', 'ranking');
      } else {
        traceStageStart('ranking_sync');
        await this.syncClubRankingsAfterMatchChange(matchId, previousRankingSnapshot);
        traceStageEnd('ranking_sync');
      }
    }

    // Automatic playoff advancement: when a bracket match's result or
    // participants change, push winner/loser into the next matches. No-op
    // (and never throws) for non-bracket matches or if the migration is
    // not applied yet, so regular match editing is unaffected.
    const resultAffecting =
      'status' in updateData ||
      'score' in updateData ||
      'home_club_id' in updateData ||
      'away_club_id' in updateData;
    markEditTrace({ resultAffecting, finalRelevant });
    if (resultAffecting && finalRelevant) {
      const skipAdvancement = isDerivedRecalcSkipped('advancement');
      if (skipAdvancement) appendEditTraceFact('skippedDerived', 'advancement');
      if (!skipAdvancement) {
      traceStageStart('advancement');
      try {
        const advancement = await resolveMatchAdvancement(supabase, matchId);
        if (advancement.ok && advancement.changed > 0) {
          markEditTrace({ advancementChanged: advancement.changed });
          await invalidateMatchesFeedCaches();
        }
        if (advancement.warnings.length > 0) {
          console.warn('[FixtureService] Playoff advancement warnings:', advancement.warnings);
        }
        if (!advancement.ok) {
          console.error('[FixtureService] Playoff advancement failed:', advancement.error);
        }
      } catch (advancementError) {
        console.error('[FixtureService] Playoff advancement threw:', advancementError);
      }
      traceStageEnd('advancement');
      }

      // Zone-stage result changed: re-derive playoff crossings for any
      // playoff phase seeded from this phase's standings, unless that zone
      // phase has been officially "closed" (playoffSeeding.locked). The
      // standings are recalculated elsewhere on result change; here we only
      // re-resolve the bracket's seed slots. Best-effort, never throws.
      const skipReseed = isDerivedRecalcSkipped('reseed');
      if (skipReseed) appendEditTraceFact('skippedDerived', 'reseed');
      if (!skipReseed) {
      traceStageStart('reseed');
      try {
        const { data: editedMatch } = await supabase
          .from('matches')
          .select('tournament_id, phase_id')
          .eq('id', matchId)
          .maybeSingle();
        if (editedMatch?.tournament_id && editedMatch?.phase_id) {
          const { data: phaseRows } = await supabase
            .from('tournament_phases')
            .select('id, settings')
            .eq('tournament_id', editedMatch.tournament_id);
          for (const phaseRow of phaseRows ?? []) {
            const cfg = readPlayoffSeedingConfig((phaseRow as any).settings);
            if (cfg && !cfg.locked && cfg.sourcePhaseId === editedMatch.phase_id) {
              const r = await reseedPlayoffBracket(supabase, { phaseId: (phaseRow as any).id });
              if (r.ok && (r.reseeded ?? 0) > 0) {
                await invalidateMatchesFeedCaches();
              }
            }
          }
        }
      } catch (reseedError) {
        console.error('[FixtureService] Playoff reseed-from-zones threw:', reseedError);
      }
      traceStageEnd('reseed');
      }
    }

    // A manual date/venue edit on a bracket match marks it 'manual' so a
    // full-phase auto-reschedule won't overwrite the admin's choice.
    // Best-effort: a no-op for non-bracket matches and silently skipped
    // until the scheduling migration is applied.
    const scheduleEdited = 'date_time' in updateData || 'venue' in updateData;
    if (scheduleEdited) {
      try {
        await supabase
          .from('matches')
          .update({ scheduling_status: 'manual', auto_scheduled: false })
          .eq('id', matchId)
          .not('bracket_match_code', 'is', null);
      } catch {
        /* columns not present yet — ignore */
      }
    }

    if (isDerivedRecalcSkipped('cache')) {
      appendEditTraceFact('skippedDerived', 'cache');
    } else {
      traceStageStart('cache_invalidation');
      await this.invalidatePublicMatchesFeed(
        supabase,
        this.getMatchFeedInvalidationScopes([existingMatch, match]),
      );
      traceStageEnd('cache_invalidation');
    }
    return this.mapMatch(match);
  }

  /**
   * Delete a match
   */
  static async deleteMatch(matchId: string): Promise<boolean> {
    if (!isUuid(matchId)) return false;
    const supabase = await this.getWriteClient();
    const { data: existingMatch } = await this.selectMatchForUpdate(supabase, matchId);
    const invalidationScopes = this.getMatchFeedInvalidationScopes([existingMatch]);
    const previousRankingSnapshot = await getMatchRankingSnapshot(matchId);

    const { error } = await supabase.from('matches').delete().eq('id', matchId);

    if (error) {
      console.error('Error deleting match:', error);
      return false;
    }

    await this.syncClubRankingsAfterMatchChange(matchId, previousRankingSnapshot);
    await this.invalidatePublicMatchesFeed(supabase, invalidationScopes);
    return true;
  }

  /**
   * Create a new round
   */
  static async createRound(data: RoundFormData): Promise<TournamentRound | null> {
    const supabase = await this.getWriteClient();

    const { data: phaseContext } = await supabase
      .from('tournament_phases')
      .select('season_id')
      .eq('id', data.phaseId)
      .maybeSingle();

    const { data: round, error } = await supabase
      .from('tournament_rounds')
      .insert({
        phase_id: data.phaseId,
        season_id: phaseContext?.season_id ?? null,
        name: data.name,
        order_index: data.orderIndex,
        start_date: data.startDate || null,
        end_date: data.endDate || null,
        notes: data.notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating round:', error);
      return null;
    }

    return this.mapRound(round);
  }

  /**
   * Update a round
   */
  static async updateRound(roundId: string, data: Partial<RoundFormData>): Promise<TournamentRound | null> {
    const supabase = await this.getWriteClient();

    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.orderIndex !== undefined) updateData.order_index = data.orderIndex;
    if (data.startDate !== undefined) updateData.start_date = data.startDate;
    if (data.endDate !== undefined) updateData.end_date = data.endDate;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const { data: round, error } = await supabase
      .from('tournament_rounds')
      .update(updateData)
      .eq('id', roundId)
      .select()
      .single();

    if (error) {
      console.error('Error updating round:', error);
      return null;
    }

    return this.mapRound(round);
  }

  /**
   * Delete a round (and all its matches if cascade)
   */
  static async deleteRound(roundId: string): Promise<boolean> {
    const supabase = await this.getWriteClient();

    const { error } = await supabase.from('tournament_rounds').delete().eq('id', roundId);

    if (error) {
      console.error('Error deleting round:', error);
      return false;
    }

    return true;
  }

  /**
   * Create a new phase
   */
  static async createPhase(data: PhaseFormData): Promise<TournamentPhase | null> {
    const supabase = await this.getWriteClient();
    const scopedSeasonId = (
      (data as PhaseFormData & { seasonId?: string | null; season_id?: string | null }).seasonId ??
      (data as PhaseFormData & { seasonId?: string | null; season_id?: string | null }).season_id ??
      null
    );

    const { data: phase, error } = await supabase
      .from('tournament_phases')
      .insert({
        tournament_id: data.tournamentId,
        season_id: scopedSeasonId,
        name: data.name,
        phase_type: data.phaseType,
        order_index: data.orderIndex,
        start_date: data.startDate || null,
        end_date: data.endDate || null,
        settings: data.settings || {},
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating phase:', error);
      return null;
    }

    return this.mapPhase(phase);
  }

  /**
   * Generate rounds for a phase automatically
   */
  static async generateRoundsForPhase(
    phaseId: string,
    numRounds: number,
    namePattern: string = 'Fecha {n}'
  ): Promise<boolean> {
    const supabase = await this.getWriteClient();

    const { data: phaseContext } = await supabase
      .from('tournament_phases')
      .select('tournament_id, season_id, phase_type, settings')
      .eq('id', phaseId)
      .maybeSingle();

    if (isPlayoffPhaseType(phaseContext?.phase_type)) {
      if (!phaseContext?.tournament_id) {
        console.error('Error generating playoff bracket: phase has no tournament.');
        return false;
      }

      // Builder-managed multi-cup bracket: generate from the saved
      // template instead of the legacy linear single-elimination flow.
      const builderConfig = (phaseContext?.settings as any)?.bracketBuilder as
        | (PlayoffBuilderConfig & { generatedAt?: string })
        | undefined;
      if (builderConfig?.templateId) {
        const result = await generatePlayoffBracket(supabase, {
          tournamentId: phaseContext.tournament_id,
          phaseId,
          seasonId: phaseContext?.season_id ?? null,
          config: {
            templateId: builderConfig.templateId,
            teamCount: builderConfig.teamCount,
            cupNames: builderConfig.cupNames,
            thirdPlace: builderConfig.thirdPlace,
            seedMode: builderConfig.seedMode,
            customSpec: builderConfig.customSpec,
          },
          schedule: (phaseContext?.settings as any)?.bracketSchedule ?? { mode: 'manual' },
          force: true,
        });
        if (!result.ok) {
          console.error('Error generating playoff bracket (builder):', result.error);
          return false;
        }
        return true;
      }

      const playoffTeamsCount = getPlayoffTeamsCount(phaseContext?.settings);
      if (playoffTeamsCount < 2) {
        console.error('Error generating playoff bracket: phase needs at least 2 teams.');
        return false;
      }

      const resolvedStages = resolvePlayoffStagesForTeams(phaseContext?.settings, playoffTeamsCount);
      const fallbackStages = resolvedStages.length > 0
        ? resolvedStages
        : Array.from({ length: numRounds }, (_, index) => ({
          name: namePattern.replace('{n}', String(index + 1)),
          matchCount: 1,
        }));
      const syncResult = await syncPlayoffStagesToRounds(supabase, phaseId, phaseContext?.season_id ?? null, fallbackStages);
      if (!syncResult.ok) {
        console.error('Error generating playoff rounds:', syncResult.error);
        return false;
      }

      const bracketResult = await ensurePlayoffBracketMatches(supabase, {
        tournamentId: phaseContext?.tournament_id,
        phaseId,
        seasonId: phaseContext?.season_id ?? null,
        teamsCount: playoffTeamsCount,
        stageMatchCounts: fallbackStages.map((stage) => stage.matchCount),
      });

      if (!bracketResult.ok) {
        console.error('Error generating playoff bracket:', bracketResult.error);
        return false;
      }

      return true;
    }

    const { error } = await supabase.rpc('generate_rounds_for_phase', {
      p_phase_id: phaseId,
      p_num_rounds: numRounds,
      p_name_pattern: namePattern,
    });

    if (error) {
      console.error('Error generating rounds:', error);
      return false;
    }

    if (phaseContext?.season_id) {
      await supabase
        .from('tournament_rounds')
        .update({ season_id: phaseContext.season_id })
        .eq('phase_id', phaseId)
        .is('season_id', null);
    }

    return true;
  }

  /**
   * Generate Round-Robin (Berger) matches for a phase
   */
  static async generateMatchesForPhase(params: FixtureGenerationParams): Promise<boolean> {
    const supabase = await this.getWriteClient();

    const requestedClubIds = Array.from(new Set(params.clubIds.filter(Boolean)));

    // 1. Resolve the tournament from the selected phase
    const { data: phaseData } = await supabase
      .from('tournament_phases')
      .select('tournament_id, season_id')
      .eq('id', params.phaseId)
      .single();

    const tournamentId = phaseData?.tournament_id;
    const seasonId = phaseData?.season_id ?? null;

    if (!tournamentId) {
      throw new Error('La fase seleccionada no pertenece a ningún torneo.');
    }

    // 2. Get active participants for the selected clubs inside this tournament
    let participantsQuery = supabase
      .from('tournament_participants')
      .select('id, club_id')
      .eq('tournament_id', tournamentId)
      .in('club_id', requestedClubIds)
      .eq('status', 'active');

    if (seasonId) {
      participantsQuery = participantsQuery.eq('season_id', seasonId);
    }

    const { data: participants, error: pError } = await participantsQuery;

    if (pError || !participants || participants.length < 2) {
      throw new Error('Se necesitan al menos 2 participantes activos.');
    }

    if (participants.length !== requestedClubIds.length) {
      throw new Error('Uno o más equipos seleccionados no son participantes activos del torneo.');
    }

    // 3. Prepare teams for Berger
    // We use the participant IDs for the algorithm
    const teamIds = participants.map(p => p.id);
    const hasBye = teamIds.length % 2 !== 0;
    if (hasBye) {
      teamIds.push('BYE'); // Dummy for odd number of teams
    }

    const n = teamIds.length;
    const roundsPerCycle = n - 1;
    const totalRoundsNeeded = params.roundsCount || (params.homeAndAway ? roundsPerCycle * 2 : roundsPerCycle);

    // 4. Create rounds first
    const rounds: any[] = [];
    for (let i = 0; i < totalRoundsNeeded; i++) {
      const { data: round, error } = await supabase
        .from('tournament_rounds')
        .insert({
          phase_id: params.phaseId,
          season_id: seasonId,
          name: `Fecha ${i + 1}`,
          order_index: i + 1,
        })
        .select()
        .single();

      if (error) throw error;
      rounds.push(round);
    }

    // 5. Generate pairs using Berger algorithm
    const matches: any[] = [];
    for (let r = 0; r < totalRoundsNeeded; r++) {
      const roundIdxInCycle = r % roundsPerCycle;
      const roundId = rounds[r].id;
      const roundDate = addDaysToIsoDate(params.startDate, r * 7);
      const roundDateTime = combineLocalDateTimeToUtcIso(roundDate, params.matchTime || '00:00', APP_TIMEZONE);

      if (!roundDateTime) {
        throw new Error('No se pudo construir la fecha de uno de los cruces generados.');
      }

      for (let i = 0; i < n / 2; i++) {
        const homeIdx = (roundIdxInCycle + i) % (n - 1);
        let awayIdx = (n - 1 - i + roundIdxInCycle) % (n - 1);

        if (i === 0) {
          awayIdx = n - 1;
        }

        const homeId = teamIds[homeIdx];
        const awayId = teamIds[awayIdx];

        if (homeId === 'BYE' || awayId === 'BYE') continue;

        // Swap home/away for the second half if homeAndAway is true
        const isSecondHalf = r >= roundsPerCycle;
        const finalHomeId = isSecondHalf ? awayId : homeId;
        const finalAwayId = isSecondHalf ? homeId : awayId;

        // Map participant IDs back to club IDs for the matches table
        const homeClubId = participants.find(p => p.id === finalHomeId)?.club_id;
        const awayClubId = participants.find(p => p.id === finalAwayId)?.club_id;

        if (!homeClubId || !awayClubId) {
          throw new Error('No se pudieron resolver los clubes de uno o más participantes activos.');
        }

        matches.push({
          tournament_id: tournamentId,
          season_id: seasonId,
          phase_id: params.phaseId,
          round_uuid: roundId,
          group_id: params.groupId || null,
          home_club_id: homeClubId,
          away_club_id: awayClubId,
          date_time: roundDateTime,
          venue: params.venue,
          status: 'scheduled',
          score: { home: 0, away: 0 }
        });
      }
    }

    // 6. Bulk insert matches
    if (matches.length > 0) {
      const { data: insertedMatches, error } = await supabase
        .from('matches')
        .insert(matches)
        .select('id');

      if (error) throw error;
      if ((insertedMatches || []).length !== matches.length) {
        throw new Error('No se pudieron persistir todos los partidos generados.');
      }

      await this.invalidatePublicMatchesFeed(supabase, this.getMatchFeedInvalidationScopes(matches));
    }

    return true;
  }

  /**
   * Import matches from external data
   */
  static async importMatches(tournamentId: string, phaseId: string, matchesData: any[]): Promise<{ success: boolean, imported: number, skipped: number, errors: string[] }> {
    const supabase = await this.getWriteClient();
    const errors: string[] = [];
    let importedCount = 0;
    let skippedCount = 0;
    let phaseContext: PhaseContext | null = null;

    try {
      await assertTournamentNotSyncLocked(supabase, tournamentId);
      phaseContext = await this.assertPhaseBelongsToTournament(supabase, tournamentId, phaseId);
      if (isPlayoffPhaseType(phaseContext.phase_type) && matchesData.some((match) => !match.roundId)) {
        throw new Error('Todos los partidos importados en una fase playoff deben indicar una etapa de eliminacion definida.');
      }
      const roundIds = Array.from(new Set(matchesData.map((match) => match.roundId).filter(Boolean)));

      for (const roundId of roundIds) {
        await this.assertRoundBelongsToPhase(supabase, phaseId, roundId);
      }

      const clubIds = matchesData.flatMap((match) => [match.homeClubId, match.awayClubId]);
      await this.assertClubReferences(supabase, clubIds);

      for (const match of matchesData) {
        if (!match.dateTime) {
          throw new Error('Todos los partidos importados deben incluir fecha.');
        }

        if (!match.homeClubId || !match.awayClubId) {
          throw new Error('Todos los partidos importados deben tener local y visitante resueltos.');
        }

        if (match.homeClubId === match.awayClubId) {
          throw new Error('No se puede importar un partido con el mismo club en local y visitante.');
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo validar el contexto de importación.';
      console.error('[FixtureService] Import validation failed:', { tournamentId, phaseId, message });
      return {
        success: false,
        imported: 0,
        skipped: 0,
        errors: [message],
      };
    }

    // M8: idempotency — skip rows that already exist for this tournament/phase.
    // Same dedup criterion as FixtureImportService.findDuplicate: home club +
    // away club + calendar date (date_time truncated to yyyy-mm-dd).
    const dedupKey = (home: string, away: string, dateTime: unknown) =>
      `${home}|${away}|${dateTime ? String(dateTime).slice(0, 10) : ''}`;

    const existingKeys = new Set<string>();
    {
      const { data: existingMatches, error: existingError } = await supabase
        .from('matches')
        .select('home_club_id, away_club_id, date_time')
        .eq('tournament_id', tournamentId)
        .eq('phase_id', phaseId);

      if (existingError) {
        console.error('[FixtureService] Could not load existing matches for dedup:', existingError);
        return {
          success: false,
          imported: 0,
          skipped: 0,
          errors: [`No se pudieron consultar los partidos existentes para deduplicar: ${existingError.message}`],
        };
      }
      for (const row of existingMatches || []) {
        existingKeys.add(dedupKey(row.home_club_id, row.away_club_id, row.date_time));
      }
    }

    const matchesToInsert = matchesData
      .filter((m) => {
        const key = dedupKey(m.homeClubId, m.awayClubId, m.dateTime);
        if (existingKeys.has(key)) {
          skippedCount += 1;
          return false;
        }
        existingKeys.add(key); // also dedup within the incoming payload
        return true;
      })
      .map(m => ({
      tournament_id: tournamentId,
      season_id: phaseContext?.season_id ?? null,
      phase_id: phaseId,
      round_uuid: m.roundId,
      group_id: m.groupId || null,
      home_club_id: m.homeClubId,
      away_club_id: m.awayClubId,
      date_time: m.dateTime,
      venue: m.venue,
      status: m.status || 'scheduled',
      score: m.score || { home: 0, away: 0 }
    }));

    // Chunk size for bulk insert
    const chunkSize = 50;
    const importedScopeRows: MatchFeedInvalidationSource[] = [];
    for (let i = 0; i < matchesToInsert.length; i += chunkSize) {
      const chunk = matchesToInsert.slice(i, i + chunkSize);
      const { data: insertedMatches, error } = await supabase
        .from('matches')
        .insert(chunk)
        .select('id');

      if (error) {
        // M8: abort on the first failed chunk instead of continuing silently;
        // report how many rows were persisted and how many were left pending.
        console.error('[FixtureService] Error importing match chunk:', { error, chunk });
        errors.push(
          `Error al insertar lote ${Math.floor(i / chunkSize) + 1}: ${error.message}. ` +
          `Importación abortada: ${importedCount} partidos insertados, ${matchesToInsert.length - importedCount} pendientes.`
        );
        break;
      } else {
        importedCount += insertedMatches?.length || 0;
        if ((insertedMatches?.length || 0) > 0) {
          importedScopeRows.push(...chunk);
        }
        if ((insertedMatches?.length || 0) !== chunk.length) {
          errors.push(`El lote ${Math.floor(i / chunkSize) + 1} se insertó de forma incompleta.`);
        }
      }
    }

    if (importedCount > 0) {
      await this.invalidatePublicMatchesFeed(supabase, this.getMatchFeedInvalidationScopes(importedScopeRows));
    }

    return {
      success: errors.length === 0,
      imported: importedCount,
      skipped: skippedCount,
      errors
    };
  }

  /**
   * Mass reschedule all matches in a round
   */
  static async massRescheduleRound(params: MassRescheduleParams): Promise<boolean> {
    const roundId = assertUuid(params.roundId, 'roundId');
    const supabase = await this.getWriteClient();
    const invalidationScopeRows: MatchFeedInvalidationSource[] = [];

    // When changing the date, each match keeps its own time-of-day unless a
    // new time is also provided, so we must recompute date_time per row.
    // We still avoid the previous N+1: rows are grouped by their resulting
    // date_time and updated with one query per distinct value (typically 1).
    const needsPerRowReschedule = Boolean(params.newDate || (params.newTime && !params.newDate));

    if (needsPerRowReschedule) {
      const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select('id, date_time')
        .or(`round_uuid.eq.${roundId},round_id.eq.${roundId}`);

      if (matchesError) {
        console.error('Error fetching matches for reschedule:', matchesError);
        return false;
      }

      const rows = matches ?? [];
      invalidationScopeRows.push(...rows);
      const groups = new Map<string, string[]>();

      for (const match of rows) {
        let nextDate: string | null;
        let nextTime: string | null;

        if (params.newDate) {
          nextDate = params.newDate;
          nextTime = params.newTime || toInputTimeInTimeZone(match.date_time, APP_TIMEZONE) || '00:00';
        } else {
          nextDate = toInputDateInTimeZone(match.date_time, APP_TIMEZONE);
          nextTime = params.newTime!;
        }

        const nextDateTime = nextDate && nextTime
          ? combineLocalDateTimeToUtcIso(nextDate, nextTime, APP_TIMEZONE)
          : null;

        if (!nextDateTime) {
          throw new Error('No se pudo recalcular la fecha/hora de la jornada.');
        }

        const bucket = groups.get(nextDateTime) ?? [];
        bucket.push(match.id);
        groups.set(nextDateTime, bucket);
        invalidationScopeRows.push({ date_time: nextDateTime });
      }

      // One UPDATE per distinct target datetime instead of one per match.
      for (const [nextDateTime, ids] of groups) {
        const { error } = await supabase
          .from('matches')
          .update({ date_time: nextDateTime })
          .in('id', ids);

        if (error) {
          console.error('Error rescheduling matches:', error);
          return false;
        }
      }
    }

    if (!needsPerRowReschedule && params.newVenue) {
      invalidationScopeRows.push(...await this.selectMatchesForFeedInvalidationByRound(supabase, roundId));
    }

    if (params.newVenue) {
      const { error } = await supabase
        .from('matches')
        .update({ venue: params.newVenue })
        .or(`round_uuid.eq.${roundId},round_id.eq.${roundId}`);

      if (error) {
        console.error('Error updating venue:', error);
        return false;
      }
    }

    if (needsPerRowReschedule || params.newVenue) {
      await this.invalidatePublicMatchesFeed(supabase, this.getMatchFeedInvalidationScopes(invalidationScopeRows));
    }

    return true;
  }

  /**
   * Reset a round (delete all matches)
   */
  static async resetRound(roundId: string): Promise<boolean> {
    if (!isUuid(roundId)) return false;
    const supabase = await this.getWriteClient();
    const matchesForInvalidation = await this.selectMatchesForFeedInvalidationByRound(supabase, roundId);
    const invalidationScopes = this.getMatchFeedInvalidationScopes(matchesForInvalidation);

    const { error } = await supabase.from('matches').delete().or(`round_uuid.eq.${roundId},round_id.eq.${roundId}`);

    if (error) {
      console.error('Error resetting round:', error);
      return false;
    }

    // Mark round as not completed
    await supabase.from('tournament_rounds').update({ is_completed: false }).eq('id', roundId);

    await this.invalidatePublicMatchesFeed(supabase, invalidationScopes);

    return true;
  }

  /**
   * Validate fixture structure and common issues
   */
  static async validateFixture(tournamentId: string): Promise<any> {
    if (!isUuid(tournamentId)) {
      return { isValid: false, diagnostics: [{ type: 'error', message: 'tournamentId inválido.' }] };
    }
    const supabase = await getReadClient();
    const diagnostics: any[] = [];

    // Fetch all phases of the tournament (previous code used .limit(1) and
    // therefore only validated the first phase by mistake) along with all
    // their rounds in two queries instead of N+1.
    const [phasesRes, matchesRes] = await Promise.all([
      supabase
        .from('tournament_phases')
        .select('id, name, tournament_rounds(id, name)')
        .eq('tournament_id', tournamentId),
      supabase
        .from('matches')
        .select('id, round_uuid, round_id, home_club_id, away_club_id')
        .eq('tournament_id', tournamentId),
    ]);

    const matches = matchesRes.data ?? [];

    // Build a Set of round IDs that already have at least one match.
    const roundsWithMatches = new Set<string>();
    for (const m of matches) {
      const rid = this.getMatchRoundId(m);
      if (rid) roundsWithMatches.add(rid);
    }

    // 1. Rounds without matches (across ALL phases).
    for (const phase of phasesRes.data ?? []) {
      const phaseRounds = (phase as any).tournament_rounds || [];
      for (const round of phaseRounds) {
        if (!roundsWithMatches.has(round.id)) {
          diagnostics.push({
            type: 'warning',
            message: `La jornada "${round.name}" no tiene partidos programados.`,
            context: (phase as any).name,
            action: 'generate',
          });
        }
      }
    }

    // 2. Teams with multiple matches in the same round.
    const roundTeams = new Map<string, Set<string>>();
    matches.forEach((m) => {
      const roundId = this.getMatchRoundId(m);
      if (!roundId) return;
      if (!roundTeams.has(roundId)) roundTeams.set(roundId, new Set());
      const teams = roundTeams.get(roundId)!;

      if (m.home_club_id && teams.has(m.home_club_id)) {
        diagnostics.push({
          type: 'error',
          message: `Conflicto: Un equipo tiene más de un partido en la misma jornada.`,
          context: roundId,
        });
      }
      if (m.home_club_id) teams.add(m.home_club_id);

      if (m.away_club_id && teams.has(m.away_club_id)) {
        diagnostics.push({
          type: 'error',
          message: `Conflicto: Un equipo tiene más de un partido en la misma jornada.`,
          context: roundId,
        });
      }
      if (m.away_club_id) teams.add(m.away_club_id);
    });

    return {
      isValid: diagnostics.filter((d) => d.type === 'error').length === 0,
      diagnostics,
    };
  }

  // ─── MAPPERS ──────────────────────────────────────────────────────────────────

  private static mapPhase(phase: any): TournamentPhase {
    return {
      id: phase.id,
      tournamentId: phase.tournament_id,
      name: phase.name,
      phaseType: phase.phase_type,
      orderIndex: phase.order_index,
      // La fase no tiene fechas propias en la base; el rango real sale de sus jornadas.
      startDate: phase.start_date ?? null,
      endDate: phase.end_date ?? null,
      isActive: phase.is_active,
      settings: phase.settings || {},
      createdAt: phase.created_at,
      updatedAt: phase.updated_at,
    };
  }

  private static mapRound(round: any): TournamentRound {
    return {
      id: round.id,
      phaseId: round.phase_id,
      name: round.name,
      orderIndex: round.order_index,
      startDate: round.start_date,
      endDate: round.end_date,
      isCompleted: round.is_completed,
      notes: round.notes,
      createdAt: round.created_at,
      updatedAt: round.updated_at,
    };
  }

  private static mapMatch(match: any): Match {
    return {
      id: match.id,
      tournamentId: match.tournament_id,
      phaseId: match.phase_id,
      roundId: match.round_uuid ?? match.round_id ?? null,
      groupId: match.group_id || null,
      referee: match.referee ?? null,
      pitch: match.pitch ?? null,
      homeClubId: match.home_club_id,
      awayClubId: match.away_club_id,
      homeSquadId: match.home_division_id ?? null,
      awaySquadId: match.away_division_id ?? null,
      category: match.category ?? null,
      dateTime: match.date_time,
      venue: match.venue || null,
      status: match.status,
      score: match.score || { home: 0, away: 0 },
      clock: match.clock ?? null,
      notes: match.notes,
      streamUrl: match.stream_url ?? match.broadcast_url ?? null,
      replayUrl: match.replay_url ?? null,
      homeBasePoints: match.home_base_points ?? null,
      awayBasePoints: match.away_base_points ?? null,
      homeBonusPoints: match.home_bonus_points ?? null,
      awayBonusPoints: match.away_bonus_points ?? null,
      pointsAutocalculated: match.points_autocalculated ?? null,
      pointsOverrideReason: match.points_override_reason ?? null,
      roundLabel: match.round_label || null,
      createdAt: match.created_at,
      updatedAt: match.updated_at,
      lineups: match.lineups,
      events: match.events,
    };
  }

  private static mapMatchWithClubs(match: any, clubLogos?: Map<string, string | null>): MatchWithClubs {
    return {
      ...this.mapMatch(match),
      tournament: match.tournament
        ? {
          id: match.tournament.id,
          name: match.tournament.name,
          logo: match.tournament.logo ?? null,
        }
        : null,
      homeClub: match.home_club
        ? {
          id: match.home_club.id,
          name: match.home_club.name,
          shortName: match.home_club.short_name,
          logo: match.home_club.logo ?? clubLogos?.get(match.home_club.id) ?? null,
        }
        : null,
      awayClub: match.away_club
        ? {
          id: match.away_club.id,
          name: match.away_club.name,
          shortName: match.away_club.short_name,
          logo: match.away_club.logo ?? clubLogos?.get(match.away_club.id) ?? null,
        }
        : null,
    };
  }

  private static mapParticipant(p: any): any {
    const clubData = Array.isArray(p.clubs) ? p.clubs[0] : p.clubs;
    return {
      id: p.id,
      clubId: p.club_id,
      name: p.name,
      shortCode: p.short_code,
      logo: clubData?.logo_url || null,
    };
  }
}
