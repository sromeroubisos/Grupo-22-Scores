/**
 * Top 10 del Centro 2026: le faltaba un punto bonus a San Martín de Villa María.
 *
 *   npx tsx src/scripts/top10-centro-2026-bonus-san-martin.ts            # dry-run
 *   npx tsx src/scripts/top10-centro-2026-bonus-san-martin.ts --apply
 *
 * La tabla oficial le da 35 puntos y la nuestra mostraba 34. El hueco está en
 * el 29-21 sobre Universitario de Córdoba del 22/8, la única fila de las trece
 * de San Martín que quedó en `points_autocalculated: true`: sin tries cargados
 * el motor no puede ver el bonus ofensivo, y la diferencia de 8 puntos deja al
 * perdedor fuera del bonus defensivo, así que la fila salía 4-0 en vez de 5-0.
 *
 * Va como override manual, igual que las otras once de este mismo equipo: la
 * fuente publica el resultado y el bonus, no la cantidad de tries. Inventar un
 * `homeTries: 5` para que el motor lo dedujera sería fabricar un dato que nadie
 * publicó; el bonus, en cambio, está en la tabla oficial.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const TORNEO = '55f28144-3d92-484b-a57d-646e06740808';
const PARTIDO = '7c0298a2-9b5b-47db-aafd-90c01f865cfb'; // San Martín VM 29 - 21 Universitario de Córdoba

async function main() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    const { data: fila, error } = await supabase
        .from('matches')
        .select('id, tournament_id, phase_id, season_id, date_time, home_club_id, away_club_id, score, status, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason')
        .eq('id', PARTIDO)
        .single();
    if (error || !fila) { console.error('No existe el partido', PARTIDO, error); process.exit(1); }
    if (fila.tournament_id !== TORNEO) { console.error('El partido no es de este torneo.'); process.exit(1); }

    const sc = (fila.score ?? {}) as Record<string, number>;
    console.log(`${String(fila.date_time).slice(0, 10)} · ${fila.home_club_id} ${sc.home}-${sc.away} ${fila.away_club_id}`);
    console.log(`  antes: ${fila.home_base_points}+${fila.home_bonus_points} / ${fila.away_base_points}+${fila.away_bonus_points} · auto=${fila.points_autocalculated}`);
    console.log('  ahora: 4+1 / 0+0 · auto=false');

    if (!APPLY) { console.log('\nDRY-RUN. Nada se escribió. Repetí con --apply.'); return; }

    const fs = await import('node:fs/promises');
    await fs.writeFile('TOP10_CENTRO_SAN_MARTIN_ROLLBACK.json', JSON.stringify([{
        id: fila.id,
        antes: {
            home_base_points: fila.home_base_points,
            away_base_points: fila.away_base_points,
            home_bonus_points: fila.home_bonus_points,
            away_bonus_points: fila.away_bonus_points,
            points_autocalculated: fila.points_autocalculated,
            points_override_reason: fila.points_override_reason,
        },
    }], null, 2), 'utf8');

    const { error: upErr } = await supabase.from('matches').update({
        home_base_points: 4,
        away_base_points: 0,
        home_bonus_points: 1,
        away_bonus_points: 0,
        points_autocalculated: false,
        points_override_reason: 'Bonus ofensivo de San Martín según la tabla oficial de la UCR (Top 10 del Centro 2026).',
    }).eq('id', PARTIDO);
    if (upErr) { console.error(upErr); process.exit(1); }

    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    const r = await recalculatePhaseStandingsScopes(TORNEO, fila.phase_id!, 'general', fila.season_id ?? null);
    console.log(`\nTabla: ${r.ok ? 'ok' : 'FALLÓ'} · ${r.rows_calculated} filas`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
