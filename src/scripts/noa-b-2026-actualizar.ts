/**
 * Torneo Regional del NOA "B" 2026: fechas reales, resultados y tabla.
 *
 *   npx tsx src/scripts/noa-b-2026-actualizar.ts            # dry-run
 *   npx tsx src/scripts/noa-b-2026-actualizar.ts --apply    # escribe
 *
 * Tres cosas en una sola pasada, porque las tres tocan las mismas 28 filas:
 *
 *   1. Las FECHAS. El fixture cargado tenía el orden correcto pero las fechas
 *      corridas casi un mes: la 4ª figuraba el 20/9 y se jugó el 22/8. Se
 *      adelantan todas al calendario real (sábados), con las excepciones
 *      declaradas partido por partido — los postergados y los domingos.
 *   2. Los RESULTADOS de las fechas 2, 3 y 4.
 *   3. El RECÁLCULO de `tournament_standings`, que no se rehace sola.
 *
 * Los puntos van con override manual (`points_autocalculated: false`) igual que
 * la fecha 1 que ya estaba cargada: la fuente publica el resultado y el punto
 * bonus, no la cantidad de tries, y el motor sin tries no puede deducir el
 * bonus ofensivo. Cada bonus de acá se corresponde con la tabla oficial de la
 * URT publicada tras la 4ª fecha.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const TORNEO = '3a335922-dc88-42a8-84d3-c38b57b46bca';

type Partido = {
    fecha: number;
    home: string;
    away: string;
    /** ISO completo. 18:30Z = 15:30 de Argentina, el horario del resto del fixture. */
    cuando: string;
    /** Ausente = todavía no se jugó: la fila queda como está (scheduled). */
    resultado?: { home: number; away: number; hb: number; hx: number; ab: number; ax: number };
    nota?: string;
};

