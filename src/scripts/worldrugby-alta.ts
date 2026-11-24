/**
 * Alta del circuito SVNS (SVNS 2 y SVNS 3) en la base, desde la API de World Rugby.
 *
 *   npx tsx src/scripts/worldrugby-alta.ts --plan                    qué haría, sin escribir
 *   npx tsx src/scripts/worldrugby-alta.ts --execute                 todo
 *   npx tsx src/scripts/worldrugby-alta.ts --execute --circuito=svns2-2027-m
 *   npx tsx src/scripts/worldrugby-alta.ts --execute --sin-eventos   sin bajar la cronología
 *
 * Crea los torneos de circuito que faltan (con una fase de liga por etapa, el molde del
 * SVNS 2 cargado a mano) y REVINCULA los que ya existían: les pone el `external_id` y a cada
 * fase la etapa de World Rugby que le toca. Después corre el mismo sincronizador que el cron
 * (clubes, participantes, partidos, cronología, tabla) etapa por etapa.
 *
 * Idempotente: lo que ya está se saltea. Deja `WORLDRUGBY_ALTA_ROLLBACK_<fecha>.sql`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

import {
    CIRCUITOS_SVNS,
    circuitoPorClave,
    temporadaLabel,
    type CircuitoSvns,
} from '../lib/integrations/worldrugby/svns.ts';
import { fijarFaseActiva, sincronizarEtapa, type ResumenEtapa } from '../lib/integrations/worldrugby/svnsSync.ts';

const REPO = process.cwd();
const ORIGEN = 'worldrugby-alta';
const PUNTOS_POR_PUESTO = [20, 18, 16, 14, 12, 10];

const modo = process.argv.includes('--execute') ? 'execute' : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) {
    console.error('usá --plan o --execute (opcional --circuito=<clave> y --sin-eventos)');
    process.exit(2);
}
const filtro = process.argv.find((a) => a.startsWith('--circuito='))?.slice('--circuito='.length) ?? null;
if (filtro && !circuitoPorClave(filtro)) {
    console.error(`circuito desconocido: ${filtro}. Hay: ${CIRCUITOS_SVNS.map((c) => c.clave).join(', ')}`);
    process.exit(2);
}
const conEventos = !process.argv.includes('--sin-eventos');

for (const l of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
    console.error('Faltan credenciales en .env.local');
    process.exit(1);
}
const sb = createClient(URL_BASE, KEY, { auth: { persistSession: false } });
const ahora = new Date();
const ahoraIso = ahora.toISOString();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fila = Record<string, any>;

async function leerUno(tabla: string, columnas: string, col: string, valor: string): Promise<Fila | null> {
    const { data, error } = await sb.from(tabla).select(columnas).eq(col, valor).maybeSingle();
    if (error) throw new Error(`${tabla}: ${error.message}`);
    return data as Fila | null;
}

/** El SVNS 2 masculino cargado a mano: de acá salen la unión, el escudo, el ruleset y los ajustes de fase. */
async function leerMolde() {
    const t = await leerUno('tournaments', '*', 'slug', 'svns-2-masculino');
    if (!t) throw new Error('no está el torneo molde svns-2-masculino');
    const { data: fases, error } = await sb.from('tournament_phases').select('*').eq('tournament_id', t.id).order('order_index');
    if (error) throw new Error(error.message);
    return { torneo: t, fase: (fases as Fila[])[0] };
}

function rulesetDe(molde: Fila, c: CircuitoSvns): Fila {
    const etapas = c.etapas.map((e, i) => ({
        id: `phase_${i + 1}`, name: e.nombre, order: i + 1, format: 'league',
        circuit_points: PUNTOS_POR_PUESTO.map((points, p) => ({ points, position: p + 1 })), ranking_source: 'phase_standings',
    }));
    const base = molde.ruleset as Fila;
    const faseBase = (base.phases as Fila[])[0];
    return {
        ...base,
        phases: etapas.map((e) => ({ ...faseBase, id: e.id, name: e.name, circuitPoints: e.circuit_points })),
        stages: etapas,
        circuit: { ...base.circuit, stages: etapas, stageCount: etapas.length },
    };
}

