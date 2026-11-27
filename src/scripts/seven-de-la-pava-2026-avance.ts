/**
 * Seven de la Pava 2026: prende el avance automático y, si hace falta, lo fuerza a mano.
 *
 *   npx tsx src/scripts/seven-de-la-pava-2026-avance.ts            # muestra el estado
 *   npx tsx src/scripts/seven-de-la-pava-2026-avance.ts --apply    # prende la bandera y completa
 *
 * Lo normal es no correrlo: con `autoAdvanceFromLabels: true` en la temporada, cada
 * resultado que se guarda por la app completa solo los cruces cuyo grupo terminó
 * (src/lib/server/advanceFromGroupLabels.ts). Esto sirve si un resultado entró por un
 * camino que no pasa por FixtureService (SQL directo, un sync externo).
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const SLUGS = ['seven-de-la-pava-2026', 'seven-de-la-pava-2026-femenino'];

async function main() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { advanceSeasonFromGroupLabels, planGroupLabelAdvancement } = await import('@/lib/server/advanceFromGroupLabels');
    const sb = createAdminClient();

    for (const slug of SLUGS) {
        const { data: t } = await sb.from('tournaments').select('id, name, current_season_id').eq('slug', slug).single();
        if (!t) throw new Error(`No existe ${slug}`);
        const season = t.current_season_id as string;
        const { data: s } = await sb.from('tournament_seasons').select('settings').eq('id', season).single();
        const settings = (s?.settings ?? {}) as Record<string, unknown>;
        console.log(`\n## ${t.name} · automático: ${settings.autoAdvanceFromLabels ? 'sí' : 'NO'}`);

        const { data: groups } = await sb.from('tournament_groups').select('id, name, phase_id').eq('season_id', season);
        const { data: ms } = await sb.from('matches')
            .select('id, phase_id, group_id, status, home_club_id, away_club_id, score, home_source_label, away_source_label, is_visible, bracket_match_code')
            .eq('season_id', season);
        const { updates, standings } = planGroupLabelAdvancement(groups ?? [], ms ?? []);
        for (const [g, orden] of standings) console.log(`  ${g}: ${orden.map((c, i) => `${i + 1}º ${c}`).join(' · ')}`);
        for (const u of updates) {
            const m = (ms ?? []).find((x) => x.id === u.id)!;
            console.log(`  ${m.bracket_match_code}: ${m.home_source_label} = ${u.home_club_id ?? '—'}  vs  ${m.away_source_label} = ${u.away_club_id ?? '—'}`);
        }
        if (!updates.length) console.log('  nada para completar');
        if (!APPLY) continue;

        if (!settings.autoAdvanceFromLabels) {
            const { error } = await sb.from('tournament_seasons').update({ settings: { ...settings, autoAdvanceFromLabels: true } }).eq('id', season);
            if (error) throw new Error(`Bandera: ${error.message}`);
            console.log('  + autoAdvanceFromLabels prendido');
        }
        const r = await advanceSeasonFromGroupLabels(sb, t.id as string, season);
        if (!r.ok) throw new Error(r.error);
        console.log(`  cruces actualizados: ${r.changed}`);
        if (r.changed) {
            const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
            const fases = Array.from(new Set<string>((groups ?? []).map((g: { phase_id: unknown }) => String(g.phase_id))));
            for (const f of fases) await recalculatePhaseStandingsScopes(t.id as string, f, 'general', season);
        }
    }
    if (!APPLY) console.log('\nNo se escribió nada. Repetí con --apply.');
}

main().catch((e) => { console.error(e); process.exit(1); });
