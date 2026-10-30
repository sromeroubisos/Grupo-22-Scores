/**
 * Copa Bronce del Oeste 2026 (Unión de Rugby de Cuyo, 6 clubes): alta del
 * torneo, su fase regular, los participantes, el fixture y los resultados.
 *
 *   node -r C:/tmp/stub.cjs -r ts-node/register -r tsconfig-paths/register \
 *     src/scripts/copa-bronce-oeste-2026-alta.ts [--apply] [--publicar]
 *
 * Fuente: rugbydecuyo.com.ar/A-CUYANO-26/bronce-fixture.html (10 fechas de
 * todos contra todos; semifinales 17/10 y finales 24/10, que no se cargan).
 *
 * El bonus no sale del marcador: la fuente da el resultado y nunca los tries,
 * así que se DEDUCE de la tabla oficial (mismo criterio que la Copa Plata, ver
 * [[copa-plata-del-oeste-fuente-y-bonus]]). Los PUNTOS de la tabla son los que
 * hay que reproducir: SJ 44, Belgrano 37, Chancay 30, Pumai 18, Teros 11,
 * Pocito 0. La columna BS de la fuente le da 6 a Belgrano, pero sus 37 puntos
 * exigen 5 (8 ganados x 4 + 5): se respetan los puntos.
 *
 * Alta en el orden de las FK circulares ([[alta-de-torneo-orden-de-fks]]) y con
 * las tres tablas de participante ([[participantes-tres-tablas]]). Retomable.
 * Nace en `draft`; `--publicar` lo pasa a published/activo.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const PUBLICAR = process.argv.includes('--publicar');

const TORNEO_MODELO = '8e21ce2b-459c-40f5-8012-d0968d6a4d95'; // Copa Plata del Oeste
const FASE_MODELO = 'bd8ac0f0-48b4-4c78-bd3c-87ed7170bda7';
const NOMBRE = 'Copa Bronce del Oeste';
const SLUG = 'copa-bronce-del-oeste-2026';
const ORIGEN = 'copa-bronce-oeste-2026-alta';
const MARGEN_DEFENSIVO = 7;
const RAZON = 'Resultado de la Copa Bronce del Oeste (rugbydecuyo.com.ar). El bonus ofensivo se deduce de los puntos de la tabla oficial: la fuente da el marcador, no los tries.';

const CLUBES = {
    SJ: { id: 'san-jorge-r-c', corto: 'San Jorge' },
    BEL: { id: 'belgrano-rugby-club', corto: 'Belgrano' },
    CHA: { id: 'chancay-r-c', corto: 'Chancay' },
    PUM: { id: 'pumai', corto: 'Pumai' },
    TER: { id: 'los-teros-san-luis', corto: 'Los Teros' },
    POC: { id: 'pocito-r-c', corto: 'Pocito' },
} as const;
type K = keyof typeof CLUBES;

/** Club que no existía en G22: Pocito (San Juan). */
const CLUB_NUEVO = { id: 'pocito-r-c', name: 'Pocito R.C.', short_name: 'Pocito', city: 'Pocito', region: 'San Juan' };

