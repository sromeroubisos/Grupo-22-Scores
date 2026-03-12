/**
 * Test script for Rugby Tournament API endpoints
 * Tests Super Rugby Americas with the provided IDs
 */

const API_KEY = 'YOUR_RAPIDAPI_KEY_HERE';
const API_HOST = 'flashscore4.p.rapidapi.com';

// Super Rugby Americas IDs
const IDS = {
  tournament_id: 'pMj4LOS9',
  tournament_stage_id: 'foLzZ955',
  tournament_template_id: 'Sx5te8Or',
  season_id: '185',
  url: '/rugby-union/south-america/super-rugby-americas/'
};

async function testEndpoint(name, url) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`URL: ${url}`);
  console.log('='.repeat(60));

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': API_HOST,
        'x-rapidapi-key': API_KEY
      }
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ SUCCESS');
      console.log('Status:', response.status);
      console.log('Data structure:', JSON.stringify(data, null, 2).substring(0, 500) + '...');

      // Count items if it's an array
      if (data.DATA && Array.isArray(data.DATA)) {
        console.log('Items in DATA:', data.DATA.length);
      } else if (Array.isArray(data)) {
        console.log('Items in response:', data.length);
      }

      return { success: true, data };
    } else {
      console.log('❌ FAILED');
      console.log('Status:', response.status);
      console.log('Error:', data);
      return { success: false, error: data };
    }
  } catch (error) {
    console.log('❌ ERROR');
    console.log('Message:', error.message);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('🏉 TESTING RUGBY TOURNAMENT ENDPOINTS - SUPER RUGBY AMERICAS');
  console.log('Tournament:', IDS.tournament_id);
  console.log('Stage:', IDS.tournament_stage_id);
  console.log('Template:', IDS.tournament_template_id);
  console.log('Season:', IDS.season_id);

  const results = {};

  // Test 1: Get Tournament IDs
  results.ids = await testEndpoint(
    'GET Tournament IDs',
    `https://${API_HOST}/api/flashscore/v2/tournaments/ids?tournament_url=${encodeURIComponent(IDS.url)}`
  );

  // Test 2: Get Tournament Details
  results.details = await testEndpoint(
    'GET Tournament Details',
    `https://${API_HOST}/api/flashscore/v2/tournaments/details?tournament_stage_id=${IDS.tournament_stage_id}`
  );

  // Test 3: Get Tournament Results
  results.results = await testEndpoint(
    'GET Tournament Results',
    `https://${API_HOST}/api/flashscore/v2/tournaments/results?tournament_template_id=${IDS.tournament_template_id}&season_id=${IDS.season_id}&page=1`
  );

  // Test 4: Get Tournament Fixtures
  results.fixtures = await testEndpoint(
    'GET Tournament Fixtures',
    `https://${API_HOST}/api/flashscore/v2/tournaments/fixtures?tournament_template_id=${IDS.tournament_template_id}&season_id=${IDS.season_id}&page=1`
  );

  // Test 5: Get Tournament Standings
  results.standings = await testEndpoint(
    'GET Tournament Standings',
    `https://${API_HOST}/api/flashscore/v2/tournaments/standings?tournament_id=${IDS.tournament_id}&tournament_stage_id=${IDS.tournament_stage_id}&type=overall`
  );

  // Test 6: Get Tournament Standings Form
  results.standingsForm = await testEndpoint(
    'GET Tournament Standings Form',
    `https://${API_HOST}/api/flashscore/v2/tournaments/standings/form?tournament_id=${IDS.tournament_id}&tournament_stage_id=${IDS.tournament_stage_id}&type=overall`
  );

  // Test 7: Get Tournament Standings HT/FT
  results.standingsHtFt = await testEndpoint(
    'GET Tournament Standings HT/FT',
    `https://${API_HOST}/api/flashscore/v2/tournaments/standings/ht-ft?type=overall&tournament_id=${IDS.tournament_id}&tournament_stage_id=${IDS.tournament_stage_id}`
  );

  // Test 8: Get Tournament Standings Over/Under
  results.standingsOverUnder = await testEndpoint(
    'GET Tournament Standings Over/Under',
    `https://${API_HOST}/api/flashscore/v2/tournaments/standings/over-under?tournament_id=${IDS.tournament_id}&tournament_stage_id=${IDS.tournament_stage_id}&type=overall&sub_type=2.5`
  );

  // Test 9: Get Tournament Top Scorers
  results.topScorers = await testEndpoint(
    'GET Tournament Top Scorers',
    `https://${API_HOST}/api/flashscore/v2/tournaments/standings/top-scorers?tournament_id=${IDS.tournament_id}&tournament_stage_id=${IDS.tournament_stage_id}`
  );

  // Test 10: Get Tournament Draw
  results.draw = await testEndpoint(
    'GET Tournament Draw',
    `https://${API_HOST}/api/flashscore/v2/tournaments/draw?tournament_id=${IDS.tournament_id}&tournament_stage_id=${IDS.tournament_stage_id}`
  );

  // Test 11: Get Tournament Archives
  results.archives = await testEndpoint(
    'GET Tournament Archives',
    `https://${API_HOST}/api/flashscore/v2/tournaments/archives?tournament_stage_id=${IDS.tournament_stage_id}`
  );

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));

  const testNames = Object.keys(results);
  const successCount = testNames.filter(name => results[name].success).length;
  const failCount = testNames.length - successCount;

  console.log(`Total Tests: ${testNames.length}`);
  console.log(`✅ Passed: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);

  console.log('\nDetailed Results:');
  testNames.forEach(name => {
    const status = results[name].success ? '✅' : '❌';
    console.log(`${status} ${name}`);
  });

  console.log('\n' + '='.repeat(60));
}

// Run the tests
runTests().catch(console.error);
