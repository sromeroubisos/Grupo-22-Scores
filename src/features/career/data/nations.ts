// Naciones del motor. DOS catálogos separados a propósito:
//
//   1. PAÍS SELECCIONABLE (`countries.generated.ts`, 255 entradas) — identidad,
//      bandera y ruta migratoria. Cubre ISO 3166-1 alpha-2 completo más las tres
//      home nations británicas. Todo país es elegible como nacionalidad.
//
//   2. UNIÓN DE RUGBY (`RUGBY_UNIONS`, este archivo) — metadato OPCIONAL. Un
//      país puede seleccionarse, tener bandera y ruta migratoria y NO tener
//      selección modelada. No se inventan selecciones para llenar el catálogo:
//      sin mapping, el jugador simplemente no es convocable.

import { SELECTABLE_COUNTRIES, type SelectableCountry } from './countries.generated.ts';
import type { MigrationRegion } from '../engine/market-routes.ts';

export const NATIONS_VERSION = '2026-07.6';

export type { SelectableCountry };
export { SELECTABLE_COUNTRIES };
export { FREQUENT_COUNTRY_CODES } from './countries.generated.ts';

const BY_CODE = new Map(SELECTABLE_COUNTRIES.map((c) => [c.code, c]));
const BY_NAME = new Map(SELECTABLE_COUNTRIES.map((c) => [c.nameEs, c]));

/** Normaliza para buscar sin tildes ni mayúsculas. */
export function normalizeSearch(value: string): string {
    return value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
}

const BY_NORMALIZED = new Map(SELECTABLE_COUNTRIES.map((c) => [normalizeSearch(c.nameEs), c]));

export function findCountry(code: string): SelectableCountry | null {
    return BY_CODE.get(code) ?? null;
}

/** Busca por nombre exacto o normalizado (tolerante a tildes y mayúsculas). */
export function findCountryByName(name: string): SelectableCountry | null {
    return BY_NAME.get(name) ?? BY_NORMALIZED.get(normalizeSearch(name)) ?? null;
}

/**
 * Filtra por texto libre, sin tildes. Orden estable del catálogo.
 *
 * Busca sobre `SELECTABLE_NATIONALITIES` y no sobre el catálogo entero: si una
 * unión suspendida no se ofrece en la grilla, tampoco puede aparecer buscándola
 * por nombre. Un selector con dos listas distintas es un selector roto.
 */
export function searchCountries(query: string): SelectableCountry[] {
    const needle = normalizeSearch(query);
    if (needle.length === 0) return SELECTABLE_NATIONALITIES;
    return SELECTABLE_NATIONALITIES.filter((c) => normalizeSearch(c.nameEs).includes(needle) || c.code === needle);
}

/**
 * Región GEOGRÁFICA del país. NO es la lista de ligas de destino: para eso está
 * la ruta migratoria (market-routes), que se deriva de acá pero es un concepto
 * separado. La geografía nunca se usa directamente como destino.
 */
export function regionOfCountry(countryCode: string): MigrationRegion | null {
    return BY_CODE.get(countryCode)?.region ?? null;
}

export function geographicRegionOf(countryCode: string): MigrationRegion | null {
    return regionOfCountry(countryCode);
}

/** ¿Es un código del catálogo seleccionable? Un código fuera es "desconocido". */
export function isSelectableCountry(countryCode: string): boolean {
    return BY_CODE.has(countryCode);
}

export function flagPathOf(countryCode: string): string {
    return BY_CODE.get(countryCode)?.flagPath ?? `/flags/${countryCode}.svg`;
}

// ── Uniones de rugby (mapping OPCIONAL) ──────────────────────────────────────
export interface RugbyUnionMapping {
    countryCode: string;
    unionCode: string;
    unionName: string;
}

