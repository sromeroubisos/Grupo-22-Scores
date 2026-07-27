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

export const NATIONS_VERSION = '2026-07.2';

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

/** Filtra el catálogo por texto libre, sin tildes. Orden estable del catálogo. */
export function searchCountries(query: string): SelectableCountry[] {
    const needle = normalizeSearch(query);
    if (needle.length === 0) return SELECTABLE_COUNTRIES;
    return SELECTABLE_COUNTRIES.filter((c) => normalizeSearch(c.nameEs).includes(needle) || c.code === needle);
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
 */
export const RUGBY_UNIONS: Record<string, string> = {
    ar: 'Argentina', uy: 'Uruguay', cl: 'Chile', br: 'Brasil', py: 'Paraguay', pe: 'Perú',
    fr: 'Francia', 'gb-eng': 'Inglaterra', 'gb-sct': 'Escocia', 'gb-wls': 'Gales', ie: 'Irlanda',
    it: 'Italia', es: 'España', pt: 'Portugal', ge: 'Georgia', ro: 'Rumanía',
    de: 'Alemania', be: 'Bélgica', nl: 'Países Bajos', cz: 'Chequia', pl: 'Polonia', ch: 'Suiza', ru: 'Rusia',
    nz: 'Nueva Zelanda', au: 'Australia', fj: 'Fiyi', ws: 'Samoa', to: 'Tonga',
    za: 'Sudáfrica', na: 'Namibia', ke: 'Kenia', zw: 'Zimbabue', tn: 'Túnez',
    jp: 'Japón', kr: 'Corea del Sur', cn: 'China', hk: 'RAE de Hong Kong (China)',
    my: 'Malasia', sg: 'Singapur', ph: 'Filipinas', th: 'Tailandia', in: 'India', lk: 'Sri Lanka',
    us: 'Estados Unidos', ca: 'Canadá',
};

export const RUGBY_UNION_MAPPINGS: RugbyUnionMapping[] = Object.entries(RUGBY_UNIONS).map(
    ([countryCode, unionName]) => ({ countryCode, unionCode: countryCode, unionName }),
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
