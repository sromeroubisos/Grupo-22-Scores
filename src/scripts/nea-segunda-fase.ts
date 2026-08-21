/**
 * Segunda fase del Torneo Regional del NEA 2026: la fase, sus ocho equipos y
 * las siete fechas (10a a 16a) del fixture oficial.
 *
 *   npx tsx src/scripts/nea-segunda-fase.ts --plan
 *   npx tsx src/scripts/nea-segunda-fase.ts --execute
 *
 * El reglamento de la fase, tal como lo dice la planilla:
 *   · 8 equipos en 7 fechas, todos contra todos a una rueda
 *   · SE ARRASTRAN LOS PUNTOS DE FASE 1
 *   · LOS 4 PRIMEROS CLASIFICAN PARA SEMIFINALES
 *
 * El arrastre no se escribe a mano: `settings.carryOver` lo resuelve
 * `standingsCarryOver.ts`, que suma la tabla de la fase anterior a la nueva y
 * descarta a los clubes que no siguen (Sixty y CAPRI, que se van al Ascenso).
 *
 * Antes de crear nada el script repara la fase 1, que hoy no puede recalcular:
 * sus filas de `tournament_phase_participants` quedaron con `season_id` en NULL
 * de cuando la fase tampoco tenia temporada, y desde el reanclaje de agosto el
 * recalculo filtra por temporada y encuentra cero participantes. El motor, ante
 * cero filas, conserva la tabla publicada — por eso la tabla dice 8 partidos
 * jugados cuando en la base hay 9. Si eso no se arregla primero, la fase 2
 * arrastra una tabla vieja.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const EJECUTAR = process.argv.includes('--execute');

const TORNEO_ID = 'b0562cf3-4ea1-463e-86cb-86988dc22f10';
const TEMPORADA_ID = '2c9d7e30-5481-44fd-8226-3b3fec34f20a';
const FASE_1_ID = 'c56764e6-b400-489d-81eb-07b768d61eb2';

/** La planilla da el fin de semana entero; el dia de cada partido todavia no. */
const FECHAS: { numero: number; fecha: string; partidos: [string, string][] }[] = [
    {
        numero: 10, fecha: '2026-08-22', partidos: [
            ['regatas-de-resistencia', 'taraguy-r-c'],
            ['san-jose', 'san-patricio'],
            ['aguara', 'curne'],
            ['aranduroga-r-c', 'curda'],
        ],
    },
    {
        numero: 11, fecha: '2026-08-29', partidos: [
            ['taraguy-r-c', 'san-jose'],
            ['curne', 'curda'],
            ['san-patricio', 'aranduroga-r-c'],
            ['aguara', 'regatas-de-resistencia'],
        ],
    },
    {
        numero: 12, fecha: '2026-09-05', partidos: [
            ['aranduroga-r-c', 'taraguy-r-c'],
            ['curda', 'regatas-de-resistencia'],
            ['san-jose', 'aguara'],
            ['curne', 'san-patricio'],
        ],
    },
    {
        numero: 13, fecha: '2026-09-19', partidos: [
            ['aguara', 'taraguy-r-c'],
            ['regatas-de-resistencia', 'san-patricio'],
            ['aranduroga-r-c', 'curne'],
            ['curda', 'san-jose'],
        ],
    },
    {
        numero: 14, fecha: '2026-10-03', partidos: [
            ['taraguy-r-c', 'curda'],
            ['san-jose', 'aranduroga-r-c'],
            ['curne', 'regatas-de-resistencia'],
            ['san-patricio', 'aguara'],
        ],
    },
    {
        numero: 15, fecha: '2026-10-10', partidos: [
            ['san-patricio', 'taraguy-r-c'],
            ['san-jose', 'curne'],
            ['aguara', 'curda'],
            ['regatas-de-resistencia', 'aranduroga-r-c'],
        ],
    },
    {
        numero: 16, fecha: '2026-10-17', partidos: [
            ['regatas-de-resistencia', 'san-jose'],
            ['aranduroga-r-c', 'aguara'],
            ['curda', 'san-patricio'],
            ['taraguy-r-c', 'curne'],
        ],
    },
];

/** 19:00 UTC = 16:00 en Argentina, el horario con el que se cargo toda la fase 1. */
const HORA = 'T19:00:00+00:00';

const CLUBES = [...new Set(FECHAS.flatMap((f) => f.partidos.flat()))];