/**
 * Reglas oficiales del SVNS (medidas contra la tabla de World Rugby de São Paulo 2026): 3 por
 * triunfo, 2 por empate, 0 por derrota, +1 de bonus defensivo por perder por 7 o menos, sin
 * bonus ofensivo, y desempate por el enfrentamiento directo. El SVNS 2 cargado a mano tenía el
 * mismo bonus pero el empate en 1 y puntos de bonus escritos a mano en los partidos.
 */
const TIEBREAKERS = [
    { metric: 'points', label: 'Puntos obtenidos', priority: 1, enabled: true },
    { metric: 'head_to_head', label: 'Resultado entre sí', priority: 2, enabled: true },
    { metric: 'points_difference', label: 'Diferencia de tantos', priority: 3, enabled: true },
    { metric: 'won', label: 'Partidos ganados', priority: 4, enabled: true },
];
const PUNTOS_OFICIALES = { win: 3, draw: 2, loss: 0 };
const BONUS_DEFENSIVO = { label: 'Derrota por 7 o menos', margin: 7, points: 1 };
const REGLA_BONUS = { id: 'close_loss', label: 'Derrota por 7 o menos', points_awarded: 1 };

function conReglasOficiales(settings: Fila): Fila {
    return {
        ...settings,
        points: { ...PUNTOS_OFICIALES },
        // Sin `allowBonusPoints`: el motor lo lee como "bonus clásico de 4 tries" y el SVNS no lo tiene.
        pointsSystem: { ...PUNTOS_OFICIALES, allowBonusPoints: false, bonusTry: null, bonusLoss: null, conditionalRules: [{ ...REGLA_BONUS }] },
        bonus: { offensive: null, defensive: { ...BONUS_DEFENSIVO } },
        tiebreakers: TIEBREAKERS,
        standings: { ...(settings.standings ?? {}), mode: 'automatic', editable: true },
    };
}

function rulesetConReglas(ruleset: Fila): Fila {
    return {
        ...ruleset,
        points: { ...PUNTOS_OFICIALES },
        pointsSystem: { ...PUNTOS_OFICIALES, allowBonusPoints: false, bonusTry: null, bonusLoss: null },
        bonus: { offensive: null, defensive: { ...BONUS_DEFENSIVO } },
        standings: { points_base: { ...PUNTOS_OFICIALES }, bonus_rules: [{ ...REGLA_BONUS }] },
        tiebreakers: TIEBREAKERS,
    };
}

/** Deja un torneo ya vinculado con el reglamento oficial. Idempotente. */
async function aplicarReglas(torneoId: string): Promise<number> {
    const { data: t, error: errT } = await sb.from('tournaments').select('ruleset').eq('id', torneoId).single();
    if (errT) throw new Error(errT.message);
    const { error: errR } = await sb.from('tournaments').update({ ruleset: rulesetConReglas((t as Fila).ruleset ?? {}), updated_at: ahoraIso }).eq('id', torneoId);
    if (errR) throw new Error(errR.message);
    const { data: fases, error } = await sb.from('tournament_phases').select('id, settings').eq('tournament_id', torneoId);
    if (error) throw new Error(error.message);
    for (const f of (fases ?? []) as Fila[]) {
        const { error: errF } = await sb.from('tournament_phases').update({ settings: conReglasOficiales(f.settings ?? {}), updated_at: ahoraIso }).eq('id', f.id);
        if (errF) throw new Error(errF.message);
    }
    // Los puntos cargados a mano ya no valen: el motor los calcula con el reglamento oficial.
    const { data: filas, error: errM } = await sb.from('matches').update({
        points_autocalculated: true, home_base_points: 0, away_base_points: 0, home_bonus_points: 0, away_bonus_points: 0,
    }).eq('tournament_id', torneoId).like('external_id', 'worldrugby:%').select('id');
    if (errM) throw new Error(errM.message);
    return (filas ?? []).length;
}

interface Cambios { sql: string[] }

