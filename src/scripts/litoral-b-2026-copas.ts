/**
 * Torneo Regional del Litoral "B" 2026: la segunda instancia.
 *
 *   npx tsx src/scripts/litoral-b-2026-copas.ts            # dry-run
 *   npx tsx src/scripts/litoral-b-2026-copas.ts --apply
 *
 * Terminadas las once fechas de la Primera Fase, los doce se parten en dos: los
 * seis de arriba juegan la Copa Oro y los seis de abajo la Copa Plata. Cada copa
 * es una rueda simple de cinco fechas, del 29 de agosto al 24 de octubre.
 *
 * Qué hace, en orden:
 *
 *   1. Borra la fase "Top 6 – Copa Oro" que había quedado vacía (sin partidos)
 *      y sus seis asignaciones. Su `settings` se usa antes como plantilla, para
 *      que las dos copas hereden el sistema de puntos, los desempates y las
 *      columnas de la tabla del torneo en vez de inventarlos.
 *   2. Crea Copa Oro y Copa Plata. La base sólo admite UNA fase activa por
 *      torneo y temporada (`tournament_phases_one_active_idx`), así que apaga la
 *      Primera Fase y deja prendida la Copa Oro, que es la que arranca.
 *   3. Asigna los seis equipos de cada copa y carga las cinco fechas.
 *   4. Etiquetas. La etiqueta de la tabla NO sale de `settings`: se resuelve por
 *      POSICIÓN desde `team_labels` + `ui_labels` (ver `resolveStandingsRowLabel`),
 *      y `settings.groupLabels` es lo que ve el gestor al elegirla. Se escriben
 *      las dos cosas.
 *        · Primera Fase, puestos 1 a 6 → "Copa Oro", verde.
 *        · cada copa, puestos 1 a 4 → "Semifinales", verde.
 *
 * Las copas arrancan de cero: no se arrastran los puntos de la Primera Fase. Si
 * el reglamento dijera lo contrario, es `carryOver` en los settings de cada copa
 * y un recálculo.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const TORNEO = 'b28a55ac-b372-4b89-ba81-ee43232abffb';
const TEMPORADA = 'e6f13b21-255c-4300-a68d-95f18f881dd0';
const FASE_1 = '08b60098-aff2-4acc-bfb6-5631bf3ffee6';
const FASE_VACIA = '678173c9-9f75-42d5-ab4b-72a41a1acff5'; // "Top 6 – Copa Oro", sin partidos
const ROLLBACK = 'LITORAL_B_COPAS_ROLLBACK.json';

const VERDE = '#00a365';
const HORA = 'T19:00:00+00:00'; // la misma que traen las once fechas ya jugadas
const CANCHA = 'Cancha 1';

const FECHAS = ['2026-08-29', '2026-09-19', '2026-10-10', '2026-10-17', '2026-10-24'];

type Copa = {
    nombre: string;
    orden: number;
    activa: boolean;
    clubes: string[];
    /** Una entrada por fecha; cada una con sus tres cruces [local, visitante]. */
    fechas: Array<Array<[string, string]>>;
};

