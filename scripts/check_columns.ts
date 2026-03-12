
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('--- TOURNAMENTS SCHEMA ---');
    const { data: tData, error: tError } = await supabase.from('tournaments').select('*').limit(1);
    if (tError) {
        console.error('Tournament Error:', tError);
    } else if (tData && tData.length > 0) {
        console.log(Object.keys(tData[0]).join(', '));
    } else {
        console.log('No tournaments found to check schema.');
    }

    console.log('\n--- CLUBS SCHEMA ---');
    const { data: cData, error: cError } = await supabase.from('clubs').select('*').limit(1);
    if (cError) {
        console.error('Club Error:', cError);
    } else if (cData && cData.length > 0) {
        console.log(Object.keys(cData[0]).join(', '));
    } else {
        console.log('No clubs found to check schema.');
    }
}

checkSchema().catch(console.error);
