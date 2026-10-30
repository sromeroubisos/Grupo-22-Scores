import path from 'node:path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
const TORNEOS = ['45bfef25-ec3f-4990-b6f5-e6ea7b3e3dd5', '62bf0694-f008-496f-bfa6-0efae8af1ce4', '683363b8-45a3-444b-a831-7345b0cbc40e'];
async function main() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const sb = createAdminClient();
    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    for (const t of TORNEOS) {
        const { data: fases } = await sb.from('tournament_phases').select('id, name, season_id').eq('tournament_id', t);
        for (const f of fases ?? []) {
            const r = await recalculatePhaseStandingsScopes(t, f.id, 'general', f.season_id);
            console.log(t.slice(0, 8), f.name, JSON.stringify(r)?.slice(0, 100));
        }
    }
}
main().catch((e) => { console.error(e); process.exit(1); });