async function crearTorneo(molde: { torneo: Fila; fase: Fila }, c: CircuitoSvns, cambios: Cambios): Promise<string> {
    const torneoId = crypto.randomUUID();
    const seasonId = crypto.randomUUID();
    const ruleset = rulesetDe(molde.torneo, c);
    const generoDb = c.genero === 'm' ? 'masculino' : 'femenino';
    const desde = c.etapas[0].desde;
    const hasta = c.etapas[c.etapas.length - 1].hasta;

    const ins = async (tabla: string, filas: Fila | Fila[]) => {
        const { error } = await sb.from(tabla).insert(filas);
        if (error) throw new Error(`${tabla}: ${error.message}`);
    };
    try {
        await ins('tournaments', {
            id: torneoId, union_id: molde.torneo.union_id, season_id: c.temporada, name: c.nombre, display_name: c.nombre,
            original_name: c.nombre, slug: c.slug, status: 'published', category: null, age_grade: 'Mayores', gender: generoDb,
            region: 'Internacional', country: 'Internacional', country_id: 'international', country_name: 'Internacional',
            format: 'circuit', is_visible: true, is_active: true, logo_url: molde.torneo.logo_url,
            ruleset, ruleset_version: 1, sport_id: 'rugby', sport: 'rugby', sport_name: 'Rugby',
            priority: 99, sponsors: [], social_links: {}, display_order: 99, is_popular: false,
            is_api_managed: false, review_status: 'approved', data_source: null,
            external_id: c.externalId, current_season_id: null, created_at: ahoraIso, updated_at: ahoraIso,
        });
        await ins('tournament_seasons', {
            id: seasonId, tournament_id: torneoId, legacy_tournament_id: torneoId, season_code: c.temporada,
            name: c.nombre, display_name: c.nombre, slug: c.slug, status: 'active', is_active: true,
            start_date: desde, end_date: hasta, format: 'circuit', ruleset, settings: { source: ORIGEN },
            champion_club_id: null, created_at: ahoraIso, updated_at: ahoraIso,
        });
        const { error } = await sb.from('tournaments').update({ current_season_id: seasonId }).eq('id', torneoId);
        if (error) throw new Error(`tournaments (temporada): ${error.message}`);
        await ins('tournament_phases', c.etapas.map((e, i) => ({
            id: crypto.randomUUID(), tournament_id: torneoId, season_id: seasonId, order_index: i + 1, is_active: i === 0,
            name: e.nombre, phase_type: 'league',
            settings: {
                ...molde.fase.settings, teamsCount: 6, source: ORIGEN, worldrugby: { etapa: e.clave },
                circuit: { ...(molde.fase.settings.circuit ?? {}), pointsByPlacement: PUNTOS_POR_PUESTO.map((points, p) => ({ points, position: p + 1 })) },
            },
            created_at: ahoraIso, updated_at: ahoraIso,
        })));
    } catch (e) {
        await sb.from('tournament_phases').delete().eq('tournament_id', torneoId);
        await sb.from('tournaments').update({ current_season_id: null }).eq('id', torneoId);
        await sb.from('tournament_seasons').delete().eq('tournament_id', torneoId);
        await sb.from('tournaments').delete().eq('id', torneoId);
        throw e;
    }
    cambios.sql.push(
        `DELETE FROM public.match_events WHERE match_id IN (SELECT id FROM public.matches WHERE tournament_id = '${torneoId}');`,
        `DELETE FROM public.matches WHERE tournament_id = '${torneoId}';`,
        `DELETE FROM public.tournament_phase_participants WHERE tournament_id = '${torneoId}';`,
        `UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '${torneoId}';`,
        `DELETE FROM public.team_season_entries WHERE tournament_id = '${torneoId}';`,
        `DELETE FROM public.tournament_participants WHERE tournament_id = '${torneoId}';`,
        `DELETE FROM public.tournament_standings WHERE tournament_id = '${torneoId}';`,
        `DELETE FROM public.tournament_phases WHERE tournament_id = '${torneoId}';`,
        `UPDATE public.tournaments SET current_season_id = NULL WHERE id = '${torneoId}';`,
        `DELETE FROM public.tournament_seasons WHERE tournament_id = '${torneoId}';`,
        `DELETE FROM public.tournaments WHERE id = '${torneoId}';`,
    );
    console.log(`✓ torneo nuevo ${c.nombre}  /tournaments/${torneoId}`);
    return torneoId;
}

