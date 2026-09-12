/**
 * Uruguayo de Clubes 2026 (Súper URU): los bonus que faltan para que las tablas
 * del Apertura y del Clausura digan lo mismo que la oficial.
 *
 *   npx tsx src/scripts/uruguayo-2026-tabla-oficial.ts            # dry-run
 *   npx tsx src/scripts/uruguayo-2026-tabla-oficial.ts --apply
 *
 * En este torneo un partido en AUTOMÁTICO no suma bonus: el ruleset guarda las
 * reglas como `phases[].standings.bonus_rules`, forma que el motor no lee, y
 * sin tries tampoco podría deducir el ofensivo. Por eso los partidos con bonus
 * pasan a cargarse a mano.
 *
 *   · APERTURA (tabla oficial, 11 fechas): ocho clubes tenían un punto de menos.
 *     Siete son un bonus de un partido cargado en automático; el reparto sale
 *     del marcador (el total por club es el de la tabla, cualquiera sea el
 *     partido). El octavo, Montevideo Cricket, tenía un -1 en el partido con
 *     Old Christians que la tabla oficial no descuenta (29 = 5 × 4 + 9).
 *   · CLAUSURA, fechas 1 y 2: la tabla importada de rugbyarchive (PJ 2) trae los
 *     bonus y los partidos estaban en automático, sin ninguno. El reparto es el
 *     único que cierra con esa tabla salvo Old Boys y Montevideo Cricket, que
 *     tienen uno solo en dos partidos; va al de 46-33, que da igual al total.
 *
 * Los PF/PC del Apertura no se tocan: la tabla oficial no cierra consigo misma
 * (el walkover de Trébol le suma 28 a favor y 21 en contra a Círculo de Tenis).
 */
import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const TORNEO = '271638cc-3351-42ce-81bd-ef091e82515d';
const TEMPORADA = '94818e51-34a2-4872-858c-9b0423e50435';
const ROLLBACK = 'URUGUAYO_2026_TABLA_OFICIAL_ROLLBACK.json';

type Arreglo = { fecha: string; home: string; away: string; homeBonus: number; awayBonus: number; razon: string };

const APERTURA = 'Tabla oficial del Apertura - Súper URU 2026: bonus del partido.';
const CLAUSURA = 'Tabla del Clausura - Súper URU 2026 a la fecha 2: bonus del partido.';

const ARREGLOS: Arreglo[] = [
    { fecha: '2026-06-20', home: 'carrasco-polo', away: 'club-seminario', homeBonus: 1, awayBonus: 1, razon: APERTURA },
    { fecha: '2026-05-30', home: 'trebol-de-paysandu', away: 'los-cuervos', homeBonus: 1, awayBonus: 0, razon: APERTURA },
    { fecha: '2026-06-20', home: 'psg', away: 'los-cuervos', homeBonus: 1, awayBonus: 1, razon: APERTURA },
    { fecha: '2026-06-20', home: 'lobos-pde', away: 'ceibos-club', homeBonus: 1, awayBonus: 1, razon: APERTURA },
    { fecha: '2026-03-14', home: 'old-christians-club', away: 'montevideo-c-c', homeBonus: 1, awayBonus: 0, razon: APERTURA },

    { fecha: '2026-08-01', home: 'montevideo-c-c', away: 'old-christians-club', homeBonus: 0, awayBonus: 1, razon: CLAUSURA },
    { fecha: '2026-08-01', home: 'old-boys-girls-club', away: 'los-cuervos', homeBonus: 0, awayBonus: 1, razon: CLAUSURA },
    { fecha: '2026-08-01', home: 'trebol-de-paysandu', away: 'carrasco-polo', homeBonus: 1, awayBonus: 1, razon: CLAUSURA },
    { fecha: '2026-08-01', home: 'champagnat', away: 'lobos-pde', homeBonus: 0, awayBonus: 1, razon: CLAUSURA },
    { fecha: '2026-08-01', home: 'circulo-de-tenis', away: 'psg', homeBonus: 1, awayBonus: 0, razon: CLAUSURA },
    { fecha: '2026-08-08', home: 'carrasco-polo', away: 'los-cuervos', homeBonus: 0, awayBonus: 1, razon: CLAUSURA },
    { fecha: '2026-08-08', home: 'ceibos-club', away: 'old-christians-club', homeBonus: 0, awayBonus: 1, razon: CLAUSURA },
    { fecha: '2026-08-08', home: 'champagnat', away: 'trebol-de-paysandu', homeBonus: 0, awayBonus: 1, razon: CLAUSURA },
    { fecha: '2026-08-08', home: 'circulo-de-tenis', away: 'club-seminario', homeBonus: 1, awayBonus: 0, razon: CLAUSURA },
    { fecha: '2026-08-08', home: 'lobos-pde', away: 'psg', homeBonus: 1, awayBonus: 0, razon: CLAUSURA },
    { fecha: '2026-08-08', home: 'montevideo-c-c', away: 'old-boys-girls-club', homeBonus: 1, awayBonus: 1, razon: CLAUSURA },
];