const COPAS: Copa[] = [
    {
        nombre: 'Copa Oro',
        orden: 2,
        activa: true,
        clubes: ['universitario-de-santa-fe', 'c-a-provincial', 'crar', 'logaritmo-rugby-club', 'los-caranchos', 'alma-juniors'],
        fechas: [
            [
                ['universitario-de-santa-fe', 'c-a-provincial'],
                ['crar', 'logaritmo-rugby-club'],
                ['los-caranchos', 'alma-juniors'],
            ],
            [
                ['c-a-provincial', 'los-caranchos'],
                ['alma-juniors', 'crar'],
                ['logaritmo-rugby-club', 'universitario-de-santa-fe'],
            ],
            [
                ['logaritmo-rugby-club', 'c-a-provincial'],
                ['universitario-de-santa-fe', 'alma-juniors'],
                ['crar', 'los-caranchos'],
            ],
            [
                ['c-a-provincial', 'crar'],
                ['los-caranchos', 'universitario-de-santa-fe'],
                ['alma-juniors', 'logaritmo-rugby-club'],
            ],
            [
                ['alma-juniors', 'c-a-provincial'],
                ['logaritmo-rugby-club', 'los-caranchos'],
                ['universitario-de-santa-fe', 'crar'],
            ],
        ],
    },
    {
        nombre: 'Copa Plata',
        orden: 3,
        activa: false,
        clubes: ['pampas-de-rufino', 'gimnasia-y-esgrima-de-pergamino', 'la-salle-jobson', 'regatas-belgrano-san-nicolas', 'cha-roga-r-c', 'club-tilcara'],
        fechas: [
            [
                ['pampas-de-rufino', 'gimnasia-y-esgrima-de-pergamino'],
                ['la-salle-jobson', 'regatas-belgrano-san-nicolas'],
                ['cha-roga-r-c', 'club-tilcara'],
            ],
            [
                ['gimnasia-y-esgrima-de-pergamino', 'cha-roga-r-c'],
                ['club-tilcara', 'la-salle-jobson'],
                ['regatas-belgrano-san-nicolas', 'pampas-de-rufino'],
            ],
            [
                ['regatas-belgrano-san-nicolas', 'gimnasia-y-esgrima-de-pergamino'],
                ['pampas-de-rufino', 'club-tilcara'],
                ['la-salle-jobson', 'cha-roga-r-c'],
            ],
            [
                ['gimnasia-y-esgrima-de-pergamino', 'la-salle-jobson'],
                ['cha-roga-r-c', 'pampas-de-rufino'],
                ['club-tilcara', 'regatas-belgrano-san-nicolas'],
            ],
            [
                ['club-tilcara', 'gimnasia-y-esgrima-de-pergamino'],
                ['regatas-belgrano-san-nicolas', 'cha-roga-r-c'],
                ['pampas-de-rufino', 'la-salle-jobson'],
            ],
        ],
    },
];

type Participante = { id: string; club_id: string; name: string };
type Fila = Record<string, unknown>;

/** Que cada copa sea una rueda simple de verdad, antes de escribir una sola fila. */
function verificarRueda(copa: Copa) {
    const cruces = copa.fechas.flat();
    if (cruces.length !== 15) throw new Error(`${copa.nombre}: ${cruces.length} partidos, deberían ser 15.`);

    const vistos = new Set<string>();
    for (const [local, visitante] of cruces) {
        if (!copa.clubes.includes(local)) throw new Error(`${copa.nombre}: ${local} no está en la copa.`);
        if (!copa.clubes.includes(visitante)) throw new Error(`${copa.nombre}: ${visitante} no está en la copa.`);
        const par = [local, visitante].sort().join('|');
        if (vistos.has(par)) throw new Error(`${copa.nombre}: ${par} se repite.`);
        vistos.add(par);
    }
    if (vistos.size !== 15) throw new Error(`${copa.nombre}: ${vistos.size} cruces distintos, deberían ser 15.`);

    copa.fechas.forEach((fecha, i) => {
        const enLaFecha = fecha.flat();
        if (new Set(enLaFecha).size !== 6) {
            throw new Error(`${copa.nombre}, fecha ${i + 1}: un club juega dos veces o falta alguno.`);
        }
    });
}

