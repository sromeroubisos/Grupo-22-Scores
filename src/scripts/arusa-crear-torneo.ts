/**
 * Da de alta en G22 una competencia de ARUSA que todavía no existe: el torneo,
 * su temporada, una fase por rama, los participantes y los clubes que falten.
 *
 *   npx tsx src/scripts/arusa-crear-torneo.ts --lev=1332975 \
 *     --nombre="M18 Primera de ARUSA" --sufijo=m18 --plan
 *   … --execute
 *
 * Después de crear, los partidos entran con el script de siempre:
 *   npx tsx src/scripts/arusa-torneo.ts --lev=… --torneo=<slug> --execute
 *   npx tsx src/scripts/arusa-recalcular.ts --torneo=<slug>
 *
 * `--ramas` elige qué ramas entran (por coma). Sin él entran todas las de tipo
 * `league`, cada una como una fase con el nombre que le pone ARUSA. Los
 * juveniles de Segunda tienen tres ("Clausura M18", "Zona 1", "Zona 2").
 *
 * `--sufijo` es lo que distingue a las FILIALES. Un club de ARUSA inscribe un
 * equipo por categoría y a veces dos en la misma, y cada uno es su propia ficha
 * —así lo hace ya la URBA con sus 976 fichas juveniles y las 94 `-intermedia`.
 * Con `--sufijo=m18`, "PWCC" pasa a ser `pwcc-m18` y "Old Boys Azul",
 * `old-boys-r-c-m18-azul`. Sin sufijo, cada equipo va a su club tal cual: eso
 * solo sirve para una competencia de primeros equipos.
 *
 * Quién es la madre lo dice `club_external_ids` (`club:{id de Leverade}`), que
 * llena `arusa-equivalencias.ts`. Si un club no está ahí, es una institución
 * nueva y nace sin sufijo.
 *
 * El torneo nace en `draft` y sin activar. Publicarlo es una decisión, no un
 * efecto de importarlo.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';

import { fetchCabecera, fetchPartidosDeGrupo } from '../lib/integrations/arusa/client.ts';
import { CLAVE_CLUB, CLAVE_EQUIPO, CLAVE_EQUIPO_RAMA, nombreDeFilial, normalizarNombre } from '../lib/integrations/arusa/sync.ts';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;
const EJECUTAR = process.argv.includes('--execute');
const LEV = arg('lev');
const NOMBRE = arg('nombre');
const SUFIJO = arg('sufijo');
const RAMAS = arg('ramas')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const MODELO = arg('modelo') || 'top-10-de-arusa';

if (!LEV || !NOMBRE) {
    console.error('Faltan --lev=<id de arusa.cl> y --nombre="<nombre del torneo en G22>"');
    process.exit(1);
}

const REGION = 'Santiago de Chile';
/** El único club del escalafón que no es de Santiago. */
const CIUDADES: Record<string, string> = { 'toros de quillota': 'Quillota' };

const aSlug = (nombre: string) => normalizarNombre(nombre).replace(/ /g, '-');
const clave = (s: string) => normalizarNombre(s).replace(/ /g, '');

/**
 * Lo que el nombre del equipo agrega al del club: "Old Boys Azul" sobre
 * "Old Boys R.C." es "azul". Si no comparten NINGUNA palabra, el nombre es un
 * apodo de la categoría entera ("Galas SF" es el femenino de Stade Francais) y
 * no distingue nada: ahí no hay resto.
 */
