/**
 * Fixture Service
 * Backend service for managing tournament fixtures
 */

import { createClient } from '@/lib/supabase/server';
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
  ResetRoundParams,
  FixtureGenerationParams,
  MassRescheduleParams,
} from '@/lib/types/fixture';

export class FixtureService {
  private static _supportsRoundLabel: boolean | null = null;

  /**
   * Check if the round_label column exists in the matches table.
   * Caches the result to avoid redundant queries.
   */
  static async checkRoundLabelSupport(): Promise<boolean> {
    if (this._supportsRoundLabel !== null) return this._supportsRoundLabel;

    try {
      const supabase = await createClient();
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

  /**
   * Get complete fixture structure for a tournament
   */
  static async getTournamentFixture(tournamentId: string): Promise<TournamentFixture | null> {
    const supabase = await createClient();

    // 1. Get tournament info (FIX: removed non-existent 'season' column)
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, name')
      .eq('id', tournamentId)
      .single();

    if (tournamentError || !tournament) {
      console.error(`[FixtureService] Tournament not found for ID: ${tournamentId}`, tournamentError);
      return null;
    }

    console.log(`[FixtureService] Tournament found: ${tournament.name}`);

    // 2. Get phases
    const { data: phases, error: phasesError } = await supabase
      .from('tournament_phases')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('order_index', { ascending: true });

    if (phasesError) {
      console.error(`[FixtureService] Error fetching phases for tournament ${tournamentId}:`, phasesError);
      return null;
    }

    // 3. Get ALL rounds for this tournament to avoid N+1
    const { data: allRounds, error: roundsError } = await supabase
      .from('tournament_rounds')
      .select('*')
      .in('phase_id', (phases || []).map(p => p.id))
      .order('order_index', { ascending: true });

    if (roundsError) {
      console.error('[FixtureService] Error fetching all rounds:', roundsError);
    }

    // 4. Get ALL matches for this tournament directly by tournament_id
    // This captures even "orphaned" matches and is much more efficient.
    const { data: allMatches, error: matchesError } = await supabase
      .from('matches')
      .select(`
        *,
        home_club:clubs!matches_home_club_id_fkey(id, name, short_name, logo:logo_url),
        away_club:clubs!matches_away_club_id_fkey(id, name, short_name, logo:logo_url)
      `)
      .eq('tournament_id', tournamentId)
      .order('date_time', { ascending: true });

    if (matchesError) {
      console.error('[FixtureService] Error fetching all matches:', matchesError);
    }

    // 5. Get participants
    const { data: participants, error: participantsError } = await supabase
      .from('tournament_participants')
      .select('id, club_id, name, short_code, clubs:club_id(logo_url)')
      .eq('tournament_id', tournamentId)
      .eq('status', 'active');

    if (participantsError) {
      console.error('Error fetching participants:', participantsError);
    }

    // 6. Map everything together in-memory
    const mappedMatches = (allMatches || []).map(m => this.mapMatchWithClubs(m));
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
      tournamentSeason: null, // Season field removed from DB
      currentPhaseId: currentPhase?.id || null,
      currentRoundId: currentRound?.id || null,
      phases: phasesWithRounds,
      participants: (participants || []).map(p => this.mapParticipant(p)),
    };
  }

  /**
   * Get rounds for a specific phase with their matches
   */
  static async getRoundsForPhase(phaseId: string): Promise<RoundWithMatches[] | null> {
    const supabase = await createClient();

    const { data: rounds, error: roundsError } = await supabase
      .from('tournament_rounds')
      .select('*')
      .eq('phase_id', phaseId)
      .order('order_index', { ascending: true });

    if (roundsError) {
      console.error('Error fetching rounds:', roundsError);
      return null;
    }

    const roundsWithMatches: RoundWithMatches[] = await Promise.all(
      (rounds || []).map(async (round) => {
        const matches = await this.getMatchesForRound(round.id);
        return {
          ...this.mapRound(round),
          matches: matches || [],
          matchCount: matches?.length || 0,
        };
      })
    );

    return roundsWithMatches;
  }

  /**
   * Get a specific match by ID with club details
   */
  static async getMatch(matchId: string): Promise<MatchWithClubs | null> {
    const supabase = await createClient();

    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('*, home_club:clubs!matches_home_club_id_fkey(id, name, short_name, logo:logo_url), away_club:clubs!matches_away_club_id_fkey(id, name, short_name, logo:logo_url), tournament:tournaments(id, name)')
      .eq('id', matchId)
      .single();

    if (matchError || !match) {
      console.error('Error fetching match:', matchError);
      return null;
    }

    return this.mapMatchWithClubs(match);
  }

  /**
   * Get matches for a specific round
   */
  static async getMatchesForRound(roundId: string): Promise<MatchWithClubs[] | null> {
    const supabase = await createClient();

    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select(`
        *,
        home_club:clubs!matches_home_club_id_fkey(id, name, short_name, logo:logo_url),
        away_club:clubs!matches_away_club_id_fkey(id, name, short_name, logo:logo_url)
      `)
      .eq('round_id', roundId)
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

    const supabase = await createClient();

    // 1. Try to find existing round with this name in this phase
    const { data: existing, error: findError } = await supabase
      .from('tournament_rounds')
      .select('id')
      .eq('phase_id', phaseId)
      .eq('name', roundLabel)
      .maybeSingle();

    if (existing) return existing.id;

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

    const { data: newRound, error: createError } = await supabase
      .from('tournament_rounds')
      .insert({
        phase_id: phaseId,
        name: roundLabel,
        order_index: nextOrder,
        status: 'draft'
      })
      .select('id')
      .single();

    if (createError) {
      console.error('[FixtureService] Error creating round automatically:', createError);
      return null;
    }

    return newRound.id;
  }

  /**
   * Create a new match
   */
  static async createMatch(data: MatchFormData & { tournamentId: string }): Promise<Match | null> {
    const supabase = await createClient();

    // Validation: teams must be different
    if (data.homeClubId === data.awayClubId) {
      throw new Error('El equipo local y el visitante no pueden ser el mismo.');
    }

    const [supportsRoundLabel] = await Promise.all([
      this.checkRoundLabelSupport()
    ]);
    console.log(`[FixtureService] createMatch - round_label: ${supportsRoundLabel}`);

    // Automated Round Management: if roundId is missing but label exists, find or create it.
    let finalRoundId = data.roundId;
    if (!finalRoundId && data.phaseId && data.roundLabel) {
      console.log(`[FixtureService] Attempting to find/create round for label: ${data.roundLabel}`);
      finalRoundId = await this.findOrCreateRound(data.phaseId, data.roundLabel);
    }

    // Fallback: If no roundId and no roundLabel was provided, but we have a phase,
    // explicitly assign it to "Fecha 1" or the first available round to ensure it's not orphaned entirely by the UI grouping
    if (!finalRoundId && data.phaseId && !data.roundLabel) {
      console.log(`[FixtureService] No round provided. Auto-assigning to default round 'Fecha 1'.`);
      finalRoundId = await this.findOrCreateRound(data.phaseId, 'Fecha 1');
    }

    // Explicit whitelist for base columns strictly matching public.matches
    const insertData: any = {
      phase_id: data.phaseId,
      group_id: data.groupId || null,
      referee: data.referee || null,
      pitch: data.pitch || null,
      tournament_id: data.tournamentId,
      round_id: finalRoundId,
      home_club_id: data.homeClubId,
      away_club_id: data.awayClubId,
      date_time: data.dateTime,
      venue: data.venue,
      status: data.status,
      notes: data.notes || null,
      stream_url: data.streamUrl || null,
      replay_url: data.replayUrl || null,
      score: data.score || { home: 0, away: 0 },
      live_enabled: data.status === 'live',
    };

    if (supportsRoundLabel) {
      insertData.round_label = data.roundLabel || null;
    }

    const { data: match, error } = await supabase
      .from('matches')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error creating match:', error);
      throw new Error(error.message);
    }

    return this.mapMatch(match);
  }