async function main() {
    for (const copa of COPAS) verificarRueda(copa);

    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    // ── Los doce del torneo, para resolver club_id → participant_id ───────────
    const { data: partsRaw, error: partsErr } = await supabase
        .from('tournament_participants')
        .select('id, club_id, name')
        .eq('tournament_id', TORNEO);
    if (partsErr || !partsRaw) { console.error('No pude leer los participantes.', partsErr); process.exit(1); }
    const participantes = partsRaw as unknown as Participante[];
    const porClub = new Map(participantes.map((p) => [p.club_id, p]));

    for (const copa of COPAS) {
        for (const club of copa.clubes) {
            if (!porClub.has(club)) { console.error(`${copa.nombre}: el club ${club} no es participante del torneo.`); process.exit(1); }
        }
    }

    // ── La fase vacía: plantilla de settings y confirmación de que se puede ir ─
    const { data: viejaRaw, error: viejaErr } = await supabase
        .from('tournament_phases').select('*').eq('id', FASE_VACIA).maybeSingle();
    if (viejaErr) { console.error('No pude leer la fase vieja.', viejaErr); process.exit(1); }
    const vieja = viejaRaw as unknown as Fila | null;

    const { count: partidosDeLaVieja } = await supabase
        .from('matches').select('id', { count: 'exact', head: true }).eq('phase_id', FASE_VACIA);
    if ((partidosDeLaVieja ?? 0) > 0) {
        console.error(`La fase "Top 6 – Copa Oro" tiene ${partidosDeLaVieja} partidos: no la borro. Revisala a mano.`);
        process.exit(1);
    }
    const { data: asignVieja } = await supabase
        .from('tournament_phase_participants').select('*').eq('phase_id', FASE_VACIA);
    const asignacionesViejas = (asignVieja ?? []) as unknown as Fila[];

    const plantilla = { ...((vieja?.settings ?? {}) as Record<string, unknown>) };
    if (Object.keys(plantilla).length === 0) { console.error('La fase vieja no tiene settings para usar de plantilla.'); process.exit(1); }

    // ── Lo que se va a escribir ──────────────────────────────────────────────
    const plan = COPAS.map((copa) => {
        const faseId = randomUUID();
        const etiquetaId = randomUUID();
        return {
            copa,
            faseId,
            etiquetaId,
            asignaciones: copa.clubes.map((club) => ({
                id: randomUUID(),
                tournament_id: TORNEO,
                season_id: TEMPORADA,
                phase_id: faseId,
                participant_id: porClub.get(club)!.id,
                group_id: null,
                status: 'active',
            })),
            partidos: copa.fechas.flatMap((fecha, i) => fecha.map(([local, visitante]) => ({
                id: randomUUID(),
                tournament_id: TORNEO,
                season_id: TEMPORADA,
                phase_id: faseId,
                round_label: `Fecha ${i + 1}`,
                date_time: `${FECHAS[i]}${HORA}`,
                home_club_id: local,
                away_club_id: visitante,
                status: 'scheduled',
                score: { home: 0, away: 0 },
                sport_id: 'rugby',
                venue: CANCHA,
                is_visible: true,
                review_status: 'approved',
                points_autocalculated: true,
            }))),
        };
    });

    const etiquetaOroId = randomUUID();

    console.log('== A BORRAR ==');
    console.log(`fase "${vieja?.name ?? '(no existe)'}" ${FASE_VACIA} · ${asignacionesViejas.length} asignaciones · 0 partidos`);

    console.log('\n== A CREAR ==');
    for (const p of plan) {
        console.log(`\n${p.copa.nombre} (orden ${p.copa.orden}, activa=${p.copa.activa}) ${p.faseId}`);
        console.log(`  equipos: ${p.copa.clubes.map((c) => porClub.get(c)!.name).join(', ')}`);
        p.copa.fechas.forEach((fecha, i) => {
            console.log(`  Fecha ${i + 1} — ${FECHAS[i]}`);
            for (const [l, v] of fecha) console.log(`    ${porClub.get(l)!.name} vs ${porClub.get(v)!.name}`);
        });
        console.log(`  etiqueta: "Semifinales" ${VERDE} en los puestos 1 a 4`);
    }
    console.log(`\nPrimera Fase: etiqueta "Copa Oro" ${VERDE} en los puestos 1 a 6, y se apaga (la activa pasa a ser la Copa Oro).`);

    if (!APPLY) { console.log('\nDRY-RUN. Nada se escribió. Repetí con --apply.'); return; }

    // ── 1. rollback antes de tocar nada ──────────────────────────────────────
    const { data: fase1Raw } = await supabase.from('tournament_phases').select('*').eq('id', FASE_1).single();
    const fase1 = fase1Raw as unknown as Fila;
    const fs = await import('node:fs/promises');
    await fs.writeFile(ROLLBACK, JSON.stringify({
        borrado: { fase: vieja, asignaciones: asignacionesViejas },
        fase1_antes: { id: FASE_1, is_active: fase1.is_active, settings: fase1.settings },
        creado: {
            fases: plan.map((p) => p.faseId),
            asignaciones: plan.flatMap((p) => p.asignaciones.map((a) => a.id)),
            partidos: plan.flatMap((p) => p.partidos.map((m) => m.id)),
            ui_labels: [etiquetaOroId, ...plan.map((p) => p.etiquetaId)],
        },
    }, null, 2), 'utf8');

    // ── 2. borrar la fase vacía ──────────────────────────────────────────────
    if (vieja) {
        const { error: e1 } = await supabase.from('tournament_phase_participants').delete().eq('phase_id', FASE_VACIA);
        if (e1) { console.error('No pude borrar las asignaciones viejas.', e1); process.exit(1); }
        const { error: e2 } = await supabase.from('tournament_phases').delete().eq('id', FASE_VACIA);
        if (e2) { console.error('No pude borrar la fase vieja.', e2); process.exit(1); }
        console.log(`· borrada la fase "${vieja.name}" y sus ${asignacionesViejas.length} asignaciones`);
    }

    // ── 3. apagar la Primera Fase (una sola activa por torneo y temporada) ────
    const { error: eApagar } = await supabase.from('tournament_phases')
        .update({ is_active: false })
        .eq('tournament_id', TORNEO).eq('season_id', TEMPORADA).eq('is_active', true);
    if (eApagar) { console.error('No pude apagar la fase activa.', eApagar); process.exit(1); }
    console.log('· Primera Fase apagada');

    // ── 4. las dos copas ─────────────────────────────────────────────────────
    for (const p of plan) {
        const { error } = await supabase.from('tournament_phases').insert([{
            id: p.faseId,
            tournament_id: TORNEO,
            season_id: TEMPORADA,
            name: p.copa.nombre,
            phase_type: 'league',
            order_index: p.copa.orden,
            is_active: p.copa.activa,
            settings: {
                ...plantilla,
                legs: 1,
                teamsCount: p.copa.clubes.length,
                advanceCount: 4,
                groupTags: ['Semifinales'],
                groupLabels: [{ id: p.etiquetaId, name: 'Semifinales', color: VERDE, colorMode: 'manual', autoColorIndex: 0 }],
            },
        }]);
        if (error) { console.error(`Alta de la fase ${p.copa.nombre} falló.`, error); process.exit(1); }
        console.log(`· fase "${p.copa.nombre}" creada (${p.faseId})`);

        const { error: eAsign } = await supabase.from('tournament_phase_participants').insert(p.asignaciones);
        if (eAsign) { console.error(`Asignación de equipos de ${p.copa.nombre} falló.`, eAsign); process.exit(1); }
        console.log(`  · ${p.asignaciones.length} equipos asignados`);

        for (let i = 0; i < p.partidos.length; i += 50) {
            const { error: eM } = await supabase.from('matches').insert(p.partidos.slice(i, i + 50));
            if (eM) { console.error(`Alta de partidos de ${p.copa.nombre} falló.`, eM); process.exit(1); }
        }
        console.log(`  · ${p.partidos.length} partidos creados`);
    }

    // ── 5. las etiquetas ─────────────────────────────────────────────────────
    //
    // `ui_labels` es la definición (nombre y color) y `team_labels` la asignación
    // a una posición dentro de una fase. La tabla pública lee la segunda; el
    // gestor, además, ofrece las de `settings.groupLabels`.
    const labels = [
        { id: etiquetaOroId, name: 'Copa Oro', color: VERDE, scope: 'standings' },
        ...plan.map((p) => ({ id: p.etiquetaId, name: 'Semifinales', color: VERDE, scope: 'standings' })),
    ];
    const { error: eLabels } = await supabase.from('ui_labels' as never).insert(labels as never);
    if (eLabels) { console.error('Alta de etiquetas falló.', eLabels); process.exit(1); }
    console.log(`· ${labels.length} etiquetas creadas en ui_labels`);

    const asignacionesEtiqueta = [
        ...[1, 2, 3, 4, 5, 6].map((position) => ({
            label_id: etiquetaOroId, club_id: null, position,
            tournament_id: TORNEO, phase_id: FASE_1, group_id: null,
        })),
        ...plan.flatMap((p) => [1, 2, 3, 4].map((position) => ({
            label_id: p.etiquetaId, club_id: null, position,
            tournament_id: TORNEO, phase_id: p.faseId, group_id: null,
        }))),
    ];
    const { error: eTL } = await supabase.from('team_labels').insert(asignacionesEtiqueta);
    if (eTL) { console.error('Asignación de etiquetas falló.', eTL); process.exit(1); }
    console.log(`· ${asignacionesEtiqueta.length} asignaciones de etiqueta escritas`);

    const settings1 = { ...((fase1.settings ?? {}) as Record<string, unknown>) };
    settings1.groupTags = ['Copa Oro'];
    settings1.groupLabels = [{ id: etiquetaOroId, name: 'Copa Oro', color: VERDE, colorMode: 'manual', autoColorIndex: 0 }];
    const { error: eS1 } = await supabase.from('tournament_phases').update({ settings: settings1 }).eq('id', FASE_1);
    if (eS1) { console.error('No pude escribir la etiqueta en la Primera Fase.', eS1); process.exit(1); }
    console.log('· Primera Fase: etiqueta "Copa Oro" registrada en sus settings');

    // ── 6. las tablas de las copas, para que existan desde el día uno ─────────
    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    for (const p of plan) {
        const r = await recalculatePhaseStandingsScopes(TORNEO, p.faseId, 'general', TEMPORADA);
        console.log(`· ${p.copa.nombre}: tabla inicial ${r.ok ? 'ok' : 'FALLÓ'} (${r.rows_calculated} filas)`);
    }

    // ── 7. verificación ──────────────────────────────────────────────────────
    console.log('\n== VERIFICACIÓN ==');
    const { data: fasesRaw } = await supabase.from('tournament_phases')
        .select('id, name, order_index, is_active').eq('tournament_id', TORNEO).order('order_index');
    for (const f of (fasesRaw ?? []) as unknown as Array<{ id: string; name: string; order_index: number; is_active: boolean }>) {
        const { count } = await supabase.from('matches').select('id', { count: 'exact', head: true }).eq('phase_id', f.id);
        const { count: equipos } = await supabase.from('tournament_phase_participants').select('id', { count: 'exact', head: true }).eq('phase_id', f.id);
        const { data: tl } = await supabase.from('team_labels')
            .select('position, label:ui_labels(name, color)').eq('phase_id', f.id).order('position');
        const etiquetas = ((tl ?? []) as unknown as Array<{ position: number; label: { name: string; color: string } | null }>);
        const resumen = etiquetas.length
            ? `${etiquetas[0].label?.name} ${etiquetas[0].label?.color} en ${etiquetas.map((e) => e.position).join(',')}`
            : 'sin etiquetas';
        console.log(`[${f.order_index}] ${f.name.padEnd(14)} activa=${String(f.is_active).padEnd(5)} equipos=${equipos} partidos=${count} · ${resumen}`);
    }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
