const https = require('https');

const options = {
    method: 'GET',
    hostname: 'flashscore4.p.rapidapi.com',
    path: '/api/flashscore/v2/matches/list?day=0&sport_id=8',
    headers: {
        'x-rapidapi-host': 'flashscore4.p.rapidapi.com',
        'x-rapidapi-key': '32e9f1aee1msha3c5470d1ea7367p10fac7jsnf9a1bfc88131'
    }
};

const req = https.request(options, function (res) {
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        try {
            const data = JSON.parse(body);
            const list = Array.isArray(data) ? data : (data.data || []);
            let match = null;
            for (const t of list) {
                if (t.matches && t.matches.length > 0) { match = t.matches[0]; break; }
            }
            if (match) {
                console.log('HOME KEYS:', Object.keys(match.home_team || {}));
                console.log('HOME TEAM:', match.home_team);
                console.log('AWAY KEYS:', Object.keys(match.away_team || {}));
                console.log('AWAY TEAM:', match.away_team);
            } else {
                console.log('No match found');
            }
        } catch (e) { console.error(e); }
    });
});
req.end();
