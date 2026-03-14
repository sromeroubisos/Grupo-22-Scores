const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load .env.local
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
    console.error("Missing Supabase URL or Key in .env.local");
    process.exit(1);
}

console.log(`Connecting to: ${url}`);
const supabase = createClient(url, key);

async function runDiagnostic() {
    const results = {
        connection: false,
        tables: {},
        auth: false
    };

    try {
        // Test connection by fetching a simple table count
        const { data, error, count } = await supabase
            .from('sports')
            .select('*', { count: 'exact', head: true });

        if (error) {
            console.error("Connection error:", error.message);
            results.error = error;
        } else {
            console.log("Successfully connected to Supabase.");
            results.connection = true;
            results.sportsCount = count;
        }

        // Check essential tables
        const tablesToCheck = ['matches', 'tournaments', 'clubs', 'users'];
        for (const table of tablesToCheck) {
            const { count, error } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true });
            
            results.tables[table] = error ? `Error: ${error.message}` : `OK (${count} rows)`;
        }

    } catch (err) {
        console.error("Unexpected diagnostic error:", err);
    }

    console.log("\n--- DIAGNOSTIC RESULTS ---");
    console.log(JSON.stringify(results, null, 2));
}

runDiagnostic();
