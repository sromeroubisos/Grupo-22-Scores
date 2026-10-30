import path from 'node:path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
async function main() {
    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    const T = '60b228c6-e85b-41fb-8f01-8357f49e2f3a', S = 'fc436b86-31cd-42f0-9a33-56fa98edda07';
    const fases = [
        '7aae2666-8a0b-4650-a9ab-66c5841830bf', 'd9ab8150-5ed2-4c75-b083-ad056d1d34a2',
        '6da4ae0b-9747-4557-b3ed-55184973b247', 'a91db79e-6cde-4164-9c99-9b425ab596a7', 'dd93b692-5e70-4e9b-b23b-40bcd44c7fe2',
    ];
    for (const f of fases) {
        const r = await recalculatePhaseStandingsScopes(T, f, 'general', S);
        console.log(f.slice(0, 8), r.ok ? 'ok' : 'FALLÓ', r.rows_calculated, 'filas');
    }
}
main().catch((e) => { console.error(e); process.exit(1); });
