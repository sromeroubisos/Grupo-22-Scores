/**
 * Seven de la Pava 2026 (Córdoba Athletic Club, viernes 27 y sábado 28/11): alta de
 * DOS torneos de rugby 7 desde el fixture oficial (Fixture_7DLP_2026.pdf).
 *
 *   npx tsx src/scripts/seven-de-la-pava-2026-alta.ts                 # dry-run
 *   npx tsx src/scripts/seven-de-la-pava-2026-alta.ts --apply
 *   npx tsx src/scripts/seven-de-la-pava-2026-alta.ts --apply --publicar
 *
 * Masculino "Seven de la Pava": 9 clubes en 3 zonas de 3 (viernes). El sábado, el 1.º de
 * cada zona va a la Copa de Oro, el 2.º a la de Plata y el 3.º a la de Bronce: cada copa es
 * un triangular todos contra todos y el 1.º y el 2.º juegan la final.
 *   Fase 1 "Fase de zonas"  (group_stage, Zona A/B/C)
 *   Fase 2 "Copas"          (group_stage, grupos Copa de Oro/Plata/Bronce)
 *   Fase 3 "Finales"        (playoff, una final por copa)
 * Femenino "Seven de la Pava (Femenino)": triangular el sábado + final 1.º vs 2.º.
 *
 * Los cruces que dependen de resultados nacen SIN clubes, ocultos, con `bracket_match_code`
 * (P11…P25, el Nº del fixture) y el rótulo de origen ("1º Zona A"). La temporada lleva
 * `autoAdvanceFromLabels: true`, así que se completan solos al cargar el último resultado
 * de la zona o del triangular (src/lib/server/advanceFromGroupLabels.ts). A mano:
 * `seven-de-la-pava-2026-avance.ts`.
 *
 * Cada club entra con su versión "<Club> 7s" (se reusa si existe). Córdoba Athletic tiene
 * dos equipos en cada rama: van como clubes 7s "1" y "2" vinculados al club base.
 * Puntos 2/1/0 sin bonus, como el Córdoba 7 (mismo orden que el 3/2/1 de World Rugby).
 * Retomable. Nace en draft; --publicar lo pasa a published/activo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const PUBLICAR = process.argv.includes('--publicar');

const MODELO = '65d4ace6-5df3-49cd-a59f-32a40777395e'; // Córdoba 7 (seven, 2/1/0, plantel fijo)
const UNION_UCR = '0c515ac1-af49-4699-b3c5-7273bc424357';
const ORIGEN = 'seven-de-la-pava-2026-alta';
const LOGO_LOCAL = 'public/competiciones/ar-seven-de-la-pava.png';
const LOGO_STORAGE = 'logos/seven-de-la-pava-2026.png';
const SEDE = 'Córdoba Athletic Club';

/** Club 7s de cada equipo. `base` = club del que sale la versión 7s. */
type Equipo = { base: string; nombre: string; id7?: string; nombre7?: string };
const EQ: Record<string, Equipo> = {
    CAC1: { base: 'cordoba-athletic-club', nombre: 'Córdoba Athletic 1', id7: 'cordoba-athletic-club-7s-1', nombre7: 'Córdoba Athletic Club 7s "1"' },
    UNI: { base: 'club-universitario-de-cordoba', nombre: 'Universitario de Córdoba' },
    AGU: { base: 'aguara-guazu', nombre: 'Aguará Guazú' },
    JCC: { base: 'jockey-club-cordoba', nombre: 'Jockey Club Córdoba' },
    PB: { base: 'club-palermo-bajo', nombre: 'Palermo Bajo' },
    SFR: { base: 'santa-fe-r-c', nombre: 'Santa Fe R.C.' },
    CAC2: { base: 'cordoba-athletic-club', nombre: 'Córdoba Athletic 2', id7: 'cordoba-athletic-club-7s-2', nombre7: 'Córdoba Athletic Club 7s "2"' },
    TAB: { base: 'club-la-tablada', nombre: 'La Tablada' },
    EST: { base: 'estudiantes-de-parana', nombre: 'Estudiantes de Paraná' },
    // femenino
    F1: { base: 'cordoba-athletic-club-femenino', nombre: 'Córdoba Athletic 1', id7: 'cordoba-athletic-club-femenino-7s-1', nombre7: 'Córdoba Athletic Club Femenino 7s "1"' },
    F2: { base: 'cordoba-athletic-club-femenino', nombre: 'Córdoba Athletic 2', id7: 'cordoba-athletic-club-femenino-7s-2', nombre7: 'Córdoba Athletic Club Femenino 7s "2"' },
    F3: { base: '', nombre: 'Invitación 7', id7: 'invitacion-7-femenino', nombre7: 'Invitación 7' },
};

