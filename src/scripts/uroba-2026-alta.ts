/**
 * UROBA 2026 (Unión de Rugby del Oeste de Buenos Aires, 10 clubes): alta del torneo,
 * sus cinco fases, los participantes, el fixture y los resultados.
 *
 *   npx tsx src/scripts/uroba-2026-alta.ts                 # dry-run
 *   npx tsx src/scripts/uroba-2026-alta.ts --apply
 *   npx tsx src/scripts/uroba-2026-alta.ts --apply --publicar
 *
 * Fuente: bd.uar.com.ar (Championships 54012 y 49135 / Reg. Nac. de Base de datos).
 *
 * Fases:
 *   · Tira completa  (49135 · fixture 11705): Remo, Los Miuras, Estudiantes de Olavarría
 *                    y Argentino de Trenque Lauquen, 6 fechas.
 *   · Zona única     (49135 · fixture 11706): Pico, Kamikazes/C. Italiano, Los Indios/Bolívar,
 *                    Onas, América/Mapuche y Villegas.
 *   · Semifinales, Final UROBA y Final Copa Ombú (54012 · fixture 13035).
 *
 * Puntos: la UAR publica entre corchetes los puntos de tabla de cada equipo. De ahí
 * salen los bonus: ganador con 5 = bonus ofensivo; perdedor con 1 = defensivo (perder
 * por 7 o menos). Los marcadores con ofensivo quedan con puntos a mano
 * (`points_autocalculated: false`), igual que el TRP.
 *
 * Los siete clubes que solo jugaron UROBA se crean NUEVOS (aunque haya homónimos en
 * otros torneos, no son los mismos). Los Miuras, Estudiantes de Olavarría y Argentino
 * de Trenque Lauquen ya existían del Pampeano y se reutilizan.
 *
 * Alta en el orden de las FK circulares (memoria alta_de_torneo_orden_de_fks).
 * Retomable. Nace en `draft`; `--publicar` lo pasa a published/activo.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const PUBLICAR = process.argv.includes('--publicar');

const TORNEO_MODELO = '594fcb55-b052-4a8f-bf24-5a288e35e4f5'; // TRP A
const FASE_MODELO = '89ed14f4-9c2f-4faa-ae54-61f9892e44a1'; // su Regular Season
const NOMBRE = 'UROBA';
const SLUG = 'uroba-2026';
const ORIGEN = 'uroba-2026-alta';
const MARGEN_DEFENSIVO = 7;
const RAZON = 'Resultado y bonus de UROBA 2026 según la planilla oficial de la UAR (Reg. Nac. de Base de datos). El bonus ofensivo va declarado: la fuente da el marcador, no los tries.';

interface ClubDef { id: string; name: string; short: string; nuevo: boolean }
const CLUBES: ClubDef[] = [
    { id: 'los-miuras', name: 'Los Miuras', short: 'Los Miuras', nuevo: false },
    { id: 'estudiantes-de-olavarria', name: 'Estudiantes de Olavarría', short: 'Estudiantes (OLAV)', nuevo: false },
    { id: 'argentino-de-trenque-lauquen', name: 'Argentino de Trenque Lauquen', short: 'Argentino TL', nuevo: false },
    { id: 'remo', name: 'Remo', short: 'Remo', nuevo: true },
    { id: 'pico-rugby', name: 'Pico Rugby', short: 'Pico Rugby', nuevo: true },
    { id: 'kamikazes-club-italiano', name: 'Kamikazes / C. Italiano', short: 'Kamikazes', nuevo: true },
    { id: 'los-indios-bolivar', name: 'Los Indios / Bolívar', short: 'Los Indios', nuevo: true },
    { id: 'onas-benito-juarez', name: 'Onas Benito Juárez', short: 'Onas', nuevo: true },
    { id: 'america-mapuche', name: 'América C. Atl. Riv. / Mapuche', short: 'América / Mapuche', nuevo: true },
    { id: 'villegas-rugby-club', name: 'Villegas Rugby Club', short: 'Villegas', nuevo: true },
];
const MIU = 'los-miuras', EST = 'estudiantes-de-olavarria', ARG = 'argentino-de-trenque-lauquen';
const REM = 'remo', PICO = 'pico-rugby', KAM = 'kamikazes-club-italiano', IND = 'los-indios-bolivar';
const ONA = 'onas-benito-juarez', AME = 'america-mapuche', VIL = 'villegas-rugby-club';

type Etapa = 'TIRA' | 'ZONA' | 'SEMI' | 'FINAL' | 'OMBU';
interface P {
    etapa: Etapa; ronda: string; fecha: string; hora: string; // fecha yyyy-mm-dd, hora HH:MM (Argentina)
    home: string; away: string; hs: number | null; as: number | null;
    ofensivo?: 'home' | 'away'; estado?: 'suspended';
}
const p = (etapa: Etapa, ronda: string, fecha: string, hora: string, home: string, away: string,
    hs: number | null, as: number | null, ofensivo?: 'home' | 'away', estado?: 'suspended'): P =>
    ({ etapa, ronda, fecha, hora, home, away, hs, as, ofensivo, estado });

const PARTIDOS: P[] = [
    // ── Tira completa ────────────────────────────────────────────────────────
    p('TIRA', 'Fecha 1', '2026-03-22', '15:30', REM, EST, 10, 24, 'away'),
    p('TIRA', 'Fecha 1', '2026-04-11', '15:30', MIU, ARG, 74, 0, 'home'),
    p('TIRA', 'Fecha 2', '2026-03-29', '15:30', EST, MIU, 10, 12),
    p('TIRA', 'Fecha 2', '2026-05-24', '15:30', ARG, REM, 34, 22),
    p('TIRA', 'Fecha 3', '2026-04-18', '15:30', EST, ARG, 38, 16, 'home'),
    p('TIRA', 'Fecha 3', '2026-04-19', '15:30', MIU, REM, 64, 0, 'home'),
    p('TIRA', 'Fecha 4', '2026-04-26', '15:00', REM, ARG, 17, 10),
    p('TIRA', 'Fecha 4', '2026-04-26', '15:00', MIU, EST, 55, 0, 'home'),
    p('TIRA', 'Fecha 5', '2026-05-09', '15:30', EST, REM, 21, 12),
    p('TIRA', 'Fecha 5', '2026-05-10', '15:00', ARG, MIU, 12, 28, 'away'),
    p('TIRA', 'Fecha 6', '2026-05-17', '15:00', ARG, EST, 13, 30),
    p('TIRA', 'Fecha 6', '2026-05-17', '15:00', REM, MIU, 12, 19),
    // ── Zona única ───────────────────────────────────────────────────────────
    p('ZONA', 'Fecha 1', '2026-03-28', '15:30', PICO, VIL, 27, 0, 'home'),
    p('ZONA', 'Fecha 1', '2026-03-29', '13:30', KAM, ONA, 33, 14, 'home'),
    p('ZONA', 'Fecha 1', '2026-03-29', '14:40', AME, IND, 10, 8),
    p('ZONA', 'Fecha 2', '2026-04-11', '15:30', AME, KAM, 20, 29),
    p('ZONA', 'Fecha 2', '2026-04-12', '14:30', ONA, PICO, 11, 7),
    p('ZONA', 'Fecha 2', '2026-04-12', '15:30', IND, VIL, 34, 6, 'home'),
    p('ZONA', 'Fecha 3', '2026-04-26', '14:00', ONA, AME, 17, 10),
    p('ZONA', 'Fecha 3', '2026-04-26', '15:30', KAM, IND, 17, 14),
    p('ZONA', 'Fecha 4', '2026-05-10', '14:00', VIL, ONA, 15, 14),
    p('ZONA', 'Fecha 4', '2026-05-10', '14:30', IND, PICO, 13, 11),
    p('ZONA', 'Fecha 5', '2026-05-16', '15:30', VIL, AME, 14, 20),
    p('ZONA', 'Fecha 5', '2026-05-16', '15:30', PICO, KAM, 34, 19),
    p('ZONA', 'Fecha 5', '2026-05-17', '15:00', IND, ONA, 28, 25),
    p('ZONA', 'Fecha 6', '2026-05-30', '15:30', AME, PICO, 13, 33, 'away'),
    p('ZONA', 'Fecha 6', '2026-05-31', '14:00', KAM, VIL, 45, 8, 'home'),
    p('ZONA', 'Fecha 7', '2026-06-13', '12:30', ONA, AME, null, null, undefined, 'suspended'),
    // ── Fase final (54012 · fixture 13035) ───────────────────────────────────
    p('SEMI', 'Semifinal', '2026-11-01', '15:00', IND, REM, 17, 18),
    p('SEMI', 'Semifinal', '2026-11-08', '15:30', PICO, KAM, 26, 24),
    p('SEMI', 'Semifinal', '2026-11-15', '15:30', MIU, REM, 23, 8),
    p('FINAL', 'Final UROBA', '2026-11-22', '15:30', MIU, PICO, null, null),
    p('OMBU', 'Final Copa Ombú', '2026-11-22', '14:30', KAM, REM, null, null),
];

const FASES: Array<{ etapa: Etapa; nombre: string; orden: number; tipo: 'league' | 'playoff'; activa: boolean; equipos: number }> = [
    { etapa: 'TIRA', nombre: 'Tira completa', orden: 1, tipo: 'league', activa: false, equipos: 4 },
    { etapa: 'ZONA', nombre: 'Zona única', orden: 1, tipo: 'league', activa: false, equipos: 6 },
    { etapa: 'SEMI', nombre: 'Semifinales', orden: 2, tipo: 'playoff', activa: false, equipos: 4 },
    { etapa: 'FINAL', nombre: 'Final UROBA', orden: 3, tipo: 'playoff', activa: true, equipos: 2 },
    { etapa: 'OMBU', nombre: 'Final Copa Ombú', orden: 3, tipo: 'playoff', activa: false, equipos: 2 },
];

function puntos(m: P) {
    const h = m.hs as number, a = m.as as number;
    const gana = h > a ? 'home' : h < a ? 'away' : null;
    const base = (l: 'home' | 'away') => (gana === null ? 2 : gana === l ? 4 : 0);
    const dif = Math.abs(h - a);
    const bonus = (l: 'home' | 'away') =>
        (m.ofensivo === l ? 1 : 0) + (gana !== null && gana !== l && dif <= MARGEN_DEFENSIVO ? 1 : 0);
    return {
        home_base_points: base('home'), away_base_points: base('away'),
        home_bonus_points: bonus('home'), away_bonus_points: bonus('away'),
    };
}

async function main() {
    // ── validación del archivo ───────────────────────────────────────────────
    const validos = new Set(CLUBES.map((c) => c.id));
    const vistos = new Set<string>();
    for (const m of PARTIDOS) {
        if (!validos.has(m.home) || !validos.has(m.away)) throw new Error(`Club desconocido: ${JSON.stringify(m)}`);
        if (m.home === m.away) throw new Error(`Un club contra sí mismo: ${JSON.stringify(m)}`);
        if ((m.hs === null) !== (m.as === null)) throw new Error(`Marcador a medias: ${JSON.stringify(m)}`);
        if (m.ofensivo && (m.ofensivo === 'home' ? (m.hs as number) <= (m.as as number) : (m.as as number) <= (m.hs as number))) {
            throw new Error(`Ofensivo para el perdedor: ${JSON.stringify(m)}`);
        }
        const k = `${m.etapa}|${m.ronda}|${m.home}|${m.away}`;
        if (vistos.has(k)) throw new Error(`Partido repetido: ${k}`);
        vistos.add(k);
    }
    const de = (e: Etapa) => PARTIDOS.filter((m) => m.etapa === e);
    console.log(`Partidos: ${FASES.map((f) => `${f.nombre} ${de(f.etapa).length}`).join(' · ')} · jugados ${PARTIDOS.filter((m) => m.hs !== null).length}/${PARTIDOS.length}`);

    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    // ── clubes: los viejos tienen que existir; los nuevos no pueden pisar a otro ──
    const { data: clubesDb } = await supabase.from('clubs').select('id, union_id').in('id', CLUBES.map((c) => c.id));
    const porId = new Map(((clubesDb ?? []) as Array<{ id: string; union_id: string | null }>).map((c) => [c.id, c]));
    for (const c of CLUBES) {
        const ya = porId.get(c.id);
        if (!c.nuevo && !ya) throw new Error(`Debería existir y no está: ${c.id}`);
        if (c.nuevo && ya && ya.union_id !== 'uroba') throw new Error(`El id ${c.id} ya es de otro club (union ${ya.union_id}); elegí otro id.`);
    }

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

    console.log(`\nTorneo: "${NOMBRE} 2026" (${SLUG}) · ${CLUBES.length} clubes (${CLUBES.filter((c) => c.nuevo).length} nuevos)`);
    for (const c of CLUBES) console.log(`  · ${c.short.padEnd(20)} ${c.id}${c.nuevo ? '  [NUEVO]' : ''}`);
    if (!APPLY) { console.log('\nDry-run: no se escribió nada. Repetí con --apply.'); return; }

    // ── clubes nuevos ────────────────────────────────────────────────────────
    for (const c of CLUBES.filter((x) => x.nuevo && !porId.has(x.id))) {
        const { error } = await supabase.from('clubs').insert([{
            id: c.id, name: c.name, short_name: c.short, slug: c.id, union_id: 'uroba',
            region: 'Buenos Aires', country: 'ARG', sport: 'rugby', sport_id: 'rugby',
            entity_type: 'club', status: 'active', visibility: 'visible', is_visible: true, claim_status: 'own',
        }]);
        if (error) throw new Error(`Club ${c.id}: ${error.message}`);
        console.log(`+ club ${c.id}`);
    }

    // ── torneo, temporada ────────────────────────────────────────────────────
    if (!torneoId) {
        torneoId = randomUUID();
        seasonId = randomUUID();
        const { error: e1 } = await supabase.from('tournaments').insert([{
            id: torneoId, union_id: 'uroba', season_id: '2026',
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
            start_date: '2026-03-21', end_date: null,
            settings: { source: ORIGEN, nota: 'Tira completa + Zona única + Semifinales + Final UROBA + Final Copa Ombú' },
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
        settings.legs = 1;
        settings.advanceCount = 0;
        if (f.tipo === 'league') {
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
            phase_type: f.tipo, order_index: f.orden, is_active: f.activa, settings,
        }]);
        if (error) throw new Error(`Fase ${f.nombre}: ${error.message}`);
        faseId.set(f.etapa, id);
        console.log(`+ fase ${f.nombre}`);
    }

    // ── participantes: las TRES tablas ───────────────────────────────────────
    const { data: yaPart } = await supabase.from('tournament_participants').select('id, club_id').eq('tournament_id', torneoId);
    const partId = new Map<string, string>((yaPart ?? []).map((x) => [x.club_id as string, x.id as string]));
    for (const c of CLUBES) {
        if (partId.has(c.id)) continue;
        const participantId = randomUUID();
        const entryId = randomUUID();
        const { error: e1 } = await supabase.from('tournament_participants').insert([{
            id: participantId, tournament_id: torneoId, season_id: seasonId, club_id: c.id,
            name: c.short, short_code: c.short, type: 'club', status: 'active', season_entry_id: null,
        }]);
        if (e1) throw new Error(`Participante ${c.id}: ${e1.message}`);
        const { error: e2 } = await supabase.from('team_season_entries').insert([{
            id: entryId, season_id: seasonId, tournament_id: torneoId, club_id: c.id, team_id: null,
            source_participant_id: participantId, status: 'active',
            settings: { source: ORIGEN, participant_type: 'club' },
        }]);
        if (e2) throw new Error(`Entrada ${c.id}: ${e2.message}`);
        const { error: e3 } = await supabase.from('tournament_participants').update({ season_entry_id: entryId }).eq('id', participantId);
        if (e3) throw new Error(`Enganche ${c.id}: ${e3.message}`);
        partId.set(c.id, participantId);
    }
    console.log(`participantes: ${partId.size}`);

    // ── asignación a fase: solo donde de verdad juega ────────────────────────
    const { data: yaAsig } = await supabase.from('tournament_phase_participants').select('phase_id, participant_id').eq('tournament_id', torneoId);
    const asignados = new Set((yaAsig ?? []).map((a) => `${a.phase_id}|${a.participant_id}`));
    for (const f of FASES) {
        const clubes = [...new Set(de(f.etapa).flatMap((m) => [m.home, m.away]))];
        for (const club of clubes) {
            if (asignados.has(`${faseId.get(f.etapa)}|${partId.get(club)}`)) continue;
            const { error } = await supabase.from('tournament_phase_participants').insert([{
                tournament_id: torneoId, season_id: seasonId, phase_id: faseId.get(f.etapa),
                participant_id: partId.get(club), status: 'active',
            }]);
            if (error) throw new Error(`Asignación ${club} → ${f.nombre}: ${error.message}`);
        }
    }

    // ── partidos ─────────────────────────────────────────────────────────────
    const { data: yaMatches } = await supabase.from('matches')
        .select('id, phase_id, home_club_id, away_club_id, round_label').eq('tournament_id', torneoId);
    const existe = new Map((yaMatches ?? []).map((m) => [`${m.phase_id}|${m.round_label}|${m.home_club_id}|${m.away_club_id}`, m.id as string]));
    let nuevos = 0, actualizados = 0;
    for (const m of PARTIDOS) {
        const fase = faseId.get(m.etapa)!;
        const liga = m.etapa === 'TIRA' || m.etapa === 'ZONA';
        const jugado = m.hs !== null;
        const dateTime = new Date(`${m.fecha}T${m.hora}:00-03:00`).toISOString();
        const base = {
            tournament_id: torneoId, season_id: seasonId, phase_id: fase, round_label: m.ronda,
            home_club_id: m.home, away_club_id: m.away, date_time: dateTime,
            is_visible: true, review_status: 'approved',
        };
        const resultado = jugado
            ? {
                status: 'final',
                score: { home: m.hs, away: m.as },
                ...(liga ? {
                    ...puntos(m),
                    points_autocalculated: !m.ofensivo,
                    points_override_reason: m.ofensivo ? RAZON : null,
                } : {}),
            }
            : { status: m.estado ?? 'scheduled', score: null };
        const id = existe.get(`${fase}|${m.ronda}|${m.home}|${m.away}`);
        if (id) {
            const { error } = await supabase.from('matches').update({ date_time: dateTime, ...resultado }).eq('id', id);
            if (error) throw new Error(`Update ${m.home}-${m.away}: ${error.message}`);
            actualizados += 1;
        } else {
            const { error } = await supabase.from('matches').insert([{ id: randomUUID(), ...base, ...resultado }]);
            if (error) throw new Error(`Insert ${m.home}-${m.away}: ${error.message}`);
            nuevos += 1;
        }
    }
    console.log(`partidos: ${nuevos} nuevos · ${actualizados} actualizados`);

    // ── tablas (solo las dos de liga) ────────────────────────────────────────
    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    for (const f of FASES.filter((x) => x.tipo === 'league')) {
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
