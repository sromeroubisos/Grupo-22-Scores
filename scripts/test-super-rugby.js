const API_KEY = 'YOUR_RAPIDAPI_KEY_HERE';
const API_HOST = 'flashscore4.p.rapidapi.com';

const SUPER_RUGBY = {
    id: 'rugby-super-rugby',
    name: 'Super Rugby',
    url: '/rugby-union/world/super-rugby/',
    flashScoreIds: {
        tournamentId: '0rhtApjB',
        tournamentStageId: '63T0FgLF',
        tournamentTemplateId: 'Stv0V7h5',
        seasonId: '185'
    }
};

async function testSuperRugby() {
    console.log('\n=== Testing Super Rugby ===\n');
    console.log('Tournament:', SUPER_RUGBY.name);
    console.log('URL:', SUPER_RUGBY.url);
    console.log('FlashScore IDs:', SUPER_RUGBY.flashScoreIds);

    // Test 1: Get Tournament IDs from URL
    console.log('\n--- Test 1: Get Tournament IDs from URL ---');
    try {
        const encodedUrl = encodeURIComponent(SUPER_RUGBY.url);
        const url = `https://${API_HOST}/api/flashscore/v2/tournaments/ids?tournament_url=${encodedUrl}`;

        const response = await fetch(url, {
            headers: {
                'x-rapidapi-host': API_HOST,
                'x-rapidapi-key': API_KEY
            }
        });

        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(data, null, 2));

        if (data && data.DATA && data.DATA.length > 0) {
            console.log('✅ Tournament IDs found!');
            const ids = data.DATA[0];
            console.log('  - tournament_id:', ids.tournament_id);
            console.log('  - tournament_stage_id:', ids.tournament_stage_id);
            console.log('  - tournament_template_id:', ids.tournament_template_id);
            console.log('  - season_id:', ids.season_id);
        } else {
            console.log('❌ No tournament IDs found');
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }

    // Test 2: Get Tournament Details using tournamentStageId
    console.log('\n--- Test 2: Get Tournament Details ---');
    try {
        const url = `https://${API_HOST}/api/flashscore/v2/tournaments/details?tournament_stage_id=${SUPER_RUGBY.flashScoreIds.tournamentStageId}`;

        const response = await fetch(url, {
            headers: {
                'x-rapidapi-host': API_HOST,
                'x-rapidapi-key': API_KEY
            }
        });

        const data = await response.json();
        console.log('Status:', response.status);

        if (data && data.DATA) {
            console.log('✅ Tournament details found!');
            console.log('  - Name:', data.DATA.name || data.DATA.tournament?.name);
            console.log('  - Season:', data.DATA.season_id || data.DATA.season);
            console.log('  - Country:', data.DATA.country?.name || data.DATA.country_name);
        } else {
            console.log('❌ No tournament details found');
            console.log('Response:', JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }

    // Test 3: Get Standings
    console.log('\n--- Test 3: Get Standings ---');
    try {
        const url = `https://${API_HOST}/api/flashscore/v2/tournaments/standings?tournament_id=${SUPER_RUGBY.flashScoreIds.tournamentId}&tournament_stage_id=${SUPER_RUGBY.flashScoreIds.tournamentStageId}`;

        const response = await fetch(url, {
            headers: {
                'x-rapidapi-host': API_HOST,
                'x-rapidapi-key': API_KEY
            }
        });

        const data = await response.json();
        console.log('Status:', response.status);

        if (data && data.DATA && data.DATA.length > 0) {
            console.log('✅ Standings found!');
            console.log('  - Groups/Teams:', data.DATA.length);
        } else {
            console.log('❌ No standings found');
            console.log('Response:', JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }

    // Test 4: Get Results
    console.log('\n--- Test 4: Get Results ---');
    try {
        const url = `https://${API_HOST}/api/flashscore/v2/tournaments/results?tournament_template_id=${SUPER_RUGBY.flashScoreIds.tournamentTemplateId}&season_id=${SUPER_RUGBY.flashScoreIds.seasonId}`;

        const response = await fetch(url, {
            headers: {
                'x-rapidapi-host': API_HOST,
                'x-rapidapi-key': API_KEY
            }
        });

        const data = await response.json();
        console.log('Status:', response.status);

        if (data && data.DATA && data.DATA.length > 0) {
            console.log('✅ Results found!');
            console.log('  - Matches:', data.DATA.length);
        } else {
            console.log('❌ No results found');
            console.log('Response:', JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testSuperRugby();
