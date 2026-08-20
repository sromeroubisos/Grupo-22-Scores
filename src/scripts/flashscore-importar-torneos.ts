/**
 * Guarda como TORNEOS de la base los del catálogo de código que viven en el
 * proveedor:
 *
 *   npx tsx src/scripts/flashscore-importar-torneos.ts --plan
 *   npx tsx src/scripts/flashscore-importar-torneos.ts --execute
 *
 * Qué cambia y qué NO. La fila guarda IDENTIDAD y VÍNCULO, nunca partidos:
 * nombre, escudo, país, orden, visibilidad, y la ruta del proveedor en
 * `ruleset.external.flashscore.tournament_url`. Resultados, próximos partidos y
 * posiciones se siguen pidiendo al proveedor en cada visita, igual que hoy. El
 * torneo no se "congela" al guardarse.
 *
 * Por qué el vínculo es la URL y no los ids de temporada: el bundle de
 * `tournaments/ids?tournament_url=` apunta SIEMPRE a la temporada corriente. Si
 * la fila guardara `tournament_id` / `tournament_stage_id` / `season_id`, el
 * torneo quedaría mirando para siempre el año en que se importó —exactamente lo
 * que dejó al Top 14 con la tabla en cero—. Guardando la URL, la resolución es
 * UNA llamada memoizada 24h y siempre cae en la temporada que corre.
 * `persistResolvedTournamentIds` acompaña: durable va solo lo estable.
 *
 * El slug es el id del catálogo (`rugby-france-top-14`) a propósito: la ruta
 * `/tournaments/<id>` resuelve por uuid O por slug, así que los links que ya
 * circulan siguen andando y pasan a servirse de la fila nueva.
 *
 * Y el listado público no se duplica: `uniqueTournamentsByIdentity` en
 * /tournaments deduplica por país + nombre y le da prioridad a la fila de base
 * sobre la entrada de catálogo. Por eso este script chequea el par
 * (país, nombre) antes de crear: dos filas con el mismo par sí serían un
 * duplicado real, y ninguna dedup las salvaría.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';

import { getAllRugbyTournaments } from '../lib/data/tournaments/rugby.ts';
import { resolveTournamentCountryLabel } from '../lib/data/countries.ts';

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

const EJECUTAR = process.argv.includes('--execute');
// Nace oculto en vez de publicado. El default es publicado porque el sentido de
// guardarlo es que se vea; --borrador es para revisar antes.
const BORRADOR = process.argv.includes('--borrador');

const PAIS_POR_UNION: Record<string, string> = { wales: 'Gales', scotland: 'Escocia' };

/**
 * El rugby argentino no entra por acá. La URBA ya está en la base con su propio
 * cron oficial —"URBA: TOP 14 - Superior" y sus 27 divisiones, temporada 2026—,
 * y la versión del proveedor es una sola tabla más flaca con otro nombre: la
 * dedup por país + nombre no la agarraría y quedarían las dos publicadas.
 * Mismo criterio que con los clubes, y por la misma razón: el catálogo argentino
 * está curado y se carga por sus propios seeders.
 */
const RUTAS_EXCLUIDAS = [/^\/rugby-union\/argentina\//i];

type FilaTorneo = Record<string, unknown>;
type TorneoExistente = { id: string; name: string; slug: string | null; country_id: string | null };

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
    if (!filas.length) return;
    const res = await fetch(`${URL_BASE}/rest/v1/${tabla}`, {
        method: 'POST',
        headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
        body: JSON.stringify(filas),
    });
    if (!res.ok) throw new Error(`POST ${tabla}: ${res.status} ${await res.text()}`);
}

/** La misma identidad que usa el listado público: país + nombre, sin acentos. */
function claveDeIdentidad(pais: string | null | undefined, nombre: string): string {
    const limpiar = (v: string) =>
        String(v || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '');
    return `${limpiar(pais || 'international')}::${limpiar(nombre)}`;
}

function paisEnCastellano(countryId: string | undefined, url: string): string | null {
    if (countryId && countryId !== 'international') {
        const porId = PAIS_POR_UNION[countryId] || resolveTournamentCountryLabel(countryId);
        if (porId) return porId;
    }
    const segmento = url.split('/').filter(Boolean)[1];
    if (!segmento) return null;
    return PAIS_POR_UNION[segmento] || resolveTournamentCountryLabel(segmento);
}

