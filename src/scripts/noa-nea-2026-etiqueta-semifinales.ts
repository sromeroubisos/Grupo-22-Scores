/**
 * Etiqueta verde "Semifinales" en los cuatro primeros del Regional del NOA "A"
 * y del Regional del NEA, temporada 2026.
 *
 *   npx tsx src/scripts/noa-nea-2026-etiqueta-semifinales.ts            # dry-run
 *   npx tsx src/scripts/noa-nea-2026-etiqueta-semifinales.ts --apply
 *
 * LA BANDA DE COLOR NO SALE DE `settings`. Tres cosas parecen la etiqueta de la
 * tabla y sólo una la pinta:
 *
 *   · `ui_labels` — la definición: nombre, color y `scope: 'standings'`.
 *   · `team_labels` — la asignación, y es POR POSICIÓN, no por club. Es la que
 *     lee la web (`resolveStandingsRowLabel`, `src/lib/teamLabels.ts`), acotada
 *     por fase y grupo.
 *   · `settings.groupLabels` de la fase — sólo la lista que el gestor ofrece al
 *     elegir etiqueta. Escribir esto y no `team_labels` es exactamente el estado
 *     en el que estaba el NOA "A": la fase declaraba su "Semifinales" verde
 *     desde el 07/08 y en la tabla pública no se veía nada.
 *
 * Por eso se escriben las tres.
 *
 * Cuatro puestos, no dos. Una semifinal la juegan cuatro. El NEA lo confirma en
 * su propia fase (`advanceCount: 4`); el NOA "A" tiene `advanceCount: 2`, que es
 * el número que muestra el gestor y contradice al cartel que la misma fase ya
 * traía. No se toca acá: cambiar cuántos clasifican es una decisión del torneo,
 * no un efecto secundario de pintar una fila.
 *
 * La etiqueta del NOA "A" ya existía en `ui_labels` y es exclusiva de su fase
 * —ningún otro torneo la usa—, así que se reusa. La del NEA se crea nueva en vez
 * de compartir alguna de las doce "Semifinales" que ya hay: compartir una
 * acopla dos torneos por el color, y el día que alguien le cambie el tono a uno
 * se lo cambia al otro sin enterarse.
 *
 * Efecto de borde conocido: como la etiqueta va por posición, la banda sigue al
 * puesto y no al club. Si mañana cambia el orden de la tabla, cambia a quién le
 * toca — que es justamente lo que se quiere.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const ROLLBACK = 'NOA_NEA_ETIQUETA_SEMIFINALES_ROLLBACK.json';
const VERDE = '#00a365';
const PUESTOS = [1, 2, 3, 4];

type Objetivo = {
    rotulo: string;
    torneo: string;
    fase: string;
    /** Cuántos clubes tiene que tener la tabla de esa fase; si no, corta. */
    clubes: number;
    /** El primero de la tabla al momento de escribir esto: verifica que la fase es la que se cree. */
    primero: string;
    /** La etiqueta ya existente en `ui_labels`, o `null` para crear una nueva. */
    etiquetaExistente: string | null;
};

const OBJETIVOS: Objetivo[] = [
    {
        rotulo: 'Regional del NOA "A" 2026 · Regular Season',
        torneo: 'a4a4d389-5eaa-4e16-9024-81c54abe64cc',
        fase: '88bb0e41-7872-43b7-8f53-8bf52fa6dee3',
        clubes: 10,
        primero: 'cardenales-r-c',
        etiquetaExistente: 'addcf981-946f-4b8e-8144-2a68c844f1cf',
    },
    {
        // La Primera Fase reparte a los ocho que siguen, no semifinalistas: no se etiqueta.
        rotulo: 'Regional del NEA 2026 · Segunda Fase',
        torneo: 'b0562cf3-4ea1-463e-86cb-86988dc22f10',
        fase: '36496ee9-0fa1-417c-9597-e77c75b6a9ac',
        clubes: 8,
        primero: 'taraguy-r-c',
        etiquetaExistente: null,
    },
];

