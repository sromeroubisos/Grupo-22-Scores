import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const sportsData = [
    { "api_sport_id": "1", "name": "Football", "sport_url": "/football/", "slug": "football" },
    { "api_sport_id": "2", "name": "Tennis", "sport_url": "/tennis/", "slug": "tennis" },
    { "api_sport_id": "3", "name": "Basketball", "sport_url": "/basketball/", "slug": "basketball" },
    { "api_sport_id": "4", "name": "Hockey", "sport_url": "/hockey/", "slug": "hockey" },
    { "api_sport_id": "23", "name": "Golf", "sport_url": "/golf/", "slug": "golf" },
    { "api_sport_id": "15", "name": "Snooker", "sport_url": "/snooker/", "slug": "snooker" },
    { "api_sport_id": "5", "name": "Am. football", "sport_url": "/american-football/", "slug": "american-football" },
    { "api_sport_id": "12", "name": "Volleyball", "sport_url": "/volleyball/", "slug": "volleyball" },
    { "api_sport_id": "18", "name": "Aussie rules", "sport_url": "/aussie-rules/", "slug": "aussie-rules" },
    { "api_sport_id": "21", "name": "Badminton", "sport_url": "/badminton/", "slug": "badminton" },
    { "api_sport_id": "10", "name": "Bandy", "sport_url": "/bandy/", "slug": "bandy" },
    { "api_sport_id": "6", "name": "Baseball", "sport_url": "/baseball/", "slug": "baseball" },
    { "api_sport_id": "26", "name": "Beach soccer", "sport_url": "/beach-soccer/", "slug": "beach-soccer" },
    { "api_sport_id": "17", "name": "Beach volleyball", "sport_url": "/beach-volleyball/", "slug": "beach-volleyball" },
    { "api_sport_id": "16", "name": "Boxing", "sport_url": "/boxing/", "slug": "boxing" },
    { "api_sport_id": "13", "name": "Cricket", "sport_url": "/cricket/", "slug": "cricket" },
    { "api_sport_id": "34", "name": "Cycling", "sport_url": "/cycling/", "slug": "cycling" },
    { "api_sport_id": "14", "name": "Darts", "sport_url": "/darts/", "slug": "darts" },
    { "api_sport_id": "36", "name": "eSports", "sport_url": "/esports/", "slug": "esports" },
    { "api_sport_id": "24", "name": "Field hockey", "sport_url": "/field-hockey/", "slug": "field-hockey" },
    { "api_sport_id": "9", "name": "Floorball", "sport_url": "/floorball/", "slug": "floorball" },
    { "api_sport_id": "11", "name": "Futsal", "sport_url": "/futsal/", "slug": "futsal" },
    { "api_sport_id": "7", "name": "Handball", "sport_url": "/handball/", "slug": "handball" },
    { "api_sport_id": "35", "name": "Horse racing", "sport_url": "/horse-racing/", "slug": "horse-racing" },
    { "api_sport_id": "42", "name": "Kabaddi", "sport_url": "/kabaddi/", "slug": "kabaddi" },
    { "api_sport_id": "28", "name": "MMA", "sport_url": "/mma/", "slug": "mma" },
    { "api_sport_id": "31", "name": "Motorsport", "sport_url": "/motorsport/", "slug": "motorsport" },
    { "api_sport_id": "29", "name": "Netball", "sport_url": "/netball/", "slug": "netball" },
    { "api_sport_id": "30", "name": "Pesäpallo", "sport_url": "/pesapallo/", "slug": "pesapallo" },
    { "api_sport_id": "19", "name": "Rugby League", "sport_url": "/rugby-league/", "slug": "rugby-league" },
    { "api_sport_id": "8", "name": "Rugby Union", "sport_url": "/rugby-union/", "slug": "rugby-union" },
    { "api_sport_id": "25", "name": "Table tennis", "sport_url": "/table-tennis/", "slug": "table-tennis" },
    { "api_sport_id": "22", "name": "Water polo", "sport_url": "/water-polo/", "slug": "water-polo" },
    { "api_sport_id": "37", "name": "Winter Sports", "sport_url": "/winter-sports/", "slug": "winter-sports" }
];

