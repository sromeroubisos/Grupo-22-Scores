/**
 * Recalcula y persiste la tabla de posiciones de un torneo después de un
 * import. `arusa-torneo.ts` escribe partidos por PostgREST y no pasa por el
 * gestor, así que `tournament_standings` queda con la foto vieja hasta que
 * alguien la rehace.
 *
 *   npx tsx src/scripts/arusa-recalcular.ts --torneo=<slug o uuid>
 *
 * El cron `/api/cron/arusa-sync` ya lo hace solo; esto es para las corridas a
 * mano del script.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;
const TORNEO = arg('torneo');
if (!TORNEO) { console.error('Falta --torneo=<slug o uuid>'); process.exit(1); }

async function main() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    const supabase = createAdminClient();

    const columna = /^[0-9a-f-]{36}$/i.test(TORNEO!) ? 'id' : 'slug';
    const { data: torneos } = await supabase.from('tournaments').select('id, name').eq(columna, TORNEO!).limit(1);
    const torneo = torneos?.[0];
    if (!torneo) { console.error(`No existe el torneo "${TORNEO}".`); process.exit(1); }

    const { data: fases } = await supabase
        .from('tournament_phases').select('id, name, season_id')
        .eq('tournament_id', torneo.id).order('order_index', { ascending: true });
    if (!fases?.length) { console.error(`"${torneo.name}" no tiene fases.`); process.exit(1); }

    for (const fase of fases) {
        const r = await recalculatePhaseStandingsScopes(torneo.id, fase.id, 'general', fase.season_id ?? null);
        console.log(`${torneo.name} · ${fase.name}: ${r.ok ? 'ok' : 'FALLÓ'} · ${r.rows_calculated} filas · ${r.scopes_recalculated} ámbitos`);
    }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
