
const https = require('https');

const url = 'https://vxsolicapdcpemfsahbk.supabase.co/rest/v1/matches?select=count';
const apiKey = 'YOUR_SUPABASE_KEY_HERE';

console.log('Sending request to Supabase...');

const options = {
    headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`
    },
    timeout: 10000 // 10 seconds
};

const req = https.get(url, options, (res) => {
    console.log('Status Code:', res.statusCode);
    console.log('Headers:', res.headers);

    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('Body:', data);
    });
});

req.on('error', (e) => {
    console.error('Error:', e.message);
});

req.on('timeout', () => {
    console.error('Request timed out after 10s');
    req.destroy();
});