/** El torneo cargado a mano: se le pone el id externo y a cada fase su etapa. Lo demás no se toca. */
async function revincular(viejo: Fila, c: CircuitoSvns, cambios: Cambios) {
    const { data: fases, error } = await sb.from('tournament_phases').select('id, order_index, name, settings').eq('tournament_id', viejo.id).order('order_index');
    if (error) throw new Error(error.message);
    const lista = (fases ?? []) as Fila[];
    if (lista.length !== c.etapas.length) {
        throw new Error(`${c.clave}: el torneo ${viejo.slug} tiene ${lista.length} fases y World Rugby ${c.etapas.length} etapas`);
    }
    // Copia de lo que había cargado a mano: el sincronizador corrige marcadores con el dato oficial.
    const { data: previos, error: errP } = await sb.from('matches').select('*').eq('tournament_id', viejo.id).limit(1000);
    if (errP) throw new Error(errP.message);
    const copia = path.join(REPO, `WORLDRUGBY_ALTA_BACKUP_${viejo.slug}_${ahoraIso.slice(0, 10)}.json`);
    fs.writeFileSync(copia, JSON.stringify({ torneo: viejo, fases: lista, partidos: previos }, null, 1), 'utf8');
    console.log(`   copia de ${(previos ?? []).length} partidos: ${path.basename(copia)}`);
    cambios.sql.push(`-- los partidos previos de ${viejo.slug} están en ${path.basename(copia)}`);
    const q = (v: unknown) => (v === null || v === undefined ? 'NULL' : typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
    cambios.sql.push(
        `UPDATE public.tournaments SET external_id = ${q(viejo.external_id)}, status = ${q(viejo.status)}, is_active = ${q(viejo.is_active)}, is_visible = ${q(viejo.is_visible)}, display_name = ${q(viejo.display_name)} WHERE id = '${viejo.id}';`,
    );
    const { error: errT } = await sb.from('tournaments').update({
        external_id: c.externalId, status: 'published', is_active: true, is_visible: true,
        display_name: `${viejo.name} ${temporadaLabel(c.temporada)}`, updated_at: ahoraIso,
    }).eq('id', viejo.id);
    if (errT) throw new Error(errT.message);
    for (const [i, fase] of lista.entries()) {
        const settings = { ...(fase.settings ?? {}), worldrugby: { etapa: c.etapas[i].clave } };
        const { error: errF } = await sb.from('tournament_phases').update({ settings, updated_at: ahoraIso }).eq('id', fase.id);
        if (errF) throw new Error(errF.message);
        cambios.sql.push(`UPDATE public.tournament_phases SET settings = settings - 'worldrugby' WHERE id = '${fase.id}';`);
        console.log(`   fase "${fase.name}" ← ${c.etapas[i].clave}`);
    }
    console.log(`✓ torneo existente ${viejo.slug} revinculado a ${c.externalId} y publicado`);
}

async function main() {
    console.log(`modo: ${modo}${filtro ? ` · ${filtro}` : ''}${conEventos ? '' : ' · sin cronología'}\n`);
    const circuitos = filtro ? [circuitoPorClave(filtro) as CircuitoSvns] : [...CIRCUITOS_SVNS];
    const molde = await leerMolde();
    const cambios: Cambios = { sql: ['-- Rollback del alta del circuito SVNS (World Rugby).', 'BEGIN;'] };

    const buscar = async (c: CircuitoSvns, columnas: string) =>
        (await leerUno('tournaments', columnas, 'external_id', c.externalId))
        ?? (c.slugExistente ? await leerUno('tournaments', columnas, 'slug', c.slugExistente) : null)
        ?? (await leerUno('tournaments', columnas, 'slug', c.slug));

    const torneoIds = new Map<string, string>();
    for (const c of circuitos) {
        if (modo === 'execute') {
            const existente = await buscar(c, '*');
            if (!existente) torneoIds.set(c.clave, await crearTorneo(molde, c, cambios));
            else {
                if (existente.external_id !== c.externalId) await revincular(existente, c, cambios);
                else console.log(`= ${c.nombre} ya está dado de alta`);
                torneoIds.set(c.clave, existente.id);
            }
        } else {
            const e = await buscar(c, 'id, slug, external_id, status');
            const estado = e ? (e.external_id === c.externalId ? 'ya dado de alta' : `se revincula ${e.slug} (${e.status})`) : 'se crea';
            console.log(`${e ? (e.external_id === c.externalId ? '=' : '~') : '+'} ${c.nombre.padEnd(34)} ${c.etapas.length} etapa(s)  ${estado}`);
        }
    }
    console.log('');

    // Etapas: el mismo sincronizador que el cron. En --plan el torneo nuevo todavía no existe y la etapa lo avisa.
    const { recalculatePhaseStandingsScopes } = await import('../lib/server/recalculateStandings');
    const { getNationalTeamFlag } = await import('../lib/utils/teamLogoOverrides');
    const { wrCountryEs } = await import('../lib/services/worldRugbyEventParser.ts');
    const resumenes: ResumenEtapa[] = [];
    for (const c of circuitos) {
        for (const etapa of c.etapas) {
            const r = await sincronizarEtapa(sb, c, etapa, {
                enSeco: modo === 'plan', conEventos, ahora,
                logoDe: (pais) => getNationalTeamFlag(wrCountryEs(pais)) ?? getNationalTeamFlag(pais),
                recalcular: async (torneoId, faseId, seasonId) =>
                    (await recalculatePhaseStandingsScopes(torneoId, faseId, 'general', seasonId ?? undefined)).ok,
            });
            resumenes.push(r);
            console.log(`${r.ok ? '✓' : '✗'} ${etapa.clave.padEnd(32)} partidos ${String(r.partidos).padStart(2)} · crear ${r.crear} · actualizar ${r.actualizar} · sin cambios ${r.sinCambios}`
                + `${r.clubesNuevos.length ? ` · clubes nuevos ${r.clubesNuevos.join(',')}` : ''}${r.participantesNuevos ? ` · participantes nuevos ${r.participantesNuevos}` : ''}`
                + `${r.eventos ? ` · eventos ${r.eventos}` : ''}${r.huerfanos.length ? ` · HUÉRFANOS ${r.huerfanos.length}` : ''}`
                + `${r.equiposSinClub.length ? ` · SIN CLUB ${r.equiposSinClub.join(',')}` : ''}${r.error ? ` · ERROR ${r.error}` : ''}${r.errors.length ? ` · ${r.errors.join('; ')}` : ''}`);
            if (modo === 'plan') {
                for (const d of r.detalle.slice(0, 3)) console.log(`      ~ ${d.id}  ${d.cambios.join(', ')}`);
                if (r.detalle.length > 3) console.log(`      … y ${r.detalle.length - 3} más`);
            }
        }
    }

    if (modo === 'execute') {
        // Reglamento oficial y puntos de los partidos, y después la tabla de TODAS las fases.
        for (const c of circuitos) {
            const torneoId = torneoIds.get(c.clave);
            if (!torneoId) continue;
            const reseteados = await aplicarReglas(torneoId);
            const activa = await fijarFaseActiva(sb, c, torneoId, ahora);
            if (activa) console.log(`   fase activa de ${c.clave}: ${activa}`);
            const { data: fases, error } = await sb.from('tournament_phases').select('id, season_id, name').eq('tournament_id', torneoId).order('order_index');
            if (error) throw new Error(error.message);
            for (const fase of (fases ?? []) as Fila[]) {
                const r = await recalculatePhaseStandingsScopes(torneoId, fase.id, 'general', fase.season_id ?? undefined);
                console.log(`   tabla ${c.clave} · ${fase.name}: ${r.ok ? `${r.rows_calculated} filas` : 'FALLÓ'}`);
            }
            console.log(`✓ reglamento oficial en ${c.nombre} (${reseteados} partidos con puntos recalculados)`);
        }
        cambios.sql.push('COMMIT;', '');
        const archivo = path.join(REPO, `WORLDRUGBY_ALTA_ROLLBACK_${ahoraIso.slice(0, 10)}.sql`);
        fs.writeFileSync(archivo, cambios.sql.join('\n'), 'utf8');
        console.log(`\nrollback: ${archivo}`);
    } else {
        console.log('\nmodo --plan: no se escribió nada.');
    }
    const mal = resumenes.filter((r) => !r.ok);
    if (mal.length) {
        console.error(`\n${mal.length} etapa(s) con problemas`);
        process.exitCode = 1;
    }
}

main().catch((e) => {
    console.error('\nFALLÓ:', e instanceof Error ? e.message : e);
    process.exit(1);
});
