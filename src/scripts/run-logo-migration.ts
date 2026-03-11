import { Client } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const dbUrl = process.env.SUPABASE_DB_URL || ''; 

if (!dbUrl) {
    console.error('Missing SUPABASE_DB_URL in .env.local');
    process.exit(1);
}

async function runMigration() {
    const client = new Client({
        connectionString: dbUrl,
    });

    try {
        await client.connect();
        const sqlPath = path.resolve(process.cwd(), 'supabase/migrations/20260311210000_tournament_logo_overrides.sql');
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
