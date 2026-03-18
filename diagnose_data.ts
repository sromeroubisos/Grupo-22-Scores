import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);
const tournamentId = '55f28144-3d92-484b-a57d-646e06740808';

async function diagnose() {
  const results: any = { tournamentId };

  // 1. Phases
  const { data: phases } = await supabase
    .from('tournament_phases')
    .select('*')
    .eq('tournament_id', tournamentId);
  results.phases = phases;

  // 2. Groups
  const { data: groups } = await supabase
    .from('tournament_groups')
    .select('*')
    .in('phase_id', phases?.map(p => p.id) || []);
  results.groups = groups;

  // 3. Rounds
  const { data: rounds } = await supabase
    .from('tournament_rounds')
    .select('*')
    .in('phase_id', phases?.map(p => p.id) || []);
  results.rounds = rounds;

  // 4. Matches
  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .eq('tournament_id', tournamentId);
  
  results.matches = matches?.map(m => ({
    id: m.id,
    phase_id: m.phase_id,
    group_id: m.group_id,
    round_uuid: m.round_uuid,
    home_club_id: m.home_club_id,
    away_club_id: m.away_club_id,
    has_valid_phase: phases?.some(p => p.id === m.phase_id) ?? false,
    has_valid_group: groups?.some(g => g.id === m.group_id) ?? false,
    has_valid_round: rounds?.some(r => r.id === m.round_uuid) ?? false
  }));

  fs.writeFileSync('diagnosis_utf8.json', JSON.stringify(results, null, 2), 'utf8');
  console.log('Diagnosis written to diagnosis_utf8.json');
}

diagnose();
