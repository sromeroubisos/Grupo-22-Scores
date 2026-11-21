/*
 * Rugby de clubes argentino en el Seven.
 *
 * Clubes, divisiones, fuerza y cupos salen del canon de la Carrera (vía
 * `arClubs.generated.ts`, que además trae el color principal de cada club de
 * la base). Acá se arma lo jugable: el equipo de cada club y los torneos de
 * la temporada 2026, cada uno con su formato.
 *
 * Las dos ramas no se mezclan (URBA e interior). Se cruzan una sola vez, en el
 * Nacional de Clubes: campeón del Top 14 de la URBA contra campeón del TDI A.
 * Los cupos del Torneo del Interior son de la REGIÓN: salen de su regional, en
 * orden de fuerza.
 */

import { AR_SEVEN_CLUBS as GEN_CLUBS, AR_SEVEN_CUPOS, AR_SEVEN_DIVISIONS as GEN_DIVISIONS, type ArSevenClub, type ArSevenDivision } from './arClubs.generated';
import { squadFor } from './nations';
import type { Kit } from './sprites';
import type { SevenTeam } from './teams';
import type { TourDef } from './tours';

/*
 * Lo que el juego le agrega al canon (sin tocar el archivo generado):
 *
 *   · El Desarrollo de Córdoba: las dos ligas de la UCR (Capital-Este y
 *     Sur-Centro, de la base de G22). Su campeón juega el repechaje contra el
 *     último del Súper 9 por un lugar en el Súper 9.
 *   · El Torneo Andino ya no asciende al NOA B: sus cuatro mejores juegan el
 *     Regional A de Córdoba con los cuatro mejores del Súper 9, y los cuatro
 *     que siguen, el Regional B.
 *   · Tierra del Fuego y Santa Cruz alimentan el Regional Patagónico, no el
 *     Austral.
 */
const CBA_ZONE_NAMES: string[][] = [
    ['Ajedrez Cosquín', 'Asociación Cordobesa Volantes', 'Chelcos de Villa del Rosario', 'Conas', 'Cuises Porteña', 'Los Toros de Brinkmann', 'Mañke', 'Rosedal', 'Salsipuedes', 'Universidad Siglo 21', 'Villa Libertador'],
    ['Águilas de General Deheza', 'Universitario de Villa María', 'Jockey Club Río Cuarto', 'Las Iguanas', 'Los Patriotas de Ucacha', 'Los Tordos de Hernando', 'Mackenna', 'Mirage', 'Náutico Fitz Simon', 'Oliva', 'Ranqueles', 'Unión Oncativo', 'Villa General Belgrano'],
];
export const CBA_DESARROLLO_ZONES: string[][] = CBA_ZONE_NAMES.map((zone) => zone.map((name) => `ar-cba-${name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`));

const CBA_NAMES = CBA_ZONE_NAMES.flat();
// Los que tienen más estructura (ciudades grandes) un poco arriba; el resto, de desarrollo.
const CBA_STRONGER = new Set(['Jockey Club Río Cuarto', 'Universitario de Villa María', 'Universidad Siglo 21', 'Villa General Belgrano', 'Oliva']);
const CBA_CLUBS: ArSevenClub[] = CBA_DESARROLLO_ZONES.flat().map((id, i) => ({
    id,
    name: CBA_NAMES[i],
    short: CBA_NAMES[i].replace(/^(Los|Las|Club|Asociación)\s+/, '').slice(0, 3).toUpperCase(),
    color: null,
    rating: CBA_STRONGER.has(CBA_NAMES[i]) ? 31 : 26 + (i % 4),
    division: 'ar-centro-desarrollo',
    ranking: null,
}));

/** Las ramas de la carrera: las dos argentinas y, aparte (no se cruzan con las argentinas), Chile, Uruguay y Brasil. */
export type ArBranch = 'urba' | 'interior' | 'chile' | 'uruguay' | 'brasil';
export interface GameDivision extends Omit<ArSevenDivision, 'branch'> {
    branch: ArBranch;
}
/** Un club del juego: los extranjeros traen su lista de nombres y su nivel fijo (no están en el ranking argentino). */
export interface GameClub extends ArSevenClub {
    pool?: string;
    fixed?: number;
}
export const isArgBranch = (b: ArBranch) => b === 'urba' || b === 'interior';

const slug = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Ligas de afuera, de la base de G22 (temporada 2026). Sin los equipos B ni
 * los repetidos (el segundo equipo de un club que ya juega más arriba). El
 * nivel va de mayor a menor según el orden de cada lista.
 */
