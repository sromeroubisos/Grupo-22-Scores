const https = require('https');

const options = {
    method: 'GET',
    hostname: 'flashscore4.p.rapidapi.com',
    path: '/api/flashscore/v2/matches/list?day=0&sport_id=8', // Rugby Union (ID 8)
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
            // Find a match with teams
            const tournaments = Array.isArray(data) ? data : (data.data || []);
            let foundMatch = null;
            for (const t of tournaments) {
                if (t.matches && t.matches.length > 0) {
                    foundMatch = t.matches[0];
                    break;
                }
            }

            if (foundMatch) {
                console.log('--- MATCH SAMPLE ---');
                console.log(JSON.stringify(foundMatch, null, 2));
            } else {
                console.log('No match found');
            }
        } catch (e) {
            console.error('Error parsing JSON', e);
        }
    });
});

req.end();
