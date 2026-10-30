/**
 * Recalcula y persiste la tabla de UNA fase (no todas las del torneo, como
 * arusa-recalcular.ts: un torneo compartido arrastra fases de otras temporadas).
 *
 *   npx tsx src/scripts/recalcular-fase.ts --torneo=<uuid> --fase=<uuid> [--temporada=<uuid>]
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;
const TORNEO = arg('torneo');
const FASE = arg('fase');
const TEMPORADA = arg('temporada');
if (!TORNEO || !FASE) { console.error('Falta --torneo=<uuid> --fase=<uuid> [--temporada=<uuid>]'); process.exit(1); }

async function main() {
    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    const r = await recalculatePhaseStandingsScopes(TORNEO!, FASE!, 'general', TEMPORADA);
    console.log(`${FASE}: ${r.ok ? 'ok' : 'FALLÓ'} · ${r.rows_calculated} filas · ${r.scopes_recalculated} ámbitos`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
