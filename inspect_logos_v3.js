const https = require('https');

const options = {
    method: 'GET',
    hostname: 'flashscore4.p.rapidapi.com',
    path: '/api/flashscore/v2/matches/list?day=0&sport_id=8',
    headers: {
        'x-rapidapi-key': '32e9f1aee1msha3c5470d1ea7367p10fac7jsnf9a1bfc88131',
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
                    const m = t.matches[0];
                    console.log('HOME LOGO KEYS:', Object.keys(m.home_team).filter(k => k.includes('image') || k.includes('logo') || k.includes('path')));
                    console.log('AWAY LOGO KEYS:', Object.keys(m.away_team).filter(k => k.includes('image') || k.includes('logo') || k.includes('path')));
                    console.log('HOME OBJECT:', m.home_team);
                    return;
                }
            }
        } catch (e) { console.error(e); }
    });
});
req.end();
