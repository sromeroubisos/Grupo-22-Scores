import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function linkMatches() {
  const tournamentId = '55f28144-3d92-484b-a57d-646e06740808';
  const phaseId = 'b4a7d7e2-7436-43ad-a11b-59d514171b3d';

  console.log('--- LINKING MATCHES TO ROUNDS ---');

  // 1. Fetch rounds
  const { data: rounds, error: rErr } = await supabase
    .from('tournament_rounds')
    .select('id, name, start_date')
    .eq('phase_id', phaseId)
    .order('order_index', { ascending: true });

  if (rErr) {
    console.error('Error fetching rounds:', rErr);
    return;
  }

  console.log(`Found ${rounds.length} rounds.`);

  // Create a map of date -> roundId
  const dateToRoundId = new Map<string, string>();
  rounds.forEach(r => {
    if (r.start_date) {
      const dateKey = r.start_date.split('T')[0];
      dateToRoundId.set(dateKey, r.id);
    }
  });

  // 2. Fetch matches
  const { data: matches, error: mErr } = await supabase
    .from('matches')
    .select('id, date_time, round_id')
    .eq('tournament_id', tournamentId);

  if (mErr) {
    console.error('Error fetching matches:', mErr);
    return;
  }

  console.log(`Found ${matches.length} matches in tournament.`);

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const match of matches) {
    const matchDateKey = match.date_time.split('T')[0];
    const targetRoundId = dateToRoundId.get(matchDateKey);

    if (targetRoundId) {
      if (match.round_id === targetRoundId) {
        skippedCount++;
        continue;
      }

      const { error: uErr } = await supabase
        .from('matches')
        .update({ round_id: targetRoundId })
        .eq('id', match.id);

      if (uErr) {
        console.error(`Error updating match ${match.id}:`, uErr);
        errorCount++;
      } else {
        updatedCount++;
      }
    } else {
      console.warn(`No round found for match ${match.id} on date ${matchDateKey}`);
      skippedCount++;
    }
  }

  console.log('--- REPAIR COMPLETE ---');
  console.log(`Updated: ${updatedCount}`);
  console.log(`Skipped: ${skippedCount} (already linked or no date match)`);
  console.log(`Errors: ${errorCount}`);
}

linkMatches();
