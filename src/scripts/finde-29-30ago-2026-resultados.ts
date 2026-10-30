/**
 * Fin de semana del 29 y 30 de agosto de 2026. Los resultados que faltaban en
 * cinco torneos argentinos: Regional del NOA "A", Regional del NEA, NEA Ascenso,
 * Regional del NOA "B" y Súper 9 "B" de Córdoba (14ª fecha).
 *
 *   npx tsx src/scripts/finde-29-30ago-2026-resultados.ts            # dry-run
 *   npx tsx src/scripts/finde-29-30ago-2026-resultados.ts --apply
 *
 * Dos regímenes de puntos, según lo que publicó cada unión:
 *
 * · El NOA "A" publica el marcador y nada más. Va con `points_autocalculated`,
 *   igual que los dos partidos del sábado que ya estaban cargados (Jockey Salta
 *   0+1 / Universitario 4+0 salió del motor). Sin tries no hay bonus ofensivo:
 *   el ganador se lleva 4 y el perdedor por menos de ocho, 1.
 *
 * · El NEA, el Ascenso del NEA y el NOA "B" publican los puntos entre paréntesis
 *   ("Taraguy 35-13 San Jose (5-0)"), y el Súper 9 publica la tabla, de donde
 *   salen los bonus por diferencia contra la fecha anterior. Cuando el dato
 *   existe manda el dato: `points_autocalculated = false` y el motor no deduce.
 *
 * El caso raro es La Carlota, que pierde 29-33 con Aero Club y suma 2: la tabla
 * publicada la lleva de 21 a 23 puntos. Es el defensivo (cae por 4) más el
 * ofensivo, que el marcador solo no deja ver.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const ROLLBACK = 'FINDE_29_30AGO_2026_ROLLBACK.json';

type Carga = {
    id: string;
    home: string;
    away: string;
    homeScore: number;
    awayScore: number;
    /** Ausente = el motor los calcula (`points_autocalculated = true`). */
    puntos?: { homeBase: number; homeBonus: number; awayBase: number; awayBonus: number };
};

type Torneo = {
    nombre: string;
    tournamentId: string;
    phaseId: string;
    motivo: string | null;
    partidos: Carga[];
};

