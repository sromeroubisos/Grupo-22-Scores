import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConstraints() {
    console.log('Checking tournament constraints...');
    const { data, error } = await supabase.rpc('get_table_constraints', { table_name: 'tournaments' });
    if (error) {
        console.error('Error fetching constraints:', error);
        // Fallback: try to see if we can infer from a failed insert
        const { error: insertError } = await supabase.from('tournaments').insert([{ external_id: 'test-dup' }, { external_id: 'test-dup' }]);
        console.log('Test duplicate insert error (to check for unique constraint):', insertError?.message);
    } else {
        console.log('Constraints:', data);
    }
}

checkConstraints().catch(console.error);