/**
 * Países con selección modelada. Un país fuera de esta lista sigue siendo una
 * nacionalidad válida: tiene identidad, bandera y ruta migratoria, pero no
 * genera una selección ficticia.
 *
 * QUÉ ESTÁ VERIFICADO Y QUÉ NO, porque no es lo mismo y dentro de tres meses no
 * se va a poder distinguir a ojo:
 *
 *   · Los RECUENTOS por asociación están verificados (37+4 Europa, 26 África,
 *     22+5 Asia, 14 Oceanía, 13 RAN, 9+1 Sudamérica), y los comentarios de cada
 *     bloque los declaran.
 *   · Los NOMBRES están verificados en África (24 de 26) y en Europa. El resto se
 *     completó con los miembros conocidos de cada región hasta llegar al recuento,
 *     así que puede haber uniones plausibles que no sean miembros y miembros
 *     reales que falten.
 *   · CUANDO EL RECUENTO Y LOS NOMBRES SE CONTRADICEN, gana la evidencia de que
 *     el equipo juega. Europa quedó en 39 plenos contra un recuento de 37, porque
 *     Israel, Grecia y Estonia disputan la Conference y el Trophy. Borrar una
 *     unión que juega es el error inverso al de inventar una, y es peor: la
 *     inventada se nota jugando partidos que no existen, la borrada no se nota.
 *
 * Agregar una unión NO es gratis: el invariante de
 * `engine/__tests__/international-calendar.test.ts` exige que tenga fixture, así
 * que hay que meterla también en una competición del calendario. Es a propósito:
 * ofrecer una camiseta que no juega ningún partido es el bug que cerró ese test.
 */
export const RUGBY_UNIONS: Record<string, string> = {
    // ── Sudamérica Rugby · 9 plenos + 1 asociado ─────────────────────────────
    ar: 'Argentina', uy: 'Uruguay', cl: 'Chile', br: 'Brasil', py: 'Paraguay', pe: 'Perú',
    co: 'Colombia', ve: 'Venezuela', ec: 'Ecuador', bo: 'Bolivia',

    // ── Rugby Europe · 37 plenos + 4 asociados ───────────────────────────────
    fr: 'Francia', 'gb-eng': 'Inglaterra', 'gb-sct': 'Escocia', 'gb-wls': 'Gales', ie: 'Irlanda',
    it: 'Italia',
    // Los ocho del Championship 2026, verificados.
    be: 'Bélgica', ge: 'Georgia', de: 'Alemania', nl: 'Países Bajos', pt: 'Portugal',
    ro: 'Rumanía', es: 'España', ch: 'Suiza',
    // El resto de los plenos, contra la lista verificada de Rugby Europe.
    pl: 'Polonia', cz: 'Chequia', se: 'Suecia', lt: 'Lituania', ua: 'Ucrania', hr: 'Croacia',
    hu: 'Hungría', mt: 'Malta', md: 'Moldavia', lv: 'Letonia', dk: 'Dinamarca',
    rs: 'Serbia', ba: 'Bosnia y Herzegovina', bg: 'Bulgaria', at: 'Austria', no: 'Noruega',
    fi: 'Finlandia', lu: 'Luxemburgo', si: 'Eslovenia', tr: 'Turquía',
    ad: 'Andorra', mc: 'Mónaco',
    // EL RECUENTO ES LO DUDOSO, NO ESTOS TRES. La fuente dice 37 plenos y la lista
    // nominal que la acompaña trae 36 nombres sin Israel, Grecia ni Estonia — pero
    // esa lista es un conjunto POSITIVO, no exhaustivo: la propia página de las
    // divisiones europeas muestra a Estonia jugando el Trophy. Un equipo que
    // disputa la Conference existe; un recuento puede estar desactualizado o
    // contar categorías que la fuente no explicita. Se quedan.
    il: 'Israel', gr: 'Grecia', ee: 'Estonia',
    // Asociados.
    az: 'Azerbaiyán', cy: 'Chipre', me: 'Montenegro', sk: 'Eslovaquia',

    // ── Oceania Rugby · 14 plenos ────────────────────────────────────────────
    nz: 'Nueva Zelanda', au: 'Australia', fj: 'Fiyi', ws: 'Samoa', to: 'Tonga',
    pg: 'Papúa Nueva Guinea', ck: 'Islas Cook', nu: 'Niue', vu: 'Vanuatu', sb: 'Islas Salomón',
    pf: 'Polinesia Francesa', as: 'Samoa Americana', gu: 'Guam', mp: 'Islas Marianas del Norte',

    // ── Rugby Africa · 26 plenos (Mauritania, suspendida, va aparte) ─────────
    // 24 de los 26 identificados. El vigésimo sexto queda como HUECO CONOCIDO: no
    // se completa con un candidato plausible. Togo es ASOCIADO, no pleno, y por eso
    // no está acá.
    za: 'Sudáfrica', na: 'Namibia', ke: 'Kenia', zw: 'Zimbabue', tn: 'Túnez',
    dz: 'Argelia', ma: 'Marruecos', ug: 'Uganda', sn: 'Senegal', ci: 'Côte d’Ivoire',
    eg: 'Egipto', bw: 'Botsuana', bf: 'Burkina Faso', bi: 'Burundi', cm: 'Camerún',
    sz: 'Esuatini', gh: 'Ghana', ls: 'Lesoto', mg: 'Madagascar', mu: 'Mauricio',
    ng: 'Nigeria', rw: 'Ruanda', zm: 'Zambia', cd: 'República Democrática del Congo',

    // ── Asia Rugby · 22 plenos + 5 asociados ─────────────────────────────────
    jp: 'Japón', kr: 'Corea del Sur', hk: 'RAE de Hong Kong (China)', lk: 'Sri Lanka',
    cn: 'China', my: 'Malasia', sg: 'Singapur', ph: 'Filipinas', th: 'Tailandia', in: 'India',
    id: 'Indonesia', tw: 'Taiwán', uz: 'Uzbekistán', kz: 'Kazajistán', qa: 'Catar',
    ae: 'Emiratos Árabes Unidos', sa: 'Arabia Saudí', ir: 'Irán', np: 'Nepal', pk: 'Pakistán',
    bd: 'Bangladés', kh: 'Camboya',
    // Asociados.
    kg: 'Kirguistán', lb: 'Líbano', mn: 'Mongolia', sy: 'Siria', la: 'Laos',

    // ── Rugby Americas North · 13 plenos ─────────────────────────────────────
    us: 'Estados Unidos', ca: 'Canadá', mx: 'México', jm: 'Jamaica', tt: 'Trinidad y Tobago',
    bb: 'Barbados', bs: 'Bahamas', bm: 'Bermudas', ky: 'Islas Caimán', gy: 'Guyana',
    cw: 'Curazao', vg: 'Islas Vírgenes Británicas', vc: 'San Vicente y las Granadinas',
};

