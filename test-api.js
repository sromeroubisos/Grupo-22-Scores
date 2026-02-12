
const API_KEY = '32e9f1aee1msha3c5470d1ea7367p10fac7jsnf9a1bfc88131';
const API_HOST = 'flashscore4.p.rapidapi.com';

async function test() {
    const url = `https://${API_HOST}/api/flashscore/v2/tournaments/standings?tournament_id=KKay4EE8&tournament_stage_id=OEEq9Yvp&type=overall`;
    try {
        const res = await fetch(url, {
            headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY }
        });
        console.log('Status:', res.status);
        const json = await res.json();
        console.log('Data:', JSON.stringify(json, null, 2));
    } catch (e) {
        console.error('Test failed', e);
    }
}

test();