const TORNEOS: Torneo[] = [
    {
        nombre: 'Torneo Regional del NOA "A" · 3ª fecha',
        tournamentId: 'a4a4d389-5eaa-4e16-9024-81c54abe64cc',
        phaseId: '88bb0e41-7872-43b7-8f53-8bf52fa6dee3',
        motivo: null,
        partidos: [
            { id: '0ee2a394-364d-47dc-87df-4bcadc505204', home: 'tucuman-lawn-tennis', away: 'lince-rugby-club', homeScore: 59, awayScore: 31 },
            { id: 'e19f53b2-6358-4ce1-a345-360ebcb42e2a', home: 'huirapuca', away: 'universitario-de-salta', homeScore: 48, awayScore: 24 },
            { id: 'c89c7049-d8d1-4144-b114-aa99a074b16e', home: 'tucuman-rugby-club', away: 'natacion-y-gimnasia', homeScore: 29, awayScore: 27 },
        ],
    },
    {
        nombre: 'Torneo Regional del NEA · 11ª fecha',
        tournamentId: 'b0562cf3-4ea1-463e-86cb-86988dc22f10',
        phaseId: '36496ee9-0fa1-417c-9597-e77c75b6a9ac',
        motivo: 'Puntos publicados por la Unión de Rugby del Nordeste.',
        partidos: [
            {
                id: 'd1bc140e-8891-40f3-b1d7-3756ae9c9ce7', home: 'aguara', away: 'regatas-de-resistencia',
                homeScore: 33, awayScore: 16,
                puntos: { homeBase: 4, homeBonus: 1, awayBase: 0, awayBonus: 0 },
            },
        ],
    },
    {
        nombre: 'Torneo Regional del NEA Ascenso · 2ª fecha',
        tournamentId: 'c1e37680-3f1e-482a-8dc6-c14f4ba417c7',
        phaseId: '25e3fe65-111c-4a9c-8499-09cc4e87ea67',
        motivo: 'Puntos publicados por la Unión de Rugby del Nordeste.',
        partidos: [
            {
                id: 'f451e56d-2ef9-4946-bf22-3c7bbc45ed87', home: 'qompi', away: 'tacuru-social-club',
                homeScore: 45, awayScore: 15,
                puntos: { homeBase: 4, homeBonus: 1, awayBase: 0, awayBonus: 0 },
            },
            {
                // La fuente lo escribe "Sixty 40-12 Caza y Pesca": el local es Caza y Pesca.
                id: '0536af7b-4218-4a81-9e9b-4671b3e9240f', home: 'caza-y-pesca', away: 'sixty-r-c',
                homeScore: 12, awayScore: 40,
                puntos: { homeBase: 0, homeBonus: 0, awayBase: 4, awayBonus: 1 },
            },
            {
                id: 'cff17a25-d8cb-4066-9994-b8e89aed4d7a', home: 'lomas-r-c-posadas', away: 'capri',
                homeScore: 33, awayScore: 7,
                puntos: { homeBase: 4, homeBonus: 1, awayBase: 0, awayBonus: 0 },
            },
            {
                id: '29205b7d-87ed-4f08-8188-770b91772f43', home: 'pay-ubre', away: 'abipones',
                homeScore: 14, awayScore: 32,
                puntos: { homeBase: 0, homeBonus: 0, awayBase: 4, awayBonus: 0 },
            },
        ],
    },
    {
        nombre: 'Torneo Regional del NOA "B" · 5ª fecha',
        tournamentId: '3a335922-dc88-42a8-84d3-c38b57b46bca',
        phaseId: 'f649244b-123b-49e0-9550-b70990a8ec8f',
        motivo: 'Puntos publicados por la Unión de Rugby de Tucumán.',
        partidos: [
            {
                id: 'fdddd375-3de9-4a69-b90b-7407f2debb2a', home: 'gimnasia-y-tiro', away: 'aguara-guazu',
                homeScore: 91, awayScore: 22,
                puntos: { homeBase: 4, homeBonus: 1, awayBase: 0, awayBonus: 0 },
            },
            {
                id: '5619baf0-9743-4531-8562-0a43c7a34313', home: 'jockey-club-de-tucuman', away: 'tigres-r-c',
                homeScore: 30, awayScore: 30,
                puntos: { homeBase: 2, homeBonus: 0, awayBase: 2, awayBonus: 0 },
            },
            {
                id: 'aaf493fd-c0f3-4d6c-b071-536215082a98', home: 'old-lions-r-c', away: 'santiago-lawn-tennis-club',
                homeScore: 25, awayScore: 30,
                puntos: { homeBase: 0, homeBonus: 1, awayBase: 4, awayBonus: 0 },
            },
            {
                id: 'c0dac096-413e-493e-a8b9-879e10619455', home: 'tiro-federal-salta', away: 'santiago-rugby-club',
                homeScore: 31, awayScore: 27,
                puntos: { homeBase: 4, homeBonus: 0, awayBase: 0, awayBonus: 1 },
            },
        ],
    },
    {
        nombre: 'Súper 9 "B" · 14ª fecha',
        tournamentId: 'b6ed4086-2e75-4e68-962b-2d2363c9694c',
        phaseId: '4fce0ada-db34-4b22-8354-54af7956d8e4',
        motivo: 'Bonus deducidos de la tabla de la 14ª fecha publicada por la Unión Cordobesa.',
        partidos: [
            {
                id: '4c50da65-e2d0-4691-8fae-82675eea3f2a', home: 'baguales-r-c', away: 'alta-gracia-r-c',
                homeScore: 29, awayScore: 19,
                puntos: { homeBase: 4, homeBonus: 1, awayBase: 0, awayBonus: 0 },
            },
            {
                id: '8241da71-6ae0-4a6b-95fb-c96d8184acde', home: 'cordoba-rugby-club', away: 'los-cuervos-r-c',
                homeScore: 19, awayScore: 31,
                puntos: { homeBase: 0, homeBonus: 0, awayBase: 4, awayBonus: 1 },
            },
            {
                id: 'de092044-47de-4127-b096-ddd116bd4ef0', home: 'san-francisco-r-c', away: 'santa-rosa-r-c-c',
                homeScore: 36, awayScore: 23,
                puntos: { homeBase: 4, homeBonus: 1, awayBase: 0, awayBonus: 0 },
            },
            {
                id: '81f42324-0dc0-4232-bc57-f80bf9f56189', home: 'aero-club-rio-iv', away: 'c-s-la-carlota',
                homeScore: 33, awayScore: 29,
                puntos: { homeBase: 4, homeBonus: 0, awayBase: 0, awayBonus: 2 },
            },
        ],
    },
];