// Special mapping for legacy IDs
const legacyMapping: Record<string, string> = {
    'rugby': 'rugby-union',
    'fútbol': 'football',
    'vóley': 'volleyball'
};

async function normalizeSports() {
    console.log(`Starting normalization of ${sportsData.length} sports...`);
    
    // 1. Detect available columns
    const { data: sample, error: sampleError } = await supabase.from('sports').select('*').limit(1);
    if (sampleError) {
        console.error('Error fetching sample record to detect columns:', sampleError);
        process.exit(1);
    }
    
    const availableColumns = Object.keys(sample[0] || {});
    console.log('Detected columns:', availableColumns);
    
    const hasApiSportId = availableColumns.includes('api_sport_id');
    const hasSportUrl = availableColumns.includes('sport_url');
    const hasSlug = availableColumns.includes('slug');
    const hasDisplayOrder = availableColumns.includes('display_order') || availableColumns.includes('priority');
    const hasIsVisible = availableColumns.includes('is_visible') || availableColumns.includes('is_active');
    
    const orderCol = availableColumns.includes('display_order') ? 'display_order' : 'priority';
    const visibleCol = availableColumns.includes('is_visible') ? 'is_visible' : 'is_active';

    // 2. Fetch existing for preservation
    const { data: existingSports } = await supabase.from('sports').select('*');
    const existingMap = new Map();
    existingSports?.forEach(s => existingMap.set(s.id, s));

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < sportsData.length; i++) {
        const sport = sportsData[i];
        let tableId = sport.slug;
        
        // Check if there's a legacy record that needs to be updated/replaced
        const legacyId = Object.keys(legacyMapping).find(k => legacyMapping[k] === tableId);
        let existingRecord = existingMap.get(tableId);
        
        if (!existingRecord && legacyId && existingMap.has(legacyId)) {
            console.log(`  [INFO] Mapping legacy sport '${legacyId}' to '${tableId}'`);
            existingRecord = existingMap.get(legacyId);
            // We'll delete the legacy record after the upsert if it's different
            if (legacyId !== tableId) {
                await supabase.from('sports').delete().eq('id', legacyId);
            }
        }

        const payload: any = {
            id: tableId,
            name: sport.name,
            updated_at: new Date().toISOString()
        };

        if (hasApiSportId) payload.api_sport_id = sport.api_sport_id;
        if (hasSportUrl) payload.sport_url = sport.sport_url;
        if (hasSlug) payload.slug = sport.slug;
        if (hasDisplayOrder) payload[orderCol] = existingRecord ? existingRecord[orderCol] : (i + 1) * 10;
        if (hasIsVisible) payload[visibleCol] = existingRecord ? (existingRecord[visibleCol] === undefined ? true : existingRecord[visibleCol]) : true;

        const { error } = await supabase
            .from('sports')
            .upsert(payload, { onConflict: 'id' });

        if (error) {
            console.error(`  [ERROR] ${sport.name}:`, error.message);
            errorCount++;
        } else {
            console.log(`  [OK] ${sport.name} -> ID: ${tableId}`);
            successCount++;
        }
    }

    console.log(`\nNormalization finished!`);
    console.log(`Success: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    
    if (!hasApiSportId || !hasSportUrl) {
        console.warn('\nIMPORTANT: Some recommended columns (api_sport_id, sport_url) are missing from the database.');
        console.warn('Please run the migration c:\\Users\\srome\\OneDrive\\Escritorio\\Grupo-22-Scores\\supabase\\migrations\\20260312000001_add_api_sport_id.sql to enable full integration.');
    }
}

normalizeSports().catch(err => {
    console.error('Fatal error during normalization:', err);
    process.exit(1);
});