  /**
   * Update a match
   */
  static async updateMatch(matchId: string, data: Partial<MatchFormData>): Promise<Match | null> {
    const supabase = await createClient();

    // Validation: teams must be different
    if (data.homeClubId && data.awayClubId && data.homeClubId === data.awayClubId) {
      throw new Error('El equipo local y el visitante no pueden ser el mismo.');
    }

    const [supportsRoundLabel] = await Promise.all([
      this.checkRoundLabelSupport()
    ]);
    console.log(`[FixtureService] updateMatch - round_label: ${supportsRoundLabel}`);

    const updateData: any = {};

    // Automated Round Management for updates
    if (!data.roundId && data.phaseId && data.roundLabel) {
      updateData.round_id = await this.findOrCreateRound(data.phaseId, data.roundLabel);
    } else if (data.roundId) {
      updateData.round_id = data.roundId;
    }

    if (data.homeClubId) updateData.home_club_id = data.homeClubId;
    if (data.awayClubId) updateData.away_club_id = data.awayClubId;
    if (data.dateTime) updateData.date_time = data.dateTime;
    if (data.venue) updateData.venue = data.venue;
    if (data.status) {
      updateData.status = data.status;
      if (data.status === 'live') updateData.live_enabled = true;
    }

    if (supportsRoundLabel && data.roundLabel !== undefined) {
      updateData.round_label = data.roundLabel;
    }

    if (data.phaseId) updateData.phase_id = data.phaseId;
    if (data.groupId !== undefined) updateData.group_id = data.groupId;
    if (data.referee !== undefined) updateData.referee = data.referee;
    if (data.pitch !== undefined) updateData.pitch = data.pitch;
    if (data.streamUrl !== undefined) updateData.stream_url = data.streamUrl;
    if (data.replayUrl !== undefined) updateData.replay_url = data.replayUrl;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.score) updateData.score = data.score;
    if (data.lineups !== undefined) updateData.lineups = data.lineups;
    if (data.events !== undefined) updateData.events = data.events;