/** La tabla del Súper 9 "B" tal como la publicó la Unión tras la 14ª fecha. */
const SUPER9_ESPERADA: Array<{ club: string; pj: number; pg: number; pp: number; pts: number }> = [
    { club: 'baguales-r-c', pj: 12, pg: 10, pp: 2, pts: 53 },
    { club: 'los-cuervos-r-c', pj: 13, pg: 10, pp: 3, pts: 49 },
    { club: 'cordoba-rugby-club', pj: 12, pg: 9, pp: 3, pts: 45 },
    { club: 'alta-gracia-r-c', pj: 13, pg: 9, pp: 4, pts: 45 },
    { club: 'san-francisco-r-c', pj: 13, pg: 7, pp: 6, pts: 38 },
    { club: 'c-s-la-carlota', pj: 12, pg: 3, pp: 9, pts: 23 },
    { club: 'santa-rosa-r-c-c', pj: 12, pg: 4, pp: 8, pts: 18 },
    { club: 'rio-tercero-r-c', pj: 12, pg: 3, pp: 9, pts: 14 },
    { club: 'aero-club-rio-iv', pj: 13, pg: 1, pp: 12, pts: 4 },
];

/**
 * Los puntos del NOA "A", que no los publica. `home_base_points` es NOT NULL:
 * la fila siempre lleva un número, y `points_autocalculated` es lo que dice de
 * dónde salió. Es la misma cuenta que dejó los dos partidos del sábado que ya
 * estaban cargados: gana 4, empata 2, y el que cae por siete o menos suma 1. Sin
 * tries publicados no hay bonus ofensivo que ver.
 */
