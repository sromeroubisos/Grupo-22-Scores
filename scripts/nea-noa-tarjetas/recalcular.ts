import path from 'node:path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
async function main() {
    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    const T = 'b0562cf3-4ea1-463e-86cb-86988dc22f10', S = '2c9d7e30-5481-44fd-8226-3b3fec34f20a';
    for (const f of ['c56764e6-b400-489d-81eb-07b768d61eb2', '36496ee9-0fa1-417c-9597-e77c75b6a9ac']) {
        const r = await recalculatePhaseStandingsScopes(T, f, 'general', S);
        console.log(f.slice(0, 8), r.ok ? 'ok' : 'FALLÓ', r.rows_calculated, 'filas');
    }
}
main().catch((e) => { console.error(e); process.exit(1); });
