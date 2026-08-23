/**
 * Copa Plata del Oeste 2026, 8ª fecha (22/08). Los cuatro partidos.
 *
 *   npx tsx src/scripts/oeste-plata-2026-fecha8.ts            # dry-run
 *   npx tsx src/scripts/oeste-plata-2026-fecha8.ts --apply
 *
 * La fuente (rugbydecuyo) publica el marcador, no los tries, así que los puntos
 * van con override manual como el resto del torneo.
 *
 * El bonus de cada partido no se adivinó: sale de la cuenta. Sumando lo que ya
 * hay cargado de las siete fechas anteriores y agregando estos cuatro, los ocho
 * clubes dan EXACTO los puntos de la tabla publicada — 31, 28, 24, 21, 19, 15,
 * 12 y 4 — con el bonus estándar y nada más:
 *
 *   · Peumayen gana 50-24: ofensivo. Rivadavia pierde por 26: nada.
 *   · Alfiles gana 31-29 con 31 puntos: sin ofensivo. Banco pierde por 2: defensivo.
 *   · Universitario gana 29-26 con 29: sin ofensivo. Tacurú pierde por 3: defensivo.
 *   · Huazihul gana 48-29: ofensivo. Jockey pierde por 19: nada.
 *
 * Además la tabla estaba vieja, y eso el recálculo lo arregla solo: el partido
 * del 9 de agosto (Universitario 29-21 Banco) estaba cargado pero nunca se había
 * rehecho la tabla, así que esos dos figuraban con 6 jugados en vez de 7.
 *
 * Y antes de recalcular hay que destrabar el recálculo. Las ocho asignaciones de
 * `tournament_phase_participants` de esta fase tenían `season_id` en NULL, y
 * `loadPhaseScopedParticipants` filtra por temporada: devolvía cero equipos, el
 * motor cero filas y la función respondía `ok` conservando la tabla vieja. O sea:
 * recalcular no hacía nada y no se quejaba. Se rellena con la temporada de la
 * propia fase, que es de donde tendrían que haber salido.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const TORNEO = '8e21ce2b-459c-40f5-8012-d0968d6a4d95';
const FASE = 'bd8ac0f0-48b4-4c78-bd3c-87ed7170bda7';
const TEMPORADA = '4b828f09-adc7-4bb2-8ffd-04901771d7b4';
const ROLLBACK = 'OESTE_PLATA_FECHA8_ROLLBACK.json';
const MOTIVO = 'Resultado y bonus de la 8ª fecha de la Copa Plata del Oeste, según la planilla de la Unión de Rugby de Cuyo.';

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
        id: '02734bec-5cab-4780-8eca-75b099ad8f3c',
        home: 'peumayen-rugby-club', away: 'rivadavia-rugby-club',
        homeScore: 50, awayScore: 24,
        homeBase: 4, homeBonus: 1, awayBase: 0, awayBonus: 0,
    },
    {
        id: '6f97fce2-8f5a-4394-9064-a9f796034c17',
        home: 'alfiles-s-c', away: 'banco-rugby-club',
        homeScore: 31, awayScore: 29,
        homeBase: 4, homeBonus: 0, awayBase: 0, awayBonus: 1,
    },
    {
        id: '29c20e50-575c-41a7-a9e3-ac7c1c967aad',
        home: 'tacuru-rugby-hockey-club', away: 'universitario-de-mendoza',
        homeScore: 26, awayScore: 29,
        homeBase: 0, homeBonus: 1, awayBase: 4, awayBonus: 0,
    },
    {
        id: '04b4e8c9-21d7-4dbe-9711-32b26b148230',
        home: 'jockey-club-san-juan', away: 'huazihul',
        homeScore: 29, awayScore: 48,
        homeBase: 0, homeBonus: 0, awayBase: 4, awayBonus: 1,
    },
];

/**
 * La tabla publicada tras la 8ª fecha. Puesto, jugados y puntos son los tres
 * datos que cierran perfecto con los partidos cargados, así que son los que se
 * verifican. Ganados/perdidos y los tantos van aparte: la planilla tiene dos
 * columnas mal —ver el informe al final— y no vale la pena romper el script por
 * un error de la gráfica.
 */
