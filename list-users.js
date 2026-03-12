
const { createClient } = require('@supabase/supabase-js');

async function test() {
    const url = 'https://vxsolicapdcpemfsahbk.supabase.co';
    const key = 'YOUR_SUPABASE_SERVICE_ROLE_KEY'; // SERVICE ROLE KEY

    console.log('Listing users via Service Role key...');

    const supabase = createClient(url, key);

    try {
        const { data, error } = await supabase.from('users').select('*').limit(10);
        if (error) {
            console.error('Error fetching users:', error.message);
        } else {
            console.log('Users found:', data.length);
            data.forEach(u => {
                console.log(`- ${u.email} [${u.role}] (id: ${u.id})`);
            });
        }
    } catch (e) {
        console.error('Exception:', e.message);
    }
}

test();
