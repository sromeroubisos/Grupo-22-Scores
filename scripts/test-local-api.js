/**
 * Script to test the local /api/tournaments endpoint
 * This tests your Next.js API route with sample tournament data
 *
 * USAGE:
 * 1. Start your Next.js dev server: npm run dev
 * 2. In another terminal, run: node scripts/test-local-api.js
 */

const LOCAL_API_URL = 'http://localhost:3000';

// Sample tournaments to test
const TEST_CASES = [
    {
        name: 'Premier League (Football)',
        sport: 'football',
        params: { id: 'fs-OEEq9Yvp', sport: 'football' }
    },
    {
        name: 'NBA (Basketball)',
        sport: 'basketball',
        params: { id: 'fs-MHnOejlI', sport: 'basketball' }
    },
    {
        name: 'NHL (Hockey)',
        sport: 'hockey',
        params: { id: 'fs-0jOuaH85', sport: 'hockey' }
    },
    {
        name: 'Australian Open (Tennis)',
        sport: 'tennis',
        params: { id: 'fs-0psmHkpI', sport: 'tennis' }
    },
    {
        name: 'Premier League by URL (Football)',
        sport: 'football',
        params: { url: '/football/england/premier-league/', sport: 'football' }
    },
    {
        name: 'NBA by IDs (Basketball)',
        sport: 'basketball',
        params: {
            tournamentId: 'OIo52B5b',
            stageId: 'MHnOejlI',
            sport: 'basketball'
        }
    }
];

console.log('\n===========================================');
console.log('LOCAL API ENDPOINT TESTING');
console.log('===========================================\n');
console.log(`Testing endpoint: ${LOCAL_API_URL}/api/tournaments\n`);

async function testLocalEndpoint(testCase) {
    const params = new URLSearchParams(testCase.params);
    const url = `${LOCAL_API_URL}/api/tournaments?${params}`;

    try {
        const startTime = Date.now();
        const response = await fetch(url);
        const endTime = Date.now();
        const duration = endTime - startTime;

        if (!response.ok) {
            return {
                success: false,
                error: `HTTP ${response.status}: ${response.statusText}`,
                duration
            };
        }

        const data = await response.json();

        if (!data.ok) {
            return {
                success: false,
                error: data.error || 'API returned ok: false',
                duration,
                data
            };
        }

        // Analyze the response
        const analysis = {
            hasIds: !!(data.ids && data.ids.tournamentId),
            hasDetails: !!(data.details && Object.keys(data.details).length > 0),
            resultsCount: Array.isArray(data.results) ? data.results.length : 0,
            fixturesCount: Array.isArray(data.fixtures) ? data.fixtures.length : 0,
            standingsCount: Array.isArray(data.standings) ? data.standings.length : 0,
            topScorersCount: Array.isArray(data.topScorers) ? data.topScorers.length : 0
        };

        return {
            success: true,
            duration,
            data,
            analysis,
            ids: data.ids
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            duration: 0
        };
    }
}

async function runTests() {
    console.log('Running tests...\n');
    console.log('Test Name                           | Status | Time (ms) | IDs | Details | Results | Fixtures | Standings');
    console.log('------------------------------------|--------|-----------|-----|---------|---------|----------|----------');

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const testCase of TEST_CASES) {
        const result = await testLocalEndpoint(testCase);

        const statusIcon = result.success ? '✓' : '✗';
        const status = result.success ? 'OK' : 'FAIL';

        if (result.success) {
            const { analysis } = result;
            console.log(
                `${testCase.name.padEnd(35)} | ${statusIcon} ${status.padEnd(4)} | ${String(result.duration).padStart(9)} | ${analysis.hasIds ? 'Yes' : 'No'} | ${analysis.hasDetails ? 'Yes' : 'No'} | ${String(analysis.resultsCount).padStart(7)} | ${String(analysis.fixturesCount).padStart(8)} | ${String(analysis.standingsCount).padStart(9)}`
            );
            successCount++;
        } else {
            console.log(
                `${testCase.name.padEnd(35)} | ${statusIcon} ${status.padEnd(4)} | ${String(result.duration).padStart(9)} | -   | -       | -       | -        | - `
            );
            failCount++;
        }

        results.push({
            testCase,
            ...result
        });

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('------------------------------------|--------|-----------|-----|---------|---------|----------|----------');
    console.log(`\nSummary: ${successCount} successful, ${failCount} failed out of ${TEST_CASES.length} tests\n`);

    // Show detailed results for successful tests
    const successful = results.filter(r => r.success);
    if (successful.length > 0) {
        console.log('\n===========================================');
        console.log('SUCCESSFUL TESTS - DETAILED RESULTS');
        console.log('===========================================\n');

        successful.forEach((r, index) => {
            console.log(`${index + 1}. ${r.testCase.name}`);
            console.log(`   Sport: ${r.testCase.sport}`);
            console.log(`   Request: ${JSON.stringify(r.testCase.params)}`);
            console.log(`   Response Time: ${r.duration}ms`);

            if (r.ids) {
                console.log(`   IDs:`);
                console.log(`     - Tournament ID: ${r.ids.tournamentId}`);
                console.log(`     - Stage ID: ${r.ids.stageId}`);
                console.log(`     - Template ID: ${r.ids.templateId}`);
                console.log(`     - Season ID: ${r.ids.seasonId}`);
            }

            console.log(`   Data:`);
            console.log(`     - Results: ${r.analysis.resultsCount}`);
            console.log(`     - Fixtures: ${r.analysis.fixturesCount}`);
            console.log(`     - Standings: ${r.analysis.standingsCount}`);
            console.log(`     - Top Scorers: ${r.analysis.topScorersCount}`);
            console.log('');
        });
    }

    // Show failures
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
        console.log('\n===========================================');
        console.log('FAILED TESTS');
        console.log('===========================================\n');

        failures.forEach((r, index) => {
            console.log(`${index + 1}. ${r.testCase.name}`);
            console.log(`   Sport: ${r.testCase.sport}`);
            console.log(`   Request: ${JSON.stringify(r.testCase.params)}`);
            console.log(`   Error: ${r.error}`);
            console.log('');
        });

        console.log('\n⚠️  TROUBLESHOOTING:');
        console.log('   - Make sure your dev server is running: npm run dev');
        console.log('   - Check that it\'s running on port 3000');
        console.log('   - Verify your API key is valid in flashscore.ts');
        console.log('   - Check console for any error messages\n');
    }

    return results;
}

// Check if server is running first
async function checkServer() {
    try {
        const response = await fetch(LOCAL_API_URL);
        return response.ok || response.status === 404; // 404 is ok, means server is running
    } catch (error) {
        return false;
    }
}

// Main execution
(async () => {
    console.log('Checking if local server is running...');
    const serverRunning = await checkServer();

    if (!serverRunning) {
        console.log('\n❌ ERROR: Local server is not running!');
        console.log('\nPlease start your development server first:');
        console.log('   npm run dev\n');
        console.log('Then run this script again.\n');
        process.exit(1);
    }

    console.log('✓ Server is running\n');

    try {
        await runTests();
        console.log('\n✓ Testing completed!\n');
        process.exit(0);
    } catch (error) {
        console.error('\n✗ Testing failed:', error);
        process.exit(1);
    }
})();
