/**
 * Alta de la Tbilisi Cup 2026: el torneo, su temporada, la fase única, los seis
 * participantes y los nueve partidos.
 *
 *   npx tsx src/scripts/tbilisi-cup-2026.ts --plan
 *   npx tsx src/scripts/tbilisi-cup-2026.ts --execute
 *
 * Qué es: la pata georgiana del Toyota Challenge. Tres franquicias sudafricanas
 * (Cheetahs, Pumas, Griquas) contra las tres europeas (Black Lion, Lusitanos XV
 * y Castilla y León Iberians), todo en el Avchala Rugby Stadium de Tbilisi.
 * Nueve partidos en tres fechas, cruzados entre grupos —cada europeo juega
 * SOLO contra sudafricanos—, tabla única y sin playoffs.
 *
 * Los dos nombres son reales y conviene saberlo antes de volver a buscarlo: la
 * prensa sudafricana lo llama "Toyota Challenge" (la segunda pata del torneo
 * que arrancó en Bloemfontein en junio) y los organizadores georgianos lo
 * bautizaron "Tbilisi Cup", que es como está el afiche y como lo nombran la
 * FER y la prensa española. Va con el nombre de la competencia, no con el del
 * patrocinador de la otra pata.
 *
 * Ojo con el homónimo: el catálogo del proveedor ya tiene `rugby-irb-tbilisi-cup`,
 * que es la IRB Tbilisi Cup de SELECCIONES A (2012-2017). No es esta.
 *
 * ── LA HORA ────────────────────────────────────────────────────────────────
 * El afiche y la FER publican 14:00 / 17:00 / 20:00 en HORA LOCAL DE GEORGIA.
 * Georgia es UTC+4 todo el año (no tiene horario de verano), así que la resta
 * es fija y no depende de la fecha. La base guarda UTC: 10:00 / 13:00 / 16:00.
 * El fixture de acá abajo se escribe en hora de Tbilisi y la conversión la hace
 * el script a la vista, que es la única forma de que dentro de un año se pueda
 * auditar sin volver a buscar la fuente.
 *
 * ── LAS TRES TABLAS DEL PARTICIPANTE ───────────────────────────────────────
 * Inscribir un club no es una fila: `tournament_participants` (el vínculo),
 * `team_season_entries` (lo que LISTA la página cuando el torneo tiene
 * temporada) y `tournament_phase_participants` (de donde sale la TABLA de
 * posiciones). Las dos primeras se apuntan mutuamente por FK, así que van en
 * tres pasos: participante con entrada en NULL → entrada → PATCH del back-ref.
 * Faltando cualquiera de las tres el torneo se dibuja a medias y nadie avisa.
 *
 * Es retomable: cada paso relee qué hay y descuenta. Volver a correrlo no
 * duplica nada, y los partidos se reconocen por `external_id`.
 *
 * Fuentes:
 * - https://ferugby.es/horarios-y-rivales-confirmados-para-castilla-y-leon-iberians-en-la-tbilisi-cup/
 *   (nombre, sede, grupos, horarios en local y el sistema de puntaje)
 * - https://dfa.co.za/diamond-fields-advertiser/sport/2026-09-11-griquas-set-for-historic-international-rugby-tournament-in-georgia/
 *   (nueve partidos en tres fechas, tabla por puntos acumulados, sin playoffs)
 * - El afiche oficial de la Tbilisi Cup con las tres fechas completas.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
}

const EXECUTE = process.argv.includes('--execute');
if (!EXECUTE && !process.argv.includes('--plan')) {
    console.error('uso: tbilisi-cup-2026.ts --plan | --execute');
    process.exit(2);
}

const SLUG = 'tbilisi-cup';
const NOMBRE = 'Tbilisi Cup';
const TEMPORADA = '2026';
const SEDE = 'Avchala Rugby Stadium, Tbilisi';
/** Georgia no tiene horario de verano: UTC+4 los doce meses. */
const HUSO_TBILISI = 4;
const MARCA = 'tbilisi-cup-2026';

