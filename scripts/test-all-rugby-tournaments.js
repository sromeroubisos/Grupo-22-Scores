const API_KEY = 'YOUR_RAPIDAPI_KEY_HERE';
const API_HOST = 'flashscore4.p.rapidapi.com';

// Rugby tournaments with flashScoreIds from rugby.ts
const TOURNAMENTS = [
    {
        id: 'rugby-six-nations',
        name: 'Six Nations',
        url: '/rugby-union/europe/six-nations/',
        flashScoreIds: {
            tournamentId: 'OI2GTjwP',
            tournamentStageId: 'xd15pGfS',
            tournamentTemplateId: 'faEPan8O',
            seasonId: '185'
        }
    },
    {
        id: 'rugby-championship',
        name: 'Rugby Championship',
        url: '/rugby-union/world/rugby-championship/',
        flashScoreIds: {
            tournamentId: 'M54dkNqe',
            tournamentStageId: '6cEG6eKs',
            tournamentTemplateId: 'xxwSbYzH',
            seasonId: '182'
        }
    },
    {
        id: 'rugby-super-rugby',
        name: 'Super Rugby',
        url: '/rugby-union/world/super-rugby/',
        flashScoreIds: {
            tournamentId: '0rhtApjB',
            tournamentStageId: '63T0FgLF',
            tournamentTemplateId: 'Stv0V7h5',
            seasonId: '185'
        }
    }
];

async function testTournament(tournament) {
    console.log(`\nTesting: ${tournament.name}`);
    
    const results = {
        name: tournament.name,
        details: '❌',
        results: '❌',
        standings: '❌'
    };

    // Test Details
    try {
        const url = `https://${API_HOST}/api/flashscore/v2/tournaments/details?tournament_stage_id=${tournament.flashScoreIds.tournamentStageId}`;
        const response = await fetch(url, {
            headers: {
                'x-rapidapi-host': API_HOST,
                'x-rapidapi-key': API_KEY
            }
        });
        const data = await response.json();
        if (response.status === 200 && data && !Array.isArray(data)) {
            results.details = '✅';
        } else if (response.status === 200 && Array.isArray(data) && data.length === 0) {
            results.details = '⚠️ EMPTY';
        }
    } catch (error) {
        results.details = '❌ ERROR';
    }

    // Test Results
    try {
        const url = `https://${API_HOST}/api/flashscore/v2/tournaments/results?tournament_template_id=${tournament.flashScoreIds.tournamentTemplateId}&season_id=${tournament.flashScoreIds.seasonId}`;
        const response = await fetch(url, {
            headers: {
                'x-rapidapi-host': API_HOST,
                'x-rapidapi-key': API_KEY
            }
        });
        const data = await response.json();
        if (response.status === 200 && data && Array.isArray(data) && data.length > 0) {
            results.results = `✅ ${data.length} matches`;
        }
    } catch (error) {
        results.results = '❌ ERROR';
    }

    // Test Standings
    try {
        const url = `https://${API_HOST}/api/flashscore/v2/tournaments/standings?tournament_id=${tournament.flashScoreIds.tournamentId}&tournament_stage_id=${tournament.flashScoreIds.tournamentStageId}&type=overall`;
        const response = await fetch(url, {
            headers: {
                'x-rapidapi-host': API_HOST,
                'x-rapidapi-key': API_KEY
            }
        });
        const data = await response.json();
        if (response.status === 200 && data && data.DATA && data.DATA.length > 0) {
            results.standings = `✅ ${data.DATA.length} teams`;
        }
    } catch (error) {
        results.standings = '❌ ERROR';
    }

    return results;
}

async function runTests() {
    console.log('\n🏉 TESTING RUGBY TOURNAMENTS\n');

    const allResults = [];
    for (const tournament of TOURNAMENTS) {
        const result = await testTournament(tournament);
        allResults.push(result);
        console.log(`  Details: ${result.details} | Results: ${result.results} | Standings: ${result.standings}`);
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n\nSUMMARY:');
    allResults.forEach(r => {
        console.log(`${r.name.padEnd(30)} Details: ${r.details.padEnd(15)} Results: ${r.results.padEnd(20)} Standings: ${r.standings}`);
    });
}

runTests();
