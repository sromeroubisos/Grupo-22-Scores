const M = require('node:module'); const _l = M._load; M._load = function (r, ...a) { return (r === 'server-only' || r === 'client-only') ? {} : _l.call(this, r, ...a); };
import path from 'node:path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
async function main() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const mod = await import('@/lib/server/matchesFeedInvalidation');
    await mod.invalidateMatchesFeedCaches(createAdminClient());
    console.log('cachés del feed invalidados');
}
main().catch((e) => { console.error(e); process.exit(1); });
