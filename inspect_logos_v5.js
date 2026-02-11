
const https = require('https');

const options = {
    method: 'GET',
    hostname: 'flashscore4.p.rapidapi.com',
    path: '/api/flashscore/v2/matches/list?day=-1&sport_id=8', // Try yesterday
    headers: {
        'x-rapidapi-host': 'flashscore4.p.rapidapi.com',
        'x-rapidapi-key': '32e9f1aee1msha3c5470d1ea7367p10fac7jsnf9a1bfc88131'
    }
};

function fetchDay(day) {
    options.path = `/api/flashscore/v2/matches/list?day=${day}&sport_id=8`;
    console.log(`Fetching day ${day}...`);

    const req = https.request(options, function (res) {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
            const body = Buffer.concat(chunks).toString();
            try {
                const data = JSON.parse(body);
                // The structure is usually Array of Tournaments? Or object with DATA?
                // Based on previous files it handles both.

                const list = Array.isArray(data) ? data : (data.DATA || data.data || []);

                if (list.length === 0) {
                    console.log(`No tournaments found for day ${day}.`);
                    if (day < 2) fetchDay(day + 1); // Try next day
                    return;
                }

                console.log(`Found data for day ${day}!`);

                // Find a match
                let foundMatch = null;
                for (const t of list) {
                    if (t.matches && t.matches.length > 0) {
                        foundMatch = t.matches[0];
                        break;
                    }
                }

                if (foundMatch) {
                    console.log('--- MATCH SAMPLE ---');
                    console.log('Match:', foundMatch.match_id || foundMatch.event_key);
                    console.log('Home Team Object:', JSON.stringify(foundMatch.home_team, null, 2));
                    console.log('Away Team Object:', JSON.stringify(foundMatch.away_team, null, 2));

                    console.log('Home Team Object (Alternative Keys):');
                    if (foundMatch.event_home_team) console.log('event_home_team:', JSON.stringify(foundMatch.event_home_team, null, 2));

                } else {
                    console.log('Tournaments found but no matches?');
                }

            } catch (e) { console.error(e); }
        });
    });
    req.end();
}

fetchDay(-2); // Start from day -2
