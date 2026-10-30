/**
 * Alta genérica de un torneo de liga (rugby) desde un spec JSON: torneo, temporada,
 * fases, participantes (las TRES tablas), partidos y tabla. Generaliza
 * trp-b-2026-alta.ts; copia el torneo modelo (TRP A) para ruleset, país y deporte.
 *
 *   npx tsx src/scripts/torneo-liga-alta.ts <spec.json>            # dry-run
 *   npx tsx src/scripts/torneo-liga-alta.ts <spec.json> --apply
 *   npx tsx src/scripts/torneo-liga-alta.ts <spec.json> --apply --publicar
 *
 * Spec: { nombre, slug, origen, fechaInicio, fases:[{nombre, orden}],
 *         clubes:[{id, corto}], partidos:[{fase, fecha, hora, home, away,
 *         homeScore|null, awayScore|null, cerrado}] }
 * Los puntos de tabla quedan autocalculados: el motor aplica 4/2/0 y los bonus con
 * los tries de los eventos que se cargan después con ficha-partido-local.ts.
 * Retomable: si el slug existe y lo creó este script, sigue.
 */
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const PUBLICAR = process.argv.includes('--publicar');
const TORNEO_MODELO = '594fcb55-b052-4a8f-bf24-5a288e35e4f5'; // TRP A
const FASE_MODELO = '89ed14f4-9c2f-4faa-ae54-61f9892e44a1';

interface Spec {
    nombre: string; slug: string; origen: string; fechaInicio: string;
    /** Opcionales: sin ellos el torneo hereda del modelo (TRP A). */
    unionId?: string; gender?: string; category?: string; ageGrade?: string;
    /** `clubes` por fase: si falta, entran todos los del spec. */
    fases: Array<{ nombre: string; orden: number; clubes?: string[] }>;
    clubes: Array<{ id: string; corto: string }>;
    partidos: Array<{ fase: string; fecha: string; hora: string; home: string; away: string; homeScore: number | null; awayScore: number | null; cerrado: boolean }>;
}