    const { data: match, error } = await supabase
      .from('matches')
      .update(updateData)
      .eq('id', matchId)
      .select()
      .single();

    if (error) {
      console.error('Error updating match:', error);
      throw new Error(error.message);
    }

    return this.mapMatch(match);
  }

  /**
   * Delete a match
   */
  static async deleteMatch(matchId: string): Promise<boolean> {
    const supabase = await createClient();

    const { error } = await supabase.from('matches').delete().eq('id', matchId);

    if (error) {
      console.error('Error deleting match:', error);
      return false;
    }

    return true;
  }

  /**
   * Create a new round
   */
  static async createRound(data: RoundFormData): Promise<TournamentRound | null> {
    const supabase = await createClient();

    const { data: round, error } = await supabase
      .from('tournament_rounds')
      .insert({
        phase_id: data.phaseId,
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
    const supabase = await createClient();

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
    const supabase = await createClient();

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
    const supabase = await createClient();

    const { data: phase, error } = await supabase
      .from('tournament_phases')
      .insert({
        tournament_id: data.tournamentId,
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
    const supabase = await createClient();

    const { error } = await supabase.rpc('generate_rounds_for_phase', {
      p_phase_id: phaseId,
      p_num_rounds: numRounds,
      p_name_pattern: namePattern,
    });

    if (error) {
      console.error('Error generating rounds:', error);
      return false;
    }

    return true;
  }

  /**
   * Generate Round-Robin (Berger) matches for a phase
   */
  static async generateMatchesForPhase(params: FixtureGenerationParams): Promise<boolean> {
    const supabase = await createClient();

    // 1. Get participants to ensure fresh data and get club_ids
    const { data: participants, error: pError } = await supabase
      .from('tournament_participants')
      .select('id, club_id')
      .in('id', params.clubIds)
      .eq('status', 'active');

    if (pError || !participants || participants.length < 2) {
      throw new Error('Se necesitan al menos 2 participantes activos.');
    }

    // 2. Prepare teams for Berger
    // We use the participant IDs for the algorithm
    const teamIds = participants.map(p => p.id);
    const hasBye = teamIds.length % 2 !== 0;
    if (hasBye) {
      teamIds.push('BYE'); // Dummy for odd number of teams
    }

    const n = teamIds.length;
    const roundsPerCycle = n - 1;
    const totalRoundsNeeded = params.roundsCount || (params.homeAndAway ? roundsPerCycle * 2 : roundsPerCycle);

    // 3. Create rounds first
    const rounds: any[] = [];
    for (let i = 0; i < totalRoundsNeeded; i++) {
      const { data: round, error } = await supabase
        .from('tournament_rounds')
        .insert({
          phase_id: params.phaseId,
          name: `Fecha ${i + 1}`,
          order_index: i + 1,
        })
        .select()
        .single();

      if (error) throw error;
      rounds.push(round);
    }

    // 4. Generate pairs using Berger algorithm
    const matches: any[] = [];
    const baseDate = new Date(params.startDate);
    const [hours, minutes] = (params.matchTime || '00:00').split(':').map(Number);
    baseDate.setHours(hours || 0, minutes || 0, 0, 0);

    // Get tournament_id for matches
    const { data: phaseData } = await supabase
      .from('tournament_phases')
      .select('tournament_id')
      .eq('id', params.phaseId)
      .single();

    const tournamentId = phaseData?.tournament_id;

    for (let r = 0; r < totalRoundsNeeded; r++) {
      const roundIdxInCycle = r % roundsPerCycle;
      const roundId = rounds[r].id;
      const roundDate = new Date(baseDate);
      roundDate.setDate(baseDate.getDate() + (r * 7)); // Default: 1 round per week

      for (let i = 0; i < n / 2; i++) {
        let homeIdx = (roundIdxInCycle + i) % (n - 1);
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

        matches.push({
          tournament_id: tournamentId,
          round_id: roundId,
          home_club_id: homeClubId,
          away_club_id: awayClubId,
          date_time: roundDate.toISOString(),
          venue: params.venue,
          status: 'scheduled',
          score: { home: 0, away: 0 }
        });
      }
    }

    // 5. Bulk insert matches
    if (matches.length > 0) {
      const { error } = await supabase.from('matches').insert(matches);
      if (error) throw error;
    }

    return true;
  }

  /**
   * Import matches from external data
   */
  static async importMatches(tournamentId: string, phaseId: string, matchesData: any[]): Promise<{ success: boolean, imported: number, errors: string[] }> {
    const supabase = await createClient();
    const errors: string[] = [];
    let importedCount = 0;

    const matchesToInsert = matchesData.map(m => ({
      tournament_id: tournamentId,
      round_id: m.roundId,
      home_club_id: m.homeClubId,
      away_club_id: m.awayClubId,
      date_time: m.dateTime,
      venue: m.venue,
      status: m.status || 'scheduled',
      score: m.score || { home: 0, away: 0 }
    }));

    // Chunk size for bulk insert
    const chunkSize = 50;
    for (let i = 0; i < matchesToInsert.length; i += chunkSize) {
      const chunk = matchesToInsert.slice(i, i + chunkSize);
      const { error } = await supabase.from('matches').insert(chunk);
      if (error) {
        errors.push(`Error al insertar lote ${Math.floor(i / chunkSize) + 1}: ${error.message}`);
      } else {
        importedCount += chunk.length;
      }
    }

    return {
      success: errors.length === 0,
      imported: importedCount,
      errors
    };
  }

  /**
   * Mass reschedule all matches in a round
   */
  static async massRescheduleRound(params: MassRescheduleParams): Promise<boolean> {
    const supabase = await createClient();

    if (params.newDate) {
      const { data: matches } = await supabase
        .from('matches')
        .select('id, date_time')
        .eq('round_id', params.roundId);

      if (matches) {
        for (const match of matches) {
          const existingDate = new Date(match.date_time);
          const [hours, minutes] = params.newTime
            ? params.newTime.split(':').map(Number)
            : [existingDate.getHours(), existingDate.getMinutes()];

          const newDate = new Date(params.newDate);
          newDate.setHours(hours, minutes);

          await supabase
            .from('matches')
            .update({ date_time: newDate.toISOString() })
            .eq('id', match.id);
        }
      }
    } else if (params.newTime) {
      const { data: matches } = await supabase
        .from('matches')
        .select('id, date_time')
        .eq('round_id', params.roundId);

      if (matches) {
        for (const match of matches) {
          const existingDate = new Date(match.date_time);
          const [hours, minutes] = params.newTime.split(':').map(Number);
          existingDate.setHours(hours, minutes);

          await supabase
            .from('matches')
            .update({ date_time: existingDate.toISOString() })
            .eq('id', match.id);
        }
      }
    }

    if (params.newVenue) {
      const { error } = await supabase
        .from('matches')
        .update({ venue: params.newVenue })
        .eq('round_id', params.roundId);

      if (error) {
        console.error('Error updating venue:', error);
        return false;
      }
    }

    return true;
  }

  /**
   * Reset a round (delete all matches)
   */
  static async resetRound(roundId: string): Promise<boolean> {
    const supabase = await createClient();

    const { error } = await supabase.from('matches').delete().eq('round_id', roundId);

    if (error) {
      console.error('Error resetting round:', error);
      return false;
    }

    // Mark round as not completed
    await supabase.from('tournament_rounds').update({ is_completed: false }).eq('id', roundId);

    return true;
  }

  /**
   * Validate fixture structure and common issues
   */
  static async validateFixture(tournamentId: string): Promise<any> {
    const supabase = await createClient();
    const diagnostics: any[] = [];

    // 1. Check for rounds without matches
    const { data: rounds } = await supabase
      .from('tournament_rounds')
      .select('id, name, phase_id, tournament_phases(name)')
      .eq('phase_id', (await supabase.from('tournament_phases').select('id').eq('tournament_id', tournamentId).limit(1).single()).data?.id); // Simplified

    if (rounds) {
      for (const round of rounds) {
        const { count } = await supabase
          .from('matches')
          .select('*', { count: 'exact', head: true })
          .eq('round_uuid', round.id);

        if (count === 0) {
          diagnostics.push({
            type: 'warning',
            message: `La jornada "${round.name}" no tiene partidos programados.`,
            context: (round as any).tournament_phases?.name,
            action: 'generate'
          });
        }
      }
    }

    // 2. Check for teams with multiple matches in same round
    const { data: matches } = await supabase
      .from('matches')
      .select('id, round_uuid, home_club_id, away_club_id')
      .eq('tournament_id', tournamentId);

    if (matches) {
      const roundTeams = new Map<string, Set<string>>();
      matches.forEach(m => {
        if (!roundTeams.has(m.round_uuid)) roundTeams.set(m.round_uuid, new Set());
        const teams = roundTeams.get(m.round_uuid)!;

        if (teams.has(m.home_club_id)) {
          diagnostics.push({
            type: 'error',
            message: `Conflicto: Un equipo tiene más de un partido en la misma jornada.`,
            context: m.round_uuid
          });
        }
        teams.add(m.home_club_id);

        if (teams.has(m.away_club_id)) {
          diagnostics.push({
            type: 'error',
            message: `Conflicto: Un equipo tiene más de un partido en la misma jornada.`,
            context: m.round_uuid
          });
        }
        teams.add(m.away_club_id);
      });
    }

    return {
      isValid: diagnostics.filter(d => d.type === 'error').length === 0,
      diagnostics
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
      startDate: phase.start_date,
      endDate: phase.end_date,
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
      roundId: match.round_id,
      groupId: match.group_id || null,
      homeClubId: match.home_club_id,
      awayClubId: match.away_club_id,
      dateTime: match.date_time,
      venue: match.venue || null,
      status: match.status,
      referee: match.referee || null,
      pitch: match.pitch || null,
      score: match.score || { home: 0, away: 0 },
      notes: match.notes,
      roundLabel: match.round_label || null,
      streamUrl: match.stream_url || null,
      replayUrl: match.replay_url || null,
      liveEnabled: match.live_enabled,
      createdAt: match.created_at,
      updatedAt: match.updated_at,
      lineups: match.lineups,
      events: match.events,
    };
  }

  private static mapMatchWithClubs(match: any): MatchWithClubs {
    return {
      ...this.mapMatch(match),
      homeClub: match.home_club
        ? {
          id: match.home_club.id,
          name: match.home_club.name,
          shortName: match.home_club.short_name,
          logo: match.home_club.logo,
        }
        : null,
      awayClub: match.away_club
        ? {
          id: match.away_club.id,
          name: match.away_club.name,
          shortName: match.away_club.short_name,
          logo: match.away_club.logo,
        }
        : null,
    };
  }

  private static mapParticipant(p: any): any {
    return {
      id: p.id,
      clubId: p.club_id,
      name: p.name,
      shortCode: p.short_code,
      logo: p.clubs?.logo_url || null,
    };
  }
}
