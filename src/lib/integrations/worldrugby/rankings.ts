/**
 * Conector del ranking de uniones de World Rugby.
 *
 * La pantalla de world.rugby/rankings se alimenta de una API JSON publica de
 * Pulselive, sin key y con CORS abierto. No esta documentada: es la API del
 * sitio, no un producto. Por eso todo lo que entra por aca se normaliza a
 * nuestra forma antes de tocar el resto de la app — si maniana cambian un campo,
 * se rompe este archivo y ninguno mas.
 *
 * Dos advertencias medidas contra la API real (2026-08-31):
 *
 *  1. `effective.label` MIENTE en las consultas historicas: con `date=2015-10-31`
 *     contesta `2020-09-21`. Las entradas SI corresponden a la fecha pedida (el
 *     1 de esa semana es Nueva Zelanda, como corresponde). Por eso la fecha de
 *     una foto historica sale del pedido, no de la respuesta.
 *  2. El limite es de 50 pedidos por minuto (`x-ratelimit-limit: 50, 50;w=60`).
 *     Un backfill semanal de 2003 a hoy son ~1.200 pedidos: hay que espaciarlo.
 *
 * El historico arranca el 2003-10-13. `date=2003-09-08` contesta 404.
 */
// Rutas relativas y no el alias `@/`: `node --test` no resuelve los paths de
// tsconfig, y este modulo tiene test propio. Es la misma convencion que los
// conectores de URBA.
import { findCountryRecord, getCountryFlagCode } from '../../data/countries.ts';
import type { Country } from '../../types/index.ts';

const API_BASE = 'https://api.wr-rims-prod.pulselive.com/rugby/v3/rankings';
const REQUEST_TIMEOUT_MS = 12_000;

/** Primera semana con ranking publicado. Antes de esta fecha la API contesta 404. */
export const WORLD_RUGBY_FIRST_RANKING_DATE = '2003-10-13';

export const WORLD_RUGBY_CATEGORIES = ['mru', 'wru'] as const;
export type WorldRugbyCategory = (typeof WORLD_RUGBY_CATEGORIES)[number];

export type WorldRugbyEntry = {
    /** Id numerico de la union en Pulselive. Estable, sirve de clave. */
    teamId: string;
    name: string;
    nameEs: string;
    /** Trigrama de World Rugby: ARG, RSA, NZL. */
    code: string;
    /** Id del pais en nuestro catalogo, o null si no lo pudimos resolver. */
    countryId: string | null;
    /** Ruta local de la bandera (`/flags/ar.svg`), o null. */
    flagUrl: string | null;
    region: string | null;
    position: number;
    previousPosition: number | null;
    points: number;
    previousPoints: number | null;
};

export type WorldRugbySnapshot = {
    category: WorldRugbyCategory;
    /** Rotulo que devuelve la API: "Mens Rugby Union". */
    label: string;
    /** Fecha de la foto, en ISO corto. */
    effectiveDate: string;
    fetchedAt: string;
    entries: WorldRugbyEntry[];
};

type ApiTeam = {
    id?: unknown;
    name?: unknown;
    abbreviation?: unknown;
    countryCode?: unknown;
};

type ApiEntry = {
    team?: ApiTeam;
    pts?: unknown;
    pos?: unknown;
    previousPts?: unknown;
    previousPos?: unknown;
};

type ApiResponse = {
    label?: unknown;
    entries?: unknown;
    effective?: { label?: unknown } | null;
};

const REGION_LABELS_ES: Record<NonNullable<Country['region']>, string> = {
    'international': 'Internacional',
    'africa': 'Africa',
    'asia': 'Asia',
    'europe': 'Europa',
    'north-america': 'Norteamerica',
    'south-america': 'Sudamerica',
    'oceania': 'Oceania',
};

/**
 * El continente de las uniones cuyo pais entro al catalogo por la via
 * autogenerada, que no trae `region`. Son 65 de las 114 del ranking masculino:
 * sin esto, mas de la mitad de la tabla mostraba un guion en la columna.
 *
 * Vive aca y no en `countries.ts` a proposito: completar la region de 65 paises
 * del catalogo compartido le cambia el agrupado al sidebar y al selector de
 * torneos, que es una decision de otro tamanio. Aca solo afecta a esta tabla.
 *
 * Va por codigo alpha-2 y no por nombre porque el nombre ya lo resolvio
 * `findCountryRecord`: si el pais no esta en el catalogo, tampoco llega hasta
 * este mapa.
 */
