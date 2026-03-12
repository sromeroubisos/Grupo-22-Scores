const https = require('https');

const options = {
    method: 'GET',
    hostname: 'flashscore4.p.rapidapi.com',
    path: '/api/flashscore/v2/matches/list?day=0&sport_id=8',
    headers: {
        'x-rapidapi-key': 'YOUR_RAPIDAPI_KEY_HERE',
        'x-rapidapi-host': 'flashscore4.p.rapidapi.com'
    }
};

const req = https.request(options, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            const list = Array.isArray(json) ? json : (json.data || []);
            for (const t of list) {
                if (t.matches && t.matches.length > 0) {
                    const ht = t.matches[0].home_team;
                    Object.keys(ht).forEach(k => {
                        if (k.includes('image')) console.log('KEY FOUND:', k, 'VALUE:', ht[k]);
                    });
                    return;
                }
            }
        } catch (e) { console.error(e); }
    });
});
req.end();