function distintivo(nombreEquipo: string, nombreClub: string): string | null {
    const club = new Set(normalizarNombre(nombreClub).split(' ').filter(Boolean));
    const equipo = normalizarNombre(nombreEquipo).split(' ').filter(Boolean);
    if (!equipo.some((t) => club.has(t))) return null;

    // Antes de mirar las palabras sueltas, la abreviatura: "Old Macks" sobre
    // "Old Mackayans" y "Sporting RC" sobre "Sporting R.C." no distinguen nada,
    // pero token a token dejarían un resto ("macks", "rc"). Si un nombre entra
    // letra a letra en el otro, es el mismo equipo escrito más corto.
    const compacto = (s: string) => normalizarNombre(s).replace(/ /g, '');
    const entraEn = (corto: string, largo: string) => {
        let i = 0;
        for (const c of largo) if (i < corto.length && corto[i] === c) i += 1;
        return i === corto.length;
    };
    // Solo en ese sentido: el equipo tiene que entrar en el club, no al revés.
    // "COBS" entra en "COBS Rojo", pero ahí el "Rojo" SÍ distingue —— es el
    // nombre del equipo el que puede ser una abreviatura del club, nunca al
    // revés.
    if (entraEn(compacto(nombreEquipo), compacto(nombreClub))) return null;

    const resto = equipo.filter((t) => !club.has(t));
    return resto.length ? resto.join('-') : null;
}

/** Color del escudo. En un escudo sobre fondo blanco el dominante suele ser el blanco: ahí, null. */
async function colorDelEscudo(bytes: Buffer): Promise<string | null> {
    try {
        const sharp = (await import('sharp')).default;
        const { dominant } = await sharp(bytes).stats();
        const { r, g, b } = dominant;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max > 235 && min > 210) return null;
        if (max < 30) return null;
        return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    } catch {
        return null;
    }
}