const ZONAS = { A: ['CAC1', 'UNI', 'AGU'], B: ['JCC', 'PB', 'SFR'], C: ['CAC2', 'TAB', 'EST'] } as const;
type ZonaK = keyof typeof ZONAS;
const COPAS = [
    { k: 'ORO', nombre: 'Copa de Oro', puesto: 1 },
    { k: 'PLATA', nombre: 'Copa de Plata', puesto: 2 },
    { k: 'BRONCE', nombre: 'Copa de Bronce', puesto: 3 },
] as const;
type CopaK = (typeof COPAS)[number]['k'];

const VIE = '2026-11-27', SAB = '2026-11-28';
// [nº, hora, zona, fecha, local, visitante]
const ZP: Array<[number, string, ZonaK, number, string, string]> = [
    [1, '20:00', 'A', 1, 'CAC1', 'UNI'], [2, '20:22', 'B', 1, 'JCC', 'PB'], [3, '20:44', 'C', 1, 'CAC2', 'TAB'],
    [4, '21:06', 'A', 2, 'UNI', 'AGU'], [5, '21:28', 'B', 2, 'PB', 'SFR'], [6, '21:50', 'C', 2, 'TAB', 'EST'],
    [7, '22:12', 'A', 3, 'CAC1', 'AGU'], [8, '22:34', 'B', 3, 'JCC', 'SFR'], [9, '22:56', 'C', 3, 'CAC2', 'EST'],
];
// copas: [nº, hora, copa, fecha, zona del local, zona del visitante]; el puesto lo pone la copa
const CP: Array<[number, string, CopaK, number, ZonaK, ZonaK]> = [
    [11, '15:22', 'BRONCE', 1, 'A', 'B'], [12, '15:44', 'PLATA', 1, 'A', 'B'], [13, '16:06', 'ORO', 1, 'A', 'B'],
    [15, '16:50', 'BRONCE', 2, 'B', 'C'], [16, '17:12', 'PLATA', 2, 'B', 'C'], [17, '17:34', 'ORO', 2, 'B', 'C'],
    [19, '18:18', 'BRONCE', 3, 'A', 'C'], [20, '18:40', 'PLATA', 3, 'A', 'C'], [21, '19:02', 'ORO', 3, 'A', 'C'],
];
const FINALES: Array<[number, string, CopaK]> = [[23, '19:46', 'BRONCE'], [24, '20:08', 'PLATA'], [25, '20:30', 'ORO']];
// femenino: [nº, hora, fecha, local, visitante]
const FP: Array<[number, string, number, string, string]> = [
    [10, '15:00', 1, 'F1', 'F2'], [14, '16:28', 2, 'F2', 'F3'], [18, '17:56', 3, 'F1', 'F3'],
];
const FINAL_FEM: [number, string] = [22, '19:24'];

