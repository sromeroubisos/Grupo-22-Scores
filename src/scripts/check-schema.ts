import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('Checking tournaments table schema...');
    
    // Query information_schema
    const { data: columns, error } = await supabase.rpc('get_table_columns', { table_name: 'tournaments' });
    
    if (error) {
        console.log('RPC get_table_columns failed, trying direct select...');
        const { data, error: selectError } = await supabase.from('tournaments').select('*').limit(1);
        if (selectError) {
            console.error('Select error:', selectError);
        } else {
            console.log('Columns found via select:', Object.keys(data[0] || {}));
        }
    } else {
        console.log('Columns:', columns);
    }

    // Also check countries table just in case
    const { data: countryData } = await supabase.from('countries').select('*').limit(1);
    console.log('Country columns:', Object.keys(countryData?.[0] || {}));
}

checkSchema().catch(console.error);