export const RUGBY_UNION_MAPPINGS: RugbyUnionMapping[] = Object.entries(RUGBY_UNIONS).map(
    ([countryCode, unionName]) => ({ countryCode, unionCode: countryCode, unionName }),
);

/**
 * MIEMBRO PLENO O ASOCIADO de su asociación regional.
 *
 * Se guarda y TODAVÍA NO SE CONSUME: hoy el motor trata igual a un pleno y a un
 * asociado. Está acá para que la doc no mienta —los metimos a todos como uniones
 * y no lo son— y para que el día que la elegibilidad o el fixture dependan de
 * esto, el dato ya exista en vez de haber que investigarlo de nuevo.
 *
 * Sólo se listan los asociados: lo que no figura es pleno.
 */
export type UnionMembership = 'full' | 'associate';

const ASSOCIATE_UNIONS: Readonly<Record<string, true>> = {
    // Rugby Europe.
    az: true, cy: true, me: true, sk: true,
    // Asia Rugby.
    kg: true, lb: true, mn: true, sy: true, la: true,
    // Sudamérica Rugby.
    bo: true,
    // ANOTADO Y NO MODELADO: Togo es asociado de Rugby Africa. No está en
    // `RUGBY_UNIONS` porque no conozco al resto de los asociados africanos y
    // agregar uno solo sería arbitrario. Tuvalu y Nauru son asociados de Oceania
    // Rugby y ADEMÁS no están afiliados a World Rugby: ésos no son uniones.
};

export function unionMembership(countryCode: string | null): UnionMembership | null {
    if (countryCode === null || !(countryCode in RUGBY_UNIONS)) return null;
    return countryCode in ASSOCIATE_UNIONS ? 'associate' : 'full';
}

/**
 * ASCENDENCIA POR ORIGEN — el país de nacimiento que abre la puerta de OTRA unión.
 *
 * NO SE CONSUME TODAVÍA, y conviene ser explícito sobre por qué no es dos líneas
 * de datos: para que elegir Nueva Caledonia deje de ser un callejón sin salida
 * hacen falta tres piezas y sólo ésta es gratis.
 *
 *   1. Esta tabla.
 *   2. Una tirada al crear el jugador que siembre el claim con
 *      `grantAncestryClaim` — que existe y hoy nadie llama, porque el motor no
 *      genera ascendencia sola (ver `engine/eligibility.ts`).
 *   3. Que `targetUnion` caiga a un claim disponible cuando la nacionalidad NO
 *      tiene unión. Hoy devuelve null y el jugador no es convocable por nadie,
 *      así que sin esto la tabla no hace nada.
 *
 * La tercera cambia a quién convoca el motor para TODO el que tenga un claim, y
 * eso mueve la distribución de caps que se acaba de medir. Va como paso propio,
 * no colado acá.
 *
 * Nueva Caledonia y Wallis y Futuna dependen de la federación francesa, y ese
 * camino en el rugby real está muy transitado: buena parte de los internacionales
 * franceses de origen del Pacífico viene por ahí. Tuvalu y Nauru no tienen
 * equivalente y quedan sin puerta, que también está bien: no todo origen tiene
 * que tener una.
 */
