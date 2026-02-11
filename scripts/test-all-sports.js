/**
 * Script to test tournament requests for all sports in SPORT_MAPPING
 * This validates that the FlashScore API works correctly for each sport
 */

const API_KEY = '32e9f1aee1msha3c5470d1ea7367p10fac7jsnf9a1bfc88131';
const API_HOST = 'flashscore4.p.rapidapi.com';

// Complete sport mapping from flashscore.ts
const SPORT_MAPPING = {
    'football': 1,
    'tennis': 2,
    'basketball': 3,
    'hockey': 4,
    'american-football': 5,
    'baseball': 6,
    'handball': 7,
    'rugby': 8,
    'rugby-union': 8,
    'rugby-league': 19,
    'floorball': 9,
    'bandy': 10,
    'futsal': 11,
    'volleyball': 12,
    'cricket': 13,
    'darts': 14,
    'snooker': 15,
    'boxing': 16,
    'beach-volleyball': 17,
    'aussie-rules': 18,
    'field-hockey': 24,
    'badminton': 21,
    'water-polo': 22,
    'golf': 23,
    'table-tennis': 25,
    'beach-soccer': 26,
    'mma': 28,
    'netball': 29,
    'pesapallo': 30,
    'motorsport': 31,
    'cycling': 34,
    'horse-racing': 35,
    'esports': 36,
    'winter-sports': 37,
    'kabaddi': 42
};

// Get unique sport IDs (some sports share IDs like rugby-union and rugby)
const uniqueSportIds = {};
for (const [sportKey, sportId] of Object.entries(SPORT_MAPPING)) {
    if (!uniqueSportIds[sportId]) {
        uniqueSportIds[sportId] = sportKey;
    }
}

console.log('\n===========================================');
console.log('SPORTS TESTING TOOL');
console.log('===========================================\n');
console.log(`Total sport entries: ${Object.keys(SPORT_MAPPING).length}`);
console.log(`Unique sport IDs: ${Object.keys(uniqueSportIds).length}\n`);

async function testSportMatches(sportKey, sportId) {
    try {
        const url = `https://${API_HOST}/api/flashscore/v2/matches/list?day=0&sport_id=${sportId}`;
        const response = await fetch(url, {
            headers: {
                'x-rapidapi-host': API_HOST,
                'x-rapidapi-key': API_KEY
            }
        });

        if (!response.ok) {
            return {
                success: false,
                error: `HTTP ${response.status}: ${response.statusText}`,
                data: null
            };
        }

        const data = await response.json();
        const tournaments = Array.isArray(data) ? data : (data.DATA || data.data || []);
        const totalMatches = tournaments.reduce((acc, t) => acc + (t.matches?.length || 0), 0);

        return {
            success: true,
            tournamentsCount: tournaments.length,
            matchesCount: totalMatches,
            data: data
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            data: null
        };
    }
}