/* ── los seis ───────────────────────────────────────────────────────────────
 * `nuevo` es el que hay que dar de alta en `clubs`. Los otros cinco ya están:
 * Black Lion y Lusitanos entraron con la Challenge Cup, y los tres
 * sudafricanos con el catálogo del proveedor.
 *
 * El escudo NO se sube: los seis ya están en `public/clubs/<id>.png`, que es la
 * biblioteca local. La base guarda la RUTA, nunca el archivo.
 */
const CLUBES = [
    { id: 'black-lion', nombre: 'Black Lion', grupo: 'A', pais: 'Georgia', ciudad: 'Tbilisi', corto: 'Black Lion' },
    { id: 'lusitanos-xv', nombre: 'Lusitanos XV', grupo: 'A', pais: 'Portugal', ciudad: 'Lisboa', corto: 'Lusitanos' },
    { id: 'castilla-y-leon-iberians', nombre: 'Castilla y León Iberians', grupo: 'A', pais: 'España', ciudad: 'Valladolid', corto: 'Iberians' },
    { id: 'cheetahs', nombre: 'Cheetahs', grupo: 'B', pais: 'Sudáfrica', ciudad: 'Bloemfontein', corto: 'Cheetahs' },
    { id: 'pumas', nombre: 'Pumas', grupo: 'B', pais: 'Sudáfrica', ciudad: 'Mbombela', corto: 'Pumas' },
    { id: 'griquas', nombre: 'Griquas', grupo: 'B', pais: 'Sudáfrica', ciudad: 'Kimberley', corto: 'Griquas' },
] as const;

const ESCUDO_LOCAL: Record<string, string> = {
    'black-lion': '/clubs/black-lion.png',
    'lusitanos-xv': '/clubs/lusitanos-xv.png',
    'castilla-y-leon-iberians': '/clubs/castilla-y-leon-iberians.png',
};

/* ── el fixture, en hora de Tbilisi ─────────────────────────────────────── */
interface Partido { fecha: number; dia: string; hora: string; local: string; visita: string }
const FIXTURE: Partido[] = [
    { fecha: 1, dia: '2026-09-24', hora: '14:00', local: 'pumas', visita: 'castilla-y-leon-iberians' },
    { fecha: 1, dia: '2026-09-24', hora: '17:00', local: 'cheetahs', visita: 'lusitanos-xv' },
    { fecha: 1, dia: '2026-09-24', hora: '20:00', local: 'black-lion', visita: 'griquas' },
    { fecha: 2, dia: '2026-09-29', hora: '14:00', local: 'castilla-y-leon-iberians', visita: 'cheetahs' },
    { fecha: 2, dia: '2026-09-29', hora: '17:00', local: 'black-lion', visita: 'pumas' },
    { fecha: 2, dia: '2026-09-29', hora: '20:00', local: 'lusitanos-xv', visita: 'griquas' },
    { fecha: 3, dia: '2026-10-04', hora: '14:00', local: 'lusitanos-xv', visita: 'pumas' },
    { fecha: 3, dia: '2026-10-04', hora: '17:00', local: 'griquas', visita: 'castilla-y-leon-iberians' },
    { fecha: 3, dia: '2026-10-04', hora: '20:00', local: 'black-lion', visita: 'cheetahs' },
];

/** Hora de Tbilisi → UTC. La resta es fija porque Georgia no cambia de huso. */
function aUtc(dia: string, hora: string): string {
    const [h, m] = hora.split(':').map(Number);
    const utc = new Date(`${dia}T00:00:00Z`);
    utc.setUTCHours(h - HUSO_TBILISI, m, 0, 0);
    return utc.toISOString();
}

const externalIdDe = (p: Partido) => `${MARCA}:f${p.fecha}-${p.local}-vs-${p.visita}`;

