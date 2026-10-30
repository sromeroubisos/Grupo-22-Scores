/**
 * Uruguayo de Clubes 2026 · Torneo Clausura · fechas 3ª, 4ª y 5ª.
 * Las tres placas de resultados de Rugby Clubes, cargadas a mano.
 *
 *   npx tsx src/scripts/uruguayo-clausura-2026-fechas.ts            # dry-run
 *   npx tsx src/scripts/uruguayo-clausura-2026-fechas.ts --apply
 *
 * Por qué un script propio y no `carga-resultados.ts`, que hace exactamente
 * esto: aquel cierra siempre rehaciendo la tabla, y en esta fase la tabla NO se
 * deduce de los partidos. La fase nació del sync de rugbyarchive con
 * `standings.mode: 'fully_manual'` y sus filas son la tabla oficial de la
 * fuente, bonus incluidos; las filas de los partidos, en cambio, ese sync las
 * escribe siempre con `bonus 0`. Un recálculo desde los partidos le sacaría a
 * Old Christians los dos ofensivos de las fechas 1 y 2, y a Círculo de Tenis
 * los dos defensivos. `recalculateStandings.ts` no mira el modo de la fase, así
 * que la única defensa es no llamarlo.
 *
 * Acá se escriben los partidos y nada más. La tabla del Clausura se pone al día
 * cuando rugbyarchive publique, con `uruguayo-2026-actualizar.ts`, que trae la
 * tabla oficial con sus columnas de bonus.
 *
 * Volver a correrlo no rompe nada: reescribe los mismos valores, y el respaldo
 * es acumulativo por id, así que el estado original de cada partido se guarda
 * una sola vez —el de la 5ª fecha ya está en el archivo desde su primera carga.
 *
 * La placa publica el bonus junto al marcador —BO ofensivo, BD defensivo— así
 * que el dato manda: `points_autocalculated = false` y el motor no deduce nada.
 * Es lo que distingue estas tres fechas de las dos primeras, importadas sólo con
 * el marcador. Casos que el marcador solo no dejaría ver:
 *
 * · PSG cae 20-50 con Carrasco Polo en la 5ª y se lleva el ofensivo: 20 puntos
 *   son cuatro tries sin conversión. Deducirlo por diferencia no se lo daría.
 * · Trébol pierde 31-50 con Old Christians en la 5ª, y Seminario 25-35 con
 *   Champagnat en la 3ª y 36-73 con Trébol en la 4ª: los tres suman el ofensivo.
 * · Lobos cae 28-36 con Old Christians en la 3ª por OCHO puntos: el chip es azul,
 *   ofensivo. No es el defensivo, que se corta en siete.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const ROLLBACK = 'URUGUAYO_CLAUSURA_2026_F5_ROLLBACK.json';

const TOURNAMENT_ID = '271638cc-3351-42ce-81bd-ef091e82515d';
const PHASE_ID = 'f9d51fdd-3349-414b-8a3e-44962469ccc8';
const MOTIVO = 'Bonus publicados por Rugby Clubes en la placa de resultados del Clausura: la fuente da el ofensivo y el defensivo junto al marcador.';

type Carga = {
    id: string;
    home: string;
    away: string;
    homeScore: number;
    awayScore: number;
    puntos: { homeBase: number; homeBonus: number; awayBase: number; awayBonus: number };
};

type Fecha = { nombre: string; dia: string; partidos: Carga[] };

const FECHAS: Fecha[] = [
    {
        nombre: '3ª fecha', dia: '2026-08-22',
        partidos: [
            {
                // PGC Trébol 66 (BO) - 15 PSG
                id: '7eafc0ef-7e68-4830-92f0-5df61d422774', home: 'trebol-de-paysandu', away: 'psg',
                homeScore: 66, awayScore: 15,
                puntos: { homeBase: 4, homeBonus: 1, awayBase: 0, awayBonus: 0 },
            },
            {
                // Carrasco Polo 29 (BO) - 23 (BD) Ceibos
                id: 'cb22fff3-504f-46e1-9bf5-c4684f0cf84b', home: 'carrasco-polo', away: 'ceibos-club',
                homeScore: 29, awayScore: 23,
                puntos: { homeBase: 4, homeBonus: 1, awayBase: 0, awayBonus: 1 },
            },
            {
                // Círculo de Tenis 19 - 45 (BO) Old Boys
                id: 'ac614304-9e24-4268-9df9-ef67a37abdda', home: 'circulo-de-tenis', away: 'old-boys-girls-club',
                homeScore: 19, awayScore: 45,
                puntos: { homeBase: 0, homeBonus: 0, awayBase: 4, awayBonus: 1 },
            },
            {
                // Los Cuervos CGU 17 - 13 (BD) MVD Cricket
                id: '99de52df-3be4-4afd-bb87-2fe60e9d413b', home: 'los-cuervos', away: 'montevideo-c-c',
                homeScore: 17, awayScore: 13,
                puntos: { homeBase: 4, homeBonus: 0, awayBase: 0, awayBonus: 1 },
            },
            {
                // Old Christians 36 (BO) - 28 (BO) Lobos
                id: '1202d484-f357-481d-8453-6ff92ff0c934', home: 'old-christians-club', away: 'lobos-pde',
                homeScore: 36, awayScore: 28,
                puntos: { homeBase: 4, homeBonus: 1, awayBase: 0, awayBonus: 1 },
            },
            {
                // Seminario 25 (BO) - 35 (BO) Champagnat
                id: '0ed171f5-cd21-4aa9-a2a7-68cebb5f0a0f', home: 'club-seminario', away: 'champagnat',
                homeScore: 25, awayScore: 35,
                puntos: { homeBase: 0, homeBonus: 1, awayBase: 4, awayBonus: 1 },
            },
        ],
    },
    {
        nombre: '4ª fecha', dia: '2026-08-29',
        partidos: [
            {
                // Champagnat 17 - 63 (BO) Old Boys
                id: '994eed8a-d3b7-4881-b24b-0c4685f9c13a', home: 'champagnat', away: 'old-boys-girls-club',
                homeScore: 17, awayScore: 63,
                puntos: { homeBase: 0, homeBonus: 0, awayBase: 4, awayBonus: 1 },
            },
            {
                // Círculo de Tenis 18 - 26 (BO) Los Cuervos CGU
                id: 'a119a93a-73b9-4490-a81a-7350070bfc55', home: 'circulo-de-tenis', away: 'los-cuervos',
                homeScore: 18, awayScore: 26,
                puntos: { homeBase: 0, homeBonus: 0, awayBase: 4, awayBonus: 1 },
            },
            {
                // Lobos 17 - 17 Carrasco Polo · el único empate, y sin bonus a la vista
                id: 'e7bf40ea-7f67-481e-acec-b49c9c1b78ab', home: 'lobos-pde', away: 'carrasco-polo',
                homeScore: 17, awayScore: 17,
                puntos: { homeBase: 2, homeBonus: 0, awayBase: 2, awayBonus: 0 },
            },
            {
                // PSG 19 - 80 (BO) Old Christians
                id: '029deb75-f5d3-42e2-baab-4781927e9701', home: 'psg', away: 'old-christians-club',
                homeScore: 19, awayScore: 80,
                puntos: { homeBase: 0, homeBonus: 0, awayBase: 4, awayBonus: 1 },
            },
            {
                // Seminario 36 (BO) - 73 (BO) PGC Trébol
                id: 'e50af961-9747-43cf-9506-c05ab7904bf2', home: 'club-seminario', away: 'trebol-de-paysandu',
                homeScore: 36, awayScore: 73,
                puntos: { homeBase: 0, homeBonus: 1, awayBase: 4, awayBonus: 1 },
            },
            {
                // Ceibos 10 - 27 (BO) MVD Cricket
                id: '10369c3b-0c33-4c4f-b066-b83dbd5a22f5', home: 'ceibos-club', away: 'montevideo-c-c',
                homeScore: 10, awayScore: 27,
                puntos: { homeBase: 0, homeBonus: 0, awayBase: 4, awayBonus: 1 },
            },
        ],
    },
    {
        nombre: '5ª fecha', dia: '2026-09-05',
        partidos: [
            {
                // Los Cuervos CGU 24 (BD) - 31 (BO) Champagnat
                id: 'ecdc5f8a-0a68-46f9-b404-4c3330d3bb02', home: 'los-cuervos', away: 'champagnat',
                homeScore: 24, awayScore: 31,
                puntos: { homeBase: 0, homeBonus: 1, awayBase: 4, awayBonus: 1 },
            },
            {
                // PGC Trébol 31 (BO) - 50 (BO) Old Christians
                id: '3c1d33f0-ea8f-46dc-b551-7fcfb0467613', home: 'trebol-de-paysandu', away: 'old-christians-club',
                homeScore: 31, awayScore: 50,
                puntos: { homeBase: 0, homeBonus: 1, awayBase: 4, awayBonus: 1 },
            },
            {
                // Old Boys 48 (BO) - 7 Seminario
                id: '6125e8e5-5d92-4525-a3aa-dbba420dff25', home: 'old-boys-girls-club', away: 'club-seminario',
                homeScore: 48, awayScore: 7,
                puntos: { homeBase: 4, homeBonus: 1, awayBase: 0, awayBonus: 0 },
            },
            {
                // PSG 20 (BO) - 50 (BO) Carrasco Polo
                id: '1a1780ed-3f25-4ca8-9365-1918f340d380', home: 'psg', away: 'carrasco-polo',
                homeScore: 20, awayScore: 50,
                puntos: { homeBase: 0, homeBonus: 1, awayBase: 4, awayBonus: 1 },
            },
            {
                // MVD Cricket 22 (BO) - 18 (BD) Lobos
                id: 'b39acf39-0196-477b-b7c8-e8a2a20adc95', home: 'montevideo-c-c', away: 'lobos-pde',
                homeScore: 22, awayScore: 18,
                puntos: { homeBase: 4, homeBonus: 1, awayBase: 0, awayBonus: 1 },
            },
            {
                // Círculo de Tenis 21 - 33 (BO) Ceibos
                id: '15c4266b-18b1-415f-8e1f-ceef9cce816f', home: 'circulo-de-tenis', away: 'ceibos-club',
                homeScore: 21, awayScore: 33,
                puntos: { homeBase: 0, homeBonus: 0, awayBase: 4, awayBonus: 1 },
            },
        ],
    },
];

type FilaPartido = {
    id: string;
    tournament_id: string | null;
    phase_id: string | null;
    season_id: string | null;
    date_time: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    score: Record<string, unknown> | null;
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

    const todos = FECHAS.flatMap((f) => f.partidos.map((carga) => ({ fecha: f, carga })));
    const { data: filas, error } = await supabase
        .from('matches')
        .select('id, tournament_id, phase_id, season_id, date_time, home_club_id, away_club_id, score, status, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason')
        .in('id', todos.map((t) => t.carga.id));
    if (error || !filas) { console.error('No pude leer los partidos.', error); process.exit(1); }

    const rows = filas as unknown as FilaPartido[];
    const porId = new Map(rows.map((f) => [f.id, f]));

    for (const { fecha, carga } of todos) {
        const fila = porId.get(carga.id);
        if (!fila) { console.error('Falta el partido', carga.id); process.exit(1); }
        if (fila.tournament_id !== TOURNAMENT_ID || fila.phase_id !== PHASE_ID) {
            console.error('El partido no es del Clausura:', carga.id); process.exit(1);
        }
        if (fila.home_club_id !== carga.home || fila.away_club_id !== carga.away) {
            console.error(`El cruce no coincide en ${carga.id}: ${fila.home_club_id} vs ${fila.away_club_id}`);
            process.exit(1);
        }
        if (String(fila.date_time).slice(0, 10) !== fecha.dia) {
            console.error(`El partido ${carga.id} no es del ${fecha.dia} sino del ${String(fila.date_time).slice(0, 10)}`);
            process.exit(1);
        }
    }

    for (const fecha of FECHAS) {
        console.log(`\n== Torneo Clausura · ${fecha.nombre} (${fecha.dia}) ==`);
        for (const carga of fecha.partidos) {
            const fila = porId.get(carga.id)!;
            const sc = (fila.score ?? {}) as Record<string, number>;
            const p = carga.puntos;
            console.log(`${carga.home} vs ${carga.away}`);
            console.log(`  antes: ${fila.status} ${sc.home ?? '-'}-${sc.away ?? '-'} · ${fila.home_base_points}+${fila.home_bonus_points} / ${fila.away_base_points}+${fila.away_bonus_points} · auto=${fila.points_autocalculated}`);
            console.log(`  ahora: final ${carga.homeScore}-${carga.awayScore} · ${p.homeBase}+${p.homeBonus} / ${p.awayBase}+${p.awayBonus} · auto=false`);
        }
    }

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
    console.log(`\n· estado anterior guardado en ${ROLLBACK} (${previo.length} filas)`);

    for (const { carga } of todos) {
        const anterior = (porId.get(carga.id)!.score ?? {}) as Record<string, unknown>;
        const p = carga.puntos;
        const { error: upErr } = await supabase.from('matches').update({
            status: 'final',
            // Los tries que ya tuviera la fila se conservan: la placa no los publica.
            score: { ...anterior, home: carga.homeScore, away: carga.awayScore },
            home_base_points: p.homeBase,
            away_base_points: p.awayBase,
            home_bonus_points: p.homeBonus,
            away_bonus_points: p.awayBonus,
            points_autocalculated: false,
            points_override_reason: MOTIVO,
        }).eq('id', carga.id);
        if (upErr) { console.error('Falló el update de', carga.id, upErr); process.exit(1); }
    }
    console.log(`· ${todos.length} partidos cargados`);
    console.log('· la tabla del Clausura NO se toca: es la oficial de rugbyarchive y se pone al día con uruguayo-2026-actualizar.ts.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
