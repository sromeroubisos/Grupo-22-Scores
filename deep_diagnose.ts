
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TOURNAMENT_ID = '55f28144-3d92-484b-a57d-646e06740808';

async function diagnoseDeep() {
  console.log('--- Deep Diagnostic ---');

  // 1. Check Participants
  const { data: participants, error: pError } = await supabase
    .from('tournament_participants')
    .select('*, clubs(*)')
    .eq('tournament_id', TOURNAMENT_ID);

  console.log(`Participants found: ${participants?.length || 0}`);
  if (pError) console.error('Error fetching participants:', pError);

  // 2. Check a sample of matches with full joins as the UI might do
  const { data: matches, error: mError } = await supabase
    .from('matches')
    .select(`
      *,
      tournament_groups(*),
      tournament_rounds(*),
      home_team:clubs!home_team_id(*),
      away_team:clubs!away_team_id(*)
    `)
    .eq('tournament_id', TOURNAMENT_ID)
    .limit(5);

  console.log(`Sample matches with joins: ${matches?.length || 0}`);
  if (mError) console.error('Error fetching matches with joins:', mError);
  
  if (matches && matches.length > 0) {
      console.log('Sample match 0 home_team_id:', matches[0].home_team_id);
      console.log('Sample match 0 away_team_id:', matches[0].away_team_id);
      console.log('Sample match 0 home_team resolved:', !!matches[0].home_team);
      console.log('Sample match 0 away_team resolved:', !!matches[0].away_team);
  }

  const result = {
    participants: participants || [],
    sample_matches_with_joins: matches || [],
    participant_error: pError,
    match_error: mError
  };

  fs.writeFileSync('deep_diagnosis.json', JSON.stringify(result, null, 2));
  console.log('Results saved to deep_diagnosis.json');
}

diagnoseDeep();
