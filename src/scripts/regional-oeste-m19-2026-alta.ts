/**
 * Regional Oeste Juvenil M19 2026 (Unión de Rugby de Cuyo, 20 clubes): alta del
 * torneo, sus 9 rondas, los participantes y todos los partidos.
 *
 *   npx tsx src/scripts/regional-oeste-m19-2026-alta.ts                 # dry-run
 *   npx tsx src/scripts/regional-oeste-m19-2026-alta.ts --apply
 *   npx tsx src/scripts/regional-oeste-m19-2026-alta.ts --apply --publicar
 *
 * Fuente: tarjetas del sistema de la UAR (Cuyo). Puntos de la fuente: ganar 3,
 * empatar 2, perder 1, WO ganado 4 y WO perdido 0; bonus ofensivo por diferencia
 * de 3 tries, bonus defensivo perdiendo por 7 o menos. La fuente publica los
 * puntos de cada equipo entre corchetes y no los tries, así que cada partido
 * lleva los puntos DECLARADOS (`points_autocalculated: false`).
 *
 * Cada ronda es una fase independiente (sin arrastre: las tablas oficiales
 * cuentan solo los partidos de la ronda).
 *
 * Alta en el orden de las FK circulares (memoria alta_de_torneo_orden_de_fks).
 * Retomable. Nace en `draft`.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const PUBLICAR = process.argv.includes('--publicar');

const TORNEO_MODELO = '166c2906-4a73-4354-a8c4-c64342ed875d'; // Copa Oro del Oeste
const FASE_MODELO = 'd200d0be-3e1f-4c5b-9ec7-342fd358f4ce';
const NOMBRE = 'Regional Oeste Juvenil M19';
const SLUG = 'regional-oeste-juvenil-m19-2026';
const ORIGEN = 'regional-oeste-m19-2026-alta';
const RAZON = 'Puntos de tabla tal como los publica la tarjeta oficial de la UAR (la fuente no da los tries).';

const CLUBES: Record<string, { id: string; nombre: string }> = {
    MA: { id: 'marista-rugby-club-m19-a', nombre: 'Marista A' },
    MB: { id: 'marista-rugby-club-m19-b', nombre: 'Marista B' },
    MC: { id: 'marista-rugby-club-m19-c', nombre: 'Marista C' },
    TA: { id: 'los-tordos-rugby-club-m19-a', nombre: 'Los Tordos A' },
    TB: { id: 'los-tordos-rugby-club-m19-b', nombre: 'Los Tordos B' },
    LA: { id: 'liceo-rugby-club-m19-a', nombre: 'Liceo A' },
    LB: { id: 'liceo-rugby-club-m19-b', nombre: 'Liceo B' },
    SA: { id: 'san-juan-rugby-club-m19-a', nombre: 'San Juan A' },
    SB: { id: 'san-juan-rugby-club-m19-b', nombre: 'San Juan B' },
    US: { id: 'universitario-de-san-juan', nombre: 'Universitario (SJ)' },
    UM: { id: 'universitario-de-mendoza', nombre: 'Universitario (Cuyo)' },
    CP: { id: 'c-p-b-m', nombre: 'C.P.B.M.' },
    BA: { id: 'banco-rugby-club', nombre: 'Banco' },
    ME: { id: 'mendoza-rugby-club', nombre: 'Mendoza' },
    SJ: { id: 'san-jorge-r-c', nombre: 'San Jorge' },
    AL: { id: 'alfiles-s-c', nombre: 'Alfiles' },
    TC: { id: 'tacuru-rugby-hockey-club', nombre: 'Tacurú' },
    TQ: { id: 'teque-r-c', nombre: 'Teqüe' },
    HZ: { id: 'huazihul', nombre: 'Huazihul' },
    JK: { id: 'jockey-club-san-juan', nombre: 'Jockey Club (SJ)' },
};

type Ronda = 'F1' | 'ORO' | 'REC' | 'PLATA' | 'BRONCE' | 'FFORO' | 'FFPLATA' | 'FFBRONCE' | 'FFEST';
const RONDAS: Array<{ k: Ronda; nombre: string; orden: number; equipos: number }> = [
    { k: 'F1', nombre: 'Copa Oro - Fase 1 Posicionamiento y Repechaje', orden: 1, equipos: 20 },
    { k: 'ORO', nombre: 'Copa Oro', orden: 2, equipos: 8 },
    { k: 'REC', nombre: 'Reclasificación Copa Plata-Bronce', orden: 3, equipos: 12 },
    { k: 'PLATA', nombre: 'Copa Plata', orden: 4, equipos: 6 },
    { k: 'BRONCE', nombre: 'Copa Bronce', orden: 5, equipos: 6 },
    { k: 'FFORO', nombre: 'Final Four Copa Oro', orden: 6, equipos: 4 },
    { k: 'FFPLATA', nombre: 'Final Four Copa Plata', orden: 7, equipos: 4 },
    { k: 'FFBRONCE', nombre: 'Final Four Copa Bronce', orden: 8, equipos: 4 },
    { k: 'FFEST', nombre: 'Final Four Copa Estímulo', orden: 9, equipos: 4 },
];

/**
 * [ronda, fecha N, 'dd/mm hh:mm', local, visitante, tantosL, tantosV, ptsL, ptsV]
 * ptsL/ptsV = el número entre corchetes. WO: el perdedor no tiene corchete (0).
 * Sin jugar: tantos y puntos en null.
 */
