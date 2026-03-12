const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function checkColumns() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
        console.error('Missing Supabase URL or Anon Key');
        return;
    }

    const supabase = createClient(url, key);

    console.log('Checking matches table columns...');

    // Attempting to select all columns with limit 0
    const { data, error } = await supabase
        .from('matches')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error querying matches:', error.message);
        return;
    }

    if (data && data.length > 0) {
        console.log('Columns found in first row:', Object.keys(data[0]));
    } else {
        console.log('No data found in matches table to inspect columns.');
    }

    // Alternative: Try to select specifically broadcast_url
    const { error: colError } = await supabase
        .from('matches')
        .select('broadcast_url')
        .limit(1);

    if (colError) {
        console.log('Column broadcast_url NOT found or accessible:', colError.message);
    } else {
        console.log('Column broadcast_url IS found.');
    }
}

checkColumns();
