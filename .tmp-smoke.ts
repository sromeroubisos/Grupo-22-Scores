import { readFileSync } from 'node:fs';
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const i = line.indexOf('=');
  process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
import { persistMatchCenterSupplementalData } from '@/lib/services/matchCenterService';
import { createAdminClient } from '@/lib/supabase/admin';

async function main() {
  console.log('persist fn:', typeof persistMatchCenterSupplementalData);
  const c = createAdminClient();
  const { data, error } = await c.from('matches').select('id').limit(1);
  console.log('probe:', error ? error.message : data.length);
}
main();