type Fila = [Ronda, number, string, string, string, number | null, number | null, number | null, number | null];
const P: Fila[] = [
    // Fase 1
    ['F1', 1, '28/05 19:15', 'TA', 'TB', 66, 24, 4, 1],
    ['F1', 1, '30/05 14:00', 'MA', 'JK', 108, 0, 4, 1],
    ['F1', 1, '30/05 13:30', 'SA', 'TQ', 33, 21, 3, 1],
    ['F1', 1, '30/05 13:30', 'US', 'SJ', 36, 23, 3, 1],
    ['F1', 1, '30/05 13:00', 'LB', 'AL', 34, 17, 4, 1],
    ['F1', 1, '30/05 14:30', 'LA', 'TC', 45, 12, 4, 1],
    ['F1', 1, '30/05 13:00', 'CP', 'MB', 50, 3, 4, 1],
    ['F1', 1, '30/05 11:00', 'BA', 'MC', 21, 0, 4, 0],
    ['F1', 1, '30/05 14:00', 'HZ', 'UM', 0, 8, 1, 3],
    ['F1', 1, '31/05 10:30', 'ME', 'SB', 41, 24, 3, 1],
    // Copa Oro
    ['ORO', 1, '13/06 13:30', 'MA', 'SA', 40, 14, 4, 1],
    ['ORO', 1, '13/06 12:00', 'TA', 'BA', 50, 5, 4, 1],
    ['ORO', 1, '13/06 12:00', 'LA', 'CP', 13, 12, 3, 2],
    ['ORO', 1, '13/06 15:00', 'US', 'ME', 38, 10, 4, 1],
    ['ORO', 2, '27/06 11:00', 'SA', 'ME', 0, 21, 0, 4],
    ['ORO', 2, '27/06 11:30', 'CP', 'US', 67, 19, 4, 1],
    ['ORO', 2, '27/06 11:00', 'BA', 'LA', 0, 52, 1, 4],
    ['ORO', 2, '27/06 12:00', 'MA', 'TA', 7, 31, 1, 4],
    ['ORO', 3, '25/07 13:00', 'TA', 'SA', 43, 42, 3, 2],
    ['ORO', 3, '25/07 10:00', 'LA', 'MA', 27, 24, 3, 2],
    ['ORO', 3, '25/07 13:00', 'ME', 'CP', 5, 41, 1, 4],
    ['ORO', 3, '26/07 12:00', 'US', 'BA', 44, 21, 4, 1],
    ['ORO', 4, '07/08 21:00', 'BA', 'ME', 10, 21, 1, 3],
    ['ORO', 4, '08/08 11:00', 'SA', 'CP', 23, 22, 3, 2],
    ['ORO', 4, '08/08 12:00', 'MA', 'US', 21, 0, 4, 0],
    ['ORO', 4, '09/08 13:30', 'TA', 'LA', 54, 5, 4, 1],
    ['ORO', 5, '22/08 12:30', 'LA', 'SA', 55, 0, 4, 1],
    ['ORO', 5, '06/09 13:00', 'CP', 'BA', 57, 5, 4, 1],
    ['ORO', 5, '17/09 20:00', 'ME', 'MA', 10, 26, 1, 4],
    ['ORO', 5, '19/09 14:00', 'US', 'TA', 35, 96, 1, 4],
    ['ORO', 6, '11/09 20:00', 'TA', 'ME', 63, 7, 4, 1],
    ['ORO', 6, '12/09 12:00', 'SA', 'BA', 21, 0, 4, 0],
    ['ORO', 6, '12/09 12:30', 'MA', 'CP', 34, 12, 3, 1],
    ['ORO', 6, '12/09 15:00', 'LA', 'US', 21, 0, 4, 0],
    ['ORO', 7, '03/10 12:30', 'US', 'SA', 23, 25, 2, 3],
    ['ORO', 7, '03/10 10:00', 'CP', 'TA', 29, 52, 1, 4],
    ['ORO', 7, '03/10 12:30', 'BA', 'MA', 0, 21, 0, 4],
    ['ORO', 7, '07/10 21:00', 'ME', 'LA', 17, 32, 1, 4],
    // Reclasificación Plata-Bronce
    ['REC', 1, '11/06 20:00', 'MC', 'MB', 17, 41, 1, 4],
    ['REC', 1, '13/06 12:30', 'JK', 'AL', 0, 61, 1, 4],
    ['REC', 1, '13/06 13:30', 'TB', 'HZ', 43, 19, 4, 1],
    ['REC', 1, '13/06 14:00', 'SJ', 'UM', 16, 21, 2, 3],
    ['REC', 1, '13/06 12:00', 'TQ', 'SB', 28, 7, 4, 1],
    ['REC', 1, '14/06 11:30', 'TC', 'LB', 15, 38, 1, 4],
    // Copa Plata
    ['PLATA', 1, '26/06 20:00', 'TB', 'TQ', 7, 34, 1, 4],
    ['PLATA', 1, '27/06 14:00', 'LB', 'UM', 21, 26, 2, 3],
    ['PLATA', 1, '28/06 12:00', 'AL', 'MB', 58, 10, 4, 1],
    ['PLATA', 2, '25/07 14:30', 'MB', 'UM', 24, 41, 1, 3],
    ['PLATA', 2, '25/07 14:00', 'TQ', 'LB', 23, 10, 3, 1],
    ['PLATA', 2, '25/07 13:00', 'AL', 'TB', 28, 22, 3, 2],
    ['PLATA', 3, '07/08 19:00', 'TB', 'MB', 17, 40, 1, 3],
    ['PLATA', 3, '09/08 11:00', 'LB', 'AL', 19, 22, 2, 3],
    ['PLATA', 3, '09/08 11:00', 'UM', 'TQ', 20, 25, 2, 3],
    ['PLATA', 4, '06/09 13:30', 'MB', 'TQ', 59, 0, 4, 1],
    ['PLATA', 4, '06/09 13:30', 'AL', 'UM', 35, 26, 3, 1],
    ['PLATA', 4, '17/09 20:00', 'TB', 'LB', 35, 26, 3, 1],
    ['PLATA', 5, '11/09 20:30', 'LB', 'MB', 26, 0, 4, 1],
    ['PLATA', 5, '12/09 12:30', 'UM', 'TB', 24, 21, 3, 2],
    ['PLATA', 5, '12/09 12:30', 'TQ', 'AL', 40, 17, 4, 1],
    // Copa Bronce
    ['BRONCE', 1, '27/06 14:00', 'HZ', 'SB', 26, 26, 2, 2],
    ['BRONCE', 1, '28/06 11:00', 'JK', 'MC', 21, 0, 4, 0],
    ['BRONCE', 1, '28/06 12:30', 'TC', 'SJ', 41, 26, 3, 1],
    ['BRONCE', 2, '25/07 13:00', 'MC', 'SJ', 0, 21, 0, 4],
    ['BRONCE', 2, '25/07 13:00', 'JK', 'HZ', 15, 8, 3, 2],
    ['BRONCE', 2, '26/07 12:00', 'SB', 'TC', 24, 29, 2, 3],
    ['BRONCE', 3, '08/08 12:00', 'HZ', 'MC', 0, 21, 0, 4],
    ['BRONCE', 3, '08/08 12:00', 'SJ', 'SB', 21, 0, 4, 0],
    ['BRONCE', 3, '09/08 13:00', 'TC', 'JK', 19, 10, 3, 1],
    ['BRONCE', 4, '06/09 12:00', 'MC', 'SB', 26, 31, 2, 3],
    ['BRONCE', 4, '06/09 12:00', 'JK', 'SJ', 21, 0, 4, 0],
    ['BRONCE', 4, '06/09 13:30', 'HZ', 'TC', 21, 0, 4, 0],
    ['BRONCE', 5, '12/09 12:00', 'SJ', 'HZ', 21, 0, 4, 0],
    ['BRONCE', 5, '12/09 15:30', 'SB', 'JK', 60, 19, 4, 1],
    ['BRONCE', 5, '18/09 20:30', 'TC', 'MC', 8, 17, 1, 3],
    // Final Four Copa Oro
    ['FFORO', 1, '24/10 13:00', 'TA', 'CP', 23, 5, 3, 1],
    ['FFORO', 1, '24/10 13:00', 'LA', 'MA', 5, 10, 2, 3],
    ['FFORO', 2, '31/10 15:00', 'MA', 'TA', null, null, null, null],
    ['FFORO', 2, '31/10 15:00', 'LA', 'CP', null, null, null, null],
    ['FFORO', 3, '07/11 15:00', 'TA', 'LA', null, null, null, null],
    ['FFORO', 3, '07/11 15:00', 'CP', 'MA', null, null, null, null],
    // Final Four Copa Plata
    ['FFPLATA', 1, '24/10 13:00', 'SA', 'BA', 22, 7, 3, 1],
    ['FFPLATA', 1, '25/10 11:30', 'US', 'ME', 0, 21, 0, 4],
    ['FFPLATA', 2, '31/10 15:00', 'ME', 'SA', null, null, null, null],
    ['FFPLATA', 2, '31/10 15:00', 'US', 'BA', null, null, null, null],
    ['FFPLATA', 3, '07/11 15:00', 'SA', 'US', null, null, null, null],
    ['FFPLATA', 3, '07/11 15:00', 'BA', 'ME', null, null, null, null],
    // Final Four Copa Bronce
    ['FFBRONCE', 1, '24/10 13:00', 'TQ', 'MB', 0, 12, 1, 3],
    ['FFBRONCE', 1, '24/10 13:00', 'AL', 'UM', 22, 19, 3, 2],
    ['FFBRONCE', 2, '31/10 15:00', 'UM', 'TQ', null, null, null, null],
    ['FFBRONCE', 2, '31/10 15:00', 'AL', 'MB', null, null, null, null],
    ['FFBRONCE', 3, '07/11 15:00', 'TQ', 'AL', null, null, null, null],
    ['FFBRONCE', 3, '07/11 15:00', 'MB', 'UM', null, null, null, null],
    // Final Four Copa Estímulo
    ['FFEST', 1, '24/10 12:00', 'LB', 'SJ', 21, 0, 4, 0],
    ['FFEST', 1, '24/10 12:00', 'TB', 'JK', 21, 0, 4, 0],
    ['FFEST', 2, '31/10 15:00', 'JK', 'LB', null, null, null, null],
    ['FFEST', 2, '31/10 15:00', 'TB', 'SJ', null, null, null, null],
    ['FFEST', 3, '07/11 15:00', 'LB', 'TB', null, null, null, null],
    ['FFEST', 3, '07/11 15:00', 'SJ', 'JK', null, null, null, null],
];