type Fila = {
    id: string;
    phase_id: string | null;
    season_id: string | null;
    date_time: string;
    home_club_id: string;
    away_club_id: string;
    status: string;
    score: Record<string, unknown> | null;
    home_base_points: number | null;
    away_base_points: number | null;
    home_bonus_points: number | null;
    away_bonus_points: number | null;
    points_autocalculated: boolean | null;
    points_override_reason: string | null;
};

async function main() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    const { data, error } = await supabase
        .from('matches')
        .select('id, phase_id, season_id, date_time, home_club_id, away_club_id, status, score, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason')
        .eq('tournament_id', TORNEO)
        .eq('season_id', TEMPORADA);
    if (error || !data) { console.error('No pude leer los partidos.', error); process.exit(1); }
    const filas = data as unknown as Fila[];

    const planes = ARREGLOS.map((a) => {
        const f = filas.find((m) => m.home_club_id === a.home && m.away_club_id === a.away && m.date_time.startsWith(a.fecha));
        if (!f) { console.error('No encontré', a.home, 'vs', a.away, a.fecha); process.exit(1); }
        if (f.status !== 'final') { console.error(a.home, 'vs', a.away, 'no está final.'); process.exit(1); }
        console.log(
            `${a.fecha} ${a.home} ${f.score?.home}-${f.score?.away} ${a.away}`,
            `| base ${f.home_base_points}/${f.away_base_points}`,
            `| bonus ${f.home_bonus_points}/${f.away_bonus_points} auto=${f.points_autocalculated}  ->  ${a.homeBonus}/${a.awayBonus} a mano`,
        );
        return { a, f };
    });

    if (!APPLY) { console.log('\nDry-run. Con --apply se escribe.'); return; }

    // Una segunda corrida no pisa el rollback con los valores ya corregidos.
    if (fs.existsSync(ROLLBACK)) {
        console.log('El rollback ya existe; se conserva el de la primera corrida:', ROLLBACK);
    } else {
        fs.writeFileSync(ROLLBACK, JSON.stringify(planes.map(({ f }) => f), null, 2));
        console.log('Rollback en', ROLLBACK);
    }

    for (const { a, f } of planes) {
        const { error: upErr } = await supabase.from('matches').update({
            home_bonus_points: a.homeBonus,
            away_bonus_points: a.awayBonus,
            points_autocalculated: false,
            points_override_reason: a.razon,
        }).eq('id', f.id);
        if (upErr) { console.error('Falló', a.home, a.away, upErr); process.exit(1); }
    }
    console.log('ok', planes.length, 'partidos');

    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    for (const fase of [...new Set(planes.map(({ f }) => f.phase_id).filter((p): p is string => Boolean(p)))]) {
        const r = await recalculatePhaseStandingsScopes(TORNEO, fase, 'general', TEMPORADA);
        console.log('tabla recalculada', fase, JSON.stringify(r)?.slice(0, 200));
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
