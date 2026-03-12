import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1];
const SUPABASE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1] || envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1];

if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_KEY in .env.local');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    const { data: unions, error } = await supabase
        .from('unions')
        .select('id, name')
        .ilike('name', '%Cordobes%');

    if (error) {
        console.error("Error fetching unions:", error);
        return;
    }

    console.log("Found unions:", unions);
}

main().catch(console.error);
