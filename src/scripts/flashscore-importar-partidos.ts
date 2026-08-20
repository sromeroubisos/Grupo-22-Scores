/**
 * Baja a `matches` los partidos de un torneo del proveedor:
 *
 *   npx tsx src/scripts/flashscore-importar-partidos.ts --torneo=rugby-france-top-14 --plan
 *   npx tsx src/scripts/flashscore-importar-partidos.ts --torneo=rugby-france-top-14 --execute
 *   npx tsx src/scripts/flashscore-importar-partidos.ts --todos --temporada=187 --execute
 *
 * El problema que resuelve, medido: la ficha de un club importado muestra cero
 * partidos. No es la página —anda bien— es que no hay dato. De los 304 clubes
 * importados solo 2 tienen algún partido, y son los del amistoso cargado a mano.
 *
 * Y no alcanza con pedirle al proveedor los partidos DEL CLUB, porque en rugby
 * ese endpoint está vacío: `teams/results?team_id=8E1xxyQA` devuelve `[]`, y no
 * es un problema de parámetros (con `team_url` directamente rechaza pidiendo el
 * `team_id`). Es el mismo agujero de cobertura de siempre.
 *
 * Los partidos SÍ existen, pero solo adentro de los resultados del TORNEO. Por
 * eso la carga va por torneo y de ahí caen a los clubes: el equipo del proveedor
 * se resuelve contra `clubs.external_id`, que es justamente el id que dejó el
 * importador de clubes.
 *
 * Un equipo sin club en la base NO se inventa: se reporta y el partido se
 * saltea. Media tabla creada al vuelo con el nombre que abrevia el proveedor es
 * como se ensucia un catálogo curado.
 *
 * La llave contra duplicados es `external_id = flashscore:<match_id>`, la misma
 * convención que ya usan los 52.545 partidos cargados desde otras fuentes.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const RAPID_KEY = process.env.RAPIDAPI_KEY?.trim();
const RAPID_HOST = (process.env.RAPIDAPI_HOST || 'flashscore4.p.rapidapi.com').trim();

if (!URL_BASE || !KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
}
if (!RAPID_KEY) {
    console.error('Falta RAPIDAPI_KEY en .env.local');
    process.exit(1);
}

const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
const H_FS = { 'x-rapidapi-host': RAPID_HOST, 'x-rapidapi-key': RAPID_KEY };
const FUENTE = 'flashscore';

function arg(nombre: string): string | null {
    const prefijo = `--${nombre}=`;
    const encontrado = process.argv.find((a) => a.startsWith(prefijo));
    return encontrado ? encontrado.slice(prefijo.length) : null;
}

const EJECUTAR = process.argv.includes('--execute');
const TODOS = process.argv.includes('--todos');
const TEMPORADA = arg('temporada');
const SLUGS = (arg('torneo') || '').split(',').map((s) => s.trim()).filter(Boolean);
// Cuántas páginas de resultados pedir. Una temporada de liga entra en 2-3.
const PAGINAS = Number(arg('paginas') || 4);

if (!TODOS && SLUGS.length === 0) {
    console.error('Falta --torneo=<slug> (o --todos para los 65 vinculados)');
    process.exit(1);
}

type TorneoLocal = { id: string; slug: string; name: string; sport_id: string | null; ruleset: any };
type Resumen = { slug: string; nuevos: number; repetidos: number; sinClub: number; error?: string };

async function fs<T>(recurso: string): Promise<T | null> {
    const res = await fetch(`https://${RAPID_HOST}/api/flashscore/v2/${recurso}`, { headers: H_FS });
    if (!res.ok) return null;
    return (await res.json()) as T;
}

async function leer<T>(recurso: string): Promise<T> {
    const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { headers: H });
    if (!res.ok) throw new Error(`GET ${recurso}: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
}

async function insertar(tabla: string, filas: unknown[]): Promise<void> {
    // De a tandas: un insert de miles de filas se cae por tamaño de request.
    const TANDA = 500;
    for (let i = 0; i < filas.length; i += TANDA) {
        const res = await fetch(`${URL_BASE}/rest/v1/${tabla}`, {
            method: 'POST',
            headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
            body: JSON.stringify(filas.slice(i, i + TANDA)),
        });
        if (!res.ok) throw new Error(`POST ${tabla}: ${res.status} ${await res.text()}`);
    }
}

function aplanar(crudo: any): any[] {
    const base = crudo?.DATA ?? crudo ?? [];
    if (!Array.isArray(base)) return [];
    return base.flatMap((fila: any) => (Array.isArray(fila?.matches) ? fila.matches : [fila]));
}

async function procesarTorneo(
    torneo: TorneoLocal,
    clubesPorExternal: Map<string, string>,
    yaCargados: Set<string>,
): Promise<Resumen> {
    const fsConfig = torneo.ruleset?.external?.flashscore ?? {};
    const rutaTorneo = fsConfig.tournament_url;
    let templateId = fsConfig.tournament_template_id;

    if (!rutaTorneo) return { slug: torneo.slug, nuevos: 0, repetidos: 0, sinClub: 0, error: 'sin ruta del proveedor' };

    const ids = await fs<any>(`tournaments/ids?tournament_url=${encodeURIComponent(rutaTorneo)}`);
    const bundle = Array.isArray(ids) ? ids[0] : ids?.DATA ?? ids;
    templateId = templateId || bundle?.tournament_template_id;
    const seasonId = TEMPORADA || bundle?.season_id;

    if (!templateId || !seasonId) {
        return { slug: torneo.slug, nuevos: 0, repetidos: 0, sinClub: 0, error: 'no se resolvieron plantilla/temporada' };
    }

    console.log(`\n══ ${torneo.name}  (${torneo.slug})  plantilla=${templateId} temporada=${seasonId}`);

    const partidos: Array<{ raw: any; jugado: boolean }> = [];
    for (let pagina = 1; pagina <= PAGINAS; pagina += 1) {
        const crudo = await fs<any>(
            `tournaments/results?tournament_template_id=${templateId}&season_id=${seasonId}&page=${pagina}`,
        );
        const filas = aplanar(crudo);
        if (filas.length === 0) break;
        filas.forEach((raw) => partidos.push({ raw, jugado: true }));
    }
    const proximos = aplanar(await fs<any>(`tournaments/fixtures?tournament_template_id=${templateId}&season_id=${seasonId}`));
    proximos.forEach((raw) => partidos.push({ raw, jugado: false }));

    const filas: Record<string, unknown>[] = [];
    const sinClub = new Set<string>();
    let repetidos = 0;

    for (const { raw, jugado } of partidos) {
        const matchId = String(raw?.match_id || '').trim();
        if (!matchId) continue;

        const externalId = `${FUENTE}:${matchId}`;
        if (yaCargados.has(externalId)) { repetidos += 1; continue; }

        const localId = clubesPorExternal.get(String(raw?.home_team?.team_id || ''));
        const visitaId = clubesPorExternal.get(String(raw?.away_team?.team_id || ''));
        if (!localId || !visitaId) {
            if (!localId) sinClub.add(String(raw?.home_team?.name || raw?.home_team?.team_id));
            if (!visitaId) sinClub.add(String(raw?.away_team?.name || raw?.away_team?.team_id));
            continue;
        }

        const timestamp = Number(raw?.timestamp);
        if (!Number.isFinite(timestamp)) continue;

        const local = Number(raw?.scores?.home);
        const visita = Number(raw?.scores?.away);
        const conMarcador = jugado && Number.isFinite(local) && Number.isFinite(visita);

        yaCargados.add(externalId);
        filas.push({
            id: randomUUID(),
            tournament_id: torneo.id,
            date_time: new Date(timestamp * 1000).toISOString(),
            venue: null,
            status: conMarcador ? 'final' : 'scheduled',
            score: conMarcador ? { home: local, away: visita } : { home: 0, away: 0 },
            home_club_id: localId,
            away_club_id: visitaId,
            sport_id: torneo.sport_id || 'rugby',
            // `matches.season_id` es uuid y el del proveedor es un entero ("187"):
            // meterlo ahí devuelve 22P02 y voltea el insert entero. La temporada
            // ya viaja en la fecha del partido, y los históricos que cargó
            // rugbyarchive también lo dejan en null.
            external_id: externalId,
            is_visible: true,
            review_status: 'approved',
        });
    }

    const jugados = filas.filter((f: any) => f.status === 'final').length;
    console.log(`  ${filas.length} partidos nuevos (${jugados} jugados, ${filas.length - jugados} por jugar)`
        + `${repetidos ? ` · ${repetidos} ya estaban` : ''}`);
    if (sinClub.size > 0) {
        console.log(`  ! sin club en la base (partidos salteados): ${[...sinClub].join(', ')}`);
    }

    if (EJECUTAR) await insertar('matches', filas);

    return { slug: torneo.slug, nuevos: filas.length, repetidos, sinClub: sinClub.size };
}

async function main() {
    const filtro = TODOS ? '' : `&slug=in.(${SLUGS.join(',')})`;
    const torneos = await leer<TorneoLocal[]>(
        `tournaments?select=id,slug,name,sport_id,ruleset&data_source=eq.${FUENTE}${filtro}&order=slug.asc`,
    );
    if (torneos.length === 0) {
        console.error('Ningún torneo vinculado al proveedor con ese filtro.');
        process.exit(1);
    }

    // El puente club↔proveedor: el id que dejó el importador de clubes.
    const clubes = await leer<Array<{ id: string; external_id: string }>>(
        'clubs?select=id,external_id&external_id=not.is.null&limit=1000',
    );
    const clubesPorExternal = new Map(clubes.map((c) => [c.external_id, c.id]));
    console.log(`${torneos.length} torneos · ${clubesPorExternal.size} clubes con id del proveedor`);

    // Los external_id que ya están, para no cargar dos veces el mismo partido.
    const yaCargados = new Set<string>();
    let desde = 0;
    for (;;) {
        const pagina = await leer<Array<{ external_id: string }>>(
            `matches?select=external_id&external_id=like.${FUENTE}:*&order=external_id.asc&limit=1000&offset=${desde}`,
        );
        pagina.forEach((m) => yaCargados.add(m.external_id));
        if (pagina.length < 1000) break;
        desde += pagina.length;
    }
    if (yaCargados.size > 0) console.log(`${yaCargados.size} partidos del proveedor ya cargados`);

    const resumenes: Resumen[] = [];
    for (const torneo of torneos) {
        try {
            resumenes.push(await procesarTorneo(torneo, clubesPorExternal, yaCargados));
        } catch (error) {
            const mensaje = error instanceof Error ? error.message : String(error);
            console.log(`  FALLÓ: ${mensaje}`);
            resumenes.push({ slug: torneo.slug, nuevos: 0, repetidos: 0, sinClub: 0, error: mensaje });
        }
    }

    console.log('\n═══ Resumen');
    resumenes.forEach((r) => {
        const detalle = r.error
            ? `FALLÓ (${r.error})`
            : `${r.nuevos} nuevos${r.repetidos ? ` · ${r.repetidos} ya estaban` : ''}${r.sinClub ? ` · ${r.sinClub} equipos sin club` : ''}`;
        console.log(`  ${r.slug.padEnd(40)} ${detalle}`);
    });
    const total = resumenes.reduce((a, r) => a + r.nuevos, 0);

    console.log(EJECUTAR
        ? `\nListo: ${total} partidos cargados.`
        : `\n--plan: no se escribió nada. ${total} partidos entrarían. Repetí con --execute.`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