export interface HeritageLink {
    to: string;
    /** Peso relativo de la tirada. 9 sobre 10 es "casi siempre". */
    weight: number;
}

export const HERITAGE_LINKS: Readonly<Record<string, readonly HeritageLink[]>> = {
    nc: [{ to: 'fr', weight: 9 }],
    wf: [{ to: 'fr', weight: 9 }],
};

/**
 * POR QUÉ un país no tiene selección modelada. Son dos cosas distintas y el dato
 * tiene que poder decirlas por separado:
 *
 *   · `sin-federacion` — no hay rugby de quince organizado que modelar. Es el
 *     caso de las ~200 nacionalidades del catálogo ISO, y no es un problema: se
 *     puede elegir la nacionalidad, y el juego no inventa una selección.
 *   · `suspendida` — la unión EXISTE y hoy no juega. Es un caso mucho peor si se
 *     lo deja pasar: el país aparece con selección, el jugador la elige esperando
 *     jugar para ella, y nunca hay un partido. Una trampa.
 */
export type NoUnionReason = 'suspendida' | 'sin-federacion';

/**
 * Uniones existentes que hoy no juegan nada. Rusia está suspendida por World
 * Rugby y no entra en ninguna competición del calendario internacional: sin
 * fixture no hay caps, así que se saca del selector en vez de ofrecerla vacía.
 *
 * Está acá y no borrada del catálogo de países porque la nacionalidad rusa sigue
 * existiendo: `findCountry('ru')` resuelve, la bandera está, y una carrera vieja
 * que la tenga guardada no explota. Lo único que cambia es que no se ofrece.
 */
export const SUSPENDED_UNIONS: Readonly<Record<string, string>> = {
    ru: 'Suspendida por World Rugby: no disputa competiciones internacionales.',
    mr: 'Suspendida por Rugby Africa: no disputa competiciones internacionales.',
};

export function unionAbsenceReason(countryCode: string | null): NoUnionReason | null {
    if (countryCode === null) return 'sin-federacion';
    if (countryCode in RUGBY_UNIONS) return null;
    return countryCode in SUSPENDED_UNIONS ? 'suspendida' : 'sin-federacion';
}

/**
 * Países que se OFRECEN como nacionalidad. Es el catálogo entero menos las
 * uniones suspendidas: mejor que Rusia no se pueda elegir a que se pueda elegir
 * y sea una trampa.
 */
export const SELECTABLE_NATIONALITIES: SelectableCountry[] = SELECTABLE_COUNTRIES.filter(
    (c) => !(c.code in SUSPENDED_UNIONS),
);

/** Código de país de una nacionalidad dada por NOMBRE (compatibilidad). */
export function countryCodeOfNationality(nationality: string): string | null {
    return findCountryByName(nationality)?.code ?? null;
}

/** ¿Ese país tiene una unión representable? */
export function hasUnion(countryCode: string | null): boolean {
    return countryCode !== null && countryCode in RUGBY_UNIONS;
}

export function unionName(countryCode: string): string {
    return RUGBY_UNIONS[countryCode] ?? countryCode;
}

