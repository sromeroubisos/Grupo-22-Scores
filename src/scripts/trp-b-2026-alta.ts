/**
 * Torneo Regional Pampeano B 2026 (URMDP, 8 clubes): alta del torneo, sus tres
 * fases, los participantes, el fixture y los resultados jugados.
 *
 *   npx tsx src/scripts/trp-b-2026-alta.ts                 # dry-run
 *   npx tsx src/scripts/trp-b-2026-alta.ts --apply
 *   npx tsx src/scripts/trp-b-2026-alta.ts --apply --publicar
 *
 * Formato (fuente: unionrugbymdp.org, fixtures del 05/06/2026):
 *   · Primera etapa: 8 equipos, todos contra todos, 7 fechas.
 *   · Zona Campeonato (los 4 primeros) y Zona Permanencia (los 4 restantes):
 *     3 fechas, arrastran los puntos de la primera etapa.
 *   · Los dos primeros de Campeonato juegan la Reubicación A/B contra el 7º y
 *     el 8º del Pampeano A (24/10, 31/10 y 14/11) — no se carga acá.
 *
 * Datos de los partidos: `resultados/trp-b-2026.json`.
 *   `homeScore`/`awayScore` null = todavía no se jugó.
 *   `ofensivo: 'home' | 'away'` = bonus ofensivo declarado. La fuente da el
 *   marcador, no los tries, así que el partido con ofensivo queda con los
 *   puntos a mano (`points_autocalculated: false`), igual que el TRP A.
 *
 * Reglas (las mismas del TRP A): 4 / 2 / 0, bonus ofensivo por diferencia de
 * tries, bonus defensivo perdiendo por 7 o menos.
 *
 * Alta en el orden que piden las FK circulares (ver memoria
 * alta_de_torneo_orden_de_fks): torneo con current_season_id null → temporada
 * → UPDATE → fases → participante (entry null) → entrada → UPDATE → asignación
 * de fase. Retomable: si el slug existe y lo creó este script, sigue.
 *
 * Nace en `draft`. `--publicar` lo pasa a published/activo.
 */
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const PUBLICAR = process.argv.includes('--publicar');

const TORNEO_MODELO = '594fcb55-b052-4a8f-bf24-5a288e35e4f5'; // TRP A
const FASE_MODELO = '89ed14f4-9c2f-4faa-ae54-61f9892e44a1'; // su Regular Season
const NOMBRE = 'Torneo Regional Pampeano B';
const SLUG = 'torneo-regional-pampeano-b-2026';
const ORIGEN = 'trp-b-2026-alta';
const MARGEN_DEFENSIVO = 7;
const RAZON = 'Resultado del TRP B publicado por la prensa de la región. El bonus ofensivo va declarado: la fuente da el marcador, no los tries.';

/** Los ocho clubes, por el id que ya tiene cada uno en G22. */
const CLUBES = [
    'club-los-50',
    'bigua-rugby-club',
    'union-del-sur',
    'pueyrredon',
    'uncas-r-c',
    'los-miuras',
    'universitario-de-bahia-blanca',
    'estudiantes-de-olavarria',
] as const;
const NOMBRE_CORTO: Record<string, string> = {
    'club-los-50': 'Los 50',
    'bigua-rugby-club': 'Biguá',
    'union-del-sur': 'Unión del Sur',
    pueyrredon: 'Pueyrredón',
    'uncas-r-c': 'UNCAS',
    'los-miuras': 'Los Miuras',
    'universitario-de-bahia-blanca': 'Universitario BB',
    'estudiantes-de-olavarria': 'Estudiantes (OLAV)',
};

type Etapa = 'E1' | 'CAMPEONATO' | 'PERMANENCIA';
interface PartidoJson {
    etapa: Etapa;
    fecha: string; // yyyy-mm-dd, la real
    hora?: string; // HH:MM hora argentina
    home: string;
    away: string;
    homeScore: number | null;
    awayScore: number | null;
    ofensivo?: 'home' | 'away' | null;
    fuente?: string;
}

const FASES: Array<{ etapa: Etapa; nombre: string; orden: number; activa: boolean; equipos: number }> = [
    { etapa: 'E1', nombre: 'Primera etapa', orden: 1, activa: true, equipos: 8 },
    { etapa: 'CAMPEONATO', nombre: 'Zona Campeonato', orden: 2, activa: false, equipos: 4 },
    { etapa: 'PERMANENCIA', nombre: 'Zona Permanencia', orden: 3, activa: false, equipos: 4 },
];

