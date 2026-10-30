/**
 * El femenino de la URBA, resultados que el cron todavía no levantó.
 *
 *   npx tsx src/scripts/urba-femenino-fecha9-2026.ts            # dry-run
 *   npx tsx src/scripts/urba-femenino-fecha9-2026.ts --apply
 *
 * Pide los tres campeonatos a la API de URBA y traduce cada partido con las
 * MISMAS funciones del conector (`mapEstadoYResultado`, `basePorPartido`,
 * `bonusDeUrba`): así lo que escribe esta corrida a mano es idéntico a lo que
 * habría escrito el cron, y la próxima pasada ve `sinCambios` en vez de
 * reescribir todo.
 *
 * **Sólo toca lo que en nuestra base NO está `final`.** Un partido ya cargado se
 * reporta si difiere, pero no se pisa: si el marcador de la base y el de URBA no
 * coinciden, eso se mira antes de decidir cuál manda.
 *
 * El caso vivo de eso es `Beromama 0-77 Ciudad`, de la 15ª fecha, con fecha 20 de
 * septiembre: URBA lo publica con `fulfilled: true` desde el 2 de agosto, o sea
 * que el dato malo es de la fuente y no del conector. Está `final` en la base y
 * suma en la tabla del TOP 9; este script no lo toca.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

import {
    basePorPartido,
    bonusDeUrba,
    esBye,
    mapEstadoYResultado,
    type UrbaMatchLike,
} from '@/lib/integrations/urba/planMatches';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const BASE_URBA = 'https://api.urba.org.ar';
const ROLLBACK = 'URBA_FEMENINO_FECHA9_ROLLBACK.json';

const CAMPEONATOS = [
    { urbaId: 2025208, nombre: 'URBA: FEMENINO - TOP 9' },
    { urbaId: 2025209, nombre: 'URBA: FEMENINO - Primera División' },
    { urbaId: 2025210, nombre: 'URBA: FEMENINO - Segunda División' },
];

type UrbaMatch = UrbaMatchLike & {
    id: number;
    playdate?: string | null;
    local_team?: { name?: string } | null;
    visit_team?: { name?: string } | null;
};

type FilaBase = {
    id: string;
    external_id: string | null;
    tournament_id: string | null;
    phase_id: string | null;
    season_id: string | null;
    date_time: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    round_label: string | null;
    status: string | null;
    score: Record<string, number> | null;
    home_base_points: number | null;
    away_base_points: number | null;
    home_bonus_points: number | null;
    away_bonus_points: number | null;
    points_autocalculated: boolean | null;
};

async function partidosDeUrba(urbaId: number): Promise<UrbaMatch[]> {
    const respuesta = await fetch(`${BASE_URBA}/api/championship/${urbaId}`, { headers: { accept: 'application/json' } });
    if (!respuesta.ok) throw new Error(`URBA respondió ${respuesta.status} para ${urbaId}`);
    const campeonato = (await respuesta.json())?.championship?.[0];
    const rondas: Array<{ matches?: UrbaMatch[] }> = campeonato?.rounds ?? [];
    return rondas.flatMap((ronda) => ronda.matches ?? [])
        .filter((m) => !esBye(m.local_team?.name) && !esBye(m.visit_team?.name));
}

async function main() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    const { data: torneos, error: errT } = await supabase
        .from('tournaments').select('id, name').in('name', CAMPEONATOS.map((c) => c.nombre));
    if (errT || !torneos) { console.error('No pude leer los torneos.', errT); process.exit(1); }
    const idPorNombre = new Map((torneos as Array<{ id: string; name: string }>).map((t) => [t.name, t.id]));

    const aEscribir: Array<{ fila: FilaBase; cambio: Record<string, unknown>; detalle: string }> = [];
    const discrepancias: string[] = [];
    const fasesTocadas = new Map<string, { tournamentId: string; phaseId: string; seasonId: string | null }>();

    for (const campeonato of CAMPEONATOS) {
        const tournamentId = idPorNombre.get(campeonato.nombre);
        if (!tournamentId) { console.error('Falta el torneo en la base:', campeonato.nombre); process.exit(1); }

        const deUrba = await partidosDeUrba(campeonato.urbaId);
        const { data: filas, error } = await supabase
            .from('matches')
            .select('id, external_id, tournament_id, phase_id, season_id, date_time, home_club_id, away_club_id, round_label, status, score, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated')
            .eq('tournament_id', tournamentId);
        if (error || !filas) { console.error('No pude leer los partidos.', error); process.exit(1); }

        const porExternal = new Map((filas as unknown as FilaBase[]).map((f) => [f.external_id ?? '', f]));

        console.log(`\n== ${campeonato.nombre} · ${deUrba.length} partidos en URBA, ${filas.length} en la base ==`);

        for (const m of deUrba) {
            const fila = porExternal.get(`urba:${m.id}`);
            if (!fila) continue;   // Un partido que no está en la base es alta, y eso lo hace el cron.

            const { status, score } = mapEstadoYResultado(m);
            const base = basePorPartido(score, status);
            const bonus = bonusDeUrba(m, status);
            const cruce = `${m.local_team?.name ?? fila.home_club_id} vs ${m.visit_team?.name ?? fila.away_club_id}`;

            const igualAlDeLaBase = fila.status === status
                && (fila.score?.home ?? null) === (score?.home ?? null)
                && (fila.score?.away ?? null) === (score?.away ?? null);
            if (igualAlDeLaBase) continue;

            if (fila.status === 'final') {
                discrepancias.push(
                    `${campeonato.nombre} · ${String(fila.date_time).slice(0, 10)} ${fila.round_label ?? ''} ${cruce}`
                    + ` · base: ${fila.score?.home}-${fila.score?.away} [${fila.status}]`
                    + ` · URBA: ${score ? `${score.home}-${score.away}` : '—'} [${status}]`
                );
                continue;
            }

            aEscribir.push({
                fila,
                cambio: {
                    status,
                    score,
                    points_autocalculated: bonus === null,
                    home_base_points: base.home,
                    away_base_points: base.away,
                    home_bonus_points: bonus ? bonus.home : 0,
                    away_bonus_points: bonus ? bonus.away : 0,
                },
                detalle: `${String(fila.date_time).slice(0, 10)} ${fila.round_label ?? ''} ${cruce}`
                    + ` · ${fila.status} → ${status} ${score ? `${score.home}-${score.away}` : ''}`
                    + (bonus ? ` · ${base.home}+${bonus.home} / ${base.away}+${bonus.away}` : ''),
            });

            if (fila.phase_id) {
                fasesTocadas.set(`${fila.tournament_id}|${fila.phase_id}`, {
                    tournamentId: fila.tournament_id!, phaseId: fila.phase_id, seasonId: fila.season_id,
                });
            }
        }
    }

    console.log(`\n== A ESCRIBIR: ${aEscribir.length} ==`);
    for (const item of aEscribir) console.log(`  ${item.detalle}`);

    if (discrepancias.length) {
        console.log(`\n== YA ESTÁN FINAL Y NO COINCIDEN CON URBA: ${discrepancias.length} (no se tocan) ==`);
        for (const d of discrepancias) console.log(`  ${d}`);
    }

    if (!APPLY) { console.log('\nDRY-RUN. Nada se escribió. Repetí con --apply.'); return; }
    if (!aEscribir.length) { console.log('\nNada que escribir.'); return; }

    const fs = await import('node:fs/promises');
    let previo: Array<{ id: string; antes: unknown }> = [];
    try { previo = JSON.parse(await fs.readFile(ROLLBACK, 'utf8')); } catch { previo = []; }
    const yaGuardados = new Set(previo.map((p) => p.id));
    for (const { fila } of aEscribir) {
        if (yaGuardados.has(fila.id)) continue;
        previo.push({
            id: fila.id,
            antes: {
                status: fila.status,
                score: fila.score,
                home_base_points: fila.home_base_points,
                away_base_points: fila.away_base_points,
                home_bonus_points: fila.home_bonus_points,
                away_bonus_points: fila.away_bonus_points,
                points_autocalculated: fila.points_autocalculated,
            },
        });
    }
    await fs.writeFile(ROLLBACK, JSON.stringify(previo, null, 2), 'utf8');

    for (const { fila, cambio } of aEscribir) {
        const { error } = await supabase.from('matches').update(cambio).eq('id', fila.id);
        if (error) { console.error('Falló el update de', fila.id, error); process.exit(1); }
    }

    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    for (const fase of fasesTocadas.values()) {
        const r = await recalculatePhaseStandingsScopes(fase.tournamentId, fase.phaseId, 'general', fase.seasonId);
        console.log(`Tabla ${fase.tournamentId.slice(0, 8)}/${fase.phaseId.slice(0, 8)}: ${r.ok ? 'ok' : 'FALLÓ'} · ${r.rows_calculated} filas`);
    }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