async function main() {
    const catalogo = getAllRugbyTournaments().filter((t) => Boolean(t.url));
    console.log(`Catálogo de rugby: ${catalogo.length} torneos con ruta del proveedor\n`);

    const existentes: TorneoExistente[] = [];
    let desde = 0;
    for (;;) {
        const pagina = await leer<TorneoExistente[]>(
            `tournaments?select=id,name,slug,country_id&order=id.asc&limit=1000&offset=${desde}`,
        );
        existentes.push(...pagina);
        if (pagina.length < 1000) break;
        desde += pagina.length;
    }

    const slugsTomados = new Set(existentes.map((t) => t.slug).filter(Boolean) as string[]);
    const identidadesTomadas = new Map<string, TorneoExistente>();
    existentes.forEach((t) => identidadesTomadas.set(claveDeIdentidad(t.country_id, t.name), t));

    const nuevos: FilaTorneo[] = [];
    const salteados: string[] = [];
    const sinProveedor: string[] = [];

    for (const t of catalogo) {
        const nombre = String(t.name || '').trim();

        if (RUTAS_EXCLUIDAS.some((patron) => patron.test(String(t.url)))) {
            salteados.push(`${nombre} → excluido: ese sistema ya está en la base por su fuente oficial`);
            continue;
        }

        const clave = claveDeIdentidad(t.countryId, nombre);
        const yaEsta = identidadesTomadas.get(clave);

        if (yaEsta) {
            salteados.push(`${nombre} → ya existe como "${yaEsta.name}" (${yaEsta.slug || yaEsta.id})`);
            continue;
        }
        if (slugsTomados.has(t.id)) {
            salteados.push(`${nombre} → el slug "${t.id}" ya está tomado`);
            continue;
        }

        // Un torneo que el proveedor no reconoce no se publica: quedaría con
        // todas las pestañas vacías y sin forma de llenarse.
        const ids = await fs<any>(`tournaments/ids?tournament_url=${encodeURIComponent(String(t.url))}`);
        const bundle = Array.isArray(ids) ? ids[0] : ids?.DATA ?? ids;
        const templateId = bundle?.tournament_template_id;
        if (!templateId) {
            sinProveedor.push(`${nombre} (${t.url})`);
            continue;
        }

        const pais = paisEnCastellano(t.countryId, String(t.url));

        nuevos.push({
            id: randomUUID(),
            name: nombre,
            display_name: nombre,
            slug: t.id,
            sport: 'rugby',
            sport_id: 'rugby',
            country_id: t.countryId || 'international',
            country: pais,
            country_name: pais,
            url: t.url,
            // Texto, no uuid: los ids externos en columnas uuid ya voltearon la
            // base una vez. La plantilla es el id que NO cambia de temporada.
            external_id: `flashscore:${templateId}`,
            ruleset: {
                external: {
                    flashscore: {
                        tournament_url: t.url,
                        tournament_template_id: String(templateId),
                    },
                },
            },
            is_api_managed: true,
            data_source: 'flashscore',
            status: BORRADOR ? 'draft' : 'published',
            is_visible: !BORRADOR,
            is_active: !BORRADOR,
            priority: typeof t.priority === 'number' ? t.priority : 0,
        });

        slugsTomados.add(t.id);
        identidadesTomadas.set(clave, { id: 'nuevo', name: nombre, slug: t.id, country_id: t.countryId || null });
    }

    console.log(`Torneos nuevos: ${nuevos.length}`);
    nuevos.forEach((f: any) => console.log(`  + ${String(f.slug).padEnd(40)} ${f.name}${f.country ? ` · ${f.country}` : ''}`));
    if (salteados.length) {
        console.log(`\nSalteados: ${salteados.length}`);
        salteados.forEach((s) => console.log(`  = ${s}`));
    }
    if (sinProveedor.length) {
        console.log(`\nEl proveedor no los reconoce (no se publican): ${sinProveedor.length}`);
        sinProveedor.forEach((s) => console.log(`  ! ${s}`));
    }

    if (!EJECUTAR) {
        console.log('\n--plan: no se escribió nada. Repetí con --execute para guardar.');
        return;
    }

    await insertar('tournaments', nuevos);
    console.log(`\nListo: ${nuevos.length} torneos creados ${BORRADOR ? 'en borrador' : 'y publicados'}.`);
    console.log('Siguen leyendo resultados, próximos y posiciones del proveedor en cada visita.');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