/** Puntos de tabla desde el corchete: 4 = 3+bonus, 3 = 3, 2 = (1+bonus | empate), 1 = 1, 0 = WO perdido. */
function puntos(h: number, a: number, pl: number, pv: number, wo: boolean) {
    const empate = h === a;
    const desglose = (pts: number, gana: boolean) => {
        if (empate) return { base: 2, bonus: 0 };
        if (wo) return { base: gana ? 3 : 0, bonus: gana ? 1 : 0 };
        if (gana) return { base: 3, bonus: pts - 3 };
        return { base: 1, bonus: pts - 1 };
    };
    const l = desglose(pl, h > a);
    const v = desglose(pv, a > h);
    return {
        home_base_points: l.base, home_bonus_points: l.bonus,
        away_base_points: v.base, away_bonus_points: v.bonus,
    };
}

function validar() {
    for (const f of P) {
        if (!CLUBES[f[3]] || !CLUBES[f[4]] || f[3] === f[4]) throw new Error(`Clubes mal: ${JSON.stringify(f)}`);
        if (f[5] === null) continue;
        const [h, a, pl, pv] = [f[5], f[6]!, f[7]!, f[8]!];
        const wo = (pl === 0 || pv === 0) && h !== a;
        const ganaL = h > a;
        const g = ganaL ? pl : pv;
        const p = ganaL ? pv : pl;
        if (h !== a) {
            if (wo ? g !== 4 : ![3, 4].includes(g)) throw new Error(`Puntos del ganador: ${JSON.stringify(f)}`);
            if (!wo && ![1, 2].includes(p)) throw new Error(`Puntos del perdedor: ${JSON.stringify(f)}`);
            if (wo && p !== 0) throw new Error(`WO mal: ${JSON.stringify(f)}`);
        } else if (pl !== 2 || pv !== 2) throw new Error(`Empate mal: ${JSON.stringify(f)}`);
    }
    const cruces = new Set<string>();
    for (const f of P) {
        const k = `${f[0]}|${f[1]}|${[f[3], f[4]].sort().join('|')}`;
        if (cruces.has(k)) throw new Error(`Cruce repetido: ${k}`);
        cruces.add(k);
    }
}

