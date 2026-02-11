/**
 * Script to test the tournament API endpoint for all sports
 * Tests the /api/tournaments endpoint with sample tournaments
 */

const API_KEY = '32e9f1aee1msha3c5470d1ea7367p10fac7jsnf9a1bfc88131';
const API_HOST = 'flashscore4.p.rapidapi.com';

// Sample tournament URLs for each sport (popular tournaments)
const SAMPLE_TOURNAMENTS = {
    'football': {
        url: '/football/england/premier-league/',
        name: 'Premier League'
    },
    'tennis': {
        url: '/tennis/atp-singles/australian-open/',
        name: 'Australian Open'
    },
    'basketball': {
        url: '/basketball/usa/nba/',
        name: 'NBA'
    },
    'hockey': {
        url: '/hockey/usa/nhl/',
        name: 'NHL'
    },
    'volleyball': {
        url: '/volleyball/world/world-championship/',
        name: 'World Championship'
    },
    'handball': {
        url: '/handball/world/world-championship/',
        name: 'World Championship'
    },
    'baseball': {
        url: '/baseball/usa/mlb/',
        name: 'MLB'
    },
    'futsal': {
        url: '/futsal/world/world-cup/',
        name: 'World Cup'
    },
    'cricket': {
        url: '/cricket/world/world-cup/',
        name: 'World Cup'
    },
    'table-tennis': {
        url: '/table-tennis/world/world-championship/',
        name: 'World Championship'
    },
    'snooker': {
        url: '/snooker/world/world-championship/',
        name: 'World Championship'
    },
    'darts': {
        url: '/darts/world/world-championship/',
        name: 'World Championship'
    },
    'field-hockey': {
        url: '/field-hockey/world/world-cup/',
        name: 'World Cup'
    },
    'golf': {
        url: '/golf/usa/pga-tour/',
        name: 'PGA Tour'
    },
};

console.log('\n===========================================');
console.log('TOURNAMENT API TESTING TOOL');
console.log('===========================================\n');