interface P { f: number; fecha: string; h: K; a: K; hs: number | null; as: number | null; of?: 'h' | 'a' | 'ambos'; nota?: string }
const PARTIDOS: P[] = [
    { f: 1, fecha: '2026-05-23', h: 'BEL', a: 'POC', hs: 78, as: 7, of: 'h' },
    { f: 1, fecha: '2026-05-23', h: 'PUM', a: 'SJ', hs: 0, as: 62, of: 'a' },
    { f: 1, fecha: '2026-05-23', h: 'TER', a: 'CHA', hs: 0, as: 45, of: 'a' },
    { f: 2, fecha: '2026-06-06', h: 'CHA', a: 'PUM', hs: 24, as: 13, of: 'h' },
    { f: 2, fecha: '2026-06-06', h: 'POC', a: 'TER', hs: 7, as: 32, of: 'a' },
    { f: 2, fecha: '2026-06-06', h: 'SJ', a: 'BEL', hs: 22, as: 25 },
    { f: 3, fecha: '2026-06-27', h: 'BEL', a: 'CHA', hs: 43, as: 0, of: 'h' },
    { f: 3, fecha: '2026-06-27', h: 'PUM', a: 'TER', hs: 37, as: 14, of: 'h' },
    { f: 3, fecha: '2026-06-27', h: 'SJ', a: 'POC', hs: 105, as: 3, of: 'h' },
    { f: 4, fecha: '2026-07-12', h: 'CHA', a: 'SJ', hs: 19, as: 30 },
    { f: 4, fecha: '2026-07-12', h: 'PUM', a: 'POC', hs: 39, as: 15, of: 'h' },
    { f: 4, fecha: '2026-07-12', h: 'TER', a: 'BEL', hs: 15, as: 77, of: 'a' },
    { f: 5, fecha: '2026-07-25', h: 'BEL', a: 'PUM', hs: 80, as: 5, of: 'h' },
    { f: 5, fecha: '2026-07-25', h: 'POC', a: 'CHA', hs: 0, as: 31, of: 'a' },
    { f: 5, fecha: '2026-07-25', h: 'SJ', a: 'TER', hs: 136, as: 0, of: 'h' },
    { f: 6, fecha: '2026-08-08', h: 'SJ', a: 'PUM', hs: 79, as: 6, of: 'h' },
    { f: 6, fecha: '2026-08-08', h: 'CHA', a: 'TER', hs: 41, as: 0, of: 'h' },
    { f: 6, fecha: '2026-08-08', h: 'POC', a: 'BEL', hs: null, as: null, nota: 'Pendiente en la fuente (sin resultado ni nueva fecha).' },
    { f: 7, fecha: '2026-08-22', h: 'PUM', a: 'CHA', hs: 14, as: 38, of: 'a' },
    { f: 7, fecha: '2026-08-22', h: 'TER', a: 'POC', hs: 96, as: 0, of: 'h' },
    { f: 7, fecha: '2026-08-22', h: 'BEL', a: 'SJ', hs: 12, as: 23 },
    { f: 8, fecha: '2026-09-06', h: 'CHA', a: 'BEL', hs: 14, as: 34 },
    { f: 8, fecha: '2026-09-06', h: 'TER', a: 'PUM', hs: 24, as: 30 },
    { f: 8, fecha: '2026-09-06', h: 'POC', a: 'SJ', hs: 0, as: 114, of: 'a' },
    { f: 9, fecha: '2026-09-19', h: 'SJ', a: 'CHA', hs: 81, as: 0, of: 'h' },
    { f: 9, fecha: '2026-09-19', h: 'POC', a: 'PUM', hs: 12, as: 31 },
    { f: 9, fecha: '2026-09-19', h: 'BEL', a: 'TER', hs: 102, as: 3, of: 'h' },
    { f: 10, fecha: '2026-10-03', h: 'PUM', a: 'BEL', hs: 10, as: 24 },
    { f: 10, fecha: '2026-10-03', h: 'CHA', a: 'POC', hs: 80, as: 0, of: 'h' },
    { f: 10, fecha: '2026-10-03', h: 'TER', a: 'SJ', hs: 3, as: 82, of: 'a' },
];

/** Los puntos de la tabla oficial, para contrastar lo que se carga. */
const PUNTOS_OFICIALES: Record<K, number> = { SJ: 44, BEL: 37, CHA: 30, PUM: 18, TER: 11, POC: 0 };

function puntos(p: P) {
    const h = p.hs as number; const a = p.as as number;
    const gana = h > a ? 'h' : h < a ? 'a' : null;
    const base = (l: 'h' | 'a') => (gana === null ? 2 : gana === l ? 4 : 0);
    const dif = Math.abs(h - a);
    const bonus = (l: 'h' | 'a') =>
        (p.of === l || p.of === 'ambos' ? 1 : 0) + (gana !== null && gana !== l && dif <= MARGEN_DEFENSIVO ? 1 : 0);
    return {
        home_base_points: base('h'), away_base_points: base('a'),
        home_bonus_points: bonus('h'), away_bonus_points: bonus('a'),
    };
}

