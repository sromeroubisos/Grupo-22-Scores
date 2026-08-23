/**
 * Súper 9 "B" 2026, 13ª fecha (22/08). Los cuatro partidos y el libre.
 *
 *   npx tsx src/scripts/super9-b-2026-fecha13.ts            # dry-run
 *   npx tsx src/scripts/super9-b-2026-fecha13.ts --apply
 *
 * La fuente publica el marcador, no los tries, así que el motor no puede ver el
 * bonus ofensivo solo. Los puntos van con override manual, como el resto del
 * torneo: con `points_autocalculated = false` el motor toma base y bonus de la
 * fila y no deduce nada.
 *
 * El bonus de cada partido sale de la tabla publicada por la Unión, que es el
 * único lugar donde el dato de tries llega hasta acá:
 *
 *   · Alta Gracia 26-17 Córdoba → Alta Gracia suma 5, o sea ofensivo (4 tries,
 *     26 = 4T + 3C). Córdoba pierde por 9: fuera del defensivo.
 *   · La Carlota 15-19 San Francisco → La Carlota pierde por 4, defensivo. San
 *     Francisco gana con 19 puntos: menos de 4 tries, sin ofensivo.
 *   · Santa Rosa 11-7 Río III → Santa Rosa gana sin ofensivo (11 puntos). Río III
 *     pierde por 4: defensivo.
 *
 * Baguales quedó libre: no hay fila que tocar.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const TORNEO = 'b6ed4086-2e75-4e68-962b-2d2363c9694c';
const FASE = '4fce0ada-db34-4b22-8354-54af7956d8e4';
const ROLLBACK = 'SUPER9_B_FECHA13_ROLLBACK.json';
const MOTIVO = 'Resultado y bonus de la 13ª fecha del Súper 9 "B", según la tabla publicada por la Unión Cordobesa.';

type Carga = {
    id: string;
    home: string;
    away: string;
    homeScore: number;
    awayScore: number;
    homeBase: number;
    awayBase: number;
    homeBonus: number;
    awayBonus: number;
};

const FECHA: Carga[] = [
    {
        id: 'd99ff34e-f3fc-4d8d-b0ba-14e29756f840',
        home: 'alta-gracia-r-c', away: 'cordoba-rugby-club',
        homeScore: 26, awayScore: 17,
        homeBase: 4, homeBonus: 1, awayBase: 0, awayBonus: 0,
    },
    {
        id: '0b616c1a-ee4d-4cf3-b2d2-2037b071053d',
        home: 'c-s-la-carlota', away: 'san-francisco-r-c',
        homeScore: 15, awayScore: 19,
        homeBase: 0, homeBonus: 1, awayBase: 4, awayBonus: 0,
    },
    {
        id: '8afeeeeb-c9aa-403c-abd9-d285bac9d425',
        home: 'santa-rosa-r-c-c', away: 'rio-tercero-r-c',
        homeScore: 11, awayScore: 7,
        homeBase: 4, homeBonus: 0, awayBase: 0, awayBonus: 1,
    },
];

/** La fila de `matches` tal como la pide este script. */
type FilaPartido = {
    id: string;
    tournament_id: string | null;
    phase_id: string | null;
    season_id: string | null;
    date_time: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    score: Record<string, number> | null;
    status: string | null;
    home_base_points: number | null;
    away_base_points: number | null;
    home_bonus_points: number | null;
    away_bonus_points: number | null;
    points_autocalculated: boolean | null;
    points_override_reason: string | null;
};

/** La tabla que tiene que quedar, tal como la publicó la Unión. */
const ESPERADA: Array<{ club: string; pj: number; pg: number; pp: number; pts: number }> = [
    { club: 'baguales-r-c', pj: 11, pg: 9, pp: 2, pts: 48 },
    { club: 'cordoba-rugby-club', pj: 11, pg: 9, pp: 2, pts: 45 },
    { club: 'alta-gracia-r-c', pj: 12, pg: 9, pp: 3, pts: 45 },
    { club: 'los-cuervos-r-c', pj: 12, pg: 9, pp: 3, pts: 44 },
    { club: 'san-francisco-r-c', pj: 12, pg: 6, pp: 6, pts: 33 },
    { club: 'c-s-la-carlota', pj: 11, pg: 3, pp: 8, pts: 21 },
    { club: 'santa-rosa-r-c-c', pj: 11, pg: 4, pp: 7, pts: 18 },
    { club: 'rio-tercero-r-c', pj: 12, pg: 3, pp: 9, pts: 14 },
    { club: 'aero-club-rio-iv', pj: 12, pg: 0, pp: 12, pts: 0 },
];