/** hb/ab = puntos por el resultado · hx/ax = bonus (try u honor). */
const FIXTURE: Partido[] = [
    // ── Fecha 1 · sábado 11 de julio ────────────────────────────────────────
    { fecha: 1, home: 'santiago-lawn-tennis-club', away: 'santiago-rugby-club', cuando: '2026-07-11T18:30:00+00:00' },
    { fecha: 1, home: 'gimnasia-y-tiro', away: 'tiro-federal-salta', cuando: '2026-07-11T18:30:00+00:00' },
    { fecha: 1, home: 'old-lions-r-c', away: 'jockey-club-de-tucuman', cuando: '2026-07-11T18:30:00+00:00' },
    { fecha: 1, home: 'tigres-r-c', away: 'aguara-guazu', cuando: '2026-08-08T18:30:00+00:00', nota: 'postergado, se jugó el 8/8' },

    // ── Fecha 2 · sábado 25 de julio ────────────────────────────────────────
    {
        fecha: 2, home: 'santiago-rugby-club', away: 'gimnasia-y-tiro', cuando: '2026-07-25T18:30:00+00:00',
        resultado: { home: 22, away: 61, hb: 0, hx: 0, ab: 4, ax: 1 },
    },
    {
        fecha: 2, home: 'tiro-federal-salta', away: 'old-lions-r-c', cuando: '2026-07-25T18:30:00+00:00',
        resultado: { home: 0, away: 36, hb: 0, hx: 0, ab: 4, ax: 1 },
    },
    {
        fecha: 2, home: 'aguara-guazu', away: 'jockey-club-de-tucuman', cuando: '2026-07-25T18:30:00+00:00',
        resultado: { home: 3, away: 81, hb: 0, hx: 0, ab: 4, ax: 1 },
    },
    {
        fecha: 2, home: 'tigres-r-c', away: 'santiago-lawn-tennis-club', cuando: '2026-08-15T18:30:00+00:00',
        resultado: { home: 46, away: 25, hb: 4, hx: 1, ab: 0, ax: 0 },
        nota: 'pendiente, se jugó el 15/8 en San Lorenzo',
    },

    // ── Fecha 3 · sábado 1 de agosto ────────────────────────────────────────
    {
        fecha: 3, home: 'old-lions-r-c', away: 'santiago-rugby-club', cuando: '2026-08-01T18:30:00+00:00',
        resultado: { home: 78, away: 14, hb: 4, hx: 1, ab: 0, ax: 0 },
    },
    {
        fecha: 3, home: 'santiago-lawn-tennis-club', away: 'aguara-guazu', cuando: '2026-08-01T18:30:00+00:00',
        resultado: { home: 54, away: 29, hb: 4, hx: 1, ab: 0, ax: 0 },
    },
    {
        fecha: 3, home: 'gimnasia-y-tiro', away: 'tigres-r-c', cuando: '2026-08-01T18:30:00+00:00',
        resultado: { home: 36, away: 33, hb: 4, hx: 0, ab: 0, ax: 1 },
    },
    {
        // Nadie publicó el marcador. Sale de la tabla oficial tras la 3ª fecha,
        // que trae tantos a favor y en contra: a Jockey (171/38) le faltaban
        // 60 y 20 sobre lo ya cargado, y a Tiro Federal (38/174) le faltaban
        // 20 y 60. Las dos cuentas, hechas desde equipos distintos, coinciden.
        fecha: 3, home: 'jockey-club-de-tucuman', away: 'tiro-federal-salta', cuando: '2026-08-02T18:30:00+00:00',
        resultado: { home: 60, away: 20, hb: 4, hx: 1, ab: 0, ax: 0 },
        nota: 'se jugó el domingo 2/8',
    },

    // ── Fecha 4 · sábado 22 de agosto ───────────────────────────────────────
    {
        fecha: 4, home: 'santiago-lawn-tennis-club', away: 'gimnasia-y-tiro', cuando: '2026-08-22T18:30:00+00:00',
        resultado: { home: 42, away: 40, hb: 4, hx: 0, ab: 0, ax: 1 },
    },
    {
        fecha: 4, home: 'santiago-rugby-club', away: 'jockey-club-de-tucuman', cuando: '2026-08-22T18:30:00+00:00',
        resultado: { home: 13, away: 46, hb: 0, hx: 0, ab: 4, ax: 1 },
    },
    {
        fecha: 4, home: 'tigres-r-c', away: 'old-lions-r-c', cuando: '2026-08-22T18:30:00+00:00',
        resultado: { home: 28, away: 15, hb: 4, hx: 0, ab: 0, ax: 0 },
    },
    {
        fecha: 4, home: 'aguara-guazu', away: 'tiro-federal-salta', cuando: '2026-08-23T18:30:00+00:00',
        nota: 'se juega el domingo 23/8',
    },

    // ── Fecha 5 · sábado 29 de agosto ───────────────────────────────────────
    { fecha: 5, home: 'gimnasia-y-tiro', away: 'aguara-guazu', cuando: '2026-08-29T18:30:00+00:00' },
    { fecha: 5, home: 'old-lions-r-c', away: 'santiago-lawn-tennis-club', cuando: '2026-08-29T18:30:00+00:00' },
    { fecha: 5, home: 'jockey-club-de-tucuman', away: 'tigres-r-c', cuando: '2026-08-29T18:30:00+00:00' },
    { fecha: 5, home: 'tiro-federal-salta', away: 'santiago-rugby-club', cuando: '2026-08-29T18:30:00+00:00' },

    // ── Fecha 6 · sábado 5 de septiembre ────────────────────────────────────
    { fecha: 6, home: 'aguara-guazu', away: 'santiago-rugby-club', cuando: '2026-09-05T18:30:00+00:00' },
    { fecha: 6, home: 'tigres-r-c', away: 'tiro-federal-salta', cuando: '2026-09-05T18:30:00+00:00' },
    { fecha: 6, home: 'santiago-lawn-tennis-club', away: 'jockey-club-de-tucuman', cuando: '2026-09-05T18:30:00+00:00' },
    { fecha: 6, home: 'gimnasia-y-tiro', away: 'old-lions-r-c', cuando: '2026-09-05T18:30:00+00:00' },

    // ── Fecha 7 · sábado 19 de septiembre ───────────────────────────────────
    { fecha: 7, home: 'old-lions-r-c', away: 'aguara-guazu', cuando: '2026-09-19T18:30:00+00:00' },
    { fecha: 7, home: 'jockey-club-de-tucuman', away: 'gimnasia-y-tiro', cuando: '2026-09-19T18:30:00+00:00' },
    { fecha: 7, home: 'tiro-federal-salta', away: 'santiago-lawn-tennis-club', cuando: '2026-09-19T18:30:00+00:00' },
    { fecha: 7, home: 'santiago-rugby-club', away: 'tigres-r-c', cuando: '2026-09-19T18:30:00+00:00' },
];