function puntos(p: PartidoJson) {
    const h = p.homeScore as number;
    const a = p.awayScore as number;
    const gana = h > a ? 'home' : h < a ? 'away' : null;
    const base = (l: 'home' | 'away') => (gana === null ? 2 : gana === l ? 4 : 0);
    const dif = Math.abs(h - a);
    const bonus = (l: 'home' | 'away') =>
        (p.ofensivo === l ? 1 : 0) + (gana !== null && gana !== l && dif <= MARGEN_DEFENSIVO ? 1 : 0);
    return {
        home_base_points: base('home'),
        away_base_points: base('away'),
        home_bonus_points: bonus('home'),
        away_bonus_points: bonus('away'),
    };
}

async function main() {
    const archivo = path.join(process.cwd(), 'src/scripts/resultados/trp-b-2026.json');
    const partidos: PartidoJson[] = JSON.parse(fs.readFileSync(archivo, 'utf8'));

    // ── validación del archivo, antes de tocar nada ──────────────────────────
    const validos = new Set<string>(CLUBES);
    for (const p of partidos) {
        if (!validos.has(p.home) || !validos.has(p.away)) throw new Error(`Club desconocido en ${JSON.stringify(p)}`);
        if (p.home === p.away) throw new Error(`Un club contra sí mismo: ${JSON.stringify(p)}`);
        if ((p.homeScore === null) !== (p.awayScore === null)) throw new Error(`Marcador a medias: ${JSON.stringify(p)}`);
    }
    const porEtapa = (e: Etapa) => partidos.filter((p) => p.etapa === e);
    const cruces = new Set<string>();
    for (const p of partidos) {
        const k = `${p.etapa}|${[p.home, p.away].sort().join('|')}`;
        if (cruces.has(k)) throw new Error(`Cruce repetido en la etapa: ${k}`);
        cruces.add(k);
    }
    console.log(
        `Archivo: E1 ${porEtapa('E1').length}/28 · Campeonato ${porEtapa('CAMPEONATO').length}/6 · Permanencia ${porEtapa('PERMANENCIA').length}/6`,
        `· jugados ${partidos.filter((p) => p.homeScore !== null).length}/${partidos.length}`,
    );

    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    // ── los clubes tienen que existir ────────────────────────────────────────
    const { data: clubesDb } = await supabase.from('clubs').select('id, name').in('id', [...CLUBES]);
    const faltan = CLUBES.filter((id) => !(clubesDb ?? []).some((c) => c.id === id));
    if (faltan.length) throw new Error(`No existen en clubs: ${faltan.join(', ')}`);

    // ── el modelo ────────────────────────────────────────────────────────────
    const { data: modelos } = await supabase.from('tournaments').select('*').eq('id', TORNEO_MODELO).limit(1);
    const modelo = modelos?.[0];
    if (!modelo) throw new Error('No encuentro el TRP A (modelo).');
    const { data: fasesModelo } = await supabase.from('tournament_phases').select('settings').eq('id', FASE_MODELO).limit(1);
    const settingsModelo = fasesModelo?.[0]?.settings;
    if (!settingsModelo) throw new Error('No encuentro la fase modelo.');

    // ── ¿ya existe? ──────────────────────────────────────────────────────────
    const { data: ya } = await supabase.from('tournaments').select('id').eq('slug', SLUG).limit(1);
    let torneoId: string | null = ya?.[0]?.id ?? null;
    let seasonId: string | null = null;
    if (torneoId) {
        const { data: s } = await supabase.from('tournament_seasons').select('id, settings').eq('tournament_id', torneoId).limit(1);
        if ((s?.[0]?.settings as { source?: string } | null)?.source !== ORIGEN) {
            throw new Error(`Ya hay un torneo con el slug ${SLUG} que no creó este script.`);
        }
        seasonId = s![0].id;
        console.log(`Retomando ${torneoId}`);
    }

    console.log(`\nTorneo: "${NOMBRE}" (${SLUG}) · ${CLUBES.length} clubes · fases: ${FASES.map((f) => f.nombre).join(' · ')}`);
    for (const id of CLUBES) console.log(`  · ${NOMBRE_CORTO[id].padEnd(20)} ${id}`);
    if (!APPLY) {
        console.log('\nDry-run: no se escribió nada. Repetí con --apply.');
        return;
    }

    // ── torneo, temporada ────────────────────────────────────────────────────
    if (!torneoId) {
        torneoId = randomUUID();
        seasonId = randomUUID();
        const { error: e1 } = await supabase.from('tournaments').insert([{
            id: torneoId, union_id: modelo.union_id, season_id: '2026',
            name: NOMBRE, original_name: NOMBRE, slug: SLUG,
            status: 'draft', is_active: false, is_visible: true,
            category: modelo.category, age_grade: modelo.age_grade,
            country: modelo.country, country_id: modelo.country_id, country_name: modelo.country_name,
            sport: modelo.sport, sport_id: modelo.sport_id, sport_name: modelo.sport_name,
            format: 'league', ruleset: modelo.ruleset, ruleset_version: modelo.ruleset_version,
            review_status: 'approved', current_season_id: null,
        }]);
        if (e1) throw new Error(`Alta del torneo: ${e1.message}`);
        const { error: e2 } = await supabase.from('tournament_seasons').insert([{
            id: seasonId, tournament_id: torneoId, legacy_tournament_id: torneoId,
            season_code: '2026', name: `${NOMBRE} 2026`, display_name: `${NOMBRE} 2026`,
            status: 'active', is_active: true, format: 'league', ruleset: modelo.ruleset,
            start_date: '2026-06-06', end_date: null,
            settings: { source: ORIGEN, nota: 'Primera etapa + Zonas Campeonato y Permanencia' },
        }]);
        if (e2) throw new Error(`Alta de la temporada: ${e2.message}`);
        const { error: e3 } = await supabase.from('tournaments').update({ current_season_id: seasonId }).eq('id', torneoId);
        if (e3) throw new Error(`current_season_id: ${e3.message}`);
        console.log('+ torneo y temporada');
    }

    // ── fases ────────────────────────────────────────────────────────────────
    const { data: fasesYa } = await supabase.from('tournament_phases').select('id, name').eq('tournament_id', torneoId);
    const faseId = new Map<Etapa, string>();
    for (const f of FASES) {
        const existente = (fasesYa ?? []).find((x) => x.name === f.nombre);
        if (existente) { faseId.set(f.etapa, existente.id); continue; }
        const settings = JSON.parse(JSON.stringify(settingsModelo));
        settings.teamsCount = f.equipos;
        settings.groupLabels = [];
        settings.groupTags = [];
        settings.advanceCount = f.etapa === 'E1' ? 4 : 0;
        settings.legs = 1;
        if (f.etapa !== 'E1') {
            // Las dos zonas arrastran la tabla completa de la primera etapa.
            settings.carryOver = {
                ...(settings.carryOver ?? {}),
                enabled: true,
                mode: 'table_totals',
                source: 'previous_phase',
                sourcePhaseId: faseId.get('E1'),
            };
            settings.carryOverPreviousPhase = true;
            // Con los puntos arrastrados hay empates (Unión del Sur y Biguá
            // terminaron con 37): desempata el mano a mano, antes que la diferencia.
            settings.tiebreakers = [
                { order: 1, metric: 'points_table', enabled: true, priority: 1 },
                { order: 2, metric: 'head_to_head', enabled: true, priority: 2 },
                { order: 3, metric: 'points_diff', enabled: true, priority: 3 },
                { order: 4, metric: 'pointsFor', enabled: true, priority: 4 },
            ];
        }
        const id = randomUUID();
        const { error } = await supabase.from('tournament_phases').insert([{
            id, tournament_id: torneoId, season_id: seasonId, name: f.nombre,
            phase_type: 'league', order_index: f.orden, is_active: f.activa, settings,
        }]);
        if (error) throw new Error(`Fase ${f.nombre}: ${error.message}`);
        faseId.set(f.etapa, id);
        console.log(`+ fase ${f.nombre}`);
    }

    // ── participantes: las TRES tablas ───────────────────────────────────────
    const { data: yaPart } = await supabase.from('tournament_participants').select('id, club_id').eq('tournament_id', torneoId);
    const partId = new Map<string, string>((yaPart ?? []).map((p) => [p.club_id as string, p.id as string]));
    for (const club of CLUBES) {
        if (partId.has(club)) continue;
        const participantId = randomUUID();
        const entryId = randomUUID();
        const nombre = NOMBRE_CORTO[club];
        const { error: e1 } = await supabase.from('tournament_participants').insert([{
            id: participantId, tournament_id: torneoId, season_id: seasonId, club_id: club,
            name: nombre, short_code: nombre, type: 'club', status: 'active', season_entry_id: null,
        }]);
        if (e1) throw new Error(`Participante ${club}: ${e1.message}`);
        const { error: e2 } = await supabase.from('team_season_entries').insert([{
            id: entryId, season_id: seasonId, tournament_id: torneoId, club_id: club, team_id: null,
            source_participant_id: participantId, status: 'active',
            settings: { source: ORIGEN, participant_type: 'club' },
        }]);
        if (e2) throw new Error(`Entrada ${club}: ${e2.message}`);
        const { error: e3 } = await supabase.from('tournament_participants')
            .update({ season_entry_id: entryId }).eq('id', participantId);
        if (e3) throw new Error(`Enganche ${club}: ${e3.message}`);
        partId.set(club, participantId);
    }
    console.log(`participantes: ${partId.size}`);

    // ── asignación a fase: solo donde de verdad juega ────────────────────────
    const { data: yaAsig } = await supabase.from('tournament_phase_participants').select('phase_id, participant_id').eq('tournament_id', torneoId);
    const asignados = new Set((yaAsig ?? []).map((a) => `${a.phase_id}|${a.participant_id}`));
    for (const f of FASES) {
        const clubes = f.etapa === 'E1'
            ? [...CLUBES]
            : [...new Set(porEtapa(f.etapa).flatMap((p) => [p.home, p.away]))];
        for (const club of clubes) {
            const key = `${faseId.get(f.etapa)}|${partId.get(club)}`;
            if (asignados.has(key)) continue;
            const { error } = await supabase.from('tournament_phase_participants').insert([{
                tournament_id: torneoId, season_id: seasonId, phase_id: faseId.get(f.etapa),
                participant_id: partId.get(club), status: 'active',
            }]);
            if (error) throw new Error(`Asignación ${club} → ${f.nombre}: ${error.message}`);
        }
    }

    // ── partidos ─────────────────────────────────────────────────────────────
    const { data: yaMatches } = await supabase.from('matches')
        .select('id, phase_id, home_club_id, away_club_id').eq('tournament_id', torneoId);
    const existe = new Map((yaMatches ?? []).map((m) => [`${m.phase_id}|${m.home_club_id}|${m.away_club_id}`, m.id as string]));
    let nuevos = 0, actualizados = 0;
    for (const p of partidos) {
        const fase = faseId.get(p.etapa)!;
        const jugado = p.homeScore !== null;
        const hora = p.hora ?? '15:30';
        const dateTime = new Date(`${p.fecha}T${hora}:00-03:00`).toISOString();
        const base = {
            tournament_id: torneoId, season_id: seasonId, phase_id: fase,
            home_club_id: p.home, away_club_id: p.away, date_time: dateTime,
            is_visible: true, review_status: 'approved',
        };
        const resultado = jugado
            ? {
                status: 'final',
                score: { home: p.homeScore, away: p.awayScore },
                ...puntos(p),
                points_autocalculated: !p.ofensivo,
                points_override_reason: p.ofensivo ? RAZON : null,
            }
            : { status: 'scheduled', score: null };
        const id = existe.get(`${fase}|${p.home}|${p.away}`);
        if (id) {
            const { error } = await supabase.from('matches').update({ date_time: dateTime, ...resultado }).eq('id', id);
            if (error) throw new Error(`Update ${p.home}-${p.away}: ${error.message}`);
            actualizados += 1;
        } else {
            const { error } = await supabase.from('matches').insert([{ id: randomUUID(), ...base, ...resultado }]);
            if (error) throw new Error(`Insert ${p.home}-${p.away}: ${error.message}`);
            nuevos += 1;
        }
    }
    console.log(`partidos: ${nuevos} nuevos · ${actualizados} actualizados`);

    // ── tablas ───────────────────────────────────────────────────────────────
    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    for (const f of FASES) {
        const r = await recalculatePhaseStandingsScopes(torneoId, faseId.get(f.etapa)!, 'general', seasonId);
        console.log('tabla', f.nombre, JSON.stringify(r)?.slice(0, 160));
    }

    if (PUBLICAR) {
        const { error: a } = await supabase.from('tournaments').update({ status: 'published', is_active: true }).eq('id', torneoId);
        if (a) throw new Error(`Publicar: ${a.message}`);
        console.log('torneo publicado');
    } else {
        console.log('El torneo queda en draft. Repetí con --publicar cuando lo hayas revisado.');
    }
    console.log('torneoId', torneoId, 'seasonId', seasonId);
}

main().catch((e) => { console.error(e); process.exit(1); });
