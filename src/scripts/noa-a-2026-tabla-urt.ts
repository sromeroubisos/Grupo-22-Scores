/**
 * Torneo Regional del NOA "A" 2026: deja la tabla igual a la que publica el
 * boletín semanal de la URT (placa del 06/09/2026).
 *
 *   npx tsx src/scripts/noa-a-2026-tabla-urt.ts            # dry-run
 *   npx tsx src/scripts/noa-a-2026-tabla-urt.ts --apply
 *
 * De los diez clubes, ocho ya cerraban. Los dos que no:
 *
 *   · Jockey de Salta — la base le daba 4 y la placa le da 3. El punto de más
 *     es un bonus defensivo mal puesto: pierde 27-35 con Universitario de Salta
 *     el 22/08 y eso son OCHO de diferencia, uno más que el margen de la fase
 *     (`defensive_bonus_rule.margin = 7`). Sus otras tres derrotas —por 3, por
 *     2 y por 5— sí se lo llevan, y con esas tres queda en los 3 de la placa.
 *     La fila estaba en `points_autocalculated: false`, así que el motor no
 *     podía corregirla solo: volvía a leer el bonus escrito a mano. Se la
 *     devuelve a automático, porque el valor correcto es justo el que deduce el
 *     reglamento.
 *
 *   · Tucumán Lawn Tennis — la base le da 10 y la placa le da 11. Le falta un
 *     bonus ofensivo: dos triunfos (8) más dos defensivos —cae 23-27 y 27-31,
 *     por cuatro las dos— dan 10, y el que falta no puede salir de otro lado.
 *
 * EL PARTIDO DEL OFENSIVO ES UNA DECISIÓN, NO UN DATO. La placa publica la
 * columna PTS y nada más: no dice en qué partido fue. Los dos triunfos de Lawn
 * Tennis —44-29 a Universitario de Tucumán y 59-31 a Lince— pasan de sobra los
 * cuatro tries, así que la aritmética no elige por nosotros. Se le carga al
 * 59-31, que es la goleada más grande del torneo y el espejo del único otro
 * ofensivo que la URT ya reconoce (Huirapucá 45-21 a Lince). Si el boletín
 * aclara después que fue el 44-29, se mueve el bonus de partido y el total no
 * cambia.
 *
 * El ofensivo no se autocalcula acá por dos motivos que se suman: no tenemos el
 * minuto a minuto de estos partidos —sin eventos `try` no hay con qué contar— y
 * el `offensive_bonus_rule` del torneo vale 0 punto. Por eso esa fila queda en
 * manual, con la fuente escrita en `points_override_reason`.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const TORNEO = 'a4a4d389-5eaa-4e16-9024-81c54abe64cc';
const FASE = '88bb0e41-7872-43b7-8f53-8bf52fa6dee3';
const TEMPORADA = '745a4a32-4585-4684-848b-6984ae887a1f';
const ROLLBACK = 'NOA_A_2026_TABLA_URT_ROLLBACK.json';
const FUENTE = 'Tabla de posiciones del boletín semanal de la URT (placa del 06/09/2026).';

type Arreglo = {
    cuando: string;
    home: string;
    away: string;
    homeScore: number;
    awayScore: number;
    homeBase: number;
    awayBase: number;
    homeBonus: number;
    awayBonus: number;
    /** `true` cuando el valor corregido es el que deduce el reglamento por sí solo. */
    auto: boolean;
    porque: string;
};

const ARREGLOS: Arreglo[] = [
    {
        cuando: '2026-08-22',
        home: 'universitario-de-salta', away: 'jockey-club-salta', homeScore: 35, awayScore: 27,
        homeBase: 4, homeBonus: 0, awayBase: 0, awayBonus: 0,
        auto: true,
        porque: 'Jockey pierde por 8, uno más que el margen del defensivo: no suma bonus.',
    },
    {
        cuando: '2026-08-30',
        home: 'tucuman-lawn-tennis', away: 'lince-rugby-club', homeScore: 59, awayScore: 31,
        homeBase: 4, homeBonus: 1, awayBase: 0, awayBonus: 0,
        auto: false,
        porque: 'Lawn Tennis gana 59-31: bonus ofensivo. Lince pierde por 28, sin defensivo.',
    },
];