async function getTournamentIds(tournamentUrl) {
    const encodedUrl = encodeURIComponent(tournamentUrl);
    const url = `https://${API_HOST}/api/flashscore/v2/tournaments/ids?tournament_url=${encodedUrl}`;

    try {
        const response = await fetch(url, {
            headers: {
                'x-rapidapi-host': API_HOST,
                'x-rapidapi-key': API_KEY
            }
        });

        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
        }

        const data = await response.json();
        const idsData = data?.DATA || data;

        if (!idsData || (Array.isArray(idsData) && idsData.length === 0)) {
            return { success: false, error: 'No IDs found' };
        }

        const first = Array.isArray(idsData) ? idsData[0] : idsData;
        return {
            success: true,
            tournamentId: first.tournament_id,
            stageId: first.tournament_stage_id,
            templateId: first.tournament_template_id,
            seasonId: first.season_id
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function getTournamentDetails(stageId) {
    const url = `https://${API_HOST}/api/flashscore/v2/tournaments/details?tournament_stage_id=${stageId}`;

    try {
        const response = await fetch(url, {
            headers: {
                'x-rapidapi-host': API_HOST,
                'x-rapidapi-key': API_KEY
            }
        });

        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
        }

        const data = await response.json();
        const details = data?.DATA || data;

        return {
            success: true,
            details: details
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function testTournamentApiEndpoint(sportId, tournamentUrl) {
    const params = new URLSearchParams({
        id: `test-${sportId}`,
        url: tournamentUrl,
        sport: sportId
    });

    // Note: This would call your local API endpoint
    // For testing purposes, we'll test the FlashScore API directly
    const idsResult = await getTournamentIds(tournamentUrl);

    if (!idsResult.success) {
        return {
            success: false,
            error: idsResult.error,
            stage: 'Getting IDs'
        };
    }

    const detailsResult = await getTournamentDetails(idsResult.stageId);

    return {
        success: detailsResult.success,
        ids: {
            tournamentId: idsResult.tournamentId,
            stageId: idsResult.stageId,
            templateId: idsResult.templateId,
            seasonId: idsResult.seasonId
        },
        hasDetails: detailsResult.success,
        error: detailsResult.success ? null : detailsResult.error
    };
}

async function testAllTournaments() {
    const results = [];
    let successCount = 0;
    let failCount = 0;

    console.log('Testing tournament API for sample tournaments...\n');
    console.log('Sport            | Tournament                      | Status | IDs Found | Details | Error');
    console.log('-----------------|----------------------------------|--------|-----------|---------|------------------');

    for (const [sportId, tournament] of Object.entries(SAMPLE_TOURNAMENTS)) {
        const result = await testTournamentApiEndpoint(sportId, tournament.url);

        const statusIcon = result.success ? '✓' : '✗';
        const status = result.success ? 'OK' : 'FAIL';
        const idsFound = result.ids ? 'Yes' : 'No';
        const hasDetails = result.hasDetails ? 'Yes' : 'No';
        const error = result.error || '';

        console.log(
            `${sportId.padEnd(16)} | ${tournament.name.padEnd(32)} | ${statusIcon} ${status.padEnd(4)} | ${idsFound.padEnd(9)} | ${hasDetails.padEnd(7)} | ${error}`
        );

        results.push({
            sportId,
            tournamentName: tournament.name,
            tournamentUrl: tournament.url,
            ...result
        });

        if (result.success) {
            successCount++;
        } else {
            failCount++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log('-----------------|----------------------------------|--------|-----------|---------|------------------');
    console.log(`\nSummary: ${successCount} successful, ${failCount} failed out of ${Object.keys(SAMPLE_TOURNAMENTS).length} tournaments\n`);

    // Show successful tournament IDs
    const successful = results.filter(r => r.success);
    if (successful.length > 0) {
        console.log('\n===========================================');
        console.log('SUCCESSFUL TOURNAMENTS - IDs EXTRACTED');
        console.log('===========================================\n');
        successful.forEach(t => {
            console.log(`${t.sportId} - ${t.tournamentName}`);
            console.log(`  URL: ${t.tournamentUrl}`);
            console.log(`  Tournament ID: ${t.ids.tournamentId}`);
            console.log(`  Stage ID: ${t.ids.stageId}`);
            console.log(`  Template ID: ${t.ids.templateId}`);
            console.log(`  Season ID: ${t.ids.seasonId}`);
            console.log('');
        });
    }

    // Show failures
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
        console.log('\n===========================================');
        console.log('FAILED TOURNAMENTS');
        console.log('===========================================\n');
        failures.forEach(f => {
            console.log(`${f.sportId} - ${f.tournamentName}`);
            console.log(`  URL: ${f.tournamentUrl}`);
            console.log(`  Error: ${f.error}`);
            console.log(`  Stage: ${f.stage || 'Unknown'}`);
            console.log('');
        });
    }

    console.log('\n===========================================');
    console.log('HOW TO USE THESE IDs IN YOUR API');
    console.log('===========================================\n');
    console.log('Example API calls for successful tournaments:\n');

    successful.slice(0, 3).forEach(t => {
        console.log(`// ${t.sportId.toUpperCase()} - ${t.tournamentName}`);
        console.log(`GET /api/tournaments?id=fs-${t.ids.stageId}&sport=${t.sportId}`);
        console.log(`GET /api/tournaments?tournamentId=${t.ids.tournamentId}&stageId=${t.ids.stageId}&sport=${t.sportId}`);
        console.log(`GET /api/tournaments?url=${encodeURIComponent(t.tournamentUrl)}&sport=${t.sportId}\n`);
    });

    return results;
}

// Run the tests
testAllTournaments()
    .then(() => {
        console.log('\n✓ Tournament API testing completed!\n');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n✗ Testing failed:', error);
        process.exit(1);
    });