type Fila = {
    id: string;
    date_time: string | null;
    round_label: string | null;
    home_club_id: string;
    away_club_id: string;
    status: string | null;
    score: Record<string, number> | null;
    phase_id: string | null;
    season_id: string | null;
    home_base_points: number | null;
    away_base_points: number | null;
    home_bonus_points: number | null;
    away_bonus_points: number | null;
    points_autocalculated: boolean | null;
    points_override_reason: string | null;
};

const dia = (iso: string) => String(iso).slice(0, 10);

const ARCHIVO_ROLLBACK = 'NOA_B_2026_ROLLBACK.json';

type EntradaRollback = { id: string; antes: Record<string, unknown> };

/**
 * Guarda el estado previo sin perder el de las corridas anteriores. Si un id ya
 * estaba respaldado, gana el respaldo VIEJO: el nuevo describe un estado que ya
 * es producto de esta carga y no sirve para deshacerla.
 */
async function fusionarRollback(nuevas: EntradaRollback[]) {
    const fs = await import('node:fs/promises');
    let previas: EntradaRollback[] = [];
    try {
        const crudo = JSON.parse(await fs.readFile(ARCHIVO_ROLLBACK, 'utf8'));
        previas = (Array.isArray(crudo) ? crudo : (crudo?.matches ?? [])) as EntradaRollback[];
    } catch {
        // No hay respaldo previo (primera corrida, o el archivo se borró).
    }
    const porId = new Map(nuevas.map((e) => [e.id, e]));
    for (const vieja of previas) porId.set(vieja.id, vieja);
    await fs.writeFile(ARCHIVO_ROLLBACK, JSON.stringify([...porId.values()], null, 2), 'utf8');
}

/**
 * La tabla de posiciones sale de `tournament_phase_participants`, no de
 * `tournament_participants`, y el recálculo acota ese SELECT por `season_id`.
 * Acá las ocho asignaciones existían con `season_id` en NULL, así que el
 * motor no encontraba participantes, devolvía cero filas y —por la guarda de
 * `recalculateStandings`— respondía `ok` dejando publicada la tabla vieja: el
 * peor fallo posible, el que no se ve. Dos reparaciones, en este orden:
 *
 *   · rellenar el `season_id` NULL con el de la temporada del partido;
 *   · crear la asignación que falte, derivada de los partidos (club que juega
 *     la fase, club asignado a la fase).
 */
