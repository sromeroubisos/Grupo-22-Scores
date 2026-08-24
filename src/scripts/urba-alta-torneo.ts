/**
 * Alta de un torneo NUEVO de URBA, de la temporada en curso.
 *
 *   node src/scripts/urba-alta-torneo.ts --ids 2025318,2025320 --plan
 *   node src/scripts/urba-alta-torneo.ts --ids 2025318,2025320 --execute --publicar
 *
 * Existe porque `/api/cron/urba-sync` **no crea torneos a propósito**: los
 * reporta en `torneosNuevos` y espera que una persona los dé de alta. La razón
 * es que tres campos de `tournaments` no salen del payload de URBA —`division`
 * (→ `category`), `age_grade` y `gender`— y adivinarlos manda un torneo a la
 * sección equivocada sin que nada falle: `resolveTournamentAudience` mira el
 * grado ANTES que el nombre, así que un `mayores` puesto de más lleva la M18 a
 * la portada de mayores.
 *
 * Este script no los inventa tampoco. Los pide por flag, y si no se los dan
 * BUSCA UN HERMANO en la base —un torneo de URBA cuyo nombre comparte la raíz—
 * y muestra sus valores para que quien ejecuta los confirme a mano. Abortar
 * pidiendo confirmación es la única salida honesta: un default acá es una
 * clasificación silenciosa.
 *
 * ── El alta son CINCO tablas, y el orden no es negociable ──────────────────
 * `tournaments` → `tournament_phases` → `tournament_participants` →
 * `tournament_phase_participants` → `matches`. Cada paso necesita el UUID del
 * anterior, y los dos del medio son los que se olvidan:
 *
 *  · un partido sin `phase_id` no entra en ninguna tabla de posiciones (es el
 *    error que se cometió con los 126 de 2026, y por eso la fase se planifica
 *    junto al torneo en `tournamentRow.ts`);
 *  · un participante sin fila en `tournament_phase_participants` tampoco, un
 *    escalón más adentro: el motor no lee `tournament_participants`, lee la
 *    inscripción en la FASE (`loadPhaseScopedParticipants`).
 *
 * Los dos fallan igual, y es el peor modo posible: el torneo se ve, los partidos
 * se ven con su marcador, y la tabla sale VACÍA sin un solo error.
 * `recalculatePhaseStandingsScopes` responde `ok: true` con `rows_calculated: 0`
 * y conserva la tabla anterior, que en un torneo nuevo es la nada.
 *
 * ── Publicar o no ──────────────────────────────────────────────────────────
 * Por defecto entra OCULTO por las tres puertas (`is_visible=false`,
 * `is_active=false`, `status='draft'`), igual que el histórico: prender después
 * es un UPDATE, cargar visible y arrepentirse ya ensució el home.
 *
 * Pero ojo con la consecuencia, porque es la que importa: **el cron filtra por
 * `is_visible`**, así que un torneo oculto no se sincroniza nunca. Si el alta
 * es para que el torneo se actualice solo, va con `--publicar`, que lo deja
 * como sus hermanos ya publicados. La guarda de visibilidad del cron existe
 * porque el trigger de notificaciones no mira `is_visible`: publicar es decidir
 * que los avisos de esos partidos salgan.
 *
 * Se puede reanudar: antes de cada paso se relee qué hay y se descuenta. Volver
 * a correrlo no duplica.
 */
import fs from 'node:fs';
import path from 'node:path';

import { fetchChampionship } from '../lib/integrations/urba/client.ts';
import { categoriaDeTorneoUrba, buildUrbaTournamentExternalId } from '../lib/integrations/urba/externalId.ts';
import { planTournamentMatches, type MatchRow, type ParticipantRow } from '../lib/integrations/urba/planMatches.ts';
import { legsDeChampionship, planPhaseRow, planTournamentRow, PREFIJO_NOMBRE, type TournamentRow } from '../lib/integrations/urba/tournamentRow.ts';
import { temporadaEnCurso } from '../lib/integrations/urba/temporada.ts';

const REPO = process.cwd();
const LOG = path.join(REPO, 'URBA_ALTA_LOG.jsonl');
const ROLLBACK = path.join(REPO, 'URBA_ALTA_ROLLBACK.sql');

/** La misma marca que usaron la carga de 2026 y la histórica: hace exacto el DELETE. */
const MARCA = 'urba-import';
const LOGO_URL = '/competiciones/ar-urba.png';
const SPORT_ID = 'rugby';

