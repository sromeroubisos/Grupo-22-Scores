/* build-coach-catalog.mjs — porta el catálogo argentino de rugby-manager-pro a TS.
 *
 * Fuente: js/pyramid/clubsARG.js (554 clubes) y js/pyramid/geo.js (25 uniones,
 * 7 regiones). Los dos son artefactos generados allá y no se editan a mano; acá
 * tampoco. Si hay que corregir un club, se corrige en la fuente y se vuelve a
 * correr esto.
 *
 *   node scripts/build-coach-catalog.mjs [ruta-a-rugby-manager-pro]
 *
 * Sale en src/features/coach/data/{geo,clubs}.generated.ts.
 */
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'src', 'features', 'coach', 'data');
const SRC = resolve(process.argv[2] || join(HERE, '..', '..', 'rugby-manager-pro'));

const { ARG_CLUBS } = require(join(SRC, 'js', 'pyramid', 'clubsARG.js'));
const { ARG_UNIONS, ARG_REGIONS } = require(join(SRC, 'js', 'pyramid', 'geo.js'));

const HEAD = (what, ver) => `// GENERADO por scripts/build-coach-catalog.mjs — NO EDITAR A MANO.
// Fuente: rugby-manager-pro/js/pyramid/${what}
//
// Si tocás este archivo hay que subir ${ver} y, con él,
// CLUB_CATALOG_VERSION del guardado (ver coachStorage.ts).
`;

const s = (v) => JSON.stringify(v);

/* ---------------------------------------------------------------- geo */
// URBA tiene regionId null a propósito: es la región de Buenos Aires, fuera del
// circuito regional del interior. No es un dato faltante.
const unions = Object.values(ARG_UNIONS)
    .filter((u) => u.membershipType === 'full')
    .sort((a, b) => a.id.localeCompare(b.id));
const regions = Object.values(ARG_REGIONS).sort((a, b) => a.id.localeCompare(b.id));

const geoTs = `${HEAD('geo.js', 'GEO_VERSION')}
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
${regions.map((r) => `    { id: ${s(r.id)}, name: ${s(r.name)}, short: ${s(r.short)} },`).join('\n')}
];

export const UNIONS: readonly UnionDef[] = [
${unions.map((u) => `    { id: ${s(u.id)}, name: ${s(u.name)}, short: ${s(u.short)}, regionId: ${s(u.regionId ?? null)}, hq: ${s(u.hq)}, activeAtRegionalLevel: ${u.competitiveStatus === 'active'} },`).join('\n')}
];

const UNION_BY_ID = new Map(UNIONS.map((u) => [u.id, u]));
const REGION_BY_ID = new Map(REGIONS.map((r) => [r.id, r]));

export function getUnion(id: string): UnionDef | null {
    return UNION_BY_ID.get(id) ?? null;
}

export function getRegion(id: string): RegionDef | null {
    return REGION_BY_ID.get(id) ?? null;
}
`;

/* -------------------------------------------------------------- clubes */
// `aff` de la fuente: A = afiliado, I = invitado, D = en desarrollo. Los tres
// juegan; lo que cambia es de qué torneo pueden participar.
const clubs = [...ARG_CLUBS].sort((a, b) => a.id.localeCompare(b.id));

// La fuente corta `short` a 22 caracteres a lo bruto ("Universitario San Migu",
// "Jockey Concepcion Del "), y eso se ve en la tabla del juego. Acá se rearma:
// primero sin las palabras de tipo de institución, después sin los conectores,
// y si todavía no entra, se corta en un límite de palabra.
const SHORT_MAX = 26;
const TYPE_WORDS = new Set([
    'club', 'rugby', 'rc', 'r.c.', 'social', 'deportivo', 'atletico', 'atlético',
    'asociacion', 'asociación', 'civil', 'cultural', 'hockey', 'and', '&', 'y',
]);
const CONNECTORS = new Set(['de', 'del', 'la', 'el', 'los', 'las']);
const shortOf = (c) => {
    if (c.short.length < 22) return c.short;
    const words = c.name.split(/\s+/).filter((w) => !TYPE_WORDS.has(w.toLowerCase()));
    // "Club de Regatas" sin "Club" empieza en "de": el conector inicial se cae.
    while (words.length > 1 && CONNECTORS.has(words[0].toLowerCase())) words.shift();
    const join = (ws) => ws.join(' ');
    if (join(words).length <= SHORT_MAX) return join(words);
    const tight = words.filter((w) => !CONNECTORS.has(w.toLowerCase()));
    if (join(tight).length <= SHORT_MAX) return join(tight);
    let out = '';
    for (const w of tight) {
        const next = out ? `${out} ${w}` : w;
        if (next.length > SHORT_MAX) break;
        out = next;
    }
    return out || c.short.trim();
};

const clubsTs = `${HEAD('clubsARG.js', 'CLUB_CATALOG_VERSION')}
export const CLUB_CATALOG_VERSION = '1.0.1';

/** Afiliación a la unión: afiliado, invitado, en desarrollo. */
export type Affiliation = 'afiliado' | 'invitado' | 'desarrollo';

export interface ClubDef {
    id: string;
    name: string;
    /** Nombre corto para tablas y placas. */
    short: string;
    /** Tres letras, para la tabla angosta de mobile. */
    code: string;
    unionId: string;
    /** Región del interior, o null si es URBA. */
    regionId: string | null;
    city: string;
    prov: string;
    affiliation: Affiliation;
    /**
     * Fuerza deportiva en escala de la pirámide (~6 el más chico, ~45 el más
     * grande). NO es un OVR de jugador: \`engine/squad.ts\` la convierte.
     */
    rating: number;
    /** Reputación institucional. Mueve la caja y la presión, no el resultado. */
    rep: number;
    /** Colores para la camiseta y el escudo de respaldo. */
    c1: string;
    c2: string;
}

const AFF: Record<string, Affiliation> = { A: 'afiliado', I: 'invitado', D: 'desarrollo' };

export const CLUBS: readonly ClubDef[] = [
${clubs.map((c) => `    { id: ${s(c.id)}, name: ${s(c.name)}, short: ${s(shortOf(c))}, code: ${s(c.code)}, unionId: ${s(c.unionId)}, regionId: ${s(c.regionId ?? null)}, city: ${s(c.city)}, prov: ${s(c.prov)}, affiliation: AFF[${s(c.aff)}], rating: ${c.rating}, rep: ${c.rep}, c1: ${s(c.c1)}, c2: ${s(c.c2)} },`).join('\n')}
];

const CLUB_BY_ID = new Map(CLUBS.map((c) => [c.id, c]));

export function getClub(id: string): ClubDef | null {
    return CLUB_BY_ID.get(id) ?? null;
}
`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'geo.generated.ts'), geoTs, 'utf8');
writeFileSync(join(OUT, 'legacy-clubs.generated.ts'), clubsTs, 'utf8');

const byUnion = {};
clubs.forEach((c) => { byUnion[c.unionId] = (byUnion[c.unionId] || 0) + 1; });
console.log(`legacy-clubs.generated.ts  ${clubs.length} clubes en ${Object.keys(byUnion).length} uniones`);
console.log(`geo.generated.ts    ${unions.length} uniones, ${regions.length} regiones`);
