/**
 * Recálculo de las tablas de posiciones de los torneos de la AAMH:
 *
 *   npx tsx src/scripts/aamh-recalcular-tablas.ts
 *   npx tsx src/scripts/aamh-recalcular-tablas.ts --anio 2025
 *
 * `tournament_standings` es una tabla PERSISTIDA, no una vista: un script que
 * escribe partidos la deja mintiendo hasta que alguien la rehace. El cron
 * `/api/cron/aamh-sync` recalcula sola la fase que tocó, pero la carga inicial
 * va por `aamh-sync-partidos.ts`, que escribe por PostgREST y no puede llamar
 * al recalculador —vive del lado del server de Next—. Este script cierra ese
 * hueco.
 *
 * Se corre UNA vez después de la carga. Del mantenimiento se ocupa el cron.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const ANIO = Number(process.argv[process.argv.indexOf('--anio') + 1]) || new Date().getUTCFullYear();

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
  const { parseTournamentExternalId } = await import('../lib/integrations/aamh/nombres.ts');

  const supabase = createAdminClient();

  const { data: torneos, error } = await supabase
    .from('tournaments')
    .select('id, name, external_id')
    .like('external_id', 'aamh:%');
  if (error) throw new Error(`No se pudieron leer los torneos: ${error.message}`);

  const delAnio = ((torneos ?? []) as { id: string; name: string; external_id: string }[]).filter((t) => {
    const clave = parseTournamentExternalId(t.external_id);
    return clave !== null && clave.anio === ANIO;
  });
  console.log(`Torneos de la AAMH ${ANIO}: ${delAnio.length}\n`);

  let filas = 0;
  const fallaron: string[] = [];

  for (const t of delAnio) {
    const { data: fases } = await supabase
      .from('tournament_phases')
      .select('id')
      .eq('tournament_id', t.id)
      .order('order_index', { ascending: true });

    for (const fase of (fases ?? []) as { id: string }[]) {
      try {
        const r = await recalculatePhaseStandingsScopes(t.id, fase.id, 'general');
        if (!r.ok) { fallaron.push(`${t.name} (fase ${fase.id})`); continue; }
        filas += r.rows_calculated;
        console.log(`  ✓ ${t.name}: ${r.rows_calculated} filas en ${r.scopes_recalculated} alcance(s)`);
      } catch (e) {
        fallaron.push(`${t.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  console.log(`\nTOTAL: ${filas} filas de tabla recalculadas.`);
  if (fallaron.length) {
    console.log(`\nFallaron (${fallaron.length}):`);
    for (const f of fallaron) console.log(`  ! ${f}`);
  }
  process.exit(fallaron.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
