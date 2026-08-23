/**
 * Súper 9 "B" 2026: repara el bonus de las fechas del 13/06 y del 20/06, y pone
 * el mano a mano antes que la diferencia de puntos en el desempate de la fase.
 *
 *   npx tsx src/scripts/super9-b-2026-reparar-bonus.ts            # dry-run
 *   npx tsx src/scripts/super9-b-2026-reparar-bonus.ts --apply
 *
 * El síntoma era San Francisco: la tabla publicada por la Unión lo pone en 33 y
 * acá quedaba en 34. El punto de más no estaba en la fecha que se cargaba.
 *
 *   · 13/06 — los cuatro partidos entraron con `points_autocalculated: true` y
 *     sin tries, así que el motor no tenía con qué dar el bonus ofensivo. Los
 *     cuatro ganadores golearon y quedaron sin él.
 *   · 20/06 — entraron a mano con +2 al ganador. El ofensivo es uno solo: un
 *     ganador no puede llevar dos. Y San Francisco, perdiendo 12-33, se llevó +2
 *     sin que le entre ni el ofensivo (12 puntos no son 4 tries) ni el defensivo
 *     (21 de diferencia).
 *
 * En Baguales, Alta Gracia y Córdoba los dos errores se anulaban (+1 y −1) y el
 * total coincidía igual: por eso la tabla parecía sana y el único que no cerraba
 * era el club donde el error no se compensaba.
 *
 * El desempate es lo otro: la fase ordenaba por diferencia antes que por mano a
 * mano, y con 45 iguales eso ponía a Alta Gracia arriba de Córdoba. La Unión
 * publica al revés.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const TORNEO = 'b6ed4086-2e75-4e68-962b-2d2363c9694c';
const FASE = '4fce0ada-db34-4b22-8354-54af7956d8e4';
const ROLLBACK = 'SUPER9_B_JUNIO_BONUS_ROLLBACK.json';

type Arreglo = {
    id: string;
    cuando: string;
    home: string;
    away: string;
    homeScore: number;
    awayScore: number;
    homeBase: number;
    awayBase: number;
    homeBonus: number;
    awayBonus: number;
    porque: string;
};

const ARREGLOS: Arreglo[] = [
    // 13/06: falta el ofensivo del ganador. El perdedor no cambia (ninguno entra
    // al defensivo), pero la fila pasa a manual para que el motor no vuelva a
    // deducir con los tries que no tiene.
    {
        id: '09f5d18f-3f81-44cc-b9ca-240da690fb29', cuando: '2026-06-13',
        home: 'alta-gracia-r-c', away: 'c-s-la-carlota', homeScore: 34, awayScore: 23,
        homeBase: 4, homeBonus: 1, awayBase: 0, awayBonus: 0,
        porque: 'Alta Gracia gana con 34: ofensivo. La Carlota pierde por 11, sin defensivo.',
    },
    {
        id: 'c15573a0-4120-4163-bb83-c94ef514e818', cuando: '2026-06-13',
        home: 'baguales-r-c', away: 'santa-rosa-r-c-c', homeScore: 55, awayScore: 16,
        homeBase: 4, homeBonus: 1, awayBase: 0, awayBonus: 0,
        porque: 'Baguales gana con 55: ofensivo. Santa Rosa pierde por 39.',
    },
    {
        id: '4740d45c-d5db-4656-83e5-478827eab2cf', cuando: '2026-06-13',
        home: 'cordoba-rugby-club', away: 'rio-tercero-r-c', homeScore: 38, awayScore: 8,
        homeBase: 4, homeBonus: 1, awayBase: 0, awayBonus: 0,
        porque: 'Córdoba gana con 38: ofensivo. Río III pierde por 30.',
    },
    {
        id: '12fd7e7f-d244-4755-9922-2c496f1a47ee', cuando: '2026-06-13',
        home: 'aero-club-rio-iv', away: 'san-francisco-r-c', homeScore: 14, awayScore: 39,
        homeBase: 0, homeBonus: 0, awayBase: 4, awayBonus: 1,
        porque: 'San Francisco gana con 39: ofensivo. Aero Club pierde por 25.',
    },
    // 20/06: el +2 al ganador no existe, y el perdedor de 12-33 no suma nada.
    {
        id: 'f7c3394f-bfc8-481e-8066-642c9f0a8918', cuando: '2026-06-20',
        home: 'san-francisco-r-c', away: 'cordoba-rugby-club', homeScore: 12, awayScore: 33,
        homeBase: 0, homeBonus: 0, awayBase: 4, awayBonus: 1,
        porque: 'Córdoba gana: un solo ofensivo. San Francisco pierde por 21 con 12 puntos: nada.',
    },
    {
        id: '8578f0ad-f0fe-414f-b025-86ec2f80180c', cuando: '2026-06-20',
        home: 'rio-tercero-r-c', away: 'baguales-r-c', homeScore: 10, awayScore: 64,
        homeBase: 0, homeBonus: 0, awayBase: 4, awayBonus: 1,
        porque: 'Baguales gana: un solo ofensivo. Río III pierde por 54.',
    },
    {
        id: '859458c4-5836-49d8-b6eb-993d956e1a6d', cuando: '2026-06-20',
        home: 'santa-rosa-r-c-c', away: 'alta-gracia-r-c', homeScore: 10, awayScore: 38,
        homeBase: 0, homeBonus: 0, awayBase: 4, awayBonus: 1,
        porque: 'Alta Gracia gana: un solo ofensivo. Santa Rosa pierde por 28.',
    },
];

/** La tabla publicada por la Unión tras la 13ª fecha, con su orden. */
const ESPERADA = [
    { pos: 1, club: 'baguales-r-c', pj: 11, pg: 9, pp: 2, pts: 48 },
    { pos: 2, club: 'cordoba-rugby-club', pj: 11, pg: 9, pp: 2, pts: 45 },
    { pos: 3, club: 'alta-gracia-r-c', pj: 12, pg: 9, pp: 3, pts: 45 },
    { pos: 4, club: 'los-cuervos-r-c', pj: 12, pg: 9, pp: 3, pts: 44 },
    { pos: 5, club: 'san-francisco-r-c', pj: 12, pg: 6, pp: 6, pts: 33 },
    { pos: 6, club: 'c-s-la-carlota', pj: 11, pg: 3, pp: 8, pts: 21 },
    { pos: 7, club: 'santa-rosa-r-c-c', pj: 11, pg: 4, pp: 7, pts: 18 },
    { pos: 8, club: 'rio-tercero-r-c', pj: 12, pg: 3, pp: 9, pts: 14 },
    { pos: 9, club: 'aero-club-rio-iv', pj: 12, pg: 0, pp: 12, pts: 0 },
];

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