async function repararAsignacionesDeFase(
    supabase: { from: (t: string) => any },
    filas: Fila[],
) {
    const { data: participantes } = await supabase
        .from('tournament_participants')
        .select('id, club_id, season_id')
        .eq('tournament_id', TORNEO)
        .eq('status', 'active');
    const porClub = new Map((participantes ?? []).map((p: any) => [p.club_id, p]));

    const { data: existentes } = await supabase
        .from('tournament_phase_participants')
        .select('id, phase_id, participant_id, season_id')
        .eq('tournament_id', TORNEO);

    const seasonPorFase = new Map(filas.filter((m) => m.phase_id).map((m) => [m.phase_id as string, m.season_id]));
    const huerfanas = (existentes ?? []).filter((a: any) => !a.season_id && seasonPorFase.get(a.phase_id));
    for (const a of huerfanas) {
        const { error } = await supabase
            .from('tournament_phase_participants')
            .update({ season_id: seasonPorFase.get(a.phase_id), updated_at: new Date().toISOString() })
            .eq('id', a.id);
        if (error) { console.error('No se pudo rellenar season_id de la asignación', a.id, error); process.exit(1); }
    }
    if (huerfanas.length) console.log(`Asignaciones de fase con season_id NULL reparadas: ${huerfanas.length}`);

    const asignadas = new Set((existentes ?? []).map((a: any) => `${a.phase_id}|${a.participant_id}`));

    const ahora = new Date().toISOString();
    const nuevas: Record<string, unknown>[] = [];
    for (const m of filas) {
        if (!m.phase_id) continue;
        for (const club of [m.home_club_id, m.away_club_id]) {
            const p: any = porClub.get(club);
            if (!p) continue;
            const clave = `${m.phase_id}|${p.id}`;
            if (asignadas.has(clave)) continue;
            asignadas.add(clave);
            nuevas.push({
                tournament_id: TORNEO,
                season_id: p.season_id ?? m.season_id,
                phase_id: m.phase_id,
                participant_id: p.id,
                group_id: null,
                status: 'active',
                seed: null,
                notes: null,
                created_at: ahora,
                updated_at: ahora,
            });
        }
    }

    if (!nuevas.length) { console.log('Asignaciones de fase: completas'); return; }
    const { error } = await supabase.from('tournament_phase_participants').insert(nuevas);
    if (error) { console.error('No se pudieron crear las asignaciones de fase', error); process.exit(1); }
    console.log(`Asignaciones de fase creadas: ${nuevas.length}`);
}

