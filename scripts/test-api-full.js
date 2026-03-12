const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not found in environment.');
    process.exit(1);
}

const tables = [
    'tournaments',
    'matches',
    'clubs',
    'unions',
    'news',
    'discipline_incidents',
    'discipline_sanctions',
    'regulations'
];

async function testAll() {
    console.log(`--- Testing Supabase REST API (URL: ${url}) ---`);

    for (const table of tables) {
        const endpoint = `${url}/rest/v1/${table}?select=*`;
        try {
            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    'apikey': key,
                    'Authorization': `Bearer ${key}`,
                    'Prefer': 'count=exact'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[${table}] FAILED (${response.status}): ${errorText}`);
            } else {
                const count = response.headers.get('content-range')?.split('/')?.[1] || '0';
                console.log(`[${table}] OK - count: ${count}`);
            }
        } catch (err) {
            console.error(`[${table}] CRITICAL ERROR: ${err.message}`);
        }
    }
}

testAll();