const FOREIGN: { div: Omit<GameDivision, 'clubs'>; pool: string; top: number; clubs: [string, string | null][] }[] = [
    {
        div: { id: 'cl-top10', label: 'Top 10 de ARUSA', branch: 'chile', region: 'chile', level: 1, promotesTo: null, relegatesTo: 'cl-segunda' },
        pool: 'latam', top: 68,
        clubs: [['Old Boys', '#495270'], ['Universidad Católica', '#1f5bab'], ['COBS', '#322952'], ['Old Mackayans', '#000776'], ['Sporting', '#000000'], ['Stade Français', '#eb2a2e'], ['Old Reds', '#ed1c24'], ['PWCC', '#cfa976'], ['Old Georgians', '#f9bd18'], ['CD Alumni', '#efdd1f'], ['Old Johns', '#e10019'], ['Santo Tomás', null], ['Los Troncos', null], ['Viña Rugby Club', null]],
    },
    {
        div: { id: 'cl-segunda', label: 'Segunda de ARUSA', branch: 'chile', region: 'chile', level: 2, promotesTo: 'cl-top10', relegatesTo: 'cl-tercera' },
        pool: 'latam', top: 52,
        clubs: [['Old Gabs', '#801740'], ['Tabancura', '#65c3f3'], ['Gauchos', '#e2332b'], ['Old Locks', '#ffac01'], ['Old Newlanders', '#0e4b12'], ['All Brads', '#215a3f'], ['Lagartos', '#20351f']],
    },
    {
        div: { id: 'cl-tercera', label: 'Tercera de ARUSA', branch: 'chile', region: 'chile', level: 3, promotesTo: 'cl-segunda', relegatesTo: 'cl-cuarta' },
        pool: 'latam', top: 45,
        clubs: [['Costa del Sol', null], ['Halcones', null], ['IRC', null], ['Lions', null], ['Mano Rugby', null], ['Old Navy', null], ['Trapiales', null]],
    },
    {
        div: { id: 'cl-cuarta', label: 'Cuarta de ARUSA', branch: 'chile', region: 'chile', level: 4, promotesTo: 'cl-tercera', relegatesTo: null },
        pool: 'latam', top: 39,
        clubs: [['Universidad de Chile', null], ['Escuela Militar', null], ['Old Green', null], ['RC Francés', null], ['Toros de Quillota', null], ['URMA', null]],
    },
    {
        div: { id: 'uy-uruguayo', label: 'Uruguayo de Clubes', branch: 'uruguay', region: 'uruguay', level: 1, promotesTo: null, relegatesTo: null },
        pool: 'rio', top: 70,
        clubs: [['Old Christians', '#002c50'], ['Carrasco Polo', '#006ab4'], ['Montevideo Cricket', '#e60000'], ['Champagnat', '#052d4c'], ['Old Boys & Girls', '#d42d00'], ['Trébol de Paysandú', '#009138'], ['Círculo de Tenis', '#2e2a28'], ['Seminario', '#871828'], ['Los Cuervos', '#000000'], ['Lobos de Punta del Este', '#2d3b6a'], ['PSG', '#e33028'], ['Ceibos', '#2a462c']],
    },
    {
        div: { id: 'br-super12', label: 'Super 12 · Primeira Divisão', branch: 'brasil', region: 'brasil', level: 1, promotesTo: null, relegatesTo: 'br-segunda' },
        pool: 'luso', top: 60,
        clubs: [['SPAC', null], ['Pasteur', null], ['São José', null], ['Poli', null], ['Jacareí', null], ['Charrua', null], ['Farrapos', null], ['Desterro', null], ['Rio Branco', null], ['Tornados Indaiatuba', null], ['Nova Lima', null], ['Joaca', null]],
    },
    {
        div: { id: 'br-segunda', label: 'Super 12 · Segunda Divisão', branch: 'brasil', region: 'brasil', level: 2, promotesTo: 'br-super12', relegatesTo: null },
        pool: 'luso', top: 50,
        clubs: [['Niterói', null], ['Rio Rugby', null], ['Brummers', null], ['Serra Gaúcha', null], ['Pé Vermelho', null], ['Leões de Paraisópolis', null], ['Colonos', null], ['Joinville', null], ['Carioca', null], ['Urutu', null], ['Iguanas SJC', null], ['Vitória', null]],
    },
];
const prefixOf = (b: ArBranch) => (b === 'chile' ? 'cl' : b === 'uruguay' ? 'uy' : 'br');
const FOREIGN_CLUBS: GameClub[] = FOREIGN.flatMap((f) =>
    f.clubs.map(([name, color], i) => ({
        id: `${prefixOf(f.div.branch)}-${slug(name)}`,
        name,
        short: name.replace(/^(Old|Los|Las|Club|CD|RC)\s+/, '').slice(0, 3).toUpperCase(),
        color,
        rating: 40,
        division: f.div.id,
        ranking: null,
        pool: f.pool,
        fixed: f.top - i,
    })),
);
const FOREIGN_DIVISIONS: GameDivision[] = FOREIGN.map((f) => ({ ...f.div, clubs: f.clubs.map(([name]) => `${prefixOf(f.div.branch)}-${slug(name)}`) }));

const DIV_OVERRIDE: Record<string, Partial<ArSevenDivision>> = {
    'ar-centro-super9b': { relegatesTo: 'ar-centro-desarrollo' },
    'ar-noa-andina': { promotesTo: null },
    'ar-patagonia-tdf': { promotesTo: 'ar-patagonia-regional' },
    'ar-patagonia-santacruz': { promotesTo: 'ar-patagonia-regional' },
};

/** Clubes del juego: los del canon, el Desarrollo de Córdoba y las ligas de afuera. */
export const AR_SEVEN_CLUBS: GameClub[] = [...GEN_CLUBS, ...CBA_CLUBS, ...FOREIGN_CLUBS];
/** Divisiones del juego: las del canon (con los cruces de arriba), el Desarrollo de Córdoba y las ligas de afuera. */
export const AR_SEVEN_DIVISIONS: GameDivision[] = [
    ...GEN_DIVISIONS.map((d) => ({ ...d, ...(DIV_OVERRIDE[d.id] ?? {}) })),
    { id: 'ar-centro-desarrollo', label: 'Desarrollo de Córdoba', branch: 'interior', region: 'centro', level: 6, promotesTo: 'ar-centro-super9b', relegatesTo: null, clubs: CBA_DESARROLLO_ZONES.flat() },
    ...FOREIGN_DIVISIONS,
];
export { AR_SEVEN_CUPOS };

