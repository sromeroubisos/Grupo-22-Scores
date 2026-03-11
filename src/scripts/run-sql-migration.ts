import { Client } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Construct connection string for direct Postgres access if possible
// Otherwise, we might need the SUPABASE_DB_URL
const dbUrl = process.env.SUPABASE_DB_URL || ''; 

if (!dbUrl) {
    console.error('Missing SUPABASE_DB_URL in .env.local');
    // If we don't have the direct DB URL, we might be able to construct it from other vars
    // but usually it starts with postgres://
    process.exit(1);
}

async function runMigration() {
    const client = new Client({
        connectionString: dbUrl,
    });

    try {
        await client.connect();
        const sqlPath = path.resolve(process.cwd(), 'supabase/fix_unified_tournaments.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Executing SQL migration...');
        await client.query(sql);
        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runMigration().catch(console.error);