type Desempate = { metric?: string; priority?: number; enabled?: boolean; order?: string };

/** Mueve el mano a mano justo detrás de los puntos y renumera las prioridades. */
function manoAManoPrimero(tiebreakers: Desempate[]): Desempate[] {
    const esManoAMano = (t: Desempate) => String(t?.metric ?? '').replace(/[\s_-]/g, '').toLowerCase() === 'headtohead';
    const esPuntos = (t: Desempate) => String(t?.metric ?? '').replace(/[\s_-]/g, '').toLowerCase() === 'points';
    const h2h = tiebreakers.find(esManoAMano);
    if (!h2h) return tiebreakers;
    const resto = tiebreakers.filter((t) => !esManoAMano(t));
    const iPuntos = resto.findIndex(esPuntos);
    const orden = [...resto];
    orden.splice(iPuntos + 1, 0, h2h);
    return orden.map((t, i) => ({ ...t, priority: i + 1 }));
}

async function main() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    const { data: filasRaw, error } = await supabase
        .from('matches')
        .select('id, tournament_id, phase_id, season_id, date_time, home_club_id, away_club_id, score, status, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason')
        .in('id', ARREGLOS.map((a) => a.id));
    if (error || !filasRaw) { console.error('No pude leer los partidos.', error); process.exit(1); }
    const filas = filasRaw as unknown as FilaPartido[];
    const porId = new Map(filas.map((f) => [f.id, f]));

    let seasonId: string | null = null;
    console.log('== PARTIDOS A REPARAR ==');
    for (const a of ARREGLOS) {
        const fila = porId.get(a.id);
        if (!fila) { console.error('Falta el partido', a.id); process.exit(1); }
        if (fila.tournament_id !== TORNEO || fila.phase_id !== FASE) {
            console.error('El partido no es de este torneo/fase:', a.id); process.exit(1);
        }
        if (fila.home_club_id !== a.home || fila.away_club_id !== a.away) {
            console.error(`El cruce no coincide en ${a.id}: ${fila.home_club_id} vs ${fila.away_club_id}`); process.exit(1);
        }
        if (!String(fila.date_time).startsWith(a.cuando)) {
            console.error(`El partido ${a.id} es del ${String(fila.date_time).slice(0, 10)}, no del ${a.cuando}`); process.exit(1);
        }
        const sc = (fila.score ?? {}) as Record<string, number>;
        if ((sc.home ?? -1) !== a.homeScore || (sc.away ?? -1) !== a.awayScore) {
            console.error(`El marcador guardado de ${a.id} es ${sc.home}-${sc.away}, no ${a.homeScore}-${a.awayScore}`); process.exit(1);
        }
        seasonId = fila.season_id ?? seasonId;

        console.log(`${a.cuando} ${a.home} ${a.homeScore}-${a.awayScore} ${a.away}`);
        console.log(`  antes: ${fila.home_base_points}+${fila.home_bonus_points} / ${fila.away_base_points}+${fila.away_bonus_points} · auto=${fila.points_autocalculated}`);
        console.log(`  ahora: ${a.homeBase}+${a.homeBonus} / ${a.awayBase}+${a.awayBonus} · auto=false`);
        console.log(`  ${a.porque}`);
    }

    const { data: faseRaw, error: fErr } = await supabase
        .from('tournament_phases').select('id, settings').eq('id', FASE).single();
    if (fErr || !faseRaw) { console.error('No pude leer la fase.', fErr); process.exit(1); }
    const fase = faseRaw as unknown as { id: string; settings: Record<string, unknown> };
    const antesTb = (fase.settings?.tiebreakers ?? []) as Desempate[];
    const despuesTb = manoAManoPrimero(antesTb);
    console.log('\n== DESEMPATE DE LA FASE ==');
    console.log('  antes: ' + antesTb.map((t) => t.metric).join(' > '));
    console.log('  ahora: ' + despuesTb.map((t) => t.metric).join(' > '));

    if (!APPLY) { console.log('\nDRY-RUN. Nada se escribió. Repetí con --apply.'); return; }

    const fs = await import('node:fs/promises');
    await fs.writeFile(ROLLBACK, JSON.stringify({
        partidos: filas.map((f) => ({
            id: f.id,
            antes: {
                home_base_points: f.home_base_points,
                away_base_points: f.away_base_points,
                home_bonus_points: f.home_bonus_points,
                away_bonus_points: f.away_bonus_points,
                points_autocalculated: f.points_autocalculated,
                points_override_reason: f.points_override_reason,
            },
        })),
        fase: { id: FASE, tiebreakers_antes: antesTb },
    }, null, 2), 'utf8');

    for (const a of ARREGLOS) {
        const { error: upErr } = await supabase.from('matches').update({
            home_base_points: a.homeBase,
            away_base_points: a.awayBase,
            home_bonus_points: a.homeBonus,
            away_bonus_points: a.awayBonus,
            points_autocalculated: false,
            points_override_reason: `Bonus corregido contra la tabla publicada por la Unión Cordobesa. ${a.porque}`,
        }).eq('id', a.id);
        if (upErr) { console.error('Falló el update de', a.id, upErr); process.exit(1); }
    }

    const { error: fUpErr } = await supabase.from('tournament_phases')
        .update({ settings: { ...fase.settings, tiebreakers: despuesTb } })
        .eq('id', FASE);
    if (fUpErr) { console.error('Falló el update de la fase.', fUpErr); process.exit(1); }

    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    const r = await recalculatePhaseStandingsScopes(TORNEO, FASE, 'general', seasonId);
    console.log(`\nTabla: ${r.ok ? 'ok' : 'FALLÓ'} · ${r.rows_calculated} filas`);
    if (r.rows_calculated === 0) { console.error('Cero filas.'); process.exit(1); }

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
        const ok = esp && esp.pos === fila.position && esp.pj === fila.played
            && esp.pg === fila.won && esp.pp === fila.lost && esp.pts === fila.points;
        if (!ok) difs++;
        const marca = ok ? 'ok' : (esp ? `POS ${esp.pos} PJ ${esp.pj} PG ${esp.pg} PP ${esp.pp} PTS ${esp.pts}` : 'sin fila publicada');
        console.log(
            String(fila.position).padStart(2) + '  ' + String(fila.club_id).padEnd(24)
            + String(fila.played).padStart(3) + String(fila.won).padStart(3) + String(fila.drawn).padStart(3) + String(fila.lost).padStart(3)
            + String(fila.scored).padStart(5) + String(fila.conceded).padStart(5) + String(fila.scored - fila.conceded).padStart(6)
            + String(fila.points).padStart(5) + '   ' + marca);
    }
    console.log(difs === 0 ? '\nLa tabla coincide con la publicada, fila por fila y en el mismo orden.' : `\n${difs} fila(s) no coinciden.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