async function main() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    // ── 0. la fase 1, que tiene que estar al dia antes de arrastrarse ────────
    const { data: asignaciones1 } = await supabase
        .from('tournament_phase_participants')
        .select('id, season_id, participant_id')
        .eq('phase_id', FASE_1_ID);
    const huerfanas = (asignaciones1 ?? []).filter((a: { season_id: string | null }) => !a.season_id);

    const { data: tabla1 } = await supabase
        .from('tournament_standings')
        .select('club_id, played, points, position')
        .eq('phase_id', FASE_1_ID)
        .order('position', { ascending: true });

    const { count: jugados } = await supabase
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .eq('phase_id', FASE_1_ID)
        .in('status', ['final', 'finished', 'ft']);

    console.log('Fase 1 "Regular Season"');
    console.log(`  ${asignaciones1?.length ?? 0} participantes asignados · ${huerfanas.length} sin temporada (hay que repararlos)`);
    console.log(`  ${jugados ?? 0} partidos finales en la base · la tabla publicada dice ${tabla1?.[0]?.played ?? '?'} jugados por equipo`);

    // ── 1. los ocho que siguen ───────────────────────────────────────────────
    const { data: participantes } = await supabase
        .from('tournament_participants')
        .select('id, club_id, name')
        .eq('tournament_id', TORNEO_ID)
        .eq('season_id', TEMPORADA_ID);

    const porClub = new Map<string, { id: string; name: string }>(
        ((participantes ?? []) as { id: string; club_id: string; name: string }[]).map((p) => [p.club_id, { id: p.id, name: p.name }]),
    );
    const faltantes = CLUBES.filter((c) => !porClub.has(c));
    if (faltantes.length) {
        console.error(`\nEstos clubes del fixture no son participantes de la temporada: ${faltantes.join(', ')}`);
        process.exit(1);
    }
    const seVan = [...porClub.keys()].filter((c) => !CLUBES.includes(c));

    console.log(`\nFase 2 "Segunda Fase" · ${CLUBES.length} equipos · ${FECHAS.length} fechas · ${FECHAS.length * 4} partidos`);
    console.log(`  siguen: ${CLUBES.map((c) => porClub.get(c)!.name).join(' · ')}`);
    console.log(`  no siguen: ${seVan.map((c) => porClub.get(c)!.name).join(' · ')} (van al Ascenso)`);
    console.log('  arrastre de puntos de la fase 1: si · clasifican a semifinales: los 4 primeros');
    for (const f of FECHAS) {
        console.log(`  Fecha ${f.numero} · ${f.fecha}`);
        for (const [l, v] of f.partidos) console.log(`      ${porClub.get(l)!.name.padEnd(24)} vs ${porClub.get(v)!.name}`);
    }

    // ── retomable: si la fase ya esta, se completa lo que falte ──────────────
    const { data: yaFases } = await supabase
        .from('tournament_phases')
        .select('id, name, order_index')
        .eq('tournament_id', TORNEO_ID)
        .eq('season_id', TEMPORADA_ID)
        .eq('order_index', 2);
    const faseExistente = yaFases?.[0] ?? null;
    if (faseExistente) console.log(`\nLa fase ya existe ("${faseExistente.name}"): se completa lo que falte.`);

    if (!EJECUTAR) {
        console.log('\n--plan: no se escribio nada. Repeti con --execute.');
        return;
    }

    // ── 2. reparar la fase 1 y rehacer su tabla ──────────────────────────────
    if (huerfanas.length) {
        const { error } = await supabase
            .from('tournament_phase_participants')
            .update({ season_id: TEMPORADA_ID })
            .eq('phase_id', FASE_1_ID)
            .is('season_id', null);
        if (error) { console.error(`No se pudo reparar la fase 1 (${error.message})`); process.exit(1); }
        console.log(`\n· fase 1: ${huerfanas.length} asignaciones enganchadas a la temporada 2026`);
    }

    // "Regular Season" al lado de "Segunda Fase" se lee mal: la planilla las
    // llama FASE 1 y SEGUNDA FASE.
    const { error: errNombre } = await supabase
        .from('tournament_phases')
        .update({ name: 'Primera Fase' })
        .eq('id', FASE_1_ID)
        .eq('name', 'Regular Season');
    if (errNombre) console.warn(`  ! no se pudo renombrar la fase 1 (${errNombre.message})`);
    else console.log('· fase 1: renombrada "Regular Season" → "Primera Fase"');

    // El cartel de la fase 1 quedo del asistente que la creo ("Clasifica",
    // puestos 1 a 2) y hoy miente: de los diez, ocho pasan a la segunda fase y
    // dos se van al Ascenso. Es lo que dicen las dos planillas juntas.
    const { data: fase1 } = await supabase
        .from('tournament_phases').select('settings').eq('id', FASE_1_ID).single();
    const settings1 = { ...(fase1?.settings ?? {}) } as Record<string, unknown>;
    settings1.tableTags = [
        { id: '1', color: '#00a365', label: 'Pasa a la Segunda Fase', fromPosition: 1, toPosition: 8 },
    ];
    settings1.advanceCount = 8;
    const { error: errTags } = await supabase
        .from('tournament_phases').update({ settings: settings1 }).eq('id', FASE_1_ID);
    if (errTags) console.warn(`  ! no se pudo corregir el cartel de la fase 1 (${errTags.message})`);
    else console.log('· fase 1: cartel corregido — "Pasa a la Segunda Fase", puestos 1 a 8');

    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    const r1 = await recalculatePhaseStandingsScopes(TORNEO_ID, FASE_1_ID, 'general', TEMPORADA_ID);
    console.log(`· fase 1: tabla rehecha (${r1.rows_calculated} filas, ok=${r1.ok})`);

    // ── 3. la fase 2 ─────────────────────────────────────────────────────────
    //
    // `tournament_phases_one_active_idx` deja UNA sola fase activa por
    // (torneo, temporada): hay que apagar la primera antes de prender la
    // segunda, el mismo orden que usa la API. La fase activa es la que el
    // torneo abre por omision, y a partir del 22 de agosto esa es la segunda.
    const faseId = faseExistente?.id ?? randomUUID();
    if (!faseExistente) {
        const { error: errApagar } = await supabase
            .from('tournament_phases')
            .update({ is_active: false })
            .eq('tournament_id', TORNEO_ID)
            .eq('season_id', TEMPORADA_ID)
            .eq('is_active', true);
        if (errApagar) { console.error(`No se pudo desactivar la fase 1 (${errApagar.message})`); process.exit(1); }
        console.log('· fase 1: desactivada (la fase activa pasa a ser la segunda)');

        const { error } = await supabase.from('tournament_phases').insert([{
            id: faseId,
            tournament_id: TORNEO_ID,
            season_id: TEMPORADA_ID,
            name: 'Segunda Fase',
            phase_type: 'league',
            order_index: 2,
            is_active: true,
            settings: {
                legs: 1,
                phaseMode: 'league',
                teamsCount: CLUBES.length,
                groupLabels: [],
                group_names: [],
                pointsSystem: { win: 4, draw: 2, loss: 0, bonusTry: 1, bonusLoss: 1 },
                tiebreakers: [
                    { label: 'Puntos obtenidos', order: 1, metric: 'points_table', enabled: true, priority: 1 },
                    { label: 'Diferencia de Tantos', order: 2, metric: 'points_diff', enabled: true, priority: 2 },
                ],
                // "SE ARRASTRAN LOS PUNTOS DE FASE 1": el motor lo resuelve solo.
                carryOver: { enabled: true, sourcePhaseId: FASE_1_ID },
                advanceCount: 4,
                tableTags: [
                    { id: '1', color: '#00a365', label: 'Clasifica a Semifinales', fromPosition: 1, toPosition: 4 },
                ],
                selectedTeamIds: CLUBES,
                groupAssignments: {},
                playoffStages: [],
                playoffThirdPlace: false,
            },
        }]);
        if (error) { console.error(`Alta de la fase fallo (${error.message})`); process.exit(1); }
        console.log(`· fase 2 creada (${faseId})`);
    }

    // ── 4. los ocho equipos asignados a la fase ──────────────────────────────
    const { data: yaAsignados } = await supabase
        .from('tournament_phase_participants')
        .select('participant_id')
        .eq('phase_id', faseId);
    const asignados = new Set(((yaAsignados ?? []) as { participant_id: string }[]).map((a) => a.participant_id));

    const nuevasAsignaciones = CLUBES
        .filter((c) => !asignados.has(porClub.get(c)!.id))
        .map((c) => ({
            id: randomUUID(),
            tournament_id: TORNEO_ID,
            season_id: TEMPORADA_ID,
            phase_id: faseId,
            participant_id: porClub.get(c)!.id,
            group_id: null,
            status: 'active',
        }));
    if (nuevasAsignaciones.length) {
        const { error } = await supabase.from('tournament_phase_participants').insert(nuevasAsignaciones);
        if (error) { console.error(`Asignacion de equipos fallo (${error.message})`); process.exit(1); }
        console.log(`· fase 2: ${nuevasAsignaciones.length} equipos asignados`);
    }

    // ── 5. las siete fechas ──────────────────────────────────────────────────
    const { data: yaPartidos } = await supabase
        .from('matches')
        .select('home_club_id, away_club_id')
        .eq('phase_id', faseId);
    const yaEsta = new Set(((yaPartidos ?? []) as { home_club_id: string; away_club_id: string }[]).map((m) => `${m.home_club_id}|${m.away_club_id}`));

    const altas = FECHAS.flatMap((f) => f.partidos
        .filter(([l, v]) => !yaEsta.has(`${l}|${v}`))
        .map(([local, visitante]) => ({
            id: randomUUID(),
            tournament_id: TORNEO_ID,
            season_id: TEMPORADA_ID,
            phase_id: faseId,
            round_label: `Fecha ${f.numero}`,
            date_time: `${f.fecha}${HORA}`,
            home_club_id: local,
            away_club_id: visitante,
            status: 'scheduled',
            score: { home: 0, away: 0 },
            sport: 'rugby',
            sport_id: 'rugby',
            is_visible: true,
            review_status: 'approved',
            points_autocalculated: true,
        })));

    if (altas.length) {
        for (let i = 0; i < altas.length; i += 50) {
            const { error } = await supabase.from('matches').insert(altas.slice(i, i + 50));
            if (error) { console.error(`Alta de partidos fallo (${error.message})`); process.exit(1); }
        }
        console.log(`· fase 2: ${altas.length} partidos creados`);
    }

    // ── 6. la tabla de la fase 2, ya con el arrastre ─────────────────────────
    const r2 = await recalculatePhaseStandingsScopes(TORNEO_ID, faseId, 'general', TEMPORADA_ID);
    console.log(`· fase 2: tabla calculada (${r2.rows_calculated} filas, ok=${r2.ok})`);

    console.log('\nListo.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
