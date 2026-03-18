import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TOURNAMENT_ID = '55f28144-3d92-484b-a57d-646e06740808';
const PHASE_ID = 'b4a7d7e2-7436-43ad-a11b-59d514171b3d';

async function repair() {
  console.log(`Starting repair for tournament ${TOURNAMENT_ID}...`);

  // 1. Ensure Phase exists
  const { data: phase, error: phaseError } = await supabase
    .from('tournament_phases')
    .select('*')
    .eq('id', PHASE_ID)
    .single();

  if (phaseError || !phase) {
    console.error('Phase not found:', phaseError);
    return;
  }
  console.log(`Found phase: ${phase.name}`);

  // 2. Create Default Group if none exist for this phase
  let groupId: string;
  const { data: existingGroups } = await supabase
    .from('tournament_groups')
    .select('id')
    .eq('phase_id', PHASE_ID)
    .limit(1);

  if (existingGroups && existingGroups.length > 0) {
    groupId = existingGroups[0].id;
    console.log(`Group already exists: ${groupId}`);
  } else {
    console.log('Creating default group...');
    const { data: newGroup, error: groupError } = await supabase
      .from('tournament_groups')
      .insert({
        phase_id: PHASE_ID,
        name: 'Grupo Único',
        order_index: 1
      })
      .select()
      .single();

    if (groupError) {
      console.error('Error creating group:', groupError);
      return;
    }
    groupId = newGroup.id;
    console.log(`Created group: ${groupId}`);
  }

  // 3. Get all matches for this tournament
  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('id, date_time')
    .eq('tournament_id', TOURNAMENT_ID)
    .order('date_time', { ascending: true });

  if (matchesError || !matches) {
    console.error('Error fetching matches:', matchesError);
    return;
  }
  console.log(`Found ${matches.length} matches to process.`);

  // 4. Generate Rounds based on unique dates
  // We'll group matches by date and create a round for each unique date if they don't exist
  const uniqueDates = Array.from(new Set(matches.map(m => m.date_time?.split('T')[0]).filter(Boolean))).sort();
  console.log(`Found ${uniqueDates.length} unique match dates.`);

  const roundMap = new Map<string, string>(); // date -> round_uuid

  for (let i = 0; i < uniqueDates.length; i++) {
    const dateStr = uniqueDates[i];
    const roundName = `Fecha ${i + 1}`;
    
    // Check if round already exists for this phase and name
    const { data: existingRound } = await supabase
      .from('tournament_rounds')
      .select('id')
      .eq('phase_id', PHASE_ID)
      .eq('name', roundName)
      .single();

    if (existingRound) {
      roundMap.set(dateStr, existingRound.id);
      console.log(`Round ${roundName} already exists: ${existingRound.id}`);
    } else {
      const { data: newRound, error: roundError } = await supabase
        .from('tournament_rounds')
        .insert({
          phase_id: PHASE_ID,
          name: roundName,
          order_index: i + 1,
          start_date: dateStr,
          end_date: dateStr
        })
        .select()
        .single();

      if (roundError) {
        console.error(`Error creating round ${roundName}:`, roundError);
        continue;
      }
      roundMap.set(dateStr, newRound.id);
      console.log(`Created round ${roundName}: ${newRound.id}`);
    }
  }

  // 5. Update matches with group_id and round_uuid
  console.log('Updating matches...');
  let updatedCount = 0;
  for (const match of matches) {
    const matchDate = match.date_time?.split('T')[0];
    const roundUuid = matchDate ? roundMap.get(matchDate) : null;

    if (!roundUuid) {
      console.warn(`No round found for match ${match.id} with date ${match.date_time}`);
    }

    const { error: updateError } = await supabase
      .from('matches')
      .update({
        group_id: groupId,
        round_uuid: roundUuid || null
      })
      .eq('id', match.id);

    if (updateError) {
      console.error(`Error updating match ${match.id}:`, updateError);
    } else {
      updatedCount++;
    }
  }

  console.log(`Repair complete. Updated ${updatedCount}/${matches.length} matches.`);
}

repair();