const ESPERADA = [
    { pos: 1, club: 'huazihul', pj: 8, pts: 31 },
    { pos: 2, club: 'peumayen-rugby-club', pj: 8, pts: 28 },
    { pos: 3, club: 'universitario-de-mendoza', pj: 8, pts: 24 },
    { pos: 4, club: 'jockey-club-san-juan', pj: 8, pts: 21 },
    { pos: 5, club: 'tacuru-rugby-hockey-club', pj: 8, pts: 19 },
    { pos: 6, club: 'banco-rugby-club', pj: 8, pts: 15 },
    { pos: 7, club: 'alfiles-s-c', pj: 8, pts: 12 },
    { pos: 8, club: 'rivadavia-rugby-club', pj: 8, pts: 4 },
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
        .in('id', FECHA.map((c) => c.id));
    if (error || !filasRaw) { console.error('No pude leer los partidos.', error); process.exit(1); }
    const filas = filasRaw as unknown as FilaPartido[];
    const porId = new Map(filas.map((f) => [f.id, f]));

    for (const carga of FECHA) {
        const fila = porId.get(carga.id);
        if (!fila) { console.error('Falta el partido', carga.id); process.exit(1); }
        if (fila.tournament_id !== TORNEO || fila.phase_id !== FASE) {
            console.error('El partido no es de este torneo/fase:', carga.id); process.exit(1);
        }
        if (fila.home_club_id !== carga.home || fila.away_club_id !== carga.away) {
            console.error(`El cruce no coincide en ${carga.id}: ${fila.home_club_id} vs ${fila.away_club_id}`); process.exit(1);
        }
        if (!String(fila.date_time).startsWith('2026-08-22')) {
            console.error(`El partido ${carga.id} no es del 22/08 sino del ${String(fila.date_time).slice(0, 10)}`); process.exit(1);
        }

        const sc = (fila.score ?? {}) as Record<string, number>;
        console.log(`${carga.home} vs ${carga.away}`);
        console.log(`  antes: ${fila.status} ${sc.home ?? '-'}-${sc.away ?? '-'} · ${fila.home_base_points}+${fila.home_bonus_points} / ${fila.away_base_points}+${fila.away_bonus_points} · auto=${fila.points_autocalculated}`);
        console.log(`  ahora: final ${carga.homeScore}-${carga.awayScore} · ${carga.homeBase}+${carga.homeBonus} / ${carga.awayBase}+${carga.awayBonus} · auto=false`);
    }

    if (!APPLY) { console.log('\nDRY-RUN. Nada se escribió. Repetí con --apply.'); return; }

    const fs = await import('node:fs/promises');
    // Acumulativo: repetir --apply no puede pisar el estado original con el ya
    // escrito. Sólo se guarda lo que todavía no está en el archivo.
    let previo: Array<{ id: string; antes: unknown }> = [];
    try { previo = JSON.parse(await fs.readFile(ROLLBACK, 'utf8')); } catch { previo = []; }
    const yaGuardados = new Set(previo.map((x) => x.id));
    const nuevos = filas.filter((f) => !yaGuardados.has(f.id)).map((f) => ({
        id: f.id,
        antes: {
            status: f.status,
            score: f.score,
            home_base_points: f.home_base_points,
            away_base_points: f.away_base_points,
            home_bonus_points: f.home_bonus_points,
            away_bonus_points: f.away_bonus_points,
            points_autocalculated: f.points_autocalculated,
            points_override_reason: f.points_override_reason,
        },
    }));
    await fs.writeFile(ROLLBACK, JSON.stringify([...previo, ...nuevos], null, 2), 'utf8');

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
    console.log('\n· 4 partidos cargados');

    // Sin esto el recálculo devuelve cero filas y no avisa.
    const { data: sinTemporada } = await supabase
        .from('tournament_phase_participants')
        .select('id')
        .eq('phase_id', FASE)
        .is('season_id', null);
    const huerfanas = (sinTemporada ?? []) as unknown as Array<{ id: string }>;
    if (huerfanas.length > 0) {
        const { error: eBf } = await supabase
            .from('tournament_phase_participants')
            .update({ season_id: TEMPORADA })
            .eq('phase_id', FASE)
            .is('season_id', null);
        if (eBf) { console.error('No pude rellenar la temporada de los participantes de fase.', eBf); process.exit(1); }
        console.log(`· ${huerfanas.length} asignaciones de fase sin temporada: rellenadas con ${TEMPORADA}`);
    }

    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    const r = await recalculatePhaseStandingsScopes(TORNEO, FASE, 'general', TEMPORADA);
    console.log(`· tabla rehecha: ${r.ok ? 'ok' : 'FALLÓ'} (${r.rows_calculated} filas)`);
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
    console.log('POS CLUB                       PJ PG PE PP   PF   PC   DIF  PTS   PUESTO/PJ/PTS PUBLICADOS');
    let difs = 0;
    for (const fila of tabla) {
        const esp = ESPERADA.find((e) => e.club === fila.club_id);
        const ok = esp && esp.pos === fila.position && esp.pj === fila.played && esp.pts === fila.points;
        if (!ok) difs++;
        console.log(
            String(fila.position).padStart(2) + '  ' + String(fila.club_id).padEnd(26)
            + String(fila.played).padStart(3) + String(fila.won).padStart(3) + String(fila.drawn).padStart(3) + String(fila.lost).padStart(3)
            + String(fila.scored).padStart(5) + String(fila.conceded).padStart(5) + String(fila.scored - fila.conceded).padStart(6)
            + String(fila.points).padStart(5) + '   ' + (ok ? 'ok' : (esp ? `POS ${esp.pos} PJ ${esp.pj} PTS ${esp.pts}` : 'sin fila publicada')));
    }
    console.log(difs === 0
        ? '\nPuesto, jugados y puntos coinciden con la tabla publicada en las ocho filas.'
        : `\n${difs} fila(s) no coinciden.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