function puntosAutomaticos(homeScore: number, awayScore: number) {
    const dif = homeScore - awayScore;
    const base = dif > 0 ? { homeBase: 4, awayBase: 0 } : dif < 0 ? { homeBase: 0, awayBase: 4 } : { homeBase: 2, awayBase: 2 };
    return {
        ...base,
        homeBonus: dif < 0 && dif >= -7 ? 1 : 0,
        awayBonus: dif > 0 && dif <= 7 ? 1 : 0,
    };
}

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

    const todos = TORNEOS.flatMap((t) => t.partidos.map((p) => ({ torneo: t, carga: p })));
    const { data: filas, error } = await supabase
        .from('matches')
        .select('id, tournament_id, phase_id, season_id, date_time, home_club_id, away_club_id, score, status, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason')
        .in('id', todos.map((t) => t.carga.id));
    if (error || !filas) { console.error('No pude leer los partidos.', error); process.exit(1); }

    const rows = filas as unknown as FilaPartido[];
    const porId = new Map(rows.map((f) => [f.id, f]));
    const seasonPorTorneo = new Map<string, string | null>();

    for (const { torneo, carga } of todos) {
        const fila = porId.get(carga.id);
        if (!fila) { console.error('Falta el partido', carga.id); process.exit(1); }
        if (fila.tournament_id !== torneo.tournamentId || fila.phase_id !== torneo.phaseId) {
            console.error('El partido no es de este torneo/fase:', carga.id); process.exit(1);
        }
        if (fila.home_club_id !== carga.home || fila.away_club_id !== carga.away) {
            console.error(`El cruce no coincide en ${carga.id}: ${fila.home_club_id} vs ${fila.away_club_id}`);
            process.exit(1);
        }
        const dia = String(fila.date_time).slice(0, 10);
        if (dia !== '2026-08-29' && dia !== '2026-08-30') {
            console.error(`El partido ${carga.id} no es del fin de semana sino del ${dia}`);
            process.exit(1);
        }
        if (!seasonPorTorneo.has(torneo.tournamentId)) seasonPorTorneo.set(torneo.tournamentId, fila.season_id ?? null);
    }

    for (const torneo of TORNEOS) {
        console.log(`\n== ${torneo.nombre} ==`);
        for (const carga of torneo.partidos) {
            const fila = porId.get(carga.id)!;
            const sc = (fila.score ?? {}) as Record<string, number>;
            const p = carga.puntos;
            console.log(`${carga.home} vs ${carga.away}`);
            console.log(`  antes: ${fila.status} ${sc.home ?? '-'}-${sc.away ?? '-'} · ${fila.home_base_points}+${fila.home_bonus_points} / ${fila.away_base_points}+${fila.away_bonus_points} · auto=${fila.points_autocalculated}`);
            const calc = p ?? puntosAutomaticos(carga.homeScore, carga.awayScore);
            console.log(`  ahora: final ${carga.homeScore}-${carga.awayScore} · ${calc.homeBase}+${calc.homeBonus} / ${calc.awayBase}+${calc.awayBonus} · auto=${!p}`);
        }
    }
    console.log('\nrio-tercero-r-c: libre en la 14ª del Súper 9, no se toca nada.');

    if (!APPLY) { console.log('\nDRY-RUN. Nada se escribió. Repetí con --apply.'); return; }

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

    for (const { torneo, carga } of todos) {
        const anterior = (porId.get(carga.id)!.score ?? {}) as Record<string, number>;
        const p = carga.puntos ?? puntosAutomaticos(carga.homeScore, carga.awayScore);
        const { error: upErr } = await supabase.from('matches').update({
            status: 'final',
            // Los tries que ya tuviera la fila se conservan: la fuente no los publica.
            score: { ...anterior, home: carga.homeScore, away: carga.awayScore },
            home_base_points: p.homeBase,
            away_base_points: p.awayBase,
            home_bonus_points: p.homeBonus,
            away_bonus_points: p.awayBonus,
            points_autocalculated: !carga.puntos,
            points_override_reason: carga.puntos ? torneo.motivo : null,
        }).eq('id', carga.id);
        if (upErr) { console.error('Falló el update de', carga.id, upErr); process.exit(1); }
    }

    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    for (const torneo of TORNEOS) {
        const r = await recalculatePhaseStandingsScopes(torneo.tournamentId, torneo.phaseId, 'general', seasonPorTorneo.get(torneo.tournamentId) ?? null);
        console.log(`Tabla ${torneo.nombre}: ${r.ok ? 'ok' : 'FALLÓ'} · ${r.rows_calculated} filas`);
        if (!r.ok || r.rows_calculated === 0) {
            console.error('Cero filas o error: revisá `tournament_phase_participants` (season_id NULL o asignaciones sin crear).');
        }
    }

    const s9 = TORNEOS[TORNEOS.length - 1];
    const { data: tablaRaw } = await supabase
        .from('tournament_standings')
        .select('club_id, position, played, won, drawn, lost, points, scored, conceded')
        .eq('tournament_id', s9.tournamentId).eq('phase_id', s9.phaseId).order('position');
    const tabla = (tablaRaw ?? []) as unknown as Array<{
        club_id: string; position: number; played: number; won: number;
        drawn: number; lost: number; points: number; scored: number; conceded: number;
    }>;

    console.log('\n== SÚPER 9 "B": TABLA RESULTANTE vs PUBLICADA ==');
    console.log('POS CLUB                      PJ PG PE PP   PF   PC   DIF  PTS   ESPERADO');
    let difs = 0;
    for (const fila of tabla) {
        const esp = SUPER9_ESPERADA.find((e) => e.club === fila.club_id);
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
