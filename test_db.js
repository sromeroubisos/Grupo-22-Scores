const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const tournamentId = '55f28144-3d92-484b-a57d-646e06740808';
  
  console.log('Querying matches for tournament:', tournamentId);
  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, round_id, phase_id')
    .eq('tournament_id', tournamentId);
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Matches count:', matches.length);
  if (matches.length > 0) {
    console.log('First match:', matches[0]);
  }
  
  const roundsWithNullPhase = await supabase
    .from('tournament_rounds')
    .select('id, name')
    .is('phase_id', null);
    
  console.log('Rounds with NULL phase_id:', roundsWithNullPhase.data?.length || 0);

  const roundsCount = await supabase
    .from('tournament_rounds')
    .select('id', { count: 'exact', head: true });
  console.log('Total rounds in DB:', roundsCount.count);
}

test();