async function testAllSports() {
    const results = [];
    let successCount = 0;
    let failCount = 0;

    console.log('Starting tests for all sports...\n');
    console.log('Sport ID | Sport Name              | Status | Tournaments | Matches | Details');
    console.log('---------|-------------------------|--------|-------------|---------|------------------');

    // Test each unique sport ID
    for (const [sportId, sportKey] of Object.entries(uniqueSportIds)) {
        const result = await testSportMatches(sportKey, parseInt(sportId));

        const statusIcon = result.success ? '✓' : '✗';
        const status = result.success ? 'OK' : 'FAIL';
        const tournaments = result.success ? result.tournamentsCount : 0;
        const matches = result.success ? result.matchesCount : 0;
        const details = result.success ? '' : result.error;

        console.log(
            `${sportId.padStart(8)} | ${sportKey.padEnd(23)} | ${statusIcon} ${status.padEnd(4)} | ${String(tournaments).padStart(11)} | ${String(matches).padStart(7)} | ${details}`
        );

        results.push({
            sportId: parseInt(sportId),
            sportKey,
            ...result
        });

        if (result.success) {
            successCount++;
        } else {
            failCount++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('---------|-------------------------|--------|-------------|---------|------------------');
    console.log(`\nSummary: ${successCount} successful, ${failCount} failed out of ${Object.keys(uniqueSportIds).length} sports\n`);

    // Detailed failure report
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
        console.log('\n===========================================');
        console.log('FAILED SPORTS DETAILS');
        console.log('===========================================\n');
        failures.forEach(f => {
            console.log(`${f.sportKey} (ID: ${f.sportId})`);
            console.log(`  Error: ${f.error}\n`);
        });
    }

    // Sports with data
    const withData = results.filter(r => r.success && (r.tournamentsCount > 0 || r.matchesCount > 0));
    if (withData.length > 0) {
        console.log('\n===========================================');
        console.log('SPORTS WITH ACTIVE DATA');
        console.log('===========================================\n');
        withData.forEach(s => {
            console.log(`${s.sportKey.padEnd(25)} - ${s.tournamentsCount} tournaments, ${s.matchesCount} matches`);
        });
    }

    // Generate sport list for sports.ts
    console.log('\n===========================================');
    console.log('SPORTS.TS CONFIGURATION');
    console.log('===========================================\n');
    console.log('Add these to your SPORTS object in sports.ts:\n');

    const successfulSports = results.filter(r => r.success);
    successfulSports.forEach((s, index) => {
        const name = s.sportKey.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const icon = getSportIcon(s.sportKey);
        console.log(`    '${s.sportKey}': {`);
        console.log(`        id: '${s.sportKey}',`);
        console.log(`        name: '${name}',`);
        console.log(`        nameEs: '${getSpanishName(s.sportKey)}',`);
        console.log(`        icon: '${icon}',`);
        console.log(`        isActive: ${s.tournamentsCount > 0 || s.matchesCount > 0},`);
        console.log(`        priority: ${index + 1},`);
        console.log(`    },`);
    });

    return results;
}

function getSportIcon(sportKey) {
    const icons = {
        'football': '⚽',
        'tennis': '🎾',
        'basketball': '🏀',
        'hockey': '🏒',
        'american-football': '🏈',
        'baseball': '⚾',
        'handball': '🤾',
        'rugby': '🏉',
        'rugby-union': '🏉',
        'rugby-league': '🏉',
        'floorball': '🏑',
        'bandy': '🏒',
        'futsal': '⚽',
        'volleyball': '🏐',
        'cricket': '🏏',
        'darts': '🎯',
        'snooker': '🎱',
        'boxing': '🥊',
        'beach-volleyball': '🏐',
        'aussie-rules': '🏈',
        'field-hockey': '🏑',
        'badminton': '🏸',
        'water-polo': '🤽',
        'golf': '⛳',
        'table-tennis': '🏓',
        'beach-soccer': '⚽',
        'mma': '🥋',
        'netball': '🏀',
        'pesapallo': '⚾',
        'motorsport': '🏎️',
        'cycling': '🚴',
        'horse-racing': '🏇',
        'esports': '🎮',
        'winter-sports': '⛷️',
        'kabaddi': '🤸'
    };
    return icons[sportKey] || '🏆';
}

function getSpanishName(sportKey) {
    const names = {
        'football': 'Fútbol',
        'tennis': 'Tenis',
        'basketball': 'Básquetbol',
        'hockey': 'Hockey sobre Hielo',
        'american-football': 'Fútbol Americano',
        'baseball': 'Béisbol',
        'handball': 'Balonmano',
        'rugby': 'Rugby',
        'rugby-union': 'Rugby Union',
        'rugby-league': 'Rugby League',
        'floorball': 'Floorball',
        'bandy': 'Bandy',
        'futsal': 'Fútbol Sala',
        'volleyball': 'Voleibol',
        'cricket': 'Cricket',
        'darts': 'Dardos',
        'snooker': 'Snooker',
        'boxing': 'Boxeo',
        'beach-volleyball': 'Voleibol de Playa',
        'aussie-rules': 'Fútbol Australiano',
        'field-hockey': 'Hockey sobre Césped',
        'badminton': 'Bádminton',
        'water-polo': 'Waterpolo',
        'golf': 'Golf',
        'table-tennis': 'Tenis de Mesa',
        'beach-soccer': 'Fútbol Playa',
        'mma': 'Artes Marciales Mixtas',
        'netball': 'Netball',
        'pesapallo': 'Pesäpallo',
        'motorsport': 'Automovilismo',
        'cycling': 'Ciclismo',
        'horse-racing': 'Carreras de Caballos',
        'esports': 'Deportes Electrónicos',
        'winter-sports': 'Deportes de Invierno',
        'kabaddi': 'Kabaddi'
    };
    return names[sportKey] || sportKey;
}

// Run the tests
testAllSports()
    .then(() => {
        console.log('\n✓ Testing completed!\n');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n✗ Testing failed:', error);
        process.exit(1);
    });
