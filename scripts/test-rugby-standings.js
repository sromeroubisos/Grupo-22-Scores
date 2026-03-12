const API_KEY = 'YOUR_RAPIDAPI_KEY_HERE';
const API_HOST = 'flashscore4.p.rapidapi.com';

const SUPER_RUGBY = {
    tournamentId: '0rhtApjB',
    tournamentStageId: '63T0FgLF',
};

async function testStandings() {
    console.log('Testing Super Rugby Standings...\n');

    const url = `https://${API_HOST}/api/flashscore/v2/tournaments/standings?tournament_id=${SUPER_RUGBY.tournamentId}&tournament_stage_id=${SUPER_RUGBY.tournamentStageId}&type=overall`;

    console.log('URL:', url);
    console.log();

    try {
        const response = await fetch(url, {
            headers: {
                'x-rapidapi-host': API_HOST,
                'x-rapidapi-key': API_KEY
            }
        });

        console.log('Status:', response.status);
        console.log('Status Text:', response.statusText);
        console.log();

        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2));

    } catch (error) {
        console.error('Error:', error.message);
    }
}

testStandings();
