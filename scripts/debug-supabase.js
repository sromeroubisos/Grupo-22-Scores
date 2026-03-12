
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Testing Supabase Connection...');
console.log('URL:', url);
console.log('Anon Key length:', key ? key.length : 0);
console.log('Service Key length:', serviceKey ? serviceKey.length : 0);

async function test() {
    const supabase = createClient(url, key);

    const tables = ['tournaments', 'clubs', 'matches', 'unions', 'news'];

    for (const table of tables) {
        console.log(`\nChecking table: ${table}...`);
        try {
            const { data, error, count } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true });

            if (error) {
                console.error(`Error querying ${table}:`, error.message, error.code);
            } else {
                console.log(`Success! Table ${table} exists. Count: ${count}`);
            }
        } catch (err) {
            console.error(`Exception querying ${table}:`, err.message);
        }
    }
}

test();
