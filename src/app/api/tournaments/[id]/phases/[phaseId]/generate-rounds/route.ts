import { NextRequest, NextResponse } from 'next/server';
import { invalidateMatchesFeedCaches } from '@/lib/server/matchesFeedInvalidation';
import { createClient } from '@/lib/supabase/server';

// POST generate rounds for a phase
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string, phaseId: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: tournamentId, phaseId } = await params;
    const body = await request.json();

    const namePattern = body.name_pattern || 'Fecha {n}';

    // 1. Fetch phase details
    const { data: phase, error: phaseError } = await supabase
      .from('tournament_phases')
      .select('phase_type, settings')
      .eq('id', phaseId)
      .single();

    if (phaseError || !phase) {
      return NextResponse.json({ error: 'Phase not found' }, { status: 404 });
    }

    if (phase.phase_type === 'league') {
      // Math for League format using Berger algorithm
      const { data: participants, error: participantsError } = await supabase
        .from('tournament_participants')
        .select('club_id')
        .eq('tournament_id', tournamentId)
        .eq('status', 'active');

      if (participantsError || !participants || participants.length === 0) {
        return NextResponse.json({ error: 'No active participants found in this tournament' }, { status: 400 });
      }

      const clubs = participants.map((p: any) => p.club_id);
      const isOdd = clubs.length % 2 !== 0;
      if (isOdd) {
        clubs.push(null); // Dummy team for byes
      }

      const N = clubs.length;
      const legs = phase.settings?.legs || 1;
      const roundsPerLeg = N - 1;

      // Build Berger Table
      const matchSlots: { roundNum: number; home: string | null; away: string | null }[] = [];
      const tempClubs = [...clubs];

      for (let r = 0; r < roundsPerLeg; r++) {
        for (let i = 0; i < N / 2; i++) {
          let home = tempClubs[i];
          let away = tempClubs[N - 1 - i];

          // Standard Berger: Fixed team 0 alternates home/away
          if (i === 0 && r % 2 === 1) {
            home = tempClubs[N - 1 - i];
            away = tempClubs[i];
          }

          if (home !== null && away !== null) {
            matchSlots.push({ roundNum: r + 1, home, away });
          }
        }
        // Rotate: first element remains fixed, others rotate clockwise
        tempClubs.splice(1, 0, tempClubs.pop()!);
      }

      // Add second leg if needed
      if (legs === 2) {
        const firstLegMatches = [...matchSlots];
        firstLegMatches.forEach(m => {
          matchSlots.push({
            roundNum: m.roundNum + roundsPerLeg,
            home: m.away, // Inverted for second leg
            away: m.home
          });
        });
      }

      const totalRounds = roundsPerLeg * legs;

      // Create Rounds & Matches
      let createdRoundsCount = 0;
      const createdRounds = [];

      for (let r = 1; r <= totalRounds; r++) {
        // Create Round
        const { data: round, error: roundError } = await supabase
          .from('tournament_rounds')
          .insert({
            phase_id: phaseId,
            name: namePattern.replace('{n}', r.toString()),
            order_index: r
          })
          .select()
          .single();

        if (roundError || !round) {
          console.error(`Error creating round ${r}:`, roundError);
          continue;
        }

        createdRounds.push(round);
        createdRoundsCount++;

        // Get matches for this round
        const matchesForRound = matchSlots.filter(m => m.roundNum === r);

        // Insert Matches
        if (matchesForRound.length > 0) {
          const matchesToInsert = matchesForRound.map(m => ({
            tournament_id: tournamentId,
            phase_id: phaseId,
            round_uuid: round.id,
            home_club_id: m.home,
            away_club_id: m.away,
            status: 'scheduled',
            score: { home: 0, away: 0 }
          }));

          const { error: matchInsertError } = await supabase
            .from('matches')
            .insert(matchesToInsert);

          if (matchInsertError) {
            console.error(`Error inserting matches for round ${r}:`, matchInsertError);
          }
        }
      }

      await invalidateMatchesFeedCaches();

      return NextResponse.json({ data: createdRounds, count: createdRoundsCount }, { status: 201 });

    } else {
      // Fallback for non-league phases using original RPC
      const numRounds = body.num_rounds || 7;
      const { error } = await supabase.rpc('generate_rounds_for_phase', {
        p_phase_id: phaseId,
        p_num_rounds: numRounds,
        p_name_pattern: namePattern,
      });

      if (error) {
        return NextResponse.json({ error: 'Error generating rounds: ' + error.message }, { status: 500 });
      }

      const { data: rounds, error: fetchError } = await supabase
        .from('tournament_rounds')
        .select('*')
        .eq('phase_id', phaseId)
        .order('order_index', { ascending: true });

      if (fetchError) {
        return NextResponse.json({ error: 'Rounds created but error fetching them' }, { status: 500 });
      }

      return NextResponse.json({ data: rounds || [], count: rounds?.length || 0 }, { status: 201 });
    }
  } catch (error: any) {
    console.error('Error in POST generate-rounds:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