/* ── el reglamento ──────────────────────────────────────────────────────────
 * Puntaje de rugby de toda la vida, el que publicó la FER: 4 por ganar, 2 por
 * empatar, bonus ofensivo por cuatro tries y defensivo por perder por 7 o
 * menos. Una sola fase: sin playoffs, la tabla al cierre de la tercera fecha es
 * el resultado del torneo.
 */
const STANDINGS = {
    points_base: { win: 4, draw: 2, loss: 0 },
    bonus_rules: [
        { id: 'try_bonus', label: '4+ Tries', points_awarded: 1 },
        { id: 'close_loss', label: 'Loss < 7 pts', points_awarded: 1 },
    ],
};
const TIEBREAKERS = { order: ['points', 'diff', 'head_to_head', 'tries', 'fair_play'] };
const RULESET = {
    phases: [{
        id: 'phase_1',
        legs: 1,
        name: 'Fase única',
        format: 'league',
        teamsCount: CLUBES.length,
        standings: STANDINGS,
        tiebreakers: TIEBREAKERS,
        group_names: [],
        groupLabels: [],
        playoffThirdPlace: false,
    }],
    stages: null,
    circuit: null,
    standings: STANDINGS,
    tiebreakers: TIEBREAKERS,
    competition: { format_type: 'league', parameters: { season_model: 'single_event', ranking_scope: 'match_points' } },
};