async function main() {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { persistClubLogo } = await import('@/lib/server/persistClubLogo');
    const supabase = createAdminClient();

    const slugTorneo = aSlug(NOMBRE!);

    // Si el torneo ya está, se retoma solo cuando lo hicimos nosotros: el alta
    // toca cinco tablas encadenadas y una corrida cortada a la mitad tiene que
    // poder terminarse sin borrar nada a mano.
    const { data: yaExiste } = await supabase.from('tournaments').select('id, name').eq('slug', slugTorneo).limit(1);
    let previo: { id: string; seasonId: string } | null = null;
    if (yaExiste?.length) {
        const { data: seasons } = await supabase
            .from('tournament_seasons').select('id, settings').eq('tournament_id', yaExiste[0].id).limit(1);
        if ((seasons?.[0]?.settings as { source?: string } | null)?.source !== 'arusa-crear-torneo') {
            console.error(`Ya hay un torneo con el slug "${slugTorneo}" (${yaExiste[0].name}) que no creó este script.`);
            process.exit(1);
        }
        previo = { id: yaExiste[0].id, seasonId: seasons![0].id };
        console.log(`Retomando "${yaExiste[0].name}".\n`);
    }

    const { data: modelos } = await supabase
        .from('tournaments')
        .select('id, name, ruleset, logo_url, age_grade, country_id, sport_name, country_name, ruleset_version')
        .eq('slug', MODELO).limit(1);
    const modelo = modelos?.[0];
    if (!modelo) { console.error(`No existe el torneo modelo "${MODELO}".`); process.exit(1); }
    const { data: fasesModelo } = await supabase
        .from('tournament_phases').select('phase_type, settings')
        .eq('tournament_id', modelo.id).order('order_index', { ascending: true }).limit(1);
    const faseModelo = fasesModelo?.[0];
    if (!faseModelo) { console.error(`El modelo "${MODELO}" no tiene fases.`); process.exit(1); }

    // ── la fuente ────────────────────────────────────────────────────────────
    const cabecera = await fetchCabecera(LEV!);
    const ligas = cabecera.grupos.filter((g) => g.tipo === 'league');
    const elegidas = RAMAS ? ligas.filter((g) => RAMAS.some((r) => clave(r) === clave(g.nombre))) : ligas;
    if (!elegidas.length) {
        console.error(`Ninguna rama coincide. La competencia tiene: ${cabecera.grupos.map((g) => `${g.nombre} [${g.tipo}]`).join(' · ')}`);
        process.exit(1);
    }

    console.log(`ARUSA  ${cabecera.nombre} · ${Object.keys(cabecera.equipos).length} equipos`);
    const partidosPorRama = new Map<string, Awaited<ReturnType<typeof fetchPartidosDeGrupo>>>();
    for (const rama of elegidas) {
        const partidos = await fetchPartidosDeGrupo(rama.id, cabecera.equipos);
        partidosPorRama.set(rama.id, partidos);
        const reales = partidos.filter((p) => !p.libre && !p.anulado);
        console.log(`       ${rama.nombre.padEnd(26)} ${String(reales.length).padStart(3)} partidos · ${reales.filter((p) => p.jugado).length} jugados`);
    }

    // ── qué club es cada equipo ──────────────────────────────────────────────
    const { data: equivRaw } = await supabase
        .from('club_external_ids').select('external_id, club_id').eq('provider', 'arusa').limit(2000);
    const equivalencias = new Map(((equivRaw ?? []) as { external_id: string; club_id: string }[])
        .map((e) => [e.external_id, e.club_id]));
    const { data: clubesRaw } = await supabase.from('clubs').select('id, name').eq('country', 'Chile').limit(2000);
    const nombrePorClub = new Map(((clubesRaw ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
    const idsTomados = new Set(nombrePorClub.keys());

    interface Inscripto {
        teamId: string; nombre: string; clubId: string;
        nuevo: boolean; madre: string | null; clubLev: string | null;
    }
    // Leverade cuelga los equipos de la COMPETENCIA, no de la rama: los diez de
    // Primera son los mismos en Titulares y en Intermedia. Por eso, cuando el
    // torneo toma una rama de una competencia con varias, el mapa que vale es
    // el de la rama, y el suelto (que apunta al primer equipo) no sirve.
    const porRamaPropia = elegidas.length < ligas.length;
    const plantel: Inscripto[] = [];
    for (const [teamId, nombre] of Object.entries(cabecera.equipos)) {
        const clubLev = cabecera.clubes[teamId];
        const yaMapeado = porRamaPropia
            ? elegidas.map((r) => equivalencias.get(CLAVE_EQUIPO_RAMA(r.id, teamId))).find(Boolean)
            : equivalencias.get(CLAVE_EQUIPO(teamId));
        if (yaMapeado) {
            plantel.push({ teamId, nombre, clubId: yaMapeado, nuevo: false, madre: null, clubLev });
            continue;
        }
        const madre = clubLev
            ? equivalencias.get(CLAVE_CLUB(clubLev)) ?? equivalencias.get(CLAVE_EQUIPO(teamId)) ?? null
            : null;
        let clubId: string;
        if (madre && SUFIJO) {
            const resto = distintivo(nombre, nombrePorClub.get(madre) ?? madre);
            clubId = [madre, SUFIJO, resto].filter(Boolean).join('-');
        } else if (madre) {
            clubId = madre;
        } else {
            clubId = SUFIJO ? `${aSlug(nombre)}-${SUFIJO}` : aSlug(nombre);
        }
        plantel.push({ teamId, nombre, clubId, nuevo: !idsTomados.has(clubId), madre, clubLev });
    }

    const repetidos = plantel.map((p) => p.clubId).filter((id, i, a) => a.indexOf(id) !== i);
    if (repetidos.length) {
        console.error(`\nDos equipos quieren la misma ficha: ${[...new Set(repetidos)].join(', ')}.`);
        console.error('Pasa cuando ARUSA los nombra igual. Resolvelo a mano antes de seguir.');
        process.exit(1);
    }

    const nuevos = plantel.filter((p) => p.nuevo);
    console.log(`\nClubes: ${plantel.length - nuevos.length} ya resueltos · ${nuevos.length} a crear`);
    for (const p of plantel) {
        const origen = p.nuevo ? (p.madre ? `filial de ${p.madre}` : 'institución nueva') : 'ya estaba';
        console.log(`  ${p.nuevo ? '+' : '·'} ${p.nombre.padEnd(24)} ${p.clubId.padEnd(34)} ${origen}`);
    }

    console.log(`\nTorneo a crear: "${NOMBRE}" (${slugTorneo}) · ${elegidas.length} fase(s): ${elegidas.map((g) => g.nombre).join(' · ')}`);
    if (!EJECUTAR) {
        console.log('\n--plan: no se escribió nada. Repetí con --execute.');
        return;
    }

    // ── clubes nuevos ────────────────────────────────────────────────────────
    for (const p of nuevos) {
        const url = cabecera.escudos[p.teamId];
        let logoUrl: string | null = null;
        let color: string | null = null;
        if (url) {
            try {
                const res = await fetch(url);
                if (res.ok) {
                    const bytes = Buffer.from(await res.arrayBuffer());
                    const mime = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
                    const guardado = await persistClubLogo(p.clubId, `data:${mime};base64,${bytes.toString('base64')}`, { supabaseClient: supabase });
                    logoUrl = guardado.url;
                    if (guardado.warning) console.warn(`  ! ${p.nombre}: ${guardado.warning}`);
                    color = await colorDelEscudo(bytes);
                }
            } catch (e) {
                console.warn(`  ! ${p.nombre}: no se pudo traer el escudo (${e instanceof Error ? e.message : e})`);
            }
        }
        // Una filial sin escudo propio usa el de la madre: es el mismo club.
        if (!logoUrl && p.madre) {
            const { data: padre } = await supabase.from('clubs').select('logo_url, primary_color').eq('id', p.madre).limit(1);
            logoUrl = padre?.[0]?.logo_url ?? null;
            color ??= padre?.[0]?.primary_color ?? null;
        }

        const { error } = await supabase.from('clubs').insert([{
            id: p.clubId, slug: p.clubId,
            // La categoría va EN el nombre: sin eso, un club con ocho equipos
            // aparece ocho veces como "PWCC" en el buscador.
            name: nombreDeFilial(p.nombre, p.madre ? SUFIJO : null),
            short_name: nombreDeFilial(p.nombre, p.madre ? SUFIJO : null),
            union_id: 'arusa',
            city: CIUDADES[normalizarNombre(p.nombre)] ?? REGION,
            region: REGION, country: 'Chile',
            sport: 'rugby', sport_id: 'rugby', entity_type: 'club',
            status: 'active', visibility: 'visible', is_visible: true,
            logo_url: logoUrl, primary_color: color,
        }]);
        if (error) { console.error(`  ! ${p.nombre}: alta de club falló (${error.message})`); process.exit(1); }
        console.log(`  + club ${p.clubId}${logoUrl ? ' con escudo' : ''}`);
    }

    // El mapa equipo→club, y el club madre si es una institución nueva.
    const equivNuevas: Array<Record<string, unknown>> = [];
    for (const p of plantel) {
        // Una fila por rama, siempre: es la que distingue a la Intermedia del
        // primer equipo. La suelta se escribe solo si nadie la tiene todavía,
        // para no pisar la del primer equipo con la de una filial.
        for (const rama of elegidas) {
            equivNuevas.push({ provider: 'arusa', external_id: CLAVE_EQUIPO_RAMA(rama.id, p.teamId), club_id: p.clubId, categoria: SUFIJO ?? null });
        }
        if (!equivalencias.has(CLAVE_EQUIPO(p.teamId))) {
            equivNuevas.push({ provider: 'arusa', external_id: CLAVE_EQUIPO(p.teamId), club_id: p.clubId, categoria: SUFIJO ?? null });
            equivalencias.set(CLAVE_EQUIPO(p.teamId), p.clubId);
        }
        if (p.clubLev && !p.madre && !equivalencias.has(CLAVE_CLUB(p.clubLev))) {
            equivNuevas.push({ provider: 'arusa', external_id: CLAVE_CLUB(p.clubLev), club_id: p.clubId, categoria: null });
            equivalencias.set(CLAVE_CLUB(p.clubLev), p.clubId);
        }
    }
    const { error: errEquiv } = await supabase.from('club_external_ids').upsert(equivNuevas, { onConflict: 'provider,external_id' });
    if (errEquiv) { console.error(`No se pudieron escribir las equivalencias (${errEquiv.message})`); process.exit(1); }

    // ── torneo, temporada y fases ────────────────────────────────────────────
    const ruleset = JSON.parse(JSON.stringify(modelo.ruleset));
    if (ruleset?.phases?.[0]) {
        ruleset.phases[0].teamsCount = plantel.length;
        ruleset.phases[0].groupLabels = (ruleset.phases[0].groupLabels ?? [])
            .filter((l: { name?: string }) => l.name !== 'Descenso' || elegidas[0].desciende > 0);
    }

    const torneoId = previo?.id ?? randomUUID();
    const seasonId = previo?.seasonId ?? randomUUID();

    if (!previo) {
        const { error: e1 } = await supabase.from('tournaments').insert([{
            id: torneoId, union_id: 'arusa', season_id: '2026',
            name: NOMBRE, original_name: NOMBRE, slug: slugTorneo,
            status: 'draft', is_active: false, is_visible: true,
            age_grade: modelo.age_grade, region: REGION, country: 'Chile',
            country_id: modelo.country_id, country_name: modelo.country_name,
            sport: 'rugby', sport_id: 'rugby', sport_name: modelo.sport_name,
            format: 'league', ruleset, ruleset_version: modelo.ruleset_version,
            logo_url: modelo.logo_url, review_status: 'approved',
            // La FK exige que la temporada exista antes: se engancha después.
            current_season_id: null,
        }]);
        if (e1) { console.error(`Alta del torneo falló (${e1.message})`); process.exit(1); }

        const { error: e2 } = await supabase.from('tournament_seasons').insert([{
            id: seasonId, tournament_id: torneoId, legacy_tournament_id: torneoId,
            season_code: '2026', name: NOMBRE, display_name: NOMBRE, slug: slugTorneo,
            status: 'draft', is_active: false, format: 'league', ruleset,
            settings: { source: 'arusa-crear-torneo', leverade_tournament: LEV, sufijo: SUFIJO ?? null },
        }]);
        if (e2) { console.error(`Alta de la temporada falló (${e2.message})`); process.exit(1); }

        const { error: e3 } = await supabase.from('tournaments').update({ current_season_id: seasonId }).eq('id', torneoId);
        if (e3) { console.error(`No se pudo marcar la temporada actual (${e3.message})`); process.exit(1); }
    }

    const { data: fasesYa } = await supabase.from('tournament_phases').select('id, name').eq('tournament_id', torneoId);
    const faseIdPorRama = new Map<string, string>();
    for (const [i, rama] of elegidas.entries()) {
        const existente = (fasesYa ?? []).find((f) => clave(f.name) === clave(rama.nombre));
        if (existente) { faseIdPorRama.set(rama.id, existente.id); continue; }

        const settings = JSON.parse(JSON.stringify(faseModelo.settings ?? {}));
        const equiposDeLaRama = new Set<string>();
        for (const p of partidosPorRama.get(rama.id) ?? []) {
            if (p.local) equiposDeLaRama.add(p.local.id);
            if (p.visita) equiposDeLaRama.add(p.visita.id);
        }
        settings.teamsCount = equiposDeLaRama.size;
        if (!rama.desciende) {
            settings.groupTags = (settings.groupTags ?? []).filter((t: string) => t !== 'Descenso');
            settings.groupLabels = (settings.groupLabels ?? []).filter((l: { name?: string }) => l.name !== 'Descenso');
        }
        const faseId = randomUUID();
        const { error } = await supabase.from('tournament_phases').insert([{
            id: faseId, tournament_id: torneoId, season_id: seasonId,
            name: rama.nombre, phase_type: faseModelo.phase_type,
            // `tournament_phases_one_active_idx` deja UNA sola fase activa por
            // torneo: la primera, que es la fase regular. Cuál se muestra
            // después es una decisión del gestor, no del import.
            order_index: i + 1, is_active: i === 0, settings,
        }]);
        if (error) { console.error(`Alta de la fase "${rama.nombre}" falló (${error.message})`); process.exit(1); }
        faseIdPorRama.set(rama.id, faseId);
        console.log(`  + fase ${rama.nombre} (${equiposDeLaRama.size} equipos)`);
    }

    // ── participantes: las TRES tablas, o el torneo se dibuja a medias ───────
    const { data: yaParticipan } = await supabase
        .from('tournament_participants').select('id, club_id').eq('tournament_id', torneoId).limit(500);
    const idPorClub = new Map(((yaParticipan ?? []) as { id: string; club_id: string }[]).map((p) => [p.club_id, p.id]));

    for (const p of plantel) {
        if (idPorClub.has(p.clubId)) continue;
        const participantId = randomUUID();
        const entryId = randomUUID();
        const { error: e1 } = await supabase.from('tournament_participants').insert([{
            id: participantId, tournament_id: torneoId, season_id: seasonId,
            club_id: p.clubId, name: p.nombre, short_code: p.nombre,
            type: 'club', status: 'active', season_entry_id: null,
        }]);
        if (e1) { console.error(`  ! ${p.nombre}: participante falló (${e1.message})`); process.exit(1); }
        const { error: e2 } = await supabase.from('team_season_entries').insert([{
            id: entryId, season_id: seasonId, tournament_id: torneoId,
            club_id: p.clubId, team_id: null, source_participant_id: participantId,
            status: 'active', settings: { source: 'arusa-crear-torneo', participant_type: 'club' },
        }]);
        if (e2) { console.error(`  ! ${p.nombre}: entrada de temporada falló (${e2.message})`); process.exit(1); }
        const { error: e3 } = await supabase.from('tournament_participants')
            .update({ season_entry_id: entryId }).eq('id', participantId);
        if (e3) { console.error(`  ! ${p.nombre}: no se pudo enganchar la entrada (${e3.message})`); process.exit(1); }
        idPorClub.set(p.clubId, participantId);
    }

    // Cada equipo entra SOLO a las fases donde de verdad juega: en los
    // juveniles de Segunda las zonas se reparten el plantel.
    const { data: yaEnFase } = await supabase
        .from('tournament_phase_participants').select('phase_id, participant_id').eq('tournament_id', torneoId).limit(2000);
    const enFase = new Set(((yaEnFase ?? []) as { phase_id: string; participant_id: string }[])
        .map((x) => `${x.phase_id}|${x.participant_id}`));

    for (const rama of elegidas) {
        const faseId = faseIdPorRama.get(rama.id)!;
        const equipos = new Set<string>();
        for (const partido of partidosPorRama.get(rama.id) ?? []) {
            if (partido.local) equipos.add(partido.local.id);
            if (partido.visita) equipos.add(partido.visita.id);
        }
        for (const teamId of equipos) {
            const clubId = plantel.find((p) => p.teamId === teamId)?.clubId;
            const participantId = clubId ? idPorClub.get(clubId) : null;
            if (!participantId || enFase.has(`${faseId}|${participantId}`)) continue;
            const { error } = await supabase.from('tournament_phase_participants').insert([{
                id: randomUUID(), tournament_id: torneoId, season_id: seasonId,
                phase_id: faseId, participant_id: participantId, group_id: null, status: 'active',
            }]);
            if (error) { console.error(`  ! ${clubId} en "${rama.nombre}": ${error.message}`); process.exit(1); }
        }
    }

    console.log(`\nListo: "${NOMBRE}" con ${plantel.length} participantes y ${elegidas.length} fase(s).`);
    console.log('Ahora los partidos:');
    console.log(`  npx tsx src/scripts/arusa-torneo.ts --lev=${LEV} --torneo=${slugTorneo} --execute`);
    console.log(`  npx tsx src/scripts/arusa-recalcular.ts --torneo=${slugTorneo}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