const NAVY = '#14234a';
const W = '#f4f4f4';
/** Para los clubes que la base todavía no tiene con color: uno fijo por nombre, nunca al azar. */
const FALLBACK = ['#1f4fa0', '#c8102e', '#0b6b3a', '#14234a', '#6e1a2c', '#ef7d1a', '#18181c', '#2c8fd0'];
const PATTERNS: Kit['pattern'][] = ['aros', 'liso', 'banda'];

function hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
}

function luminance(hex: string): number {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/**
 * Camisetas titulares relevadas a mano (fuente: sitios de los clubes y prensa).
 * Mandan sobre el color de la base, que solo trae el principal. Clave = nombre
 * del canon.
 */
const AR_KITS: Record<string, Kit> = {
    // Azul y rojo, a aros (dato confirmado por el proyecto).
    "La Tablada": { shirt: '#1b2f7a', shirt2: '#c8102e', shorts: '#1b2f7a', socks: '#1b2f7a', pattern: 'aros' },
    "Jockey Club Villa María": { shirt: '#0a7a3c', shirt2: '#ffffff', shorts: '#ffffff', socks: '#c8102e', pattern: 'liso' },
    "San Martín de Villa María": { shirt: '#c8102e', shirt2: '#ffffff', shorts: '#ffffff', socks: '#c8102e', pattern: 'liso' },
    "Córdoba Rugby Club": { shirt: '#1f3a93', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1f3a93', pattern: 'liso' },
    "Alta Gracia": { shirt: '#f47920', shirt2: '#000000', shorts: '#000000', socks: '#f47920', pattern: 'aros' },
    "Los Cuervos": { shirt: '#111111', shirt2: '#ffffff', shorts: '#111111', socks: '#111111', pattern: 'liso' },
    "San Francisco": { shirt: '#ffffff', shirt2: '#0a7a3c', shorts: '#1f3a93', socks: '#0a7a3c', pattern: 'liso' },
    "Aero Club Río Cuarto": { shirt: '#1f3a93', shirt2: '#c8102e', shorts: '#ffffff', socks: '#1f3a93', pattern: 'liso' },
    "Universitario de Rosario": { shirt: '#0099ff', shirt2: '#000000', shorts: '#000000', socks: '#000000', pattern: 'aros' },
    "Jockey Club de Venado Tuerto": { shirt: '#1f3a93', shirt2: '#c8102e', shorts: '#ffffff', socks: '#1f3a93', pattern: 'liso' },
    "CRAR": { shirt: '#0a7a3c', shirt2: '#ffffff', shorts: '#ffffff', socks: '#0a7a3c', pattern: 'liso' },
    "Logaritmo": { shirt: '#7a1f2b', shirt2: '#1f3a93', shorts: '#1f3a93', socks: '#7a1f2b', pattern: 'aros' },
    "Alma Juniors": { shirt: '#6cace4', shirt2: '#ffffff', shorts: '#ffffff', socks: '#6cace4', pattern: 'liso' },
    "Los Caranchos": { shirt: '#ffffff', shirt2: '#111111', shorts: '#111111', socks: '#ffffff', pattern: 'liso' },
    "Universitario de Santa Fe": { shirt: '#000000', shirt2: '#ffffff', shorts: '#000000', socks: '#000000', pattern: 'liso' },
    "Provincial": { shirt: '#ffffff', shirt2: '#e4002b', shorts: '#ffffff', socks: '#e4002b', pattern: 'liso' },
    "Tilcara": { shirt: '#096b44', shirt2: '#ffffff', shorts: '#ffffff', socks: '#096b44', pattern: 'liso' },
    "Cha Roga": { shirt: '#c8102e', shirt2: '#1f3a93', shorts: '#ffffff', socks: '#1f3a93', pattern: 'liso' },
    "La Salle Jobson": { shirt: '#1f3a93', shirt2: '#ffffff', shorts: '#1f3a93', socks: '#1f3a93', pattern: 'aros' },
    "San Nicolás Rugby": { shirt: '#ffffff', shirt2: '#c8102e', shorts: '#ffffff', socks: '#40c4d0', pattern: 'liso' },
    "Gimnasia y Esgrima de Pergamino": { shirt: '#1f3a93', shirt2: '#f2b705', shorts: '#1f3a93', socks: '#1f3a93', pattern: 'liso' },
    "Los Pampas de Rufino": { shirt: '#ffffff', shirt2: '#1f3a93', shorts: '#ffffff', socks: '#ffffff', pattern: 'liso' },
    "Mendoza Rugby Club": { shirt: '#1f3a9e', shirt2: '#d62828', shorts: '#ffffff', socks: '#d62828', pattern: 'liso' },
    "Universitario de San Juan": { shirt: '#7a1f2e', shirt2: '#ffffff', shorts: '#ffffff', socks: '#7a1f2e', pattern: 'liso' },
    "Teqüe Rugby Club": { shirt: '#0000cc', shirt2: '#d0102e', shorts: '#ffffff', socks: '#0000cc', pattern: 'liso' },
    "Peumayén": { shirt: '#111111', shirt2: '#ffffff', shorts: '#111111', socks: '#111111', pattern: 'aros' },
    "Huazihul": { shirt: '#d0101e', shirt2: '#111111', shorts: '#111111', socks: '#111111', pattern: 'liso' },
    "Universitario de Mendoza": { shirt: '#1a8a3a', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1a8a3a', pattern: 'aros' },
    "Banco Rugby Club": { shirt: '#ffffff', shirt2: '#00325c', shorts: '#00325c', socks: '#00325c', pattern: 'banda' },
    "Tacurú": { shirt: '#1e3a9a', shirt2: '#f2d000', shorts: '#1e3a9a', socks: '#1e3a9a', pattern: 'liso' },
    "Alfiles": { shirt: '#111111', shirt2: '#ffffff', shorts: '#111111', socks: '#111111', pattern: 'aros' },
    "Jockey Club de San Juan": { shirt: '#1c2a6b', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1c2a6b', pattern: 'liso' },
    "Belgrano Rugby Club": { shirt: '#d62828', shirt2: '#1c2a6b', shorts: '#1c2a6b', socks: '#d62828', pattern: 'liso' },
    "Universitario de Salta": { shirt: '#228b22', shirt2: '#ffffff', shorts: '#ffffff', socks: '#ffffff', pattern: 'aros' },
    "Jockey Club de Salta": { shirt: '#e00000', shirt2: '#ffffff', shorts: '#ffffff', socks: '#e00000', pattern: 'liso' },
    "Lince": { shirt: '#8a8d91', shirt2: '#e03a2a', shorts: '#8a8d91', socks: '#8a8d91', pattern: 'liso' },
    "Tigres": { shirt: '#000000', shirt2: '#d0101e', shorts: '#ffffff', socks: '#000000', pattern: 'aros' },
    "Gimnasia y Tiro": { shirt: '#ffffff', shirt2: '#5bb6e6', shorts: '#ffffff', socks: '#ffffff', pattern: 'liso' },
    "Santiago Lawn Tennis": { shirt: '#c8102e', shirt2: '#ffffff', shorts: '#ffffff', socks: '#c8102e', pattern: 'liso' },
    "Jockey Club de Tucumán": { shirt: '#7a1f24', shirt2: '#87ceeb', shorts: '#ffffff', socks: '#7a1f24', pattern: 'liso' },
    "Old Lions": { shirt: '#c8102e', shirt2: '#1c3f94', shorts: '#ffffff', socks: '#1c3f94', pattern: 'aros' },
    "Tiro Federal de Salta": { shirt: '#ffffff', shirt2: '#3fa9f5', shorts: '#111111', socks: '#111111', pattern: 'banda' },
    "Aguará Guazú": { shirt: '#1c2a6b', shirt2: '#d62828', shorts: '#1c2a6b', socks: '#d62828', pattern: 'liso' },
    "Santiago Rugby": { shirt: '#111111', shirt2: '#1f9a3a', shorts: '#111111', socks: '#f08a1c', pattern: 'liso' },
    "La Querencia": { shirt: '#1f4fbf', shirt2: '#2e9a3a', shorts: '#ffffff', socks: '#1f4fbf', pattern: 'liso' },
    "Los Teros": { shirt: '#111111', shirt2: '#ffffff', shorts: '#111111', socks: '#111111', pattern: 'liso' },
    "Los Hurones": { shirt: '#111111', shirt2: '#c9a227', shorts: '#111111', socks: '#111111', pattern: 'liso' },
    "Los Chelcos": { shirt: '#1f9a3a', shirt2: '#f2d000', shorts: '#ffffff', socks: '#1f9a3a', pattern: 'aros' },
    "Catamarca Rugby Club": { shirt: '#111111', shirt2: '#f0a020', shorts: '#111111', socks: '#111111', pattern: 'liso' },
    "Club Social Rugby": { shirt: '#d62828', shirt2: '#1c3f94', shorts: '#1c3f94', socks: '#1c3f94', pattern: 'liso' },
    "Aranduroga": { shirt: '#111111', shirt2: '#ffffff', shorts: '#111111', socks: '#111111', pattern: 'aros' },
    "CURNE": { shirt: '#f5c400', shirt2: '#c8102e', shorts: '#111111', socks: '#f5c400', pattern: 'liso' },
    "San Patricio de Corrientes": { shirt: '#1e7b3a', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1e7b3a', pattern: 'liso' },
    "CAPRI": { shirt: '#1f4fa3', shirt2: '#ffffff', shorts: '#1f4fa3', socks: '#1f4fa3', pattern: 'liso' },
    "Regatas Resistencia": { shirt: '#c8102e', shirt2: '#ffffff', shorts: '#ffffff', socks: '#c8102e', pattern: 'liso' },
    "Sixty": { shirt: '#1f3f8f', shirt2: '#ffffff', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'liso' },
    "Aguará": { shirt: '#1f3f8f', shirt2: '#6cace4', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'aros' },
    "San José de Paraguay": { shirt: '#6cace4', shirt2: '#ffffff', shorts: '#ffffff', socks: '#6cace4', pattern: 'liso' },
    "CURDA": { shirt: '#1f3f8f', shirt2: '#ffffff', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'liso' },
    "Pay Ubre": { shirt: '#c8102e', shirt2: '#1f3f8f', shorts: '#1f3f8f', socks: '#c8102e', pattern: 'liso' },
    "Italiana de Charata": { shirt: '#1f4fa3', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1f4fa3', pattern: 'liso' },
    "Chajá": { shirt: '#1e7b3a', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1e7b3a', pattern: 'liso' },
    "Centro Cazadores": { shirt: '#1f3f8f', shirt2: '#c8102e', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'aros' },
    "Carayá": { shirt: '#1e7b3a', shirt2: '#f5c400', shorts: '#1e7b3a', socks: '#1e7b3a', pattern: 'liso' },
    "Caza y Pesca": { shirt: '#c8102e', shirt2: '#ffffff', shorts: '#ffffff', socks: '#c8102e', pattern: 'liso' },
    "Argentino de Bahía Blanca": { shirt: '#1f3f8f', shirt2: '#ffffff', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'liso' },
    "IPR Sporting": { shirt: '#111111', shirt2: '#ffffff', shorts: '#111111', socks: '#111111', pattern: 'liso' },
    "Comercial Rugby Club": { shirt: '#1e7b3a', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1e7b3a', pattern: 'liso' },
    "Los Cardos": { shirt: '#1e7b3a', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1e7b3a', pattern: 'liso' },
    "San Ignacio": { shirt: '#1e7b3a', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1e7b3a', pattern: 'liso' },
    "Universitario de Bahía Blanca": { shirt: '#1f3f8f', shirt2: '#ffffff', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'liso' },
    "Estudiantes de Olavarría": { shirt: '#111111', shirt2: '#ffffff', shorts: '#111111', socks: '#111111', pattern: 'liso' },
    "Los 50": { shirt: '#111111', shirt2: '#5b2a86', shorts: '#1f2a5a', socks: '#111111', pattern: 'aros' },
    "Biguá": { shirt: '#1f3f8f', shirt2: '#ffffff', shorts: '#1f3f8f', socks: '#c8102e', pattern: 'aros' },
    "Unión del Sur": { shirt: '#1f3f8f', shirt2: '#ffffff', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'banda' },
    "Pueyrredón de Mar del Plata": { shirt: '#1f3f8f', shirt2: '#ffffff', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'liso' },
    "Uncas": { shirt: '#f5c400', shirt2: '#111111', shorts: '#111111', socks: '#111111', pattern: 'aros' },
    "Los Miuras": { shirt: '#c8102e', shirt2: '#111111', shorts: '#111111', socks: '#c8102e', pattern: 'liso' },
    "El Nacional": { shirt: '#6cace4', shirt2: '#ffffff', shorts: '#ffffff', socks: '#6cace4', pattern: 'liso' },
    "Santa Rosa de La Pampa": { shirt: '#1f3f8f', shirt2: '#ffffff', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'liso' },
    "Punta Alta Rugby Club": { shirt: '#1f3f8f', shirt2: '#ffffff', shorts: '#1f3f8f', socks: '#1f3f8f', pattern: 'liso' },
    "Pico Rugby Club": { shirt: '#111111', shirt2: '#c8102e', shorts: '#111111', socks: '#111111', pattern: 'aros' },
    "Trelew": { shirt: '#1d4fa0', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1d4fa0', pattern: 'liso' },
    "Bigornia Club": { shirt: '#ff8800', shirt2: '#000000', shorts: '#000000', socks: '#000000', pattern: 'aros' },
    "Chenque": { shirt: '#6cace4', shirt2: '#ffffff', shorts: '#ffffff', socks: '#6cace4', pattern: 'liso' },
    "Neuquén": { shirt: '#1f3a93', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1f3a93', pattern: 'liso' },
    "Roca": { shirt: '#c8102e', shirt2: '#1f3a93', shorts: '#1f3a93', socks: '#c8102e', pattern: 'liso' },
    "Deportivo Portugués": { shirt: '#c8102e', shirt2: '#00843d', shorts: '#00843d', socks: '#c8102e', pattern: 'liso' },
    "Marabunta": { shirt: '#00843d', shirt2: '#ffffff', shorts: '#ffffff', socks: '#00843d', pattern: 'aros' },
    "Las Águilas": { shirt: '#d6168b', shirt2: '#000000', shorts: '#000000', socks: '#000000', pattern: 'liso' },
    "Puerto Madryn": { shirt: '#1f24b4', shirt2: '#c8102e', shorts: '#ffffff', socks: '#1f24b4', pattern: 'aros' },
    "Calafate": { shirt: '#1f3a93', shirt2: '#000000', shorts: '#000000', socks: '#1f3a93', pattern: 'aros' },
    "Comodoro": { shirt: '#1f3a93', shirt2: '#c8102e', shorts: '#ffffff', socks: '#1f3a93', pattern: 'liso' },
    "Patoruzú": { shirt: '#f5c400', shirt2: '#000000', shorts: '#000000', socks: '#000000', pattern: 'aros' },
    "Universitario de Comodoro": { shirt: '#1f3a93', shirt2: '#c8102e', shorts: '#ffffff', socks: '#1f3a93', pattern: 'liso' },
    "Draig Goch": { shirt: '#c8102e', shirt2: '#ffffff', shorts: '#ffffff', socks: '#c8102e', pattern: 'liso' },
    "San Jorge de la Austral": { shirt: '#ffffff', shirt2: '#000000', shorts: '#000000', socks: '#000000', pattern: 'aros' },
    "Allen": { shirt: '#000000', shirt2: '#ffffff', shorts: '#000000', socks: '#000000', pattern: 'aros' },
    "Cipolletti": { shirt: '#000000', shirt2: '#ffffff', shorts: '#000000', socks: '#000000', pattern: 'liso' },
    "Ushuaia Rugby Club": { shirt: '#1f3a93', shirt2: '#ffffff', shorts: '#1f3a93', socks: '#1f3a93', pattern: 'liso' },
    "Macá Tobiano": { shirt: '#00843d', shirt2: '#000000', shorts: '#000000', socks: '#00843d', pattern: 'liso' },
    "CASI": { shirt: '#000000', shirt2: '#ffffff', shorts: '#ffffff', socks: '#ffffff', pattern: 'aros' },
    "Newman": { shirt: '#7d1222', shirt2: '#f06030', shorts: '#7d1222', socks: '#008000', pattern: 'liso' },
    "Alumni": { shirt: '#f80000', shirt2: '#ffffff', shorts: '#ffffff', socks: '#f80000', pattern: 'aros' },
    "Hindú Club": { shirt: '#0199e4', shirt2: '#f8c800', shorts: '#ffffff', socks: '#0199e4', pattern: 'aros' },
    "SIC": { shirt: '#ffffff', shirt2: '#28a8e0', shorts: '#ffffff', socks: '#0000cc', pattern: 'aros' },
    "Belgrano Athletic": { shirt: '#601b27', shirt2: '#ffcc00', shorts: '#ffffff', socks: '#601b27', pattern: 'aros' },
    "CUBA": { shirt: '#0099ff', shirt2: '#000000', shorts: '#000000', socks: '#000000', pattern: 'liso' },
    "Los Tilos": { shirt: '#009900', shirt2: '#ffcc00', shorts: '#ffffff', socks: '#009900', pattern: 'liso' },
    "Regatas Bella Vista": { shirt: '#f8c800', shirt2: '#000080', shorts: '#ffffff', socks: '#000080', pattern: 'aros' },
    "Buenos Aires": { shirt: '#1a2d69', shirt2: '#ffffff', shorts: '#1a2d69', socks: '#ff0000', pattern: 'liso' },
    "La Plata": { shirt: '#ffdd00', shirt2: '#000066', shorts: '#000066', socks: '#000066', pattern: 'liso' },
    "Los Matreros": { shirt: '#ffffff', shirt2: '#ff0000', shorts: '#ffffff', socks: '#ffffff', pattern: 'liso' },
    "Atlético del Rosario": { shirt: '#af003d', shirt2: '#87ceeb', shorts: '#ffffff', socks: '#af003d', pattern: 'aros' },
    "Champagnat": { shirt: '#003060', shirt2: '#ffffff', shorts: '#ffffff', socks: '#043464', pattern: 'banda' },
    "Jockey Club Córdoba": { shirt: '#ffffff', shirt2: '#ff0000', shorts: '#ffffff', socks: '#ff0000', pattern: 'aros' },
    "Tala": { shirt: '#ffffff', shirt2: '#000000', shorts: '#000000', socks: '#000000', pattern: 'aros' },
    "Córdoba Athletic": { shirt: '#ff0000', shirt2: '#000000', shorts: '#000000', socks: '#ff0000', pattern: 'liso' },
    "Universitario de Córdoba": { shirt: '#ffffff', shirt2: '#f81010', shorts: '#ffffff', socks: '#ffffff', pattern: 'banda' },
    "Duendes": { shirt: '#339900', shirt2: '#000000', shorts: '#000000', socks: '#339900', pattern: 'liso' },
    "Jockey Club de Rosario": { shirt: '#337700', shirt2: '#ffffff', shorts: '#ffffff', socks: '#ff0000', pattern: 'aros' },
    "Gimnasia y Esgrima de Rosario": { shirt: '#1a2a6c', shirt2: '#ffd700', shorts: '#1a2a6c', socks: '#1a2a6c', pattern: 'liso' },
    "Old Resian": { shirt: '#ffffff', shirt2: '#c8102e', shorts: '#ffffff', socks: '#1a2d69', pattern: 'aros' },
    "Santa Fe Rugby Club": { shirt: '#ffffff', shirt2: '#ff0000', shorts: '#063871', socks: '#ff0000', pattern: 'aros' },
    "CRAI": { shirt: '#4493de', shirt2: '#ffffff', shorts: '#000044', socks: '#000044', pattern: 'aros' },
    "Los Tordos": { shirt: '#a50c14', shirt2: '#132142', shorts: '#ffffff', socks: '#a50c14', pattern: 'aros' },
    "Marista": { shirt: '#ffffff', shirt2: '#f80000', shorts: '#ffffff', socks: '#ff0000', pattern: 'banda' },
    "Natación y Gimnasia": { shirt: '#ffffff', shirt2: '#003070', shorts: '#ffffff', socks: '#000000', pattern: 'banda' },
    "Palermo Bajo": { shirt: '#980000', shirt2: '#f8a000', shorts: '#ffffff', socks: '#990000', pattern: 'aros' },
    "Urú Curé": { shirt: '#a8a8a8', shirt2: '#000098', shorts: '#000080', socks: '#a9a9a9', pattern: 'liso' },
    "Estudiantes de Paraná": { shirt: '#ffffff', shirt2: '#000000', shorts: '#ffffff', socks: '#000000', pattern: 'liso' },
    "Tucumán Rugby": { shirt: '#009900', shirt2: '#000000', shorts: '#ffffff', socks: '#009900', pattern: 'liso' },
    "Huirapuca": { shirt: '#007700', shirt2: '#ff0000', shorts: '#ffffff', socks: '#007700', pattern: 'aros' },
    "Tucumán Lawn Tennis": { shirt: '#000080', shirt2: '#f8e000', shorts: '#ffffff', socks: '#000066', pattern: 'aros' },
    "Los Tarcos": { shirt: '#ee0000', shirt2: '#ffffff', shorts: '#ffffff', socks: '#ee0000', pattern: 'liso' },
    "Cardenales": { shirt: '#e00000', shirt2: '#000000', shorts: '#000000', socks: '#ffcc00', pattern: 'liso' },
    "Mar del Plata Club": { shirt: '#2e7d32', shirt2: '#ffffff', shorts: '#2e7d32', socks: '#2e7d32', pattern: 'liso' },
};

function kitOf(c: ArSevenClub): Kit {
    const known = AR_KITS[c.name];
    if (known) return known;
    const h = hash(c.name);
    const shirt = c.color && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color.toLowerCase() : FALLBACK[h % FALLBACK.length];
    const lum = luminance(shirt);
    return {
        shirt,
        shirt2: lum > 0.62 ? NAVY : W,
        shorts: lum > 0.62 ? NAVY : lum < 0.12 ? W : NAVY,
        socks: shirt,
        pattern: PATTERNS[(h >> 3) % PATTERNS.length],
    };
}

/** Palabras que no distinguen a un club de otro para armar su sigla. */
const STOP = new Set(['club', 'rugby', 'r', 'c', 'rc', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'asoc', 'asociacion', 'sociedad', 'hockey']);

/**
 * Sigla de tres letras para el marcador: las siglas propias se respetan (CASI,
 * CUBA, SIC), si no las iniciales de las palabras que cuentan, y si no las
 * primeras letras. Si dos clubes chocan, el segundo suma una letra más.
 */
function makeShorts(names: string[]): Map<string, string> {
    const used = new Set<string>();
    const out = new Map<string, string>();
    for (const name of names) {
        const plain = name.normalize('NFD').replace(/[̀-ͯ]/g, '');
        const words = plain.split(/[^A-Za-z0-9]+/).filter((w) => w && !STOP.has(w.toLowerCase()));
        let base: string;
        if (/^[A-Z]{3,4}$/.test(plain.trim())) base = plain.trim();
        else if (words.length >= 2) base = words.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
        else base = (words[0] ?? plain).slice(0, 3).toUpperCase();
        if (base.length < 3) base = (words.join('') || plain).slice(0, 3).toUpperCase();
        let short = base;
        const pool = (words.join('') || plain).toUpperCase();
        for (let i = 3; used.has(short) && i <= pool.length; i++) short = base.slice(0, 2) + pool[i - 1];
        for (let n = 2; used.has(short); n++) short = `${base.slice(0, 2)}${n}`;
        used.add(short);
        out.set(name, short);
    }
    return out;
}
const SHORTS = makeShorts([...AR_SEVEN_CLUBS].sort((a, b) => (b.ranking ?? 0) - (a.ranking ?? 0) || b.rating - a.rating).map((c) => c.name));

/**
 * Fuerza en la escala del juego. Manda el ranking de clubes de Salida de 22,
 * que es de escala ARGENTINA (Newman ~99 por ser el mejor del país, no del
 * mundo): va casi derecho, 30 + ranking × 0,55 (Newman 84, Jockey de Rosario
 * 76, un ranking 50 da 57). Así el mejor argentino queda debajo de la élite
 * profesional (Toulouse 95, Leinster 93) y la distancia entre un club de
 * arriba y uno del montón se siente en la cancha. Los clubes sin ranking toman
 * la fuerza del canon (banda 24-52), llevada a 38-58.
 */
function gameRating(c: GameClub): number {
    if (c.fixed !== undefined) return c.fixed;
    if (c.ranking !== null) return Math.round(30 + c.ranking * 0.55);
    return Math.round(38 + Math.max(0, c.rating - 24) * 0.72);
}

export const AR_CLUBS: SevenTeam[] = AR_SEVEN_CLUBS.map((c) => ({
    id: c.id,
    name: c.name,
    short: SHORTS.get(c.name) ?? c.short,
    kit: kitOf(c),
    players: squadFor(c.id, 'sudamerica'),
    rating: gameRating(c),
    flag: (() => {
        const k = kitOf(c);
        // Banderita con los colores del club (no el escudo): la dibuja FlagIcon a partir de este código.
        return `kit:${k.shirt}:${k.shirt2}:${k.pattern}`;
    })(),
    namePool: c.pool ?? 'rio',
    league: AR_SEVEN_DIVISIONS.find((d) => d.id === c.division)?.label,
}));

const AR_BY_ID: Record<string, SevenTeam> = Object.fromEntries(AR_CLUBS.map((c) => [c.id, c]));
export const arClubById = (id: string): SevenTeam | undefined => AR_BY_ID[id];

/** Divisiones jugables (con al menos cuatro clubes), en el orden del canon: URBA arriba, después el interior. */
/*
 * Nombres como los dice la gente: en Córdoba la segunda categoría es el Súper 9
 * (sus 4 mejores y los del Andino juegan el Regional A, que da el ascenso).
 */
export const AR_LABEL_OVERRIDE: Record<string, string> = {
    'ar-centro-super9b': 'Súper 9 de Córdoba',
};

export const AR_DIVISIONS_PLAYABLE = AR_SEVEN_DIVISIONS.filter((d) => d.clubs.length >= 4).map((d) => ({ ...d, label: AR_LABEL_OVERRIDE[d.id] ?? d.label }));

const byName = (name: string) => AR_SEVEN_CLUBS.find((c) => c.name === name)?.id;

/** Los clasificados al TDI A y al B 2026: los primeros de cada regional, según los cupos de su región. */
function tdiField(which: 'A' | 'B'): string[] {
    const out: string[] = [];
    for (const cupo of AR_SEVEN_CUPOS) {
        const div = AR_SEVEN_DIVISIONS.find((d) => d.id === cupo.sourceCompetitionId);
        if (!div) continue;
        const from = which === 'A' ? 0 : cupo.tdiA;
        const n = which === 'A' ? cupo.tdiA : cupo.tdiB;
        // En orden de fuerza (la del ranking de Salida de 22 cuando el club está rankeado).
        const ordered = [...div.clubs].sort((x, y) => (AR_BY_ID[y]?.rating ?? 0) - (AR_BY_ID[x]?.rating ?? 0));
        out.push(...ordered.slice(from, from + n));
    }
    return out;
}

function divisionTour(d: GameDivision): TourDef {
    const n = d.clubs.length;
    const top: 4 | 2 = n >= 6 ? 4 : 2;
    return {
        id: `ar-tour-${d.id}`,
        name: d.label,
        sub: d.branch === 'urba' ? 'Rama URBA.' : d.branch === 'interior' ? 'Regional del interior.' : d.branch === 'chile' ? 'Chile · ARUSA.' : d.branch === 'uruguay' ? 'Uruguay.' : 'Brasil · CBRu.',
        source: 'real',
        clubs: true,
        cat: isArgBranch(d.branch) ? 'Argentina' : d.branch === 'chile' ? 'Chile' : d.branch === 'uruguay' ? 'Uruguay' : 'Brasil',
        teams: [...d.clubs],
        formatLabel: `${n} clubes · fase regular a una vuelta · ${top === 4 ? 'semifinales' : 'final'} con los ${top} primeros`,
        stage: { kind: 'grupos', groups: 1, advance: top },
    };
}

const newman = byName('Newman');
const tala = byName('Tala');

// Los de más nivel de cada lado, para los otros formatos del Nacional.
const byStrength = (ids: string[]) => [...ids].sort((x, y) => (AR_BY_ID[y]?.rating ?? 0) - (AR_BY_ID[x]?.rating ?? 0));
const U = byStrength(AR_SEVEN_DIVISIONS.find((d) => d.id === 'ar-urba-top14')?.clubs ?? []);
const I = byStrength(AR_SEVEN_CUPOS.flatMap((c) => AR_SEVEN_DIVISIONS.find((d) => d.id === c.sourceCompetitionId)?.clubs ?? []));
const NAC = { source: 'real' as const, clubs: true, cat: 'Argentina' };

/** Torneos argentinos 2026: el Nacional, el Torneo del Interior y cada división (el Top 14 de la URBA primero). */
export const AR_TOURS: TourDef[] = [
    {
        id: 'ddc8bd89-50cc-48c0-be02-3bda4fc437a9', name: 'Nacional de Clubes', sub: 'Campeón del Top 14 de la URBA contra campeón del TDI A.', source: 'real',
        formatLabel: 'Final única · se pueden cambiar los dos equipos', clubs: true, cat: 'Argentina',
        teams: [newman, tala].filter((x): x is string => !!x),
        stage: { kind: 'ko' },
    },
    {
        ...NAC, id: 'ar-nacional-semis', name: 'Nacional de Clubes · semifinales', sub: 'Los dos mejores de la URBA y del interior: campeón contra subcampeón del otro lado.',
        formatLabel: 'Semifinales cruzadas y final',
        teams: [U[0], I[1], I[0], U[1]].filter(Boolean),
        stage: { kind: 'ko', fixed: true },
    },
    {
        ...NAC, id: 'ar-nacional-zonas', name: 'Nacional de Clubes · dos zonas', sub: 'Los cuatro mejores de cada lado, en dos zonas mezcladas.',
        formatLabel: '2 zonas de 4 · semifinales y final',
        teams: [...U.slice(0, 4), ...I.slice(0, 4)],
        stage: { kind: 'grupos', groups: [[U[0], U[3], I[1], I[2]], [I[0], I[3], U[1], U[2]]].map((g) => g.filter(Boolean)), advance: 2 },
    },
    {
        ...NAC, id: 'ar-nacional-a', name: 'Nacional de Clubes A', sub: 'Los 8 mejores de la URBA contra los 8 mejores del interior.',
        formatLabel: '4 zonas de 4 a dos ruedas · cuartos, semifinales y final',
        teams: [...U.slice(0, 8), ...I.slice(0, 8)],
        stage: { kind: 'grupos', groups: 4, advance: 2, legs: 2 },
    },
    {
        ...NAC, id: 'ar-nacional-b', name: 'Nacional de Clubes B', sub: 'Los 6 de abajo del Top 14 y los 10 que siguen del interior.',
        formatLabel: '4 zonas de 4 a dos ruedas · cuartos, semifinales y final',
        teams: [...U.slice(8, 14), ...I.slice(8, 18)],
        stage: { kind: 'grupos', groups: 4, advance: 2, legs: 2 },
    },
    {
        id: 'ed986d61-7389-48e5-b478-c1703b0e8379', name: 'Torneo del Interior A', sub: 'Las 16 plazas del interior, repartidas por región.', source: 'real',
        formatLabel: '4 zonas de 4 a dos ruedas · 1.º y 2.º a cuartos · semifinales y final', clubs: true, cat: 'Argentina',
        teams: tdiField('A'),
        stage: { kind: 'grupos', groups: 4, advance: 2, legs: 2 },
    },
    {
        id: 'e2712855-36f4-4363-978e-5036af5c5449', name: 'Torneo del Interior B', sub: 'El segundo nivel federal: otras 16 plazas regionales.', source: 'real',
        formatLabel: '4 zonas de 4 a dos ruedas · 1.º y 2.º a cuartos · semifinales y final', clubs: true, cat: 'Argentina',
        teams: tdiField('B'),
        stage: { kind: 'grupos', groups: 4, advance: 2, legs: 2 },
    },
    ...AR_DIVISIONS_PLAYABLE.map(divisionTour),
];
