import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

// Import local data
import { getAllRugbyTournaments } from '../lib/data/tournaments/rugby';
import { getAllHockeyTournaments } from '../lib/data/tournaments/hockey';
import { getAllBasketballTournaments } from '../lib/data/tournaments/basketball';

// Helper to generate a deterministic UUID from a string
function generateUUID(name: string): string {
    const hash = crypto.createHash('sha1').update(name).digest('hex');
    return [
        hash.substring(0, 8),
        hash.substring(8, 12),
        '5' + hash.substring(13, 16), // version 5
        ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16) + hash.substring(18, 20), // variant 1
        hash.substring(20, 32)
    ].join('-');
}

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function importTournaments() {
    const allSportsTournaments = [
        { sportId: 'rugby', tournaments: getAllRugbyTournaments() },
        { sportId: 'field-hockey', tournaments: getAllHockeyTournaments() },
        { sportId: 'basketball', tournaments: getAllBasketballTournaments() }
    ];

    // 1. Prepare Sports and Countries
    console.log('Preparing sports and countries...');
    const sports = new Set(['rugby', 'hockey', 'basketball']);
    const countries = new Map<string, string>();

    for (const { sportId, tournaments } of allSportsTournaments) {
        for (const t of tournaments) {
            if (t.countryId && t.countryId !== 'International') {
                countries.set(t.countryId, (t as any).country || t.countryId);
            }
        }
    }

    // Insert Sports
    for (const s of sports) {
        await supabase.from('sports').upsert({ id: s, name: s.charAt(0).toUpperCase() + s.slice(1).replace('-', ' ') });
    }

    // Insert Countries
    console.log(`Inserting ${countries.size} countries...`);
    for (const [id, name] of countries.entries()) {
        await supabase.from('countries').upsert({ id, name });
    }

    let totalSuccess = 0;
    let totalError = 0;

    console.log(`\nStarting import of tournaments...`);

    for (const { sportId, tournaments } of allSportsTournaments) {
        console.log(`\nImporting ${sportId} tournaments (${tournaments.length})...`);
        
        for (const t of tournaments) {
            // Use deterministic UUID for the primary key
            const tournamentId = generateUUID(`${sportId}-${t.id}`);

            // Map field-hockey to hockey for DB check constraint
            const dbSport = sportId === 'field-hockey' ? 'hockey' : sportId;

            // Fetch existing to preserve overrides
            const { data: existingTournament } = await supabase
                .from('tournaments')
                .select('display_name, custom_logo_url')
                .eq('id', tournamentId)
                .single();

            const payload: any = {
                id: tournamentId,
                external_id: t.id,
                name: t.name,
                original_name: t.originalName || t.name,
                slug: (t as any).slug || t.id.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                logo_url: t.logoUrl,
                original_logo_url: t.logoUrl,
                url: t.url,
                sport: dbSport,
                sport_id: dbSport,
                country: (t as any).country || '',
                country_id: t.countryId && t.countryId !== 'International' ? t.countryId : null,
                is_api_managed: true,
                data_source: 'static_import',
                status: 'active',
                is_visible: true
            };

            // Preserve visual overrides or use defaults for new records
            if (existingTournament) {
                payload.display_name = existingTournament.display_name;
                payload.custom_logo_url = existingTournament.custom_logo_url;
            } else {
                payload.display_name = t.displayName || t.name;
                payload.custom_logo_url = null;
            }

            const { error: tournamentError } = await supabase
                .from('tournaments')
                .upsert(payload, { onConflict: 'id' });

            if (tournamentError) {
                console.error(`  [ERROR] ${t.name}:`, JSON.stringify(tournamentError, null, 2));
                totalError++;
            } else {
                console.log(`  [OK] ${t.name}`);
                totalSuccess++;
            }
        }
    }

    console.log(`\nImport finished!`);
    console.log(`Success: ${totalSuccess}`);
    console.log(`Errors: ${totalError}`);
}

importTournaments().catch(err => {
    console.error('Fatal error during import:', err);
    process.exit(1);
});