async function main() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    const { data: filas, error } = await supabase
        .from('matches')
        .select('id, date_time, round_label, home_club_id, away_club_id, status, score, phase_id, season_id, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason')
        .eq('tournament_id', TORNEO);
    if (error) { console.error(error); process.exit(1); }
    if (!filas?.length) { console.error('El torneo no tiene partidos.'); process.exit(1); }

    // `database.types.ts` se mantiene a mano y no cubre estas columnas, así que
    // PostgREST devuelve `unknown[]`. La forma se declara acá, no se adivina.
    const partidos = filas as unknown as Fila[];

    const porCruce = new Map(partidos.map((m) => [`${m.home_club_id}|${m.away_club_id}`, m]));
    if (porCruce.size !== partidos.length) {
        console.error('Hay cruces repetidos: el fixture no es de una sola rueda.');
        process.exit(1);
    }

    const cambios: Array<{ id: string; patch: Record<string, unknown>; antes: Record<string, unknown>; linea: string }> = [];
    const huerfanos: string[] = [];

    for (const p of FIXTURE) {
        const fila = porCruce.get(`${p.home}|${p.away}`);
        if (!fila) { huerfanos.push(`${p.home} vs ${p.away}`); continue; }

        const patch: Record<string, unknown> = {};
        const antes: Record<string, unknown> = {};
        const notas: string[] = [];

        const etiqueta = `Fecha ${p.fecha}`;
        if (fila.round_label !== etiqueta) {
            patch.round_label = etiqueta;
            antes.round_label = fila.round_label;
            notas.push(`rótulo ${fila.round_label ?? '(vacío)'} → ${etiqueta}`);
        }
        if (fila.date_time !== p.cuando) {
            patch.date_time = p.cuando;
            antes.date_time = fila.date_time;
            notas.push(`fecha ${dia(fila.date_time)} → ${dia(p.cuando)}`);
        }

        if (p.resultado) {
            const r = p.resultado;
            const sc = (fila.score ?? {}) as Record<string, number>;
            const distinto = fila.status !== 'final'
                || sc.home !== r.home || sc.away !== r.away
                || fila.home_base_points !== r.hb || fila.away_base_points !== r.ab
                || fila.home_bonus_points !== r.hx || fila.away_bonus_points !== r.ax
                || fila.points_autocalculated !== false;
            if (distinto) {
                antes.status = fila.status;
                antes.score = fila.score;
                antes.home_base_points = fila.home_base_points;
                antes.away_base_points = fila.away_base_points;
                antes.home_bonus_points = fila.home_bonus_points;
                antes.away_bonus_points = fila.away_bonus_points;
                antes.points_autocalculated = fila.points_autocalculated;
                antes.points_override_reason = fila.points_override_reason;
                Object.assign(patch, {
                    status: 'final',
                    score: { home: r.home, away: r.away, homeTries: sc.homeTries ?? 0, awayTries: sc.awayTries ?? 0 },
                    home_base_points: r.hb,
                    away_base_points: r.ab,
                    home_bonus_points: r.hx,
                    away_bonus_points: r.ax,
                    points_autocalculated: false,
                    points_override_reason: 'Resultado y bonus según la tabla oficial de la URT (Regional del NOA "B" 2026).',
                });
                notas.push(`resultado ${r.home}-${r.away} · puntos ${r.hb + r.hx}-${r.ab + r.ax}`);
            }
        }

        if (Object.keys(patch).length === 0) continue;
        const cola = p.nota ? `  (${p.nota})` : '';
        cambios.push({
            id: fila.id,
            patch,
            antes,
            linea: `F${p.fecha} ${p.home} vs ${p.away}: ${notas.join(' · ')}${cola}`,
        });
    }

    if (huerfanos.length) {
        console.error('Cruces del fixture que no existen en la base:');
        huerfanos.forEach((h) => console.error(`  · ${h}`));
        process.exit(1);
    }

    console.log(`${partidos.length} partidos en la base · ${FIXTURE.length} en el fixture · ${cambios.length} filas a tocar\n`);
    cambios.forEach((c) => console.log(`  ${c.linea}`));

    // Los que ya estaban finales en la base no se declaran acá: no son un hueco.
    const pendientes = FIXTURE
        .filter((p) => !p.resultado && p.fecha <= 4)
        .filter((p) => porCruce.get(`${p.home}|${p.away}`)?.status !== 'final')
        .map((p) => `F${p.fecha} ${p.home} vs ${p.away}${p.nota ? ` — ${p.nota}` : ''}`);
    if (pendientes.length) {
        console.log('\nSin resultado (quedan como scheduled):');
        pendientes.forEach((p) => console.log(`  · ${p}`));
    }

    if (!APPLY) { console.log('\nDRY-RUN. Nada se escribió. Repetí con --apply.'); return; }

    const rollback: EntradaRollback[] = [];
    for (const c of cambios) {
        const { error: upErr } = await supabase.from('matches').update(c.patch).eq('id', c.id);
        if (upErr) { console.error(`FALLÓ ${c.linea}`, upErr); process.exit(1); }
        rollback.push({ id: c.id, antes: c.antes });
    }
    if (rollback.length) {
        // El rollback se FUSIONA, no se pisa. Una segunda corrida que toca una
        // sola fila no puede borrar el estado previo de las otras veintisiete,
        // y el respaldo más viejo de cada id es el que vale: es el que lleva de
        // vuelta al punto anterior a la primera escritura.
        await fusionarRollback(rollback);
        console.log(`\n${cambios.length} filas escritas. Rollback en ${ARCHIVO_ROLLBACK}`);
    } else {
        console.log('\nSin cambios en los partidos: el rollback anterior queda intacto.');
    }

    await repararAsignacionesDeFase(supabase, partidos);

    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    const fases = [...new Set(partidos.map((m) => `${m.phase_id}|${m.season_id ?? ''}`))];
    for (const clave of fases) {
        const [phaseId, seasonId] = clave.split('|');
        const r = await recalculatePhaseStandingsScopes(TORNEO, phaseId, 'general', seasonId || null);
        console.log(`Tabla: ${r.ok ? 'ok' : 'FALLÓ'} · ${r.rows_calculated} filas`);
    }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