const argv = process.argv.slice(2);
const flag = (nombre: string): string | null => {
    const i = argv.indexOf(`--${nombre}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const modo = argv.includes('--execute') ? 'execute' : argv.includes('--plan') ? 'plan' : null;
const publicar = argv.includes('--publicar');
const idsPedidos = (flag('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

if (!modo || !idsPedidos.length) {
    console.error('uso: --ids 2025318,2025320 (--plan | --execute) [--publicar]');
    console.error('     [--division Formativo] [--age-grade mayores] [--gender masculino]');
    process.exit(2);
}

const env: Record<string, string> = { ...(process.env as Record<string, string>) };
const envFile = path.join(REPO, '.env.local');
if (fs.existsSync(envFile)) {
    for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
        const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

async function selectAll<T = Record<string, unknown>>(recurso: string): Promise<T[]> {
    const filas: T[] = [];
    for (let desde = 0; ; desde += 1000) {
        const res = await fetch(`${URL_BASE}/rest/v1/${recurso}`, {
            headers: { ...H, range: `${desde}-${desde + 999}` },
        });
        if (!res.ok) throw new Error(`${recurso}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
        const chunk = (await res.json()) as T[];
        filas.push(...chunk);
        if (chunk.length < 1000) break;
    }
    return filas;
}

