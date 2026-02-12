const https = require('https');

const options = {
    method: 'GET',
    hostname: 'flashscore4.p.rapidapi.com',
    path: '/api/flashscore/v2/matches/live?sport_id=1', // Football
    headers: {
        'x-rapidapi-host': 'flashscore4.p.rapidapi.com',
        'x-rapidapi-key': '32e9f1aee1msha3c5470d1ea7367p10fac7jsnf9a1bfc88131'
    }
};

const req = https.request(options, function (res) {
    const chunks = [];

    res.on('data', function (chunk) {
        chunks.push(chunk);
    });

    res.on('end', function () {
        const body = Buffer.concat(chunks);
        try {
            const data = JSON.parse(body.toString());
            console.log('--- LIVE DATA SAMPLE ---');
            // Check if data is array or object/array
            const list = Array.isArray(data) ? data : (data.data || []);

            console.log(`Found ${list.length} live tournaments`);

            if (list.length > 0) {
                const firstTourney = list[0];
                console.log('Tournament:', firstTourney.name || firstTourney.league_name);
                if (firstTourney.matches && firstTourney.matches.length > 0) {
                    const match = firstTourney.matches[0];
                    console.log('Match Sample:', JSON.stringify(match, null, 2));
                    // specifically check for 'current minute' or status
                }
            }
        } catch (e) {
            console.error('Error parsing JSON', e);
        }
    });
});

req.end();