async function main() {
    // ── contraste con la tabla oficial, antes de tocar nada ──────────────────
    const tot: Record<K, number> = { SJ: 0, BEL: 0, CHA: 0, PUM: 0, TER: 0, POC: 0 };
    for (const p of PARTIDOS) {
        if (p.hs === null) continue;
        const x = puntos(p);
        tot[p.h] += x.home_base_points + x.home_bonus_points;
        tot[p.a] += x.away_base_points + x.away_bonus_points;
    }
    let ok = true;
    for (const k of Object.keys(tot) as K[]) {
        const marca = tot[k] === PUNTOS_OFICIALES[k] ? 'ok ' : 'MAL';
        if (tot[k] !== PUNTOS_OFICIALES[k]) ok = false;
        console.log(`${marca} ${CLUBES[k].corto.padEnd(10)} calculado ${tot[k]} · oficial ${PUNTOS_OFICIALES[k]}`);
    }
    if (!ok) throw new Error('Los puntos calculados no reproducen la tabla oficial.');

    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    const ids = Object.values(CLUBES).map((c) => c.id);
    const { data: clubesDb } = await supabase.from('clubs').select('id').in('id', ids);
    const faltan = ids.filter((id) => !(clubesDb ?? []).some((c) => c.id === id));
    console.log('clubes que faltan en G22:', faltan.join(', ') || 'ninguno');
    if (faltan.some((id) => id !== CLUB_NUEVO.id)) throw new Error(`Faltan clubes inesperados: ${faltan.join(', ')}`);

    const { data: modelos } = await supabase.from('tournaments').select('*').eq('id', TORNEO_MODELO).limit(1);
    const modelo = modelos?.[0];
    if (!modelo) throw new Error('No encuentro la Copa Plata (modelo).');
    const { data: fasesModelo } = await supabase.from('tournament_phases').select('settings').eq('id', FASE_MODELO).limit(1);
    const settingsModelo = fasesModelo?.[0]?.settings;
    if (!settingsModelo) throw new Error('No encuentro la fase modelo.');

    const { data: ya } = await supabase.from('tournaments').select('id').eq('slug', SLUG).limit(1);
    let torneoId: string | null = ya?.[0]?.id ?? null;
    let seasonId: string | null = null;
    if (torneoId) {
        const { data: s } = await supabase.from('tournament_seasons').select('id, settings').eq('tournament_id', torneoId).limit(1);
        if ((s?.[0]?.settings as { source?: string } | null)?.source !== ORIGEN) throw new Error(`El slug ${SLUG} no lo creó este script.`);
        seasonId = s![0].id;
        console.log(`Retomando ${torneoId}`);
    }
    if (!APPLY) { console.log('\nDry-run: no se escribió nada. Repetí con --apply.'); return; }

    // ── club nuevo ───────────────────────────────────────────────────────────
    if (faltan.includes(CLUB_NUEVO.id)) {
        const { error } = await supabase.from('clubs').insert([{
            id: CLUB_NUEVO.id, union_id: modelo.union_id, name: CLUB_NUEVO.name, short_name: CLUB_NUEVO.short_name,
            city: CLUB_NUEVO.city, region: CLUB_NUEVO.region, country: 'ARG', slug: CLUB_NUEVO.id,
            is_visible: true, entity_type: 'club', sport: 'rugby', sport_id: 'rugby', status: 'active',
            visibility: 'visible', claim_status: 'own',
        }]);
        if (error) throw new Error(`Alta de Pocito: ${error.message}`);
        console.log('+ club Pocito R.C.');
    }

    // ── torneo y temporada ───────────────────────────────────────────────────
    if (!torneoId) {
        torneoId = randomUUID(); seasonId = randomUUID();
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
            start_date: '2026-05-23', end_date: null,
            settings: { source: ORIGEN, nota: 'Fase regular de 10 fechas; semifinales 17/10 y finales 24/10 sin cargar' },
        }]);
        if (e2) throw new Error(`Alta de la temporada: ${e2.message}`);
        const { error: e3 } = await supabase.from('tournaments').update({ current_season_id: seasonId }).eq('id', torneoId);
        if (e3) throw new Error(`current_season_id: ${e3.message}`);
        console.log('+ torneo y temporada');
    }

    // ── fase ─────────────────────────────────────────────────────────────────
    const { data: fasesYa } = await supabase.from('tournament_phases').select('id, name').eq('tournament_id', torneoId);
    let faseId = fasesYa?.[0]?.id as string | undefined;
    if (!faseId) {
        const settings = JSON.parse(JSON.stringify(settingsModelo));
        settings.teamsCount = 6;
        faseId = randomUUID();
        const { error } = await supabase.from('tournament_phases').insert([{
            id: faseId, tournament_id: torneoId, season_id: seasonId, name: 'Fase regular',
            phase_type: 'league', order_index: 1, is_active: true, settings,
        }]);
        if (error) throw new Error(`Fase: ${error.message}`);
        console.log('+ fase regular');
    }

    // ── participantes: las tres tablas ───────────────────────────────────────
    const { data: yaPart } = await supabase.from('tournament_participants').select('id, club_id').eq('tournament_id', torneoId);
    const partId = new Map<string, string>((yaPart ?? []).map((p) => [p.club_id as string, p.id as string]));
    for (const k of Object.keys(CLUBES) as K[]) {
        const club = CLUBES[k].id;
        if (partId.has(club)) continue;
        const participantId = randomUUID(); const entryId = randomUUID();
        const { error: e1 } = await supabase.from('tournament_participants').insert([{
            id: participantId, tournament_id: torneoId, season_id: seasonId, club_id: club,
            name: CLUBES[k].corto, short_code: CLUBES[k].corto, type: 'club', status: 'active', season_entry_id: null,
        }]);
        if (e1) throw new Error(`Participante ${club}: ${e1.message}`);
        const { error: e2 } = await supabase.from('team_season_entries').insert([{
            id: entryId, season_id: seasonId, tournament_id: torneoId, club_id: club, team_id: null,
            source_participant_id: participantId, status: 'active', settings: { source: ORIGEN, participant_type: 'club' },
        }]);
        if (e2) throw new Error(`Entrada ${club}: ${e2.message}`);
        const { error: e3 } = await supabase.from('tournament_participants').update({ season_entry_id: entryId }).eq('id', participantId);
        if (e3) throw new Error(`Enganche ${club}: ${e3.message}`);
        partId.set(club, participantId);
    }
    const { data: yaAsig } = await supabase.from('tournament_phase_participants').select('participant_id').eq('phase_id', faseId);
    const asignados = new Set((yaAsig ?? []).map((a) => a.participant_id as string));
    for (const [club, pid] of partId) {
        if (asignados.has(pid)) continue;
        const { error } = await supabase.from('tournament_phase_participants').insert([{
            tournament_id: torneoId, season_id: seasonId, phase_id: faseId, participant_id: pid, status: 'active',
        }]);
        if (error) throw new Error(`Asignación ${club}: ${error.message}`);
    }
    console.log(`participantes: ${partId.size}`);

    // ── partidos ─────────────────────────────────────────────────────────────
    const { data: yaMatches } = await supabase.from('matches').select('id, home_club_id, away_club_id').eq('tournament_id', torneoId);
    const existe = new Map((yaMatches ?? []).map((m) => [`${m.home_club_id}|${m.away_club_id}`, m.id as string]));
    let nuevos = 0, actualizados = 0;
    for (const p of PARTIDOS) {
        const home = CLUBES[p.h].id; const away = CLUBES[p.a].id;
        const dateTime = new Date(`${p.fecha}T16:00:00-03:00`).toISOString();
        const jugado = p.hs !== null;
        const resultado = jugado
            ? { status: 'final', score: { home: p.hs, away: p.as }, ...puntos(p), points_autocalculated: false, points_override_reason: RAZON }
            : { status: 'postponed', score: null, notes: p.nota ?? null };
        const base = {
            tournament_id: torneoId, season_id: seasonId, phase_id: faseId, home_club_id: home, away_club_id: away,
            date_time: dateTime, round_label: `Fecha ${p.f}`, is_visible: true, review_status: 'approved',
        };
        const id = existe.get(`${home}|${away}`);
        if (id) {
            const { error } = await supabase.from('matches').update({ date_time: dateTime, ...resultado }).eq('id', id);
            if (error) throw new Error(`Update ${home}-${away}: ${error.message}`);
            actualizados += 1;
        } else {
            const { error } = await supabase.from('matches').insert([{ id: randomUUID(), ...base, ...resultado }]);
            if (error) throw new Error(`Insert ${home}-${away}: ${error.message}`);
            nuevos += 1;
        }
    }
    console.log(`partidos: ${nuevos} nuevos · ${actualizados} actualizados`);

    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    const r = await recalculatePhaseStandingsScopes(torneoId, faseId, 'general', seasonId);
    console.log('tabla', JSON.stringify(r)?.slice(0, 160));

    if (PUBLICAR) {
        const { error } = await supabase.from('tournaments').update({ status: 'published', is_active: true }).eq('id', torneoId);
        if (error) throw new Error(`Publicar: ${error.message}`);
        console.log('torneo publicado');
    } else {
        console.log('El torneo queda en draft. Repetí con --publicar cuando lo hayas revisado.');
    }
    console.log('torneoId', torneoId, 'seasonId', seasonId);
}

main().catch((e) => { console.error(e); process.exit(1); });
