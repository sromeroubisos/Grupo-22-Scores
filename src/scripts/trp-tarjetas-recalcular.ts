import path from 'node:path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
const TORNEOS = ['594fcb55-b052-4a8f-bf24-5a288e35e4f5', '9bd1fc54-f686-4b06-a6c4-aaa2badb894b', '62bf0694-f008-496f-bfa6-0efae8af1ce4', '683363b8-45a3-444b-a831-7345b0cbc40e', '8106fbcf-b9a7-4763-8a7f-3938c8668bf8', 'ee59eaf4-ce63-4691-b911-b593065490fb'];
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
