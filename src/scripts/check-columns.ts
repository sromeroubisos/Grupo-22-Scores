import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('Checking tournaments table columns...');
    const { data, error } = await supabase
        .from('tournaments')
        .select('name, display_name, custom_logo_url, original_logo_url')
        .limit(1);

    if (error) {
        console.log('Error or columns missing:', error.message);
    } else {
        console.log('Columns exist! Data:', data);
    }
}

checkSchema().catch(console.error);