/**
 * REPUTACIÓN INTERNACIONAL de la unión, 0 (marginal) a 5 (élite).
 *
 * Es CUÁN DIFÍCIL es ponerse esa camiseta: cruza el tamaño real del plantel
 * profesional de la unión con su nivel deportivo. De acá salen los dos umbrales
 * de convocatoria y la cantidad de tests que juega la selección por temporada.
 *
 * Las que no figuran son 0: una unión sin modelar no tiene por qué inventarse un
 * escalón. Se lee con `unionReputation()`, nunca iterando este objeto — el orden
 * de inserción no puede decidir nada (CLAUDE.md §1).
 *
 * REASIGNADA en 2026-07.6 contra el ranking mundial de julio de 2026, con el
 * catálogo completo de uniones. Tres decisiones que conviene leer antes de tocar
 * un número:
 *
 *   · FIYI SUBE A 3. Rankea 9ª, por encima de Gales. Dejarla en 2 era decir que
 *     ponerse la camiseta de Fiyi cuesta lo mismo que ponerse la de Uruguay.
 *   · TONGA Y SAMOA SE QUEDAN EN 2 aunque rankeen 20ª y 21ª, y acá la tabla se
 *     aparta del ranking A PROPÓSITO. La reputación maneja el UMBRAL DE
 *     CONVOCATORIA, así que tiene que reflejar la profundidad del pool y no los
 *     resultados: contando la diáspora en Nueva Zelanda y Australia, el pool
 *     tongano y samoano es enorme comparado con el de Rumanía o Bélgica. Los
 *     resultados caen; los jugadores están.
 *   · PORTUGAL Y CHILE SUBEN A 2 por ranking, aunque su pool sea fino. Es el
 *     caso inverso al de arriba y por eso van juntos: cuando el ranking y el pool
 *     dicen cosas distintas, se decide caso por caso y se escribe cuál mandó.
 *
 * Nueva Zelanda y Sudáfrica quedan SOLAS en 5, y es a propósito. Irlanda y
 * Francia estuvieron primeras en el ranking hace poco, pero para el juego
 * conviene que jugar para los All Blacks sea lo más difícil que hay. Son tres
 * puntos de umbral de diferencia, no diez.
 *
 * El salto grande de la escalera de umbrales (71 → 78) cae entre rep 2 y rep 3.
 * Esa es la frontera entre el que juega un Mundial y el que lo mira, y por eso
 * es la única que no se suaviza para que la curva quede prolija.
 */
const UNION_REPUTATION: Record<string, number> = {
    // 5 · Lo más difícil que hay.
    nz: 5, za: 5,
    // 4 · Potencias con plantel profesional profundo.
    ie: 4, fr: 4, 'gb-eng': 4, 'gb-sct': 4, au: 4,
    // 3 · Tier 1 con plantel más chico, y las dos del Pacífico/Asia que rankean acá.
    ar: 3, it: 3, 'gb-wls': 3, fj: 3, jp: 3,
    // 2 · Tier 2 alto: van a los Mundiales y compiten.
    ge: 2, uy: 2, pt: 2, cl: 2, es: 2, us: 2, to: 2, ws: 2,
    // 1 · Primera división continental o cerca: mezcla de profesionales y gente
    //     que labura de otra cosa.
    ro: 1, be: 1, ca: 1, zw: 1, na: 1, hk: 1, dz: 1, ch: 1, nl: 1, de: 1, pl: 1,
    ke: 1, br: 1, py: 1, ma: 1, ug: 1,
    // 0 · El resto de las 128 uniones modeladas.
};

/** Reputación de la unión (0-5). Las no listadas son 0. */
export function unionReputation(unionCode: string | null): number {
    if (unionCode === null) return 0;
    return UNION_REPUTATION[unionCode] ?? 0;
}

/**
 * PUESTO EN EL RANKING MUNDIAL.
 *
 * Es DERIVADO de la reputación, no el ranking real de World Rugby: se ordena por
 * reputación descendente y se desempata por código de unión, que es estable y no
 * depende del orden de inserción de ningún objeto (CLAUDE.md §1). Dos uniones de
 * la misma banda quedan en puestos consecutivos y arbitrarios entre sí, y eso es
 * honesto — la reputación tiene seis escalones y un ranking tiene cuarenta y tres
 * puestos, así que el orden fino no lo sabemos.
 *
 * Existe para que la fila de selección diga DÓNDE ESTÁ PARADO el jugador desde la
 * primera temporada. Un número al lado de la bandera convierte "Georgia" en
 * "Georgia, 12ª del mundo", que es la diferencia entre un dato y una referencia.
 *
 * Se calcula una vez, al cargar el módulo: es una función pura del catálogo.
 */
const RANKED_UNIONS: readonly string[] = Object.keys(RUGBY_UNIONS).sort((a, b) => {
    const porReputacion = unionReputation(b) - unionReputation(a);
    return porReputacion !== 0 ? porReputacion : a.localeCompare(b);
});

const RANKING_BY_CODE = new Map(RANKED_UNIONS.map((code, i) => [code, i + 1]));

/** Puesto en el ranking, 1 es el mejor. `null` si el país no tiene selección. */
export function worldRanking(unionCode: string | null): number | null {
    if (unionCode === null) return null;
    return RANKING_BY_CODE.get(unionCode) ?? null;
}

/** Cuántas uniones hay en el ranking. Para mostrar "12ª de 43". */
export const RANKED_UNION_COUNT = RANKED_UNIONS.length;