async function main() {
    const db = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });
    console.log(EXECUTE ? '── ESCRIBIENDO ──\n' : '── PLAN (no se escribe nada) ──\n');

    console.log(`${NOMBRE} ${TEMPORADA} · ${SEDE}`);
    for (const p of FIXTURE) {
        const l = CLUBES.find((c) => c.id === p.local)!.nombre;
        const v = CLUBES.find((c) => c.id === p.visita)!.nombre;
        console.log(`  F${p.fecha}  ${p.dia} ${p.hora} Tbilisi (${aUtc(p.dia, p.hora).slice(11, 16)} UTC)  ${l.padEnd(26)} vs  ${v}`);
    }

    /* ── 1. los clubes ─────────────────────────────────────────────────────── */
    const { data: yaEstan } = await db.from('clubs').select('id, name, country, logo_url').in('id', CLUBES.map((c) => c.id));
    const porId = new Map((yaEstan ?? []).map((c) => [c.id as string, c]));
    console.log('\nClubes:');
    for (const c of CLUBES) {
        const fila = porId.get(c.id);
        const estado = !fila ? 'A CREAR' : fila.country ? 'ya estaba' : 'a completar (sin país ni escudo)';
        console.log(`  ${fila ? '·' : '+'} ${c.nombre.padEnd(26)} ${c.id.padEnd(26)} ${estado}`);
        if (!EXECUTE) continue;

        if (!fila) {
            const { error } = await db.from('clubs').insert([{
                id: c.id, slug: c.id, name: c.nombre, short_name: c.corto,
                city: c.ciudad, country: c.pais,
                sport: 'rugby', sport_id: 'rugby', entity_type: 'club',
                status: 'active', visibility: 'visible', is_visible: true,
                logo_url: ESCUDO_LOCAL[c.id] ?? null,
            }]);
            if (error) { console.error(`    ✗ alta de club: ${error.message}`); process.exit(1); }
            console.log('    + club creado con escudo local');
            continue;
        }
        // Black Lion y Lusitanos entraron por la Challenge Cup sin país ni
        // escudo. Se completa lo que falta y no se pisa lo que ya hay.
        const parche: Record<string, unknown> = {};
        if (!fila.country) parche.country = c.pais;
        if (!fila.logo_url && ESCUDO_LOCAL[c.id]) parche.logo_url = ESCUDO_LOCAL[c.id];
        if (Object.keys(parche).length) {
            const { error } = await db.from('clubs').update(parche).eq('id', c.id);
            if (error) { console.error(`    ✗ completar club: ${error.message}`); process.exit(1); }
            console.log(`    · completado: ${Object.keys(parche).join(', ')}`);
        }
    }

    if (!EXECUTE) {
        console.log('\nSe crearían: 1 torneo, 1 temporada, 1 fase, 6 participantes (×3 tablas) y 9 partidos.');
        console.log('--plan: no se escribió nada. Repetí con --execute.');
        return;
    }

    /* ── 2. torneo + temporada (la FK es circular: la temporada se engancha después) ── */
    const { data: previos } = await db.from('tournaments').select('id, current_season_id').eq('slug', SLUG).limit(1);
    let torneoId = previos?.[0]?.id as string | undefined;
    let seasonId = previos?.[0]?.current_season_id as string | undefined;

    if (!torneoId) {
        torneoId = randomUUID();
        seasonId = randomUUID();
        const { error: e1 } = await db.from('tournaments').insert([{
            id: torneoId, season_id: TEMPORADA,
            name: NOMBRE, display_name: NOMBRE, original_name: NOMBRE, slug: SLUG,
            status: 'published', is_visible: true, is_active: true,
            age_grade: 'Mayores', country: 'Internacional', country_id: 'international', country_name: 'Internacional',
            sport: 'rugby', sport_id: 'rugby', sport_name: 'Rugby',
            format: 'league', ruleset: RULESET, review_status: 'approved',
            is_api_managed: false, data_source: MARCA,
            current_season_id: null,
        }]);
        if (e1) { console.error(`Alta del torneo falló: ${e1.message}`); process.exit(1); }

        const { error: e2 } = await db.from('tournament_seasons').insert([{
            id: seasonId, tournament_id: torneoId, legacy_tournament_id: torneoId,
            season_code: TEMPORADA, name: `${NOMBRE} ${TEMPORADA}`, display_name: `${NOMBRE} ${TEMPORADA}`,
            slug: `${SLUG}-${TEMPORADA}`, status: 'active', is_active: true,
            start_date: FIXTURE[0].dia, end_date: FIXTURE[FIXTURE.length - 1].dia,
            format: 'league', ruleset: RULESET, settings: { source: MARCA, venue: SEDE },
        }]);
        if (e2) { console.error(`Alta de la temporada falló: ${e2.message}`); process.exit(1); }

        const { error: e3 } = await db.from('tournaments').update({ current_season_id: seasonId }).eq('id', torneoId);
        if (e3) { console.error(`No se pudo marcar la temporada actual: ${e3.message}`); process.exit(1); }
        console.log(`\n+ torneo ${torneoId}\n+ temporada ${seasonId}`);
    } else {
        console.log(`\n· el torneo ya existía (${torneoId}); se completa lo que falte`);
    }

    /* ── 3. la fase ────────────────────────────────────────────────────────── */
    const { data: fasesYa } = await db.from('tournament_phases').select('id, name').eq('tournament_id', torneoId!);
    let faseId = fasesYa?.[0]?.id as string | undefined;
    if (!faseId) {
        faseId = randomUUID();
        const { error } = await db.from('tournament_phases').insert([{
            id: faseId, tournament_id: torneoId, season_id: seasonId,
            name: 'Fase única', phase_type: 'league', order_index: 1, is_active: true,
            settings: { teamsCount: CLUBES.length, legs: 1, standings: STANDINGS, tiebreakers: TIEBREAKERS },
        }]);
        if (error) { console.error(`Alta de la fase falló: ${error.message}`); process.exit(1); }
        console.log('+ fase única');
    }

    /* ── 4. participantes: las TRES tablas ─────────────────────────────────── */
    const { data: yaParticipan } = await db.from('tournament_participants').select('id, club_id').eq('tournament_id', torneoId!);
    const participantePorClub = new Map((yaParticipan ?? []).map((p) => [p.club_id as string, p.id as string]));

    for (const c of CLUBES) {
        if (participantePorClub.has(c.id)) continue;
        const participantId = randomUUID();
        const entryId = randomUUID();
        const { error: e1 } = await db.from('tournament_participants').insert([{
            id: participantId, tournament_id: torneoId, season_id: seasonId,
            club_id: c.id, name: c.nombre, short_code: c.corto, country_name: c.pais,
            type: 'club', status: 'active', season_entry_id: null,
        }]);
        if (e1) { console.error(`  ✗ ${c.nombre}: participante (${e1.message})`); process.exit(1); }
        const { error: e2 } = await db.from('team_season_entries').insert([{
            id: entryId, season_id: seasonId, tournament_id: torneoId,
            club_id: c.id, team_id: null, source_participant_id: participantId,
            // El grupo es de origen (los tres europeos y los tres sudafricanos);
            // no reparte la tabla, que es única. Queda anotado como dato.
            zone: `Grupo ${c.grupo}`, status: 'active',
            settings: { source: MARCA, participant_type: 'club' },
        }]);
        if (e2) { console.error(`  ✗ ${c.nombre}: entrada de temporada (${e2.message})`); process.exit(1); }
        const { error: e3 } = await db.from('tournament_participants').update({ season_entry_id: entryId }).eq('id', participantId);
        if (e3) { console.error(`  ✗ ${c.nombre}: back-ref de la entrada (${e3.message})`); process.exit(1); }
        participantePorClub.set(c.id, participantId);
        console.log(`  + ${c.nombre} inscripto`);
    }

    const { data: yaEnFase } = await db.from('tournament_phase_participants').select('participant_id').eq('phase_id', faseId!);
    const enFase = new Set((yaEnFase ?? []).map((x) => x.participant_id as string));
    for (const c of CLUBES) {
        const participantId = participantePorClub.get(c.id)!;
        if (enFase.has(participantId)) continue;
        const { error } = await db.from('tournament_phase_participants').insert([{
            id: randomUUID(), tournament_id: torneoId, season_id: seasonId,
            phase_id: faseId, participant_id: participantId, group_id: null, status: 'active',
        }]);
        if (error) { console.error(`  ✗ ${c.nombre} en la fase: ${error.message}`); process.exit(1); }
    }

    /* ── 5. los partidos ───────────────────────────────────────────────────── */
    const { data: partidosYa } = await db.from('matches').select('id, external_id').eq('tournament_id', torneoId!);
    const porExternal = new Map((partidosYa ?? []).map((m) => [m.external_id as string, m.id as string]));

    let nuevos = 0;
    for (const p of FIXTURE) {
        const externalId = externalIdDe(p);
        if (porExternal.has(externalId)) continue;
        const { error } = await db.from('matches').insert([{
            tournament_id: torneoId, phase_id: faseId, season_id: seasonId,
            home_club_id: p.local, away_club_id: p.visita,
            date_time: aUtc(p.dia, p.hora), venue: SEDE,
            status: 'scheduled', score: { home: 0, away: 0 },
            sport: 'rugby', sport_id: 'rugby',
            round_label: `Fecha ${p.fecha}`,
            is_visible: true, review_status: 'approved',
            external_id: externalId,
        }]);
        if (error) { console.error(`  ✗ ${externalId}: ${error.message}`); process.exit(1); }
        nuevos += 1;
    }
    console.log(`\n+ ${nuevos} partidos (${FIXTURE.length - nuevos} ya estaban)`);

    /* ── 6. la tabla ───────────────────────────────────────────────────────── */
    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    const r = await recalculatePhaseStandingsScopes(torneoId!, faseId!, 'general', seasonId ?? null);
    console.log(`tabla de posiciones: ${r.ok ? 'ok' : 'FALLÓ'} · ${r.rows_calculated} filas`);

    console.log(`\nListo: /tournaments/${torneoId}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
