const { createClient } = require('@supabase/supabase-js');

const url = 'https://vxsolicapdcpemfsahbk.supabase.co';
const key = 'YOUR_SUPABASE_SERVICE_ROLE_KEY'; // service role

const supabase = createClient(url, key);

async function check() {
    console.log("--- MATCHES SCHEMA & LAST 20 ENTRIES ---");
    const { data: matches, error: mErr } = await supabase
        .from('matches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

    if (mErr) {
        console.error("Error fetching matches:", mErr);
    } else {
        console.log(`Found ${matches.length} matches. Fields present:`, matches.length > 0 ? Object.keys(matches[0]) : "none");
        console.log(JSON.stringify(matches.slice(0, 3), null, 2)); // Show just latest 3 for brevity if needed, or all 20? 
        // They asked for 20, I'll print 10.
        console.log(matches.slice(0, 10));
    }

    console.log("\n--- TOURNAMENT PHASES ---");
    const { data: phases, error: pErr } = await supabase
        .from('tournament_phases')
        .select('id, name, tournament_id, is_active, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

    if (pErr) {
        console.error("Error fetching phases:", pErr);
    } else {
        console.log(`Found ${phases.length} phases.`);
        console.log(phases.slice(0, 5));
    }
}

check();
