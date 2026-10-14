// GENERADO por scripts/build-coach-catalog.mjs — NO EDITAR A MANO.
// Fuente: rugby-manager-pro/js/pyramid/geo.js
//
// Si tocás este archivo hay que subir GEO_VERSION y, con él,
// CLUB_CATALOG_VERSION del guardado (ver coachStorage.ts).

export const GEO_VERSION = '1.0.0';

export interface RegionDef {
    id: string;
    name: string;
    short: string;
}

export interface UnionDef {
    id: string;
    name: string;
    short: string;
    /** null en URBA: es la región de Buenos Aires, fuera del circuito del interior. */
    regionId: string | null;
    hq: string;
    /** Si hoy presenta representantes en su regional. Santa Cruz y Tierra del Fuego no. */
    activeAtRegionalLevel: boolean;
}

export const REGIONS: readonly RegionDef[] = [
    { id: "REGION_CENTRO", name: "Region Centro", short: "Centro" },
    { id: "REGION_LITORAL", name: "Region Litoral", short: "Litoral" },
    { id: "REGION_NEA", name: "Region NEA", short: "NEA" },
    { id: "REGION_NOA", name: "Region NOA", short: "NOA" },
    { id: "REGION_OESTE", name: "Region Oeste", short: "Oeste" },
    { id: "REGION_PAMPEANO", name: "Region Pampeana", short: "Pampeano" },
    { id: "REGION_PATAGONICO", name: "Region Patagonica", short: "Patagonia" },
];

export const UNIONS: readonly UnionDef[] = [
    { id: "UCR", name: "Union Cordobesa de Rugby", short: "Cordobesa", regionId: "REGION_CENTRO", hq: "Cordoba", activeAtRegionalLevel: true },
    { id: "UER", name: "Union Entrerriana de Rugby", short: "Entrerriana", regionId: "REGION_LITORAL", hq: "Parana", activeAtRegionalLevel: true },
    { id: "UJR", name: "Union Jujena de Rugby", short: "Jujena", regionId: "REGION_NOA", hq: "San Salvador de Jujuy", activeAtRegionalLevel: true },
    { id: "URAND", name: "Union Andina de Rugby", short: "Andina", regionId: "REGION_CENTRO", hq: "La Rioja", activeAtRegionalLevel: true },
    { id: "URAUS", name: "Union de Rugby Austral", short: "Austral", regionId: "REGION_PATAGONICO", hq: "Comodoro Rivadavia", activeAtRegionalLevel: true },
    { id: "URAV", name: "Union de Rugby del Alto Valle de Rio Negro y Neuquen", short: "Alto Valle", regionId: "REGION_PATAGONICO", hq: "General Roca", activeAtRegionalLevel: true },
    { id: "URBA", name: "Union de Rugby de Buenos Aires", short: "URBA", regionId: null, hq: "Buenos Aires", activeAtRegionalLevel: true },
    { id: "URC", name: "Union de Rugby de Cuyo", short: "Cuyo", regionId: "REGION_OESTE", hq: "Mendoza", activeAtRegionalLevel: true },
    { id: "URF", name: "Union de Rugby de Formosa", short: "Formosa", regionId: "REGION_NEA", hq: "Formosa", activeAtRegionalLevel: true },
    { id: "URLS", name: "Union de Rugby de los Lagos del Sur", short: "Lagos del Sur", regionId: "REGION_PATAGONICO", hq: "San Carlos de Bariloche", activeAtRegionalLevel: true },
    { id: "URMDP", name: "Union de Rugby de Mar del Plata", short: "Mar del Plata", regionId: "REGION_PAMPEANO", hq: "Mar del Plata", activeAtRegionalLevel: true },
    { id: "URNE", name: "Union de Rugby del Noreste", short: "Noreste", regionId: "REGION_NEA", hq: "Resistencia", activeAtRegionalLevel: true },
    { id: "UROBA", name: "Union de Rugby del Oeste de Buenos Aires", short: "UROBA", regionId: "REGION_PAMPEANO", hq: "Junin", activeAtRegionalLevel: true },
    { id: "URR", name: "Union de Rugby de Rosario", short: "Rosario", regionId: "REGION_LITORAL", hq: "Rosario", activeAtRegionalLevel: true },
    { id: "URS", name: "Union de Rugby de Salta", short: "Salta", regionId: "REGION_NOA", hq: "Salta", activeAtRegionalLevel: true },
    { id: "URSL", name: "Union de Rugby de San Luis", short: "San Luis", regionId: "REGION_OESTE", hq: "San Luis", activeAtRegionalLevel: true },
    { id: "URSUR", name: "Union de Rugby del Sur", short: "Sur", regionId: "REGION_PAMPEANO", hq: "Bahia Blanca", activeAtRegionalLevel: true },
    { id: "URT", name: "Union de Rugby de Tucuman", short: "Tucuman", regionId: "REGION_NOA", hq: "San Miguel de Tucuman", activeAtRegionalLevel: true },
    { id: "URTF", name: "Union de Rugby de Tierra del Fuego", short: "Tierra del Fuego", regionId: "REGION_PATAGONICO", hq: "Ushuaia", activeAtRegionalLevel: false },
    { id: "URUMI", name: "Union de Rugby de Misiones", short: "Misiones", regionId: "REGION_NEA", hq: "Posadas", activeAtRegionalLevel: true },
    { id: "URVCH", name: "Union de Rugby del Valle de Chubut", short: "Valle del Chubut", regionId: "REGION_PATAGONICO", hq: "Trelew", activeAtRegionalLevel: true },
    { id: "USCR", name: "Union Santacruena de Rugby", short: "Santacruena", regionId: "REGION_PATAGONICO", hq: "Rio Gallegos", activeAtRegionalLevel: false },
    { id: "USJ", name: "Union Sanjuanina de Rugby", short: "Sanjuanina", regionId: "REGION_OESTE", hq: "San Juan", activeAtRegionalLevel: true },
    { id: "USR", name: "Union Santafesina de Rugby", short: "Santafesina", regionId: "REGION_LITORAL", hq: "Santa Fe", activeAtRegionalLevel: true },
    { id: "USTG", name: "Union Santiaguena de Rugby", short: "Santiaguena", regionId: "REGION_NOA", hq: "Santiago del Estero", activeAtRegionalLevel: true },
];

const UNION_BY_ID = new Map(UNIONS.map((u) => [u.id, u]));
const REGION_BY_ID = new Map(REGIONS.map((r) => [r.id, r]));

export function getUnion(id: string): UnionDef | null {
    return UNION_BY_ID.get(id) ?? null;
}

export function getRegion(id: string): RegionDef | null {
    return REGION_BY_ID.get(id) ?? null;
}
