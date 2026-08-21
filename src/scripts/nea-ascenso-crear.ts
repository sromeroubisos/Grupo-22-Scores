/**
 * Da de alta el Torneo Regional del NEA Ascenso 2026: el torneo, su temporada,
 * su fase, los ocho clubes y las siete fechas del fixture oficial.
 *
 *   npx tsx src/scripts/nea-ascenso-crear.ts --plan
 *   npx tsx src/scripts/nea-ascenso-crear.ts --execute
 *
 * Es la rama de abajo del Regional del NEA: los dos ultimos de la primera fase
 * del torneo grande (Sixty y CAPRI) mas seis clubes de las cuatro uniones del
 * nordeste. Reglamento y escudo se clonan del torneo padre — es la misma
 * competencia, no otra.
 *
 * El alta toca cinco tablas encadenadas y dos cadenas son circulares
 * (`current_season_id` y el par participante ↔ entrada de temporada), asi que
 * el orden importa y el script es RETOMABLE: si se corta a la mitad, volver a
 * correrlo completa lo que falte en vez de chocar contra el slug.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const EJECUTAR = process.argv.includes('--execute');

const NOMBRE = 'Torneo Regional del NEA Ascenso';
const SLUG = 'torneo-regional-del-nea-ascenso';
/** El torneo padre: de ahi salen el reglamento, el escudo y la union. */
const TORNEO_PADRE_ID = 'b0562cf3-4ea1-463e-86cb-86988dc22f10';

/**
 * Qompi es el unico del fixture que todavia no estaba en el catalogo. Es de la
 * Union de Rugby de Formosa, del barrio Namqom, a diez kilometros de la ciudad.
 * Nace sin escudo: es preferible el hueco a inventarle una identidad.
 */
const CLUB_NUEVO = {
    id: 'qompi',
    slug: 'qompi',
    name: 'Qompi Rugby Club',
    short_name: 'Qompi',
    union_id: 'union-de-rugby-de-formosa',
    city: 'Formosa',
    region: 'Formosa',
    country: 'Argentina',
    sport: 'rugby',
    sport_id: 'rugby',
    entity_type: 'club',
    status: 'active',
    visibility: 'visible',
    is_visible: true,
    logo_url: null as string | null,
};

/**
 * La planilla del Ascenso numera las fechas de 1 a 7 y no trae fechas de
 * calendario. Se usan los siete fines de semana de la segunda mitad del ano,
 * los mismos de la segunda fase del torneo grande: Sixty y CAPRI llegan al
 * Ascenso recien despues de la 9a fecha (16 de agosto), asi que el Ascenso no
 * puede haber empezado antes. Si la union publica los dias, se corrigen con un
 * update — el fixture (quien juega contra quien) es lo que no se toca.
 */
const FECHAS: { numero: number; fecha: string; partidos: [string, string][] }[] = [
    {
        numero: 1, fecha: '2026-08-22', partidos: [
            ['sixty-r-c', 'qompi'],
            ['tacuru-social-club', 'pay-ubre'],
            ['abipones', 'lomas-r-c-posadas'],
            ['capri', 'caza-y-pesca'],
        ],
    },
    {
        numero: 2, fecha: '2026-08-29', partidos: [
            ['caza-y-pesca', 'sixty-r-c'],
            ['lomas-r-c-posadas', 'capri'],
            ['pay-ubre', 'abipones'],
            ['qompi', 'tacuru-social-club'],
        ],
    },
    {
        numero: 3, fecha: '2026-09-05', partidos: [
            ['sixty-r-c', 'tacuru-social-club'],
            ['abipones', 'qompi'],
            ['capri', 'pay-ubre'],
            ['caza-y-pesca', 'lomas-r-c-posadas'],
        ],
    },
    {
        numero: 4, fecha: '2026-09-19', partidos: [
            ['lomas-r-c-posadas', 'sixty-r-c'],
            ['pay-ubre', 'caza-y-pesca'],
            ['qompi', 'capri'],
            ['tacuru-social-club', 'abipones'],
        ],
    },
    {
        numero: 5, fecha: '2026-10-03', partidos: [
            ['sixty-r-c', 'abipones'],
            ['capri', 'tacuru-social-club'],
            ['caza-y-pesca', 'qompi'],
            ['lomas-r-c-posadas', 'pay-ubre'],
        ],
    },
    {
        numero: 6, fecha: '2026-10-10', partidos: [
            ['pay-ubre', 'sixty-r-c'],
            ['qompi', 'lomas-r-c-posadas'],
            ['tacuru-social-club', 'caza-y-pesca'],
            ['abipones', 'capri'],
        ],
    },
    {
        numero: 7, fecha: '2026-10-17', partidos: [
            ['sixty-r-c', 'capri'],
            ['caza-y-pesca', 'abipones'],
            ['lomas-r-c-posadas', 'tacuru-social-club'],
            ['pay-ubre', 'qompi'],
        ],
    },
];