async function main() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    const { data: filas, error } = await supabase
        .from('matches')
        .select('id, tournament_id, phase_id, season_id, date_time, home_club_id, away_club_id, score, status, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason')
        .in('id', FECHA.map((c) => c.id));
    if (error || !filas) { console.error('No pude leer los partidos.', error); process.exit(1); }

    const rows = filas as unknown as FilaPartido[];
    const porId = new Map(rows.map((f) => [f.id, f]));
    let seasonId: string | null = null;

    for (const carga of FECHA) {
        const fila = porId.get(carga.id);
        if (!fila) { console.error('Falta el partido', carga.id); process.exit(1); }
        if (fila.tournament_id !== TORNEO || fila.phase_id !== FASE) {
            console.error('El partido no es de este torneo/fase:', carga.id); process.exit(1);
        }
        if (fila.home_club_id !== carga.home || fila.away_club_id !== carga.away) {
            console.error(`El cruce no coincide en ${carga.id}: ${fila.home_club_id} vs ${fila.away_club_id}`);
            process.exit(1);
        }
        if (!String(fila.date_time).startsWith('2026-08-22')) {
            console.error(`El partido ${carga.id} no es del 22/08 sino del ${String(fila.date_time).slice(0, 10)}`);
            process.exit(1);
        }
        seasonId = fila.season_id ?? seasonId;

        const sc = (fila.score ?? {}) as Record<string, number>;
        console.log(`${carga.home} vs ${carga.away}`);
        console.log(`  antes: ${fila.status} ${sc.home ?? '-'}-${sc.away ?? '-'} · ${fila.home_base_points}+${fila.home_bonus_points} / ${fila.away_base_points}+${fila.away_bonus_points} · auto=${fila.points_autocalculated}`);
        console.log(`  ahora: final ${carga.homeScore}-${carga.awayScore} · ${carga.homeBase}+${carga.homeBonus} / ${carga.awayBase}+${carga.awayBonus} · auto=false`);
    }
    console.log('baguales-r-c: libre, no se toca nada.');

    if (!APPLY) { console.log('\nDRY-RUN. Nada se escribió. Repetí con --apply.'); return; }

    // El rollback se acumula: la 13ª fecha se cargó en dos tandas y la primera
    // dejó su estado anterior en este mismo archivo.
    const fs = await import('node:fs/promises');
    let previo: Array<{ id: string; antes: unknown }> = [];
    try { previo = JSON.parse(await fs.readFile(ROLLBACK, 'utf8')); } catch { previo = []; }
    const yaGuardados = new Set(previo.map((p) => p.id));
    for (const fila of rows) {
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
                points_override_reason: fila.points_override_reason,
            },
        });
    }
    await fs.writeFile(ROLLBACK, JSON.stringify(previo, null, 2), 'utf8');

    for (const carga of FECHA) {
        const { error: upErr } = await supabase.from('matches').update({
            status: 'final',
            score: { home: carga.homeScore, away: carga.awayScore },
            home_base_points: carga.homeBase,
            away_base_points: carga.awayBase,
            home_bonus_points: carga.homeBonus,
            away_bonus_points: carga.awayBonus,
            points_autocalculated: false,
            points_override_reason: MOTIVO,
        }).eq('id', carga.id);
        if (upErr) { console.error('Falló el update de', carga.id, upErr); process.exit(1); }
    }

    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    const r = await recalculatePhaseStandingsScopes(TORNEO, FASE, 'general', seasonId);
    console.log(`\nTabla: ${r.ok ? 'ok' : 'FALLÓ'} · ${r.rows_calculated} filas`);
    if (r.rows_calculated === 0) {
        console.error('Cero filas: revisá `tournament_phase_participants` (season_id NULL o asignaciones sin crear).');
        process.exit(1);
    }

    const { data: tablaRaw } = await supabase
        .from('tournament_standings')
        .select('club_id, position, played, won, drawn, lost, points, scored, conceded')
        .eq('tournament_id', TORNEO).eq('phase_id', FASE).order('position');
    const tabla = (tablaRaw ?? []) as unknown as Array<{
        club_id: string; position: number; played: number; won: number;
        drawn: number; lost: number; points: number; scored: number; conceded: number;
    }>;

    console.log('\n== TABLA RESULTANTE vs PUBLICADA ==');
    console.log('POS CLUB                      PJ PG PE PP   PF   PC   DIF  PTS   ESPERADO');
    let difs = 0;
    for (const fila of tabla) {
        const esp = ESPERADA.find((e) => e.club === fila.club_id);
        const ok = esp && esp.pj === fila.played && esp.pg === fila.won && esp.pp === fila.lost && esp.pts === fila.points;
        if (!ok) difs++;
        const marca = ok ? 'ok' : (esp ? `PJ ${esp.pj} PG ${esp.pg} PP ${esp.pp} PTS ${esp.pts}` : 'sin fila publicada');
        console.log(
            String(fila.position).padStart(2) + '  ' + String(fila.club_id).padEnd(24)
            + String(fila.played).padStart(3) + String(fila.won).padStart(3) + String(fila.drawn).padStart(3) + String(fila.lost).padStart(3)
            + String(fila.scored).padStart(5) + String(fila.conceded).padStart(5) + String(fila.scored - fila.conceded).padStart(6)
            + String(fila.points).padStart(5) + '   ' + marca);
    }
    console.log(difs === 0 ? '\nLa tabla coincide con la publicada.' : `\n${difs} fila(s) no coinciden con la publicada.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
