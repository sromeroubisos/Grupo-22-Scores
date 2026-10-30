import path from 'node:path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
async function main() {
    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    const T = 'c1e37680-3f1e-482a-8dc6-c14f4ba417c7', S = 'cf1790e1-81cd-461c-a7a2-a9bce971eee3';
    const r = await recalculatePhaseStandingsScopes(T, '25e3fe65-111c-4a9c-8499-09cc4e87ea67', 'general', S);
    console.log(r.ok ? 'ok' : 'FALLÓ', r.rows_calculated, 'filas');
}
main().catch((e) => { console.error(e); process.exit(1); });