async function main() {
    const specPath = process.argv[2];
    if (!specPath) throw new Error('uso: torneo-liga-alta.ts <spec.json> [--apply] [--publicar]');
    const spec: Spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    const ids = new Set(spec.clubes.map((c) => c.id));
    for (const p of spec.partidos) {
        if (!ids.has(p.home) || !ids.has(p.away)) throw new Error(`Club fuera del spec: ${JSON.stringify(p)}`);
        if (!spec.fases.some((f) => f.nombre === p.fase)) throw new Error(`Fase desconocida: ${p.fase}`);
    }
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();
    const { data: clubesDb } = await supabase.from('clubs').select('id').in('id', [...ids]);
    const faltan = [...ids].filter((id) => !(clubesDb ?? []).some((c) => c.id === id));
    if (faltan.length) throw new Error(`No existen en clubs: ${faltan.join(', ')}`);
    const { data: modelos } = await supabase.from('tournaments').select('*').eq('id', TORNEO_MODELO).limit(1);
    const modelo = modelos?.[0];
    const { data: fm } = await supabase.from('tournament_phases').select('settings').eq('id', FASE_MODELO).limit(1);
    const settingsModelo = fm?.[0]?.settings;
    if (!modelo || !settingsModelo) throw new Error('No encuentro el modelo (TRP A).');

    const { data: ya } = await supabase.from('tournaments').select('id').eq('slug', spec.slug).limit(1);
    let torneoId: string | null = ya?.[0]?.id ?? null;
    let seasonId: string | null = null;
    if (torneoId) {
        const { data: s } = await supabase.from('tournament_seasons').select('id, settings').eq('tournament_id', torneoId).limit(1);
        if ((s?.[0]?.settings as { source?: string } | null)?.source !== spec.origen) throw new Error(`El slug ${spec.slug} ya existe y no lo creó este spec.`);
        seasonId = s![0].id;
    }
    console.log(`"${spec.nombre}" · ${spec.clubes.length} clubes · ${spec.partidos.length} partidos (${spec.partidos.filter((p) => p.cerrado).length} cerrados)`);
    if (!APPLY) { console.log('Dry-run: no se escribió nada.'); return; }

    if (!torneoId) {
        torneoId = randomUUID(); seasonId = randomUUID();
        const { error: e1 } = await supabase.from('tournaments').insert([{
            id: torneoId, union_id: spec.unionId ?? modelo.union_id, season_id: '2026', name: spec.nombre, original_name: spec.nombre, slug: spec.slug,
            status: 'draft', is_active: false, is_visible: true, category: spec.category ?? modelo.category, age_grade: spec.ageGrade ?? modelo.age_grade, ...(spec.gender ? { gender: spec.gender } : {}),
            country: modelo.country, country_id: modelo.country_id, country_name: modelo.country_name,
            sport: modelo.sport, sport_id: modelo.sport_id, sport_name: modelo.sport_name,
            format: 'league', ruleset: modelo.ruleset, ruleset_version: modelo.ruleset_version, review_status: 'approved', current_season_id: null,
        }]);
        if (e1) throw new Error(`Alta del torneo: ${e1.message}`);
        const { error: e2 } = await supabase.from('tournament_seasons').insert([{
            id: seasonId, tournament_id: torneoId, legacy_tournament_id: torneoId, season_code: '2026', name: `${spec.nombre} 2026`,
            display_name: `${spec.nombre} 2026`, status: 'active', is_active: true, format: 'league', ruleset: modelo.ruleset,
            start_date: spec.fechaInicio, end_date: null, settings: { source: spec.origen },
        }]);
        if (e2) throw new Error(`Alta de la temporada: ${e2.message}`);
        const { error: e3 } = await supabase.from('tournaments').update({ current_season_id: seasonId }).eq('id', torneoId);
        if (e3) throw new Error(`current_season_id: ${e3.message}`);
        console.log('+ torneo y temporada');
    }

    const { data: fasesYa } = await supabase.from('tournament_phases').select('id, name').eq('tournament_id', torneoId);
    const faseId = new Map<string, string>();
    for (const f of spec.fases) {
        const ex = (fasesYa ?? []).find((x) => x.name === f.nombre);
        if (ex) { faseId.set(f.nombre, ex.id); continue; }
        const settings = JSON.parse(JSON.stringify(settingsModelo));
        settings.teamsCount = (f.clubes ?? spec.clubes.map((c) => c.id)).length; settings.groupLabels = []; settings.groupTags = []; settings.advanceCount = 0; settings.legs = 1;
        const id = randomUUID();
        const { error } = await supabase.from('tournament_phases').insert([{
            id, tournament_id: torneoId, season_id: seasonId, name: f.nombre, phase_type: 'league', order_index: f.orden, is_active: f.orden === Math.min(...spec.fases.map((x) => x.orden)), settings,
        }]);
        if (error) throw new Error(`Fase ${f.nombre}: ${error.message}`);
        faseId.set(f.nombre, id);
    }

    const { data: yaPart } = await supabase.from('tournament_participants').select('id, club_id').eq('tournament_id', torneoId);
    const partId = new Map<string, string>((yaPart ?? []).map((p) => [p.club_id as string, p.id as string]));
    for (const c of spec.clubes) {
        if (partId.has(c.id)) continue;
        const participantId = randomUUID(); const entryId = randomUUID();
        const { error: e1 } = await supabase.from('tournament_participants').insert([{
            id: participantId, tournament_id: torneoId, season_id: seasonId, club_id: c.id, name: c.corto, short_code: c.corto,
            type: 'club', status: 'active', season_entry_id: null,
        }]);
        if (e1) throw new Error(`Participante ${c.id}: ${e1.message}`);
        const { error: e2 } = await supabase.from('team_season_entries').insert([{
            id: entryId, season_id: seasonId, tournament_id: torneoId, club_id: c.id, team_id: null,
            source_participant_id: participantId, status: 'active', settings: { source: spec.origen, participant_type: 'club' },
        }]);
        if (e2) throw new Error(`Entrada ${c.id}: ${e2.message}`);
        const { error: e3 } = await supabase.from('tournament_participants').update({ season_entry_id: entryId }).eq('id', participantId);
        if (e3) throw new Error(`Enganche ${c.id}: ${e3.message}`);
        partId.set(c.id, participantId);
    }
    const { data: yaAsig } = await supabase.from('tournament_phase_participants').select('phase_id, participant_id').eq('tournament_id', torneoId);
    const asignados = new Set((yaAsig ?? []).map((a) => `${a.phase_id}|${a.participant_id}`));
    for (const f of spec.fases) {
        for (const c of spec.clubes.filter((x) => !f.clubes || f.clubes.includes(x.id))) {
            if (asignados.has(`${faseId.get(f.nombre)}|${partId.get(c.id)}`)) continue;
            const { error } = await supabase.from('tournament_phase_participants').insert([{
                tournament_id: torneoId, season_id: seasonId, phase_id: faseId.get(f.nombre), participant_id: partId.get(c.id), status: 'active',
            }]);
            if (error) throw new Error(`Asignación ${c.id}: ${error.message}`);
        }
    }

    const { data: yaM } = await supabase.from('matches').select('id, phase_id, home_club_id, away_club_id').eq('tournament_id', torneoId);
    const existe = new Map((yaM ?? []).map((m) => [`${m.phase_id}|${m.home_club_id}|${m.away_club_id}`, m.id as string]));
    let nuevos = 0, act = 0;
    for (const p of spec.partidos) {
        const fase = faseId.get(p.fase)!;
        const dateTime = new Date(`${p.fecha}T${p.hora}:00-03:00`).toISOString();
        const jugado = p.cerrado && p.homeScore !== null && p.awayScore !== null;
        const h = p.homeScore ?? 0, a = p.awayScore ?? 0;
        const gana = h > a ? 'home' : h < a ? 'away' : null;
        const resultado = jugado
            ? {
                status: 'final', score: { home: h, away: a },
                home_base_points: gana === null ? 2 : gana === 'home' ? 4 : 0, away_base_points: gana === null ? 2 : gana === 'away' ? 4 : 0,
                home_bonus_points: gana === 'away' && a - h <= 7 ? 1 : 0, away_bonus_points: gana === 'home' && h - a <= 7 ? 1 : 0,
                points_autocalculated: true, points_override_reason: null,
            }
            : { status: 'scheduled', score: null };
        const id = existe.get(`${fase}|${p.home}|${p.away}`);
        if (id) {
            const { error } = await supabase.from('matches').update({ date_time: dateTime, ...resultado }).eq('id', id);
            if (error) throw new Error(`Update ${p.home}-${p.away}: ${error.message}`);
            act += 1;
        } else {
            const { error } = await supabase.from('matches').insert([{
                id: randomUUID(), tournament_id: torneoId, season_id: seasonId, phase_id: fase, home_club_id: p.home, away_club_id: p.away,
                date_time: dateTime, is_visible: true, review_status: 'approved', ...resultado,
            }]);
            if (error) throw new Error(`Insert ${p.home}-${p.away}: ${error.message}`);
            nuevos += 1;
        }
    }
    console.log(`partidos: ${nuevos} nuevos · ${act} actualizados`);
    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    for (const f of spec.fases) {
        const r = await recalculatePhaseStandingsScopes(torneoId, faseId.get(f.nombre)!, 'general', seasonId);
        console.log('tabla', f.nombre, JSON.stringify(r)?.slice(0, 120));
    }
    if (PUBLICAR) {
        const { error } = await supabase.from('tournaments').update({ status: 'published', is_active: true }).eq('id', torneoId);
        if (error) throw new Error(`Publicar: ${error.message}`);
        console.log('torneo publicado');
    }
    console.log('torneoId', torneoId, 'seasonId', seasonId);
}

main().catch((e) => { console.error(e); process.exit(1); });