async function insertarYLeer<T = Record<string, unknown>>(tabla: string, filas: unknown): Promise<T[]> {
    const res = await fetch(`${URL_BASE}/rest/v1/${tabla}`, {
        method: 'POST',
        headers: { ...H, 'content-type': 'application/json', prefer: 'return=representation' },
        body: JSON.stringify(filas),
    });
    if (!res.ok) throw new Error(`POST ${tabla}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T[];
}

async function insertar(tabla: string, filas: unknown[]): Promise<{ ok: boolean; error?: string }> {
    if (!filas.length) return { ok: true };
    const res = await fetch(`${URL_BASE}/rest/v1/${tabla}`, {
        method: 'POST',
        headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
        body: JSON.stringify(filas),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `HTTP ${res.status} ${(await res.text()).slice(0, 300)}` };
}

const anotar = (e: unknown) => fs.appendFileSync(LOG, JSON.stringify(e) + '\n', 'utf8');

/**
 * La raíz del nombre: lo que queda al sacarle el último tramo después de " - ".
 * "Rugby Formativo - Campeonato A" → "Rugby Formativo". Sirve para encontrar el
 * hermano del que copiar la clasificación, y NO para clasificar solo: lo que
 * devuelve va a la pantalla para que una persona lo confirme.
 */
const raizDelNombre = (nombre: string) => {
    const partes = nombre.split(' - ');
    return partes.length > 1 ? partes.slice(0, -1).join(' - ') : nombre;
};

/**
 * La fila que se escribe. `planTournamentRow` devuelve `status: 'draft'` e
 * `is_active: false` como literales —es su politica— y publicar los cambia, asi
 * que el tipo de lo que viaja a la base los relaja a los dos.
 */
type FilaTorneo = Omit<TournamentRow, 'status' | 'is_active'> & { status: string; is_active: boolean };

interface Hermano {
    external_id: string; name: string; category: string | null;
    subcategory: string | null; age_grade: string | null; gender: string | null;
    is_visible: boolean; is_active: boolean; status: string | null;
}

async function main() {
    const ANIO = temporadaEnCurso();
    console.log(`modo: ${modo}${publicar ? ' · PUBLICAR' : ' · oculto'} · temporada ${ANIO}`);
    console.log(`ids pedidos: ${idsPedidos.join(', ')}\n`);

    console.log('leyendo la base…');
    const torneosEnBase = await selectAll<Hermano & { id: string; season_id: string | null }>(
        'tournaments?select=id,external_id,name,season_id,category,subcategory,age_grade,gender,is_visible,is_active,status&external_id=like.urba:*');
    const mapeo = await selectAll<{ external_id: string; club_id: string }>(
        'club_external_ids?select=external_id,club_id&provider=eq.urba');
    const clubes = await selectAll<{ id: string; name: string | null }>('clubs?select=id,name');
    const partidosEnBase = await selectAll<{ external_id: string }>(
        'matches?select=external_id&external_id=like.urba:*');

    const uuidPorExternal = new Map(torneosEnBase.map((t) => [t.external_id, t.id]));
    const porTriple = new Map(mapeo.map((m) => [m.external_id, m.club_id]));
    const nombrePorClub = new Map(clubes.map((c) => [c.id, c.name ?? '']));
    const yaEscritos = new Set(partidosEnBase.map((m) => m.external_id));
    console.log(`  torneos urba ${uuidPorExternal.size} · partidos ${yaEscritos.size} · triples ${porTriple.size}\n`);

    interface Tanda {
        externalId: string; nombre: string;
        fila: FilaTorneo;
        legs: 1 | 2; equipos: number;
        matches: MatchRow[]; participantes: ParticipantRow[];
        sinResolver: string[];
    }
    const tandas: Tanda[] = [];
    let faltaConfirmar = false;

    for (const id of idsPedidos) {
        const externalId = buildUrbaTournamentExternalId(id);
        /**
         * Un torneo que ya está NO se saltea: se completa.
         *
         * Saltearlo acá rompía la única cosa que este script promete —ser
         * reanudable—, y de la forma más silenciosa: una corrida que crea el
         * torneo y muere antes de inscribir los participantes en la fase deja
         * un torneo que se ve, con partidos, con tabla vacía. Volver a correrlo
         * decía "YA ESTÁ" y no arreglaba nada.
         *
         * Cada paso de la escritura relee qué hay y escribe sólo lo que falta,
         * así que pasar de largo el filtro es exactamente lo correcto. El paso 1
         * no hace UPDATE: una clasificación ya puesta a mano no se pisa.
         */
        const yaExiste = uuidPorExternal.has(externalId);

        // Sin `cacheDir` a propósito: un torneo que se está dando de alta HOY se
        // pide fresco. La caché de disco existe para el barrido del histórico,
        // donde releer 811 payloads que no cambian es la operación cara.
        const res = await fetchChampionship(id);
        if (!res.ok || !res.data) { console.error(`  ! ${externalId}: URBA no devolvió payload (HTTP ${res.status})`); continue; }
        const champ = res.data as { name?: string; teams?: Array<{ id: number; club_id: number | null; name?: string }> };
        const nombre = String(champ.name ?? '').trim();
        if (!nombre) { console.error(`  ! ${externalId}: el payload no trae nombre`); continue; }

        const categoria = categoriaDeTorneoUrba(nombre);
        if (!categoria) { console.error(`  ! ${externalId} "${nombre}": sin categoría derivable, no se puede resolver el triple de sus clubes`); continue; }

        // ── la clasificación: por flag, o del hermano, o se aborta ────────────
        const raiz = raizDelNombre(nombre);
        const hermanos = torneosEnBase.filter((t) =>
            (t.name ?? '').startsWith(`${PREFIJO_NOMBRE}${raiz}`) && t.external_id !== externalId);
        const delHermano = hermanos[0];

        const division = flag('division') ?? delHermano?.category ?? null;
        const ageGrade = flag('age-grade') ?? delHermano?.age_grade ?? null;
        const gender = flag('gender') ?? delHermano?.gender ?? null;

        console.log(`\n  ${externalId} "${nombre}"`);
        console.log(`    categoría del triple: ${categoria} · raíz del nombre: "${raiz}"`);
        if (hermanos.length) {
            console.log(`    hermanos en la base (${hermanos.length}):`);
            for (const h of hermanos.slice(0, 4)) {
                console.log(`      ${h.external_id} "${h.name}" — category=${h.category} age_grade=${h.age_grade} gender=${h.gender} subcategory=${h.subcategory} visible=${h.is_visible} status=${h.status}`);
            }
        } else {
            console.log('    hermanos en la base: NINGUNO');
        }
        if (!division || !ageGrade || !gender) {
            console.error(`    ! falta clasificación (division=${division} age_grade=${ageGrade} gender=${gender}).`);
            console.error('      Pasala a mano: --division X --age-grade Y --gender Z');
            faltaConfirmar = true;
            continue;
        }
        console.log(`    → category=${division} age_grade=${ageGrade} gender=${gender}`);

        const fila = planTournamentRow(
            { urba_id: id, nombre, anio: ANIO, division, age_grade: ageGrade, gender },
            { isVisible: publicar, logoUrl: LOGO_URL },
        );
        // `planTournamentRow` deja el torneo en borrador. Publicar es cambiar las
        // TRES puertas a la vez: `is_active` es la de RLS, `status` la del feed y
        // `is_visible` la que mira el cron. Prender una sola deja el torneo a
        // medio publicar, que es peor que oculto.
        const filaFinal: FilaTorneo = publicar
            ? { ...fila, is_active: true, status: 'published' }
            : fila;

        const plan = planTournamentMatches({
            championship: champ as never,
            tournamentId: '(pendiente)',
            categoria,
            subcategory: fila.subcategory,
            resolverClub: (t: string) => porTriple.get(t) ?? null,
            existentes: new Map(),
            participantesYaEnBase: new Set(),
            nombreDeClub: (cid: string) => nombrePorClub.get(cid) || null,
        });

        const equipos = (champ.teams ?? []).filter((t) => !/^bye$/i.test(String(t.name ?? ''))).length;
        const sinResolver = [...new Set(plan.omitidos.map((o) => o.motivo))];

        console.log(`    equipos ${equipos} · legs ${legsDeChampionship(champ as never)} · partidos a crear ${plan.crear.length} · participantes ${plan.participantesCrear.length}`);
        if (plan.omitidos.length) {
            console.log(`    OMITIDOS ${plan.omitidos.length}: ${sinResolver.join(' · ')}`);
        }

        tandas.push({
            externalId, nombre, fila: filaFinal,
            legs: legsDeChampionship(champ as never), equipos,
            matches: plan.crear.filter((f) => !yaEscritos.has(f.external_id)),
            participantes: plan.participantesCrear,
            sinResolver,
        });
    }

    if (faltaConfirmar) {
        console.error('\nHay torneos sin clasificación confirmada. No se escribió nada.');
        process.exit(1);
    }
    if (!tandas.length) { console.log('\nNada que dar de alta.'); return; }

    const nuevos = tandas.filter((t) => !uuidPorExternal.has(t.externalId)).length;
    const totalM = tandas.reduce((s, t) => s + t.matches.length, 0);
    const totalP = tandas.reduce((s, t) => s + t.participantes.length, 0);
    console.log(`\nplan: ${tandas.length} torneos · ${tandas.length} fases · ${totalM} partidos · ${totalP} participantes`);

    // ── el rollback, ANTES de escribir ────────────────────────────────────────
    const ids = tandas.map((t) => `'${t.externalId}'`).join(', ');
    const sql = [
        `-- Rollback del alta de ${tandas.length} torneos de URBA. Generado ANTES de ejecutar.`,
        `-- ${tandas.map((t) => `${t.externalId} "${t.nombre}"`).join(' · ')}`,
        '--',
        '-- El corte son los external_id EXACTOS de esta corrida: no toca ningún otro torneo.',
        '-- El orden es hijo -> padre: las FK no admiten el inverso.',
        '',
        'BEGIN;',
        '',
        '-- 1. Partidos',
        'DELETE FROM public.matches m USING public.tournaments t',
        `  WHERE m.tournament_id = t.id AND t.external_id IN (${ids});`,
        '',
        '-- 2. Participantes',
        'DELETE FROM public.tournament_participants p USING public.tournaments t',
        `  WHERE p.tournament_id = t.id AND t.external_id IN (${ids})`,
        `    AND p.notes = '${MARCA}';`,
        '',
        '-- 3. Inscripciones en la fase',
        'DELETE FROM public.tournament_phase_participants i USING public.tournaments t',
        `  WHERE i.tournament_id = t.id AND t.external_id IN (${ids});`,
        '',
        '-- 4. Fases',
        'DELETE FROM public.tournament_phases f USING public.tournaments t',
        `  WHERE f.tournament_id = t.id AND t.external_id IN (${ids});`,
        '',
        '-- 5. Torneos',
        `DELETE FROM public.tournaments WHERE external_id IN (${ids});`,
        '',
        'COMMIT;',
        '',
    ];
    fs.writeFileSync(ROLLBACK, sql.join('\n'), 'utf8');
    console.log(`rollback escrito: ${ROLLBACK}`);

    if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

    // ── la escritura ──────────────────────────────────────────────────────────
    anotar({ ts: new Date().toISOString(), evento: 'inicio', torneos: tandas.length, totalM, totalP, publicar });
    let hechosT = 0, hechosF = 0, hechosM = 0, hechosP = 0, hechosI = 0, fallidas = 0;

    for (const t of tandas) {
        try {
            // 1. el torneo — si ya está (reanudación), se reusa su UUID
            let uuid = uuidPorExternal.get(t.externalId);
            if (!uuid) {
                const creado = await insertarYLeer<{ id: string }>('tournaments', t.fila);
                uuid = creado[0]?.id;
                if (!uuid) throw new Error('el torneo se creó pero no devolvió id');
                uuidPorExternal.set(t.externalId, uuid);
                hechosT++;
            }

            // 2. la fase — antes que los partidos, porque le dan el phase_id
            const fases = await selectAll<{ id: string }>(
                `tournament_phases?select=id&tournament_id=eq.${uuid}&order=order_index`);
            let phaseId = fases[0]?.id;
            if (!phaseId) {
                const creada = await insertarYLeer<{ id: string }>('tournament_phases',
                    planPhaseRow({ tournamentId: uuid, teamsCount: t.equipos, legs: t.legs }));
                phaseId = creada[0]?.id;
                if (!phaseId) throw new Error('la fase se creó pero no devolvió id');
                hechosF++;
            }

            // 3. participantes — se relee justo antes: no hay UNIQUE donde apoyarse
            if (t.participantes.length) {
                const ahora = await selectAll<{ club_id: string }>(
                    `tournament_participants?select=club_id&tournament_id=eq.${uuid}`);
                const yaEsta = new Set(ahora.map((x) => x.club_id));
                const faltan = t.participantes
                    .filter((p) => !yaEsta.has(p.club_id))
                    .map((p) => ({ ...p, tournament_id: uuid, notes: MARCA }));
                const r = await insertar('tournament_participants', faltan);
                if (!r.ok) throw new Error(`participantes: ${r.error}`);
                hechosP += faltan.length;
            }

            /**
             * 4. La inscripción del participante EN LA FASE.
             *
             * Sin esto la tabla sale vacía y nada falla — el mismo modo de falla
             * que el `phase_id` del partido, un escalón más adentro. El motor no
             * lee `tournament_participants`: lee `tournament_phase_participants`
             * y con eso resuelve a qué participante corresponde cada club
             * (`loadPhaseScopedParticipants`). Si la tabla existe y no hay
             * asignaciones devuelve `[]`, y `recalculatePhaseStandingsScopes`
             * responde `ok: true` con `rows_calculated: 0`.
             *
             * `season_id` va en NULL a propósito: es lo que tienen las filas de
             * los 811 torneos de URBA ya cargados, y `loadPhaseScopedParticipants`
             * sólo filtra por temporada cuando se le pasa una. Poner un valor acá
             * y no en la fase dejaría la tabla fuera de alcance.
             */
            const participantesDelTorneo = await selectAll<{ id: string; club_id: string }>(
                `tournament_participants?select=id,club_id&tournament_id=eq.${uuid}`);
            const enLaFase = await selectAll<{ participant_id: string }>(
                `tournament_phase_participants?select=participant_id&tournament_id=eq.${uuid}&phase_id=eq.${phaseId}`);
            const yaInscripto = new Set(enLaFase.map((x) => x.participant_id));
            const inscribir = participantesDelTorneo
                .filter((p) => !yaInscripto.has(p.id))
                .map((p) => ({
                    tournament_id: uuid,
                    phase_id: phaseId,
                    participant_id: p.id,
                    season_id: null,
                    group_id: null,
                    status: 'active',
                    seed: null,
                    notes: MARCA,
                }));
            if (inscribir.length) {
                const r = await insertar('tournament_phase_participants', inscribir);
                if (!r.ok) throw new Error(`inscripción en la fase: ${r.error}`);
                hechosI += inscribir.length;
            }

            // 5. partidos, ya con su torneo y su fase
            if (t.matches.length) {
                const filas = t.matches.map((f) => ({
                    ...f, tournament_id: uuid, phase_id: phaseId,
                    sport_id: SPORT_ID, is_visible: publicar,
                }));
                const r = await insertar('matches', filas);
                if (!r.ok) throw new Error(`partidos: ${r.error}`);
                hechosM += filas.length;
            }

            console.log(`  ok ${t.externalId} → ${uuid}  (${t.matches.length} partidos, ${t.participantes.length} participantes, ${inscribir.length} inscripciones de fase)`);
            anotar({ ts: new Date().toISOString(), evento: 'ok', torneo: t.externalId, uuid, matches: t.matches.length });
        } catch (e) {
            fallidas++;
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`  FALLÓ ${t.externalId}: ${msg}`);
            anotar({ ts: new Date().toISOString(), evento: 'fallo', torneo: t.externalId, error: msg });
        }
    }

    anotar({ ts: new Date().toISOString(), evento: 'fin', hechosT, hechosF, hechosM, hechosP, hechosI, fallidas });
    console.log(`\nescritos: ${hechosT} torneos · ${hechosF} fases · ${hechosP} participantes · ${hechosI} inscripciones de fase · ${hechosM} partidos · fallidas ${fallidas}`);
    if (hechosT || hechosF || hechosP || hechosI || hechosM) {
        console.log('Falta la tabla: `/api/cron/urba-sync?scope=jornada&posiciones=todas` la rehace cuando el torneo entra en alcance.');
    }
    if (fallidas) {
        console.error('Quedaron tandas sin escribir. Volvé a correr --execute: sólo escribe lo que falta.');
        process.exit(1);
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