/** 19:00 UTC = 16:00 en Argentina, el horario del torneo padre. */
const HORA = 'T19:00:00+00:00';

const CLUBES = [...new Set(FECHAS.flatMap((f) => f.partidos.flat()))];

async function main() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    const { data: padres } = await supabase
        .from('tournaments')
        .select('id, name, ruleset, ruleset_version, logo_url, union_id, age_grade, category, country_id, country_name, sport_name')
        .eq('id', TORNEO_PADRE_ID)
        .limit(1);
    const padre = padres?.[0];
    if (!padre) { console.error('No existe el torneo padre.'); process.exit(1); }

    // ── que clubes estan y cual falta ────────────────────────────────────────
    const { data: clubesRaw } = await supabase
        .from('clubs')
        .select('id, name, short_name')
        .in('id', CLUBES);
    const existentes = new Map<string, { name: string; short_name: string | null }>(
        ((clubesRaw ?? []) as { id: string; name: string; short_name: string | null }[]).map((c) => [c.id, c]),
    );
    const faltan = CLUBES.filter((c) => !existentes.has(c));
    if (faltan.some((c) => c !== CLUB_NUEVO.id)) {
        console.error(`Faltan clubes que este script no sabe crear: ${faltan.filter((c) => c !== CLUB_NUEVO.id).join(', ')}`);
        process.exit(1);
    }

    console.log(`Clubes del fixture (${CLUBES.length}):`);
    for (const id of CLUBES) {
        const c = existentes.get(id);
        console.log(`  ${c ? '·' : '+'} ${id.padEnd(22)} ${c?.name ?? `${CLUB_NUEVO.name} (a crear, sin escudo)`}`);
    }

    // ── retomable ────────────────────────────────────────────────────────────
    const { data: yaExiste } = await supabase
        .from('tournaments')
        .select('id, name, current_season_id')
        .eq('slug', SLUG)
        .limit(1);
    let previo: { id: string; seasonId: string; faseId: string } | null = null;
    if (yaExiste?.length) {
        const { data: seasons } = await supabase
            .from('tournament_seasons').select('id, settings').eq('tournament_id', yaExiste[0].id).limit(1);
        const mio = (seasons?.[0]?.settings as { source?: string } | null)?.source === 'nea-ascenso-crear';
        if (!mio) {
            console.error(`\nYa hay un torneo con el slug "${SLUG}" que no creo este script. Nada que hacer.`);
            process.exit(1);
        }
        const { data: fases } = await supabase
            .from('tournament_phases').select('id').eq('tournament_id', yaExiste[0].id)
            .order('order_index', { ascending: true }).limit(1);
        previo = { id: yaExiste[0].id, seasonId: seasons![0].id, faseId: fases?.[0]?.id ?? '' };
        console.log(`\nRetomando "${yaExiste[0].name}": el torneo ya estaba creado por este script.`);
    }

    console.log(`\nTorneo: "${NOMBRE}" (${SLUG})`);
    console.log(`  reglamento y escudo clonados de "${padre.name}" · union ${padre.union_id}`);
    console.log(`  ${CLUBES.length} equipos · una rueda · ${FECHAS.length} fechas · ${FECHAS.length * 4} partidos`);
    for (const f of FECHAS) {
        console.log(`  Fecha ${f.numero} · ${f.fecha}`);
        for (const [l, v] of f.partidos) {
            const n = (id: string) => existentes.get(id)?.name ?? CLUB_NUEVO.name;
            console.log(`      ${n(l).padEnd(22)} vs ${n(v)}`);
        }
    }

    if (!EJECUTAR) {
        console.log('\n--plan: no se escribio nada. Repeti con --execute.');
        return;
    }

    // ── 1. el club que falta ─────────────────────────────────────────────────
    if (faltan.includes(CLUB_NUEVO.id)) {
        const { error } = await supabase.from('clubs').insert([CLUB_NUEVO]);
        if (error) { console.error(`Alta de ${CLUB_NUEVO.name} fallo (${error.message})`); process.exit(1); }
        console.log(`\n· club ${CLUB_NUEVO.id} creado (falta el escudo)`);
        existentes.set(CLUB_NUEVO.id, { name: CLUB_NUEVO.name, short_name: CLUB_NUEVO.short_name });
    }

    // ── 2. torneo → temporada → enganche (la FK circular) ────────────────────
    const torneoId = previo?.id ?? randomUUID();
    const seasonId = previo?.seasonId ?? randomUUID();
    const faseId = previo?.faseId || randomUUID();

    if (!previo) {
        const { error } = await supabase.from('tournaments').insert([{
            id: torneoId,
            union_id: padre.union_id,
            season_id: '2026',
            name: NOMBRE,
            original_name: NOMBRE,
            slug: SLUG,
            status: 'published',
            is_active: true,
            is_visible: true,
            category: padre.category,
            age_grade: padre.age_grade,
            country: 'Argentina',
            country_id: padre.country_id,
            country_name: padre.country_name,
            sport: 'rugby',
            sport_id: 'rugby',
            sport_name: padre.sport_name,
            format: 'league',
            ruleset: padre.ruleset,
            ruleset_version: padre.ruleset_version,
            logo_url: padre.logo_url,
            review_status: 'approved',
            // Apunta a una temporada que todavia no existe: primero el torneo,
            // despues la temporada, y recien ahi se lo enganchamos.
            current_season_id: null,
        }]);
        if (error) { console.error(`Alta del torneo fallo (${error.message})`); process.exit(1); }
        console.log(`· torneo creado (${torneoId})`);

        const { error: errSeason } = await supabase.from('tournament_seasons').insert([{
            id: seasonId,
            tournament_id: torneoId,
            legacy_tournament_id: torneoId,
            season_code: '2026',
            name: `${NOMBRE} 2026`,
            display_name: `${NOMBRE} 2026`,
            status: 'active',
            is_active: true,
            format: 'league',
            ruleset: {},
            settings: { source: 'nea-ascenso-crear' },
        }]);
        if (errSeason) { console.error(`Alta de la temporada fallo (${errSeason.message})`); process.exit(1); }

        const { error: errEnganche } = await supabase
            .from('tournaments').update({ current_season_id: seasonId }).eq('id', torneoId);
        if (errEnganche) { console.error(`No se pudo marcar la temporada actual (${errEnganche.message})`); process.exit(1); }
        console.log(`· temporada 2026 creada y enganchada (${seasonId})`);
    }

    // ── 3. la fase ───────────────────────────────────────────────────────────
    if (!previo?.faseId) {
        const { error } = await supabase.from('tournament_phases').insert([{
            id: faseId,
            tournament_id: torneoId,
            season_id: seasonId,
            name: 'Fase Regular',
            phase_type: 'league',
            order_index: 1,
            is_active: true,
            settings: {
                legs: 1,
                phaseMode: 'league',
                teamsCount: CLUBES.length,
                groupLabels: [],
                group_names: [],
                pointsSystem: { win: 4, draw: 2, loss: 0, bonusTry: 1, bonusLoss: 1 },
                tiebreakers: [
                    { label: 'Puntos obtenidos', order: 1, metric: 'points_table', enabled: true, priority: 1 },
                    { label: 'Diferencia de Tantos', order: 2, metric: 'points_diff', enabled: true, priority: 2 },
                ],
                // Sin tableTags: la planilla del Ascenso no dice cuantos suben
                // ni si hay play-off. Se agregan cuando la union lo publique.
                tableTags: [],
                selectedTeamIds: CLUBES,
                groupAssignments: {},
                playoffStages: [],
                playoffThirdPlace: false,
            },
        }]);
        if (error) { console.error(`Alta de la fase fallo (${error.message})`); process.exit(1); }
        console.log(`· fase creada (${faseId})`);
    }

    // ── 4. participantes: las TRES tablas, o el torneo se dibuja a medias ────
    const { data: yaParticipan } = await supabase
        .from('tournament_participants').select('id, club_id').eq('tournament_id', torneoId);
    const inscriptos = new Map<string, string>(
        ((yaParticipan ?? []) as { id: string; club_id: string }[]).map((p) => [p.club_id, p.id]),
    );

    const { data: yaAsignados } = await supabase
        .from('tournament_phase_participants').select('participant_id').eq('phase_id', faseId);
    const asignados = new Set(((yaAsignados ?? []) as { participant_id: string }[]).map((a) => a.participant_id));

    for (const clubId of CLUBES) {
        const club = existentes.get(clubId)!;
        let participantId = inscriptos.get(clubId);

        if (!participantId) {
            participantId = randomUUID();
            const entryId = randomUUID();
            // `tournament_participants.season_entry_id` y
            // `team_season_entries.source_participant_id` se apuntan mutuamente:
            // participante sin entrada, entrada, y el update que cierra el circulo.
            const { error: e1 } = await supabase.from('tournament_participants').insert([{
                id: participantId, tournament_id: torneoId, season_id: seasonId,
                club_id: clubId, name: club.name, short_code: club.short_name ?? club.name,
                type: 'club', status: 'active', season_entry_id: null,
            }]);
            if (e1) { console.error(`  ! ${club.name}: participante fallo (${e1.message})`); process.exit(1); }

            const { error: e2 } = await supabase.from('team_season_entries').insert([{
                id: entryId, season_id: seasonId, tournament_id: torneoId,
                club_id: clubId, team_id: null, source_participant_id: participantId,
                status: 'active', settings: { source: 'nea-ascenso-crear', participant_type: 'club' },
            }]);
            if (e2) { console.error(`  ! ${club.name}: entrada de temporada fallo (${e2.message})`); process.exit(1); }

            const { error: e2b } = await supabase.from('tournament_participants')
                .update({ season_entry_id: entryId }).eq('id', participantId);
            if (e2b) { console.error(`  ! ${club.name}: no se pudo enganchar la entrada (${e2b.message})`); process.exit(1); }
        }

        if (!asignados.has(participantId)) {
            const { error: e3 } = await supabase.from('tournament_phase_participants').insert([{
                id: randomUUID(), tournament_id: torneoId, season_id: seasonId,
                phase_id: faseId, participant_id: participantId, group_id: null, status: 'active',
            }]);
            if (e3) { console.error(`  ! ${club.name}: asignacion de fase fallo (${e3.message})`); process.exit(1); }
        }
    }
    console.log(`· ${CLUBES.length} participantes inscriptos y asignados a la fase`);

    // ── 5. las siete fechas ──────────────────────────────────────────────────
    const { data: yaPartidos } = await supabase
        .from('matches').select('home_club_id, away_club_id').eq('phase_id', faseId);
    const yaEsta = new Set(((yaPartidos ?? []) as { home_club_id: string; away_club_id: string }[]).map((m) => `${m.home_club_id}|${m.away_club_id}`));

    const altas = FECHAS.flatMap((f) => f.partidos
        .filter(([l, v]) => !yaEsta.has(`${l}|${v}`))
        .map(([local, visitante]) => ({
            id: randomUUID(),
            tournament_id: torneoId,
            season_id: seasonId,
            phase_id: faseId,
            round_label: `Fecha ${f.numero}`,
            date_time: `${f.fecha}${HORA}`,
            home_club_id: local,
            away_club_id: visitante,
            status: 'scheduled',
            score: { home: 0, away: 0 },
            sport: 'rugby',
            sport_id: 'rugby',
            is_visible: true,
            review_status: 'approved',
            points_autocalculated: true,
        })));

    if (altas.length) {
        for (let i = 0; i < altas.length; i += 50) {
            const { error } = await supabase.from('matches').insert(altas.slice(i, i + 50));
            if (error) { console.error(`Alta de partidos fallo (${error.message})`); process.exit(1); }
        }
        console.log(`· ${altas.length} partidos creados`);
    }

    // ── 6. la tabla, todavia en cero ─────────────────────────────────────────
    const { recalculatePhaseStandingsScopes } = await import('@/lib/server/recalculateStandings');
    const r = await recalculatePhaseStandingsScopes(torneoId, faseId, 'general', seasonId);
    console.log(`· tabla inicializada (${r.rows_calculated} filas, ok=${r.ok})`);

    console.log(`\nListo: "${NOMBRE}" con ${CLUBES.length} equipos y ${FECHAS.length * 4} partidos.`);
    console.log(`  /tournaments/${torneoId}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