const CONTINENT_BY_CODE: Record<string, string> = {
    // Africa
    BF: 'Africa', BI: 'Africa', BW: 'Africa', CI: 'Africa', CM: 'Africa',
    GH: 'Africa', KE: 'Africa', LS: 'Africa', MA: 'Africa', MG: 'Africa',
    MU: 'Africa', NA: 'Africa', NG: 'Africa', RW: 'Africa', SN: 'Africa',
    SZ: 'Africa', TN: 'Africa', UG: 'Africa', ZM: 'Africa', ZW: 'Africa',
    // Asia
    AE: 'Asia', HK: 'Asia', ID: 'Asia', IR: 'Asia', KZ: 'Asia',
    LA: 'Asia', LK: 'Asia', MY: 'Asia', NP: 'Asia', PK: 'Asia',
    QA: 'Asia', SG: 'Asia', TH: 'Asia', TW: 'Asia', UZ: 'Asia',
    // Europa
    AD: 'Europa', BA: 'Europa', LU: 'Europa', LV: 'Europa', MC: 'Europa',
    MD: 'Europa', MT: 'Europa', UA: 'Europa',
    // Norteamerica, que en este catalogo incluye Centroamerica y el Caribe
    BB: 'Norteamerica', BM: 'Norteamerica', BS: 'Norteamerica', CR: 'Norteamerica',
    JM: 'Norteamerica', KY: 'Norteamerica', LC: 'Norteamerica', TT: 'Norteamerica',
    VC: 'Norteamerica',
    // Sudamerica
    GY: 'Sudamerica', PE: 'Sudamerica', PY: 'Sudamerica',
    // Oceania
    AS: 'Oceania', CK: 'Oceania', FJ: 'Oceania', GU: 'Oceania', NU: 'Oceania',
    PG: 'Oceania', SB: 'Oceania', TO: 'Oceania', VU: 'Oceania', WS: 'Oceania',
};

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function readText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function readNumber(value: unknown): number | null {
    // `Number(null)` es 0 y `Number('')` tambien: sin este corte, una fila que
    // llega sin puesto entra a la tabla como puesto 0 en vez de descartarse.
    if (value === null || value === undefined || value === '') return null;

    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * La bandera sale del catalogo local (`public/flags/*.svg`, dominio publico) y no
 * de un CDN: son SVG, no cuestan memoria de bitmap y no dependen de que un
 * tercero siga sirviendo la imagen. Inglaterra, Escocia y Gales no son alpha-2 y
 * `getCountryFlagCode` ya los resuelve — que es justo el caso que importa en rugby.
 */
function resolveCountry(code: string, name: string) {
    const record = findCountryRecord(code, name);
    if (!record) {
        return { countryId: null, nameEs: name, flagUrl: null, region: null };
    }

    const flagCode = getCountryFlagCode(record);
    return {
        countryId: record.id,
        nameEs: record.nameEs || record.name || name,
        flagUrl: flagCode ? `/flags/${flagCode}.svg` : null,
        region: (record.region ? REGION_LABELS_ES[record.region] : null)
            ?? CONTINENT_BY_CODE[String(record.code || '').toUpperCase()]
            ?? null,
    };
}

export function normalizeWorldRugbyEntries(payload: unknown): WorldRugbyEntry[] {
    const entries = (payload as ApiResponse | null)?.entries;
    if (!Array.isArray(entries)) {
        throw new Error('La respuesta de World Rugby no trae la lista de posiciones.');
    }

    const normalized: WorldRugbyEntry[] = [];

    for (const raw of entries as ApiEntry[]) {
        const teamId = readText(raw?.team?.id);
        const name = readText(raw?.team?.name);
        const position = readNumber(raw?.pos);
        const points = readNumber(raw?.pts);

        // Una fila sin nombre, sin puesto o sin puntos no es una fila incompleta:
        // es una fila que no sabemos leer. Se descarta en vez de pintar un "-".
        if (!name || position === null || points === null) continue;

        const code = readText(raw?.team?.abbreviation);
        const resolved = resolveCountry(readText(raw?.team?.countryCode) || code, name);

        normalized.push({
            teamId: teamId || code || name,
            name,
            nameEs: resolved.nameEs,
            code,
            countryId: resolved.countryId,
            flagUrl: resolved.flagUrl,
            region: resolved.region,
            position,
            previousPosition: readNumber(raw?.previousPos),
            points,
            previousPoints: readNumber(raw?.previousPts),
        });
    }

    if (!normalized.length) {
        throw new Error('World Rugby contesto una tabla vacia.');
    }

    return normalized.sort((a, b) => a.position - b.position);
}

/**
 * Trae una foto del ranking. Sin `date` devuelve la vigente.
 *
 * Nunca devuelve vacio ante una falla: tira. Un ranking vacio guardado como si
 * fuera bueno es peor que no tener ranking — ya nos paso con FlashScore.
 */
export async function fetchWorldRugbyRanking(
    category: WorldRugbyCategory,
    options: { date?: string | null; signal?: AbortSignal } = {},
): Promise<WorldRugbySnapshot> {
    const date = readText(options.date);
    if (date && !ISO_DATE_REGEX.test(date)) {
        throw new Error(`Fecha invalida para el ranking de World Rugby: "${date}". Se espera YYYY-MM-DD.`);
    }

    const url = new URL(`${API_BASE}/${category}`);
    url.searchParams.set('language', 'en');
    if (date) url.searchParams.set('date', date);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    options.signal?.addEventListener('abort', () => controller.abort(), { once: true });

    let response: Response;
    try {
        response = await fetch(url, {
            signal: controller.signal,
            cache: 'no-store',
            headers: { accept: 'application/json' },
        });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`No se pudo consultar el ranking de World Rugby (${category}): ${reason}`);
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        throw new Error(
            `World Rugby contesto ${response.status} para el ranking ${category}${date ? ` del ${date}` : ''}.`,
        );
    }

    const payload = (await response.json()) as ApiResponse;
    const entries = normalizeWorldRugbyEntries(payload);

    // La fecha pedida gana sobre la que contesta la API: en las consultas
    // historicas `effective.label` devuelve cualquier cosa (ver cabecera).
    const effectiveLabel = readText(payload?.effective?.label);
    const effectiveDate = date
        || (ISO_DATE_REGEX.test(effectiveLabel) ? effectiveLabel : new Date().toISOString().slice(0, 10));

    return {
        category,
        label: readText(payload?.label) || (category === 'mru' ? 'Mens Rugby Union' : 'Womens Rugby Union'),
        effectiveDate,
        fetchedAt: new Date().toISOString(),
        entries,
    };
}