const iso = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`).toISOString();

function validar() {
    const enZonas = Object.values(ZONAS).flat();
    if (new Set(enZonas).size !== 9) throw new Error('Las zonas no suman 9 equipos distintos.');
    for (const [n, , z, , h, a] of ZP) {
        const zona = ZONAS[z] as readonly string[];
        if (!zona.includes(h) || !zona.includes(a)) throw new Error(`P${n} fuera de su zona`);
    }
    for (const z of Object.keys(ZONAS) as ZonaK[]) {
        const pares = new Set(ZP.filter((p) => p[2] === z).map((p) => [p[4], p[5]].sort().join('-')));
        if (pares.size !== 3) throw new Error(`Zona ${z}: no es todos contra todos`);
    }
    for (const c of COPAS) {
        const pares = new Set(CP.filter((p) => p[2] === c.k).map((p) => [p[4], p[5]].sort().join('-')));
        if (pares.size !== 3) throw new Error(`${c.nombre}: no es todos contra todos`);
    }
    const nums = [...ZP.map((p) => p[0]), ...CP.map((p) => p[0]), ...FINALES.map((p) => p[0]), ...FP.map((p) => p[0]), FINAL_FEM[0]].sort((a, b) => a - b);
    if (nums.join() !== Array.from({ length: 25 }, (_, i) => i + 1).join()) throw new Error('Los Nº del fixture no son 1..25');
}

const TIEBREAKERS = [
    { order: 'desc', metric: 'points', enabled: true, priority: 1 },
    { order: 'desc', metric: 'headToHead', enabled: true, priority: 2 },
    { order: 'desc', metric: 'pointsDiff', enabled: true, priority: 3 },
    { order: 'desc', metric: 'pointsFor', enabled: true, priority: 4 },
];
const PUNTOS = { win: 2, draw: 1, loss: 0, allowBonusPoints: false };
const COLORES = ['#00a365', '#3b82f6', '#f97316'];
const COLORES_COPA = ['#eab308', '#94a3b8', '#b45309'];

type T = { id: string; season: string };

async function main() {
    validar();
    console.log('Fixture validado: 9 de zona · 9 de copas · 3 finales · femenino 3 + final');

    const { createAdminClient } = await import('@/lib/supabase/admin');
    const sb = createAdminClient();

    const bases = [...new Set(Object.values(EQ).map((e) => e.base).filter(Boolean))];
    const { data: basesDb } = await sb.from('clubs').select('*').in('id', bases);
    const baseDb = new Map<string, any>((basesDb ?? []).map((b: any) => [b.id as string, b]));
    const faltan = bases.filter((b) => !baseDb.has(b));
    if (faltan.length) throw new Error(`No existen los clubes base: ${faltan.join(', ')}`);

    const { data: mod } = await sb.from('tournaments').select('*').eq('id', MODELO).single();
    if (mod?.ruleset?.rugbyModality !== 'sevens') throw new Error('El modelo no es un seven.');
    const { data: modFase } = await sb.from('tournament_phases').select('settings').eq('tournament_id', MODELO).eq('phase_type', 'group_stage').limit(1).single();

    // ── versión 7s de cada equipo ─────────────────────────────────────────────
    const plan = new Map<string, { id: string; nombre: string }>();
    for (const [k, e] of Object.entries(EQ)) {
        if (e.id7) { plan.set(k, { id: e.id7, nombre: e.nombre7! }); continue; }
        const b = baseDb.get(e.base)!;
        plan.set(k, { id: `${b.id}-7s`, nombre: `${b.name} 7s` });
    }
    const { data: porNombre } = await sb.from('clubs').select('id, name').in('name', [...plan.values()].map((p) => p.nombre));
    const { data: porId } = await sb.from('clubs').select('id, name').in('id', [...plan.values()].map((p) => p.id));
    const club7 = new Map<string, string>();
    console.log('\nVersión 7s de cada equipo:');
    for (const [k, p] of plan) {
        const ya = (porNombre ?? []).find((c) => c.name === p.nombre) ?? (porId ?? []).find((c) => c.id === p.id);
        if (ya && ya.name !== p.nombre) throw new Error(`${k}: el id ${p.id} ya existe como "${ya.name}"`);
        if (ya) club7.set(k, ya.id as string);
        console.log(`  ${k.padEnd(5)} ${p.nombre.padEnd(40)} ${ya ? ya.id : `(se crea ${p.id})`}`);
    }
    if (!APPLY) { console.log('\nDry-run: no se escribió nada. Repetí con --apply.'); return; }

    // ── crear las versiones 7s que faltan ────────────────────────────────────
    // Misma forma que las 7s que crea la app (p. ej. club-la-tablada-7s): fila en clubs sin
    // union_id + vínculo `family` en club_derivatives. clubService es server-only y no corre acá.
    for (const [k, p] of plan) {
        if (club7.has(k)) continue;
        const e = EQ[k];
        const b = e.base ? baseDb.get(e.base)! : null;
        const { error } = await sb.from('clubs').insert([{
            id: p.id, slug: p.id, name: p.nombre, short_name: e.nombre, country: b?.country || 'ARG',
            logo_url: b?.logo_url ?? null, is_visible: true, entity_type: 'club', sport: 'rugby',
            status: 'active', visibility: 'visible', categories: [], claim_status: 'own',
        }]);
        if (error) throw new Error(`${k}: no se pudo crear ${p.nombre}: ${error.message}`);
        if (b) {
            const { error: el } = await sb.from('club_derivatives').insert([{ base_club_id: b.id, derived_club_id: p.id, derivative_type: 'family' }]);
            if (el) throw new Error(`${k}: no se pudo vincular: ${el.message}`);
        }
        club7.set(k, p.id);
        console.log(`  + ${k}: ${p.id}`);
    }

    // ── escudo del torneo a Storage ──────────────────────────────────────────
    const { error: eUp } = await sb.storage.from('tournaments').upload(LOGO_STORAGE, fs.readFileSync(LOGO_LOCAL), { contentType: 'image/png', upsert: true });
    if (eUp) throw new Error(`Escudo: ${eUp.message}`);
    const logoUrl = sb.storage.from('tournaments').getPublicUrl(LOGO_STORAGE).data.publicUrl;

    // ── helpers de alta ──────────────────────────────────────────────────────
    async function torneo(t: { slug: string; nombre: string; genero: string }): Promise<T> {
        const { data: ya } = await sb.from('tournaments').select('id, current_season_id').eq('slug', t.slug).limit(1);
        if (ya?.[0]) {
            const { data: s } = await sb.from('tournament_seasons').select('id, settings').eq('id', ya[0].current_season_id).single();
            if ((s?.settings as { source?: string } | null)?.source !== ORIGEN) throw new Error(`El slug ${t.slug} existe y no lo creó este script.`);
            await sb.from('tournaments').update({ logo_url: logoUrl }).eq('id', ya[0].id);
            console.log(`= ${t.nombre} ${ya[0].id}`);
            return { id: ya[0].id as string, season: s!.id as string };
        }
        const id = randomUUID(), season = randomUUID();
        const { error: e1 } = await sb.from('tournaments').insert([{
            id, union_id: UNION_UCR, season_id: '2026', name: t.nombre, original_name: t.nombre, display_name: t.nombre, slug: t.slug,
            status: 'draft', is_active: false, is_visible: true, category: null, age_grade: 'Mayores', region: 'Córdoba', gender: t.genero,
            country: mod.country, country_id: mod.country_id, country_name: mod.country_name,
            sport: mod.sport, sport_id: mod.sport_id, sport_name: mod.sport_name, logo_url: logoUrl,
            format: 'league', ruleset: mod.ruleset, ruleset_version: mod.ruleset_version, review_status: 'approved', current_season_id: null,
        }]);
        if (e1) throw new Error(`Torneo ${t.nombre}: ${e1.message}`);
        const { error: e2 } = await sb.from('tournament_seasons').insert([{
            id: season, tournament_id: id, legacy_tournament_id: id, season_code: '2026', name: `${t.nombre} 2026`, display_name: `${t.nombre} 2026`,
            status: 'active', is_active: true, format: 'league', ruleset: mod.ruleset, start_date: VIE, end_date: SAB,
            settings: { source: ORIGEN, sede: SEDE, fuente: 'Fixture oficial 7DLP 2026', bloques_min: 22, autoAdvanceFromLabels: true },
        }]);
        if (e2) throw new Error(`Temporada ${t.nombre}: ${e2.message}`);
        const { error: e3 } = await sb.from('tournaments').update({ current_season_id: season }).eq('id', id);
        if (e3) throw new Error(`current_season_id: ${e3.message}`);
        console.log(`+ ${t.nombre} ${id}`);
        return { id, season };
    }

    async function fase(t: T, nombre: string, tipo: 'group_stage' | 'playoff', orden: number, activa: boolean, grupos: string[], colores: string[], extra: Record<string, unknown>) {
        const { data: ya } = await sb.from('tournament_phases').select('id').eq('season_id', t.season).eq('name', nombre).limit(1);
        let id = ya?.[0]?.id as string | undefined;
        if (!id) {
            id = randomUUID();
            const groupIds = grupos.map(() => randomUUID());
            const base = (tipo === 'group_stage' ? { ...(modFase?.settings ?? {}) } : {}) as Record<string, unknown>;
            const { error } = await sb.from('tournament_phases').insert([{
                id, tournament_id: t.id, season_id: t.season, name: nombre, phase_type: tipo, order_index: orden, is_active: activa,
                settings: {
                    ...base, source: ORIGEN, legs: 1, advanceCount: 0,
                    pointsSystem: { ...((base.pointsSystem as object) ?? {}), ...PUNTOS }, tiebreakers: TIEBREAKERS,
                    ...(grupos.length ? {
                        groupTags: grupos, group_names: grupos,
                        groupLabels: grupos.map((g, i) => ({ id: groupIds[i], name: g, color: colores[i] ?? '#64748b', colorMode: 'manual', autoColorIndex: i })),
                    } : {}),
                    ...extra,
                },
            }]);
            if (error) throw new Error(`Fase ${nombre}: ${error.message}`);
            for (const [i, g] of grupos.entries()) {
                const { error: eg } = await sb.from('tournament_groups').insert([{ id: groupIds[i], phase_id: id, name: g, order_index: i + 1, season_id: t.season }]);
                if (eg) throw new Error(`Grupo ${g}: ${eg.message}`);
            }
            console.log(`  + fase ${nombre}`);
        }
        const { data: gs } = await sb.from('tournament_groups').select('id, name').eq('phase_id', id);
        return { id: id as string, gid: new Map<string, string>((gs ?? []).map((g) => [g.name as string, g.id as string])) };
    }

    async function participantes(t: T, claves: string[], grupoDe: (k: string) => string | null) {
        const { data: ya } = await sb.from('tournament_participants').select('id, club_id, season_entry_id').eq('season_id', t.season);
        const out = new Map<string, { pid: string; entry: string }>();
        for (const p of ya ?? []) out.set(p.club_id as string, { pid: p.id as string, entry: p.season_entry_id as string });
        for (const k of claves) {
            const club = club7.get(k)!;
            if (out.has(club)) continue;
            const pid = randomUUID(), entry = randomUUID(), g = grupoDe(k);
            const { error: e1 } = await sb.from('tournament_participants').insert([{ id: pid, tournament_id: t.id, season_id: t.season, club_id: club, group_id: g, name: EQ[k].nombre, short_code: EQ[k].nombre, type: 'club', status: 'active', season_entry_id: null }]);
            if (e1) throw new Error(`Participante ${k}: ${e1.message}`);
            const { error: e2 } = await sb.from('team_season_entries').insert([{ id: entry, season_id: t.season, tournament_id: t.id, club_id: club, team_id: null, group_id: g, source_participant_id: pid, status: 'active', settings: { source: ORIGEN, participant_type: 'club' } }]);
            if (e2) throw new Error(`Entrada ${k}: ${e2.message}`);
            const { error: e3 } = await sb.from('tournament_participants').update({ season_entry_id: entry }).eq('id', pid);
            if (e3) throw new Error(`Enganche ${k}: ${e3.message}`);
            out.set(club, { pid, entry });
        }
        return out;
    }

    async function asignar(t: T, faseId: string, pid: string, gid?: string) {
        const { data: ya } = await sb.from('tournament_phase_participants').select('id').eq('phase_id', faseId).eq('participant_id', pid).limit(1);
        if (ya?.length) return;
        const { error } = await sb.from('tournament_phase_participants').insert([{ tournament_id: t.id, season_id: t.season, phase_id: faseId, participant_id: pid, status: 'active', ...(gid ? { group_id: gid } : {}) }]);
        if (error) throw new Error(`Asignación: ${error.message}`);
    }

    const cuenta: Record<string, number> = {};
    async function partido(t: T, p: {
        nro: number; dia: string; hora: string; fase: string; grupo?: string; ronda: string;
        home?: string; away?: string; entries: Map<string, { entry: string }>; hl?: string; al?: string;
    }) {
        const code = `P${p.nro}`;
        const { data: ya } = await sb.from('matches').select('id, status').eq('season_id', t.season).eq('bracket_match_code', code).limit(1);
        const row = {
            date_time: iso(p.dia, p.hora), round_label: p.ronda, phase_id: p.fase, group_id: p.grupo ?? null,
            ...(p.home ? { home_club_id: p.home, home_season_entry_id: p.entries.get(p.home)?.entry ?? null } : {}),
            ...(p.away ? { away_club_id: p.away, away_season_entry_id: p.entries.get(p.away)?.entry ?? null } : {}),
            home_source_label: p.hl ?? null, away_source_label: p.al ?? null,
        };
        let r: string;
        if (ya?.[0]) {
            if (ya[0].status !== 'scheduled') r = 'ya jugado';
            else {
                const { error } = await sb.from('matches').update(row).eq('id', ya[0].id);
                if (error) throw new Error(`${code}: ${error.message}`);
                r = 'actualizado';
            }
        } else {
            const { error } = await sb.from('matches').insert([{
                id: randomUUID(), tournament_id: t.id, season_id: t.season, bracket_match_code: code, status: 'scheduled',
                is_visible: Boolean(p.home && p.away), review_status: 'approved', auto_scheduled: false, ...row,
            }]);
            if (error) throw new Error(`${code}: ${error.message}`);
            r = 'nuevo';
        }
        cuenta[r] = (cuenta[r] ?? 0) + 1;
    }

    // ── MASCULINO ────────────────────────────────────────────────────────────
    const TM = await torneo({ slug: 'seven-de-la-pava-2026', nombre: 'Seven de la Pava', genero: 'masculino' });
    const fZ = await fase(TM, 'Fase de zonas', 'group_stage', 1, true, ['Zona A', 'Zona B', 'Zona C'], COLORES, { teamsCount: 9 });
    const fC = await fase(TM, 'Copas', 'group_stage', 2, false, COPAS.map((c) => c.nombre), COLORES_COPA, { teamsCount: 9, seededFrom: 'Fase de zonas' });
    const fF = await fase(TM, 'Finales', 'playoff', 3, false, [], [], {
        teamsCount: 6, phaseMode: 'playoff', bracketMode: 'manual',
        playoffStages: [{ id: 'playoff_stage_1', name: 'Finales', matchCount: 3, orderIndex: 1 }],
    });
    const zonaDe = (k: string) => (Object.entries(ZONAS) as [ZonaK, readonly string[]][]).find(([, v]) => v.includes(k))![0];
    const partM = await participantes(TM, Object.values(ZONAS).flat(), (k) => fZ.gid.get(`Zona ${zonaDe(k)}`) ?? null);
    for (const k of Object.values(ZONAS).flat()) await asignar(TM, fZ.id, partM.get(club7.get(k)!)!.pid, fZ.gid.get(`Zona ${zonaDe(k)}`));

    for (const [n, h, z, f, l, v] of ZP) {
        await partido(TM, { nro: n, dia: VIE, hora: h, fase: fZ.id, grupo: fZ.gid.get(`Zona ${z}`), ronda: `Zona ${z} · Fecha ${f}`, home: club7.get(l), away: club7.get(v), entries: partM });
    }
    for (const [n, h, c, f, zl, zv] of CP) {
        const copa = COPAS.find((x) => x.k === c)!;
        await partido(TM, { nro: n, dia: SAB, hora: h, fase: fC.id, grupo: fC.gid.get(copa.nombre), ronda: `${copa.nombre} · Fecha ${f}`, entries: partM, hl: `${copa.puesto}º Zona ${zl}`, al: `${copa.puesto}º Zona ${zv}` });
    }
    for (const [n, h, c] of FINALES) {
        const copa = COPAS.find((x) => x.k === c)!;
        await partido(TM, { nro: n, dia: SAB, hora: h, fase: fF.id, ronda: `Final ${copa.nombre}`, entries: partM, hl: `1º ${copa.nombre}`, al: `2º ${copa.nombre}` });
    }

    // ── FEMENINO ─────────────────────────────────────────────────────────────
    const TF = await torneo({ slug: 'seven-de-la-pava-2026-femenino', nombre: 'Seven de la Pava (Femenino)', genero: 'femenino' });
    const fT = await fase(TF, 'Triangular', 'group_stage', 1, true, ['Triangular'], ['#dc2626'], { teamsCount: 3 });
    const fFF = await fase(TF, 'Final', 'playoff', 2, false, [], [], {
        teamsCount: 2, phaseMode: 'playoff', bracketMode: 'manual',
        playoffStages: [{ id: 'playoff_stage_1', name: 'Final', matchCount: 1, orderIndex: 1 }],
    });
    const partF = await participantes(TF, ['F1', 'F2', 'F3'], () => fT.gid.get('Triangular') ?? null);
    for (const k of ['F1', 'F2', 'F3']) await asignar(TF, fT.id, partF.get(club7.get(k)!)!.pid, fT.gid.get('Triangular'));
    for (const [n, h, f, l, v] of FP) {
        await partido(TF, { nro: n, dia: SAB, hora: h, fase: fT.id, grupo: fT.gid.get('Triangular'), ronda: `Fecha ${f}`, home: club7.get(l), away: club7.get(v), entries: partF });
    }
    await partido(TF, { nro: FINAL_FEM[0], dia: SAB, hora: FINAL_FEM[1], fase: fFF.id, ronda: 'Final', entries: partF, hl: '1º Triangular', al: '2º Triangular' });
    console.log('partidos:', JSON.stringify(cuenta));

    if (PUBLICAR) {
        for (const t of [TM, TF]) {
            const { error } = await sb.from('tournaments').update({ status: 'published', is_active: true }).eq('id', t.id);
            if (error) throw new Error(`Publicar: ${error.message}`);
        }
        console.log('publicados');
    } else console.log('Quedan en draft. Repetí con --publicar.');
    console.log('masculino', TM.id, TM.season, '· femenino', TF.id, TF.season);
}

main().catch((e) => { console.error(e); process.exit(1); });