function iso(dm: string) {
    const [fecha, hora] = dm.split(' ');
    const [d, m] = fecha.split('/');
    return new Date(`2026-${m}-${d}T${hora}:00-03:00`).toISOString();
}

async function main() {
    validar();
    const jugados = P.filter((f) => f[5] !== null).length;
    console.log(`Partidos: ${P.length} (${jugados} jugados, ${P.length - jugados} pendientes)`);

    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    const ids = Object.values(CLUBES).map((c) => c.id);
    const { data: clubesDb } = await supabase.from('clubs').select('id').in('id', ids);
    const faltan = ids.filter((id) => !(clubesDb ?? []).some((c) => c.id === id));
    if (faltan.length) throw new Error(`No existen en clubs: ${faltan.join(', ')}`);

    const { data: modelos } = await supabase.from('tournaments').select('*').eq('id', TORNEO_MODELO).limit(1);
    const modelo = modelos?.[0];
    if (!modelo) throw new Error('No encuentro el torneo modelo.');
    const { data: fasesModelo } = await supabase.from('tournament_phases').select('settings').eq('id', FASE_MODELO).limit(1);
    const settingsModelo = fasesModelo?.[0]?.settings;
    if (!settingsModelo) throw new Error('No encuentro la fase modelo.');

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

    console.log(`\nTorneo "${NOMBRE}" (${SLUG}) · ${ids.length} clubes · ${RONDAS.length} rondas`);
    if (!APPLY) {
        console.log('Dry-run: no se escribió nada. Repetí con --apply.');
        return;
    }

    const ruleset = {
        ...modelo.ruleset,
        pointsWin: 3, pointsDraw: 2, pointsLoss: 1,
        pointsBonusTry: 1, pointsBonusLoss: 1, pointsBonusTryMode: 'difference',
    };

    if (!torneoId) {
        torneoId = randomUUID();
        seasonId = randomUUID();
        const { error: e1 } = await supabase.from('tournaments').insert([{
            id: torneoId, union_id: modelo.union_id, season_id: '2026',
            name: NOMBRE, original_name: NOMBRE, slug: SLUG,
            status: 'draft', is_active: false, is_visible: true,
            category: 'Juvenil', age_grade: 'M19',
            country: modelo.country, country_id: modelo.country_id, country_name: modelo.country_name,
            sport: modelo.sport, sport_id: modelo.sport_id, sport_name: modelo.sport_name,
            format: 'league', ruleset, ruleset_version: modelo.ruleset_version,
            review_status: 'approved', current_season_id: null,
        }]);
        if (e1) throw new Error(`Alta del torneo: ${e1.message}`);
        const { error: e2 } = await supabase.from('tournament_seasons').insert([{
            id: seasonId, tournament_id: torneoId, legacy_tournament_id: torneoId,
            season_code: '2026', name: `${NOMBRE} 2026`, display_name: `${NOMBRE} 2026`,
            status: 'active', is_active: true, format: 'league', ruleset,
            start_date: '2026-05-28', end_date: null,
            settings: { source: ORIGEN, nota: 'Fase 1, Copas Oro/Plata/Bronce, Reclasificación y Final Four' },
        }]);
        if (e2) throw new Error(`Alta de la temporada: ${e2.message}`);
        const { error: e3 } = await supabase.from('tournaments').update({ current_season_id: seasonId }).eq('id', torneoId);
        if (e3) throw new Error(`current_season_id: ${e3.message}`);
        console.log('+ torneo y temporada');
    }

    // ── rondas ───────────────────────────────────────────────────────────────
    const { data: fasesYa } = await supabase.from('tournament_phases').select('id, name').eq('tournament_id', torneoId);
    const faseId = new Map<Ronda, string>();
    for (const r of RONDAS) {
        const existente = (fasesYa ?? []).find((x) => x.name === r.nombre);
        if (existente) { faseId.set(r.k, existente.id); continue; }
        const settings = JSON.parse(JSON.stringify(settingsModelo));
        delete settings.standings; // tabla calculada, no manual
        delete settings.quickCreator;
        settings.teamsCount = r.equipos;
        settings.groupLabels = [];
        settings.groupTags = [];
        settings.tableTags = [];
        settings.advanceCount = 0;
        settings.legs = 1;
        settings.selectedTeamIds = [];
        settings.pointsSystem = { win: 3, draw: 2, loss: 1, bonusTry: 1, bonusLoss: 1 };
        settings.tiebreakers = [
            { order: 1, metric: 'points_table', enabled: true, priority: 1 },
            { order: 2, metric: 'head_to_head', enabled: true, priority: 2 },
            { order: 3, metric: 'points_diff', enabled: true, priority: 3 },
            { order: 4, metric: 'pointsFor', enabled: true, priority: 4 },
        ];
        const id = randomUUID();
        const { error } = await supabase.from('tournament_phases').insert([{
            id, tournament_id: torneoId, season_id: seasonId, name: r.nombre,
            phase_type: 'league', order_index: r.orden, is_active: r.orden === 1, settings,
        }]);
        if (error) throw new Error(`Ronda ${r.nombre}: ${error.message}`);
        faseId.set(r.k, id);
        console.log(`+ ronda ${r.nombre}`);
    }

    // ── participantes: las TRES tablas ───────────────────────────────────────
    const { data: yaPart } = await supabase.from('tournament_participants').select('id, club_id').eq('tournament_id', torneoId);
    const partId = new Map<string, string>((yaPart ?? []).map((p) => [p.club_id as string, p.id as string]));
    for (const c of Object.values(CLUBES)) {
        if (partId.has(c.id)) continue;
        const participantId = randomUUID();
        const entryId = randomUUID();
        const { error: e1 } = await supabase.from('tournament_participants').insert([{
            id: participantId, tournament_id: torneoId, season_id: seasonId, club_id: c.id,
            name: c.nombre, short_code: c.nombre, type: 'club', status: 'active', season_entry_id: null,
        }]);
        if (e1) throw new Error(`Participante ${c.id}: ${e1.message}`);
        const { error: e2 } = await supabase.from('team_season_entries').insert([{
            id: entryId, season_id: seasonId, tournament_id: torneoId, club_id: c.id, team_id: null,
            source_participant_id: participantId, status: 'active',
            settings: { source: ORIGEN, participant_type: 'club' },
        }]);
        if (e2) throw new Error(`Entrada ${c.id}: ${e2.message}`);
        const { error: e3 } = await supabase.from('tournament_participants')
            .update({ season_entry_id: entryId }).eq('id', participantId);
        if (e3) throw new Error(`Enganche ${c.id}: ${e3.message}`);
        partId.set(c.id, participantId);
    }
    console.log(`participantes: ${partId.size}`);

    // ── asignación a ronda: solo donde juega ─────────────────────────────────
    const { data: yaAsig } = await supabase.from('tournament_phase_participants').select('phase_id, participant_id').eq('tournament_id', torneoId);
    const asignados = new Set((yaAsig ?? []).map((a) => `${a.phase_id}|${a.participant_id}`));
    for (const r of RONDAS) {
        const claves = [...new Set(P.filter((f) => f[0] === r.k).flatMap((f) => [f[3], f[4]]))].sort();
        if (claves.length !== r.equipos) throw new Error(`${r.nombre}: ${claves.length} equipos, esperaba ${r.equipos}`);
        for (const k of claves) {
            const key = `${faseId.get(r.k)}|${partId.get(CLUBES[k].id)}`;
            if (asignados.has(key)) continue;
            const { error } = await supabase.from('tournament_phase_participants').insert([{
                tournament_id: torneoId, season_id: seasonId, phase_id: faseId.get(r.k),
                participant_id: partId.get(CLUBES[k].id), status: 'active',
            }]);
            if (error) throw new Error(`Asignación ${k} → ${r.nombre}: ${error.message}`);
        }
    }

    // ── partidos ─────────────────────────────────────────────────────────────
    const { data: yaMatches } = await supabase.from('matches')
        .select('id, phase_id, home_club_id, away_club_id').eq('tournament_id', torneoId);
    const existe = new Map((yaMatches ?? []).map((m) => [`${m.phase_id}|${m.home_club_id}|${m.away_club_id}`, m.id as string]));
    let nuevos = 0, actualizados = 0;
    for (const f of P) {
        const [rk, fechaN, dm, hk, ak, h, a, pl, pv] = f;
        const fase = faseId.get(rk)!;
        const home = CLUBES[hk].id, away = CLUBES[ak].id;
        const dateTime = iso(dm);
        const jugado = h !== null;
        const wo = jugado && h !== a && (pl === 0 || pv === 0);
        const resultado = jugado
            ? {
                status: 'final',
                score: { home: h, away: a },
                ...puntos(h!, a!, pl!, pv!, wo),
                points_autocalculated: false,
                points_override_reason: wo ? `Walkover (21-0). ${RAZON}` : RAZON,
            }
            : { status: 'scheduled', score: null };
        const base = {
            tournament_id: torneoId, season_id: seasonId, phase_id: fase,
            home_club_id: home, away_club_id: away, date_time: dateTime,
            round_label: `Fecha ${fechaN}`, is_visible: true, review_status: 'approved',
        };
        const id = existe.get(`${fase}|${home}|${away}`);
        if (id) {
            const { error } = await supabase.from('matches').update({ date_time: dateTime, round_label: base.round_label, ...resultado }).eq('id', id);
            if (error) throw new Error(`Update ${hk}-${ak}: ${error.message}`);
            actualizados += 1;
        } else {
            const { error } = await supabase.from('matches').insert([{ id: randomUUID(), ...base, ...resultado }]);
            if (error) throw new Error(`Insert ${hk}-${ak}: ${error.message}`);
            nuevos += 1;
        }
    }
    console.log(`partidos: ${nuevos} nuevos · ${actualizados} actualizados`);

    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    for (const r of RONDAS) {
        const res = await recalculatePhaseStandingsScopes(torneoId, faseId.get(r.k)!, 'general', seasonId);
        console.log('tabla', r.nombre, JSON.stringify(res)?.slice(0, 120));
    }

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