type FilaEtiqueta = {
    id: string;
    label_id: string | null;
    club_id: string | null;
    position: number | null;
    tournament_id: string | null;
    phase_id: string | null;
    group_id: string | null;
};

async function main() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    const plan: Array<{
        objetivo: Objetivo;
        etiquetaId: string;
        crearEtiqueta: boolean;
        settingsAntes: Record<string, unknown>;
        previas: FilaEtiqueta[];
        tabla: Array<{ position: number; club_id: string; points: number }>;
    }> = [];

    for (const o of OBJETIVOS) {
        const { data: faseRaw, error: eFase } = await supabase
            .from('tournament_phases').select('id, name, tournament_id, settings').eq('id', o.fase).single();
        if (eFase || !faseRaw) { console.error(`No pude leer la fase de ${o.rotulo}.`, eFase); process.exit(1); }
        const fase = faseRaw as unknown as { id: string; name: string; tournament_id: string; settings: Record<string, unknown> | null };
        if (fase.tournament_id !== o.torneo) {
            console.error(`La fase ${o.fase} no es del torneo ${o.torneo}.`); process.exit(1);
        }

        const { data: tablaRaw } = await supabase
            .from('tournament_standings').select('position, club_id, points').eq('phase_id', o.fase).order('position');
        const tabla = (tablaRaw ?? []) as unknown as Array<{ position: number; club_id: string; points: number }>;
        if (tabla.length !== o.clubes) {
            console.error(`${o.rotulo}: la tabla tiene ${tabla.length} clubes, esperaba ${o.clubes}.`); process.exit(1);
        }
        if (tabla[0]?.club_id !== o.primero) {
            console.error(`${o.rotulo}: el primero es ${tabla[0]?.club_id}, esperaba ${o.primero}.`); process.exit(1);
        }

        const { data: previasRaw } = await supabase
            .from('team_labels').select('id, label_id, club_id, position, tournament_id, phase_id, group_id').eq('phase_id', o.fase);
        const previas = (previasRaw ?? []) as unknown as FilaEtiqueta[];

        let etiquetaId = o.etiquetaExistente;
        let crearEtiqueta = false;
        if (etiquetaId) {
            const { data: existente } = await supabase
                .from('ui_labels').select('id, name, color, scope').eq('id', etiquetaId).maybeSingle();
            const e = existente as unknown as { name: string; color: string; scope: string } | null;
            if (!e) { console.error(`${o.rotulo}: la etiqueta ${etiquetaId} no está en ui_labels.`); process.exit(1); }
            if (e.color !== VERDE || e.scope !== 'standings') {
                console.error(`${o.rotulo}: la etiqueta ${etiquetaId} es ${e.color}/${e.scope}, no ${VERDE}/standings.`); process.exit(1);
            }
        } else {
            etiquetaId = randomUUID();
            crearEtiqueta = true;
        }

        plan.push({ objetivo: o, etiquetaId, crearEtiqueta, settingsAntes: fase.settings ?? {}, previas, tabla });
    }

    console.log('== ETIQUETA "Semifinales" ' + VERDE + ' EN LOS PUESTOS ' + PUESTOS.join(', ') + ' ==');
    for (const p of plan) {
        console.log(`\n${p.objetivo.rotulo}`);
        console.log(`  etiqueta: ${p.etiquetaId} (${p.crearEtiqueta ? 'nueva en ui_labels' : 'ya existía, se reusa'})`);
        console.log(`  team_labels: ${p.previas.length} antes → ${PUESTOS.length} después`);
        for (const fila of p.tabla) {
            const marca = PUESTOS.includes(fila.position) ? ' ← Semifinales' : '';
            console.log(`    ${String(fila.position).padStart(2)}  ${fila.club_id.padEnd(26)} ${String(fila.points).padStart(3)}${marca}`);
        }
    }

    if (!APPLY) { console.log('\nDRY-RUN. Nada se escribió. Repetí con --apply.'); return; }

    const fs = await import('node:fs/promises');
    await fs.writeFile(ROLLBACK, JSON.stringify({
        objetivos: plan.map((p) => ({
            rotulo: p.objetivo.rotulo,
            fase: p.objetivo.fase,
            etiqueta_creada: p.crearEtiqueta ? p.etiquetaId : null,
            settings_antes: p.settingsAntes,
            team_labels_antes: p.previas,
        })),
    }, null, 2), 'utf8');

    for (const p of plan) {
        if (p.crearEtiqueta) {
            const { error } = await supabase.from('ui_labels' as never).insert({
                id: p.etiquetaId, name: 'Semifinales', color: VERDE, scope: 'standings',
            } as never);
            if (error) { console.error(`Alta de etiqueta falló en ${p.objetivo.rotulo}.`, error); process.exit(1); }
        }

        // Las previas se borran antes de insertar para que correr esto dos veces
        // no deje ocho filas donde tiene que haber cuatro.
        if (p.previas.length) {
            const { error } = await supabase.from('team_labels').delete().eq('phase_id', p.objetivo.fase);
            if (error) { console.error(`No pude limpiar las etiquetas previas de ${p.objetivo.rotulo}.`, error); process.exit(1); }
        }

        const { error: eTL } = await supabase.from('team_labels').insert(
            PUESTOS.map((position) => ({
                label_id: p.etiquetaId, club_id: null, position,
                tournament_id: p.objetivo.torneo, phase_id: p.objetivo.fase, group_id: null,
            })),
        );
        if (eTL) { console.error(`Asignación falló en ${p.objetivo.rotulo}.`, eTL); process.exit(1); }

        // El PATCH de fases pisa `settings` entero, así que se parte de lo que
        // había y se reemplaza sólo lo propio.
        const settings = { ...p.settingsAntes };
        settings.groupTags = ['Semifinales'];
        settings.groupLabels = [{ id: p.etiquetaId, name: 'Semifinales', color: VERDE, colorMode: 'manual', autoColorIndex: 0 }];
        const { error: eS } = await supabase.from('tournament_phases').update({ settings }).eq('id', p.objetivo.fase);
        if (eS) { console.error(`No pude escribir los settings de ${p.objetivo.rotulo}.`, eS); process.exit(1); }

        console.log(`· ${p.objetivo.rotulo}: ${PUESTOS.length} asignaciones + groupLabels`);
    }

    console.log('\n== VERIFICACIÓN ==');
    let difs = 0;
    for (const p of plan) {
        const { data: tlRaw } = await supabase
            .from('team_labels').select('position, club_id, label:ui_labels(name, color, scope)')
            .eq('phase_id', p.objetivo.fase).order('position');
        const tl = (tlRaw ?? []) as unknown as Array<{ position: number; club_id: string | null; label: { name: string; color: string; scope: string } | null }>;
        const ok = tl.length === PUESTOS.length
            && tl.every((f, i) => f.position === PUESTOS[i] && f.club_id === null
                && f.label?.name === 'Semifinales' && f.label?.color === VERDE && f.label?.scope === 'standings');
        if (!ok) difs++;
        console.log(`${ok ? 'ok  ' : 'MAL '} ${p.objetivo.rotulo}: ` + (tl.map((f) => `${f.position}=${f.label?.name}/${f.label?.color}`).join(' ') || 'sin etiquetas'));
        for (const fila of p.tabla.filter((f) => PUESTOS.includes(f.position))) {
            console.log(`       ${fila.position}. ${fila.club_id}`);
        }
    }
    console.log(difs === 0
        ? '\nLas dos tablas pintan sus cuatro primeros de verde.'
        : `\n${difs} objetivo(s) quedaron mal.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