/** La tabla de la placa, con su orden. */
const ESPERADA = [
    { pos: 1, club: 'cardenales-r-c', pts: 16 },
    { pos: 2, club: 'huirapuca', pts: 14 },
    { pos: 3, club: 'natacion-y-gimnasia', pts: 13 },
    { pos: 4, club: 'los-tarcos', pts: 13 },
    { pos: 5, club: 'tucuman-lawn-tennis', pts: 11 },
    { pos: 6, club: 'tucuman-rugby-club', pts: 10 },
    { pos: 7, club: 'universitario-de-tucuman', pts: 5 },
    { pos: 8, club: 'universitario-de-salta', pts: 4 },
    { pos: 9, club: 'jockey-club-salta', pts: 3 },
    { pos: 10, club: 'lince-rugby-club', pts: 2 },
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

async function main() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    const { data: filasRaw, error } = await supabase
        .from('matches')
        .select('id, tournament_id, phase_id, season_id, date_time, home_club_id, away_club_id, score, status, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason')
        .eq('tournament_id', TORNEO)
        .eq('phase_id', FASE);
    if (error || !filasRaw) { console.error('No pude leer los partidos de la fase.', error); process.exit(1); }
    const todas = filasRaw as unknown as FilaPartido[];

    /**
     * El partido no se escribe por uuid a mano: se resuelve por cruce, día y
     * marcador dentro de la fase, y si algo de eso no cierra, corta sin tocar
     * nada. Un uuid copiado mal es indistinguible de uno bueno hasta que ya
     * pisó la fila equivocada.
     */
    const objetivo: Array<{ arreglo: Arreglo; fila: FilaPartido }> = [];
    for (const a of ARREGLOS) {
        const candidatos = todas.filter((f) =>
            f.home_club_id === a.home && f.away_club_id === a.away
            && String(f.date_time ?? '').startsWith(a.cuando));
        if (candidatos.length !== 1) {
            console.error(`El cruce ${a.home} vs ${a.away} del ${a.cuando} aparece ${candidatos.length} veces en la fase.`);
            process.exit(1);
        }
        const fila = candidatos[0];
        const sc = (fila.score ?? {}) as Record<string, number>;
        if ((sc.home ?? -1) !== a.homeScore || (sc.away ?? -1) !== a.awayScore) {
            console.error(`El marcador guardado de ${fila.id} es ${sc.home}-${sc.away}, no ${a.homeScore}-${a.awayScore}.`);
            process.exit(1);
        }
        if (fila.status !== 'final') {
            console.error(`El partido ${fila.id} no está finalizado: ${fila.status}.`);
            process.exit(1);
        }
        objetivo.push({ arreglo: a, fila });
    }

    console.log(FUENTE);
    console.log('\n== PARTIDOS A CORREGIR ==');
    for (const { arreglo: a, fila } of objetivo) {
        console.log(`${a.cuando} ${a.home} ${a.homeScore}-${a.awayScore} ${a.away}  (${fila.id})`);
        console.log(`  antes: ${fila.home_base_points}+${fila.home_bonus_points} / ${fila.away_base_points}+${fila.away_bonus_points} · auto=${fila.points_autocalculated}`);
        console.log(`  ahora: ${a.homeBase}+${a.homeBonus} / ${a.awayBase}+${a.awayBonus} · auto=${a.auto}`);
        console.log(`  ${a.porque}`);
    }

    if (!APPLY) { console.log('\nDRY-RUN. Nada se escribió. Repetí con --apply.'); return; }

    const fs = await import('node:fs/promises');
    await fs.writeFile(ROLLBACK, JSON.stringify({
        fuente: FUENTE,
        partidos: objetivo.map(({ fila }) => ({
            id: fila.id,
            antes: {
                home_base_points: fila.home_base_points,
                away_base_points: fila.away_base_points,
                home_bonus_points: fila.home_bonus_points,
                away_bonus_points: fila.away_bonus_points,
                points_autocalculated: fila.points_autocalculated,
                points_override_reason: fila.points_override_reason,
            },
        })),
    }, null, 2), 'utf8');

    for (const { arreglo: a, fila } of objetivo) {
        const { error: upErr } = await supabase.from('matches').update({
            home_base_points: a.homeBase,
            away_base_points: a.awayBase,
            home_bonus_points: a.homeBonus,
            away_bonus_points: a.awayBonus,
            points_autocalculated: a.auto,
            points_override_reason: a.auto ? null : `${FUENTE} ${a.porque}`,
        }).eq('id', fila.id);
        if (upErr) { console.error('Falló el update de', fila.id, upErr); process.exit(1); }
    }

    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    const r = await recalculatePhaseStandingsScopes(TORNEO, FASE, 'general', TEMPORADA);
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

    console.log('\n== TABLA RESULTANTE vs PLACA DE LA URT ==');
    console.log('POS CLUB                      PJ PG PE PP   PF   PC   DIF  PTS   PLACA');
    let difs = 0;
    for (const fila of tabla) {
        const esp = ESPERADA.find((e) => e.club === fila.club_id);
        const ok = !!esp && esp.pos === fila.position && esp.pts === fila.points;
        if (!ok) difs++;
        const marca = ok ? 'ok' : (esp ? `POS ${esp.pos} PTS ${esp.pts}` : 'sin fila en la placa');
        console.log(
            String(fila.position).padStart(2) + '  ' + String(fila.club_id).padEnd(24)
            + String(fila.played).padStart(3) + String(fila.won).padStart(3) + String(fila.drawn).padStart(3) + String(fila.lost).padStart(3)
            + String(fila.scored).padStart(5) + String(fila.conceded).padStart(5) + String(fila.scored - fila.conceded).padStart(6)
            + String(fila.points).padStart(5) + '   ' + marca);
    }
    console.log(difs === 0
        ? '\nLa tabla coincide con la placa, fila por fila y en el mismo orden.'
        : `\n${difs} fila(s) no coinciden.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
