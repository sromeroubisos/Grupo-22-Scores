/*
 * Selecciones del Seven. La camiseta es la titular de cada país, en los
 * colores con los que juega (no los de la bandera cuando no coinciden: Nueva
 * Zelanda de negro, Australia de amarillo, Sudáfrica de verde y oro).
 *
 * Los países chicos de Rugby Europe Trophy y Conference van con los colores
 * de su bandera (`approx`): no hay referencia firme de su indumentaria.
 *
 * El plantel sale de una semilla por país, así cada selección tiene siempre
 * las mismas caras. El tono de piel y el pelo se reparten según la región,
 * para que un pack de Tonga no se vea igual que uno de Escocia.
 */

import { AR_SEVEN_ROSTERS } from './arRosters.generated';
import { femLook, HAIR_STYLES, type Kit, type Look } from './sprites';
import type { SevenTeam } from './teams';

export type Region = 'europa-norte' | 'europa-sur' | 'europa-este' | 'sudamerica' | 'pacifico' | 'africa-sur' | 'africa' | 'asia' | 'norteamerica' | 'oceania' | 'medio-oriente';

interface NationDef {
    code: string;
    name: string;
    flag: string; // ISO para la bandera
    rating: number;
    region: Region;
    kit: Kit;
    approx?: boolean; // camiseta tomada de la bandera
}

const W = '#f4f4f4';
const K = '#1c1c20';
const NAVY = '#1b2848';
const RED = '#c8102e';
const GREEN = '#0e7a46';
const ROYAL = '#1f4fa0';
const YELLOW = '#f6c700';

const kit = (shirt: string, shirt2: string, shorts: string, socks: string, pattern: Kit['pattern'] = 'liso', collar?: string): Kit => ({ shirt, shirt2, shorts, socks, pattern, collar });

const DEFS: NationDef[] = [
    // --- Rugby Championship / Tri Nations ---
    { code: 'ARG', name: 'Argentina', flag: 'ar', rating: 86, region: 'sudamerica', kit: kit('#7cc6ec', W, NAVY, NAVY, 'aros', NAVY) },
    { code: 'NZL', name: 'Nueva Zelanda', flag: 'nz', rating: 91, region: 'oceania', kit: kit('#26262b', '#26262b', '#26262b', '#26262b', 'liso', W) },
    { code: 'AUS', name: 'Australia', flag: 'au', rating: 82, region: 'oceania', kit: kit('#f6b51e', '#0f5a36', '#f6b51e', '#f6b51e', 'liso', '#0f5a36') },
    { code: 'RSA', name: 'Sudáfrica', flag: 'za', rating: 93, region: 'africa-sur', kit: kit('#0b6b3a', '#f2c230', W, '#0b6b3a', 'liso', '#f2c230') },
    // --- Six Nations ---
    { code: 'ENG', name: 'Inglaterra', flag: 'gb-eng', rating: 87, region: 'europa-norte', kit: kit(W, RED, NAVY, NAVY, 'liso', NAVY) },
    { code: 'FRA', name: 'Francia', flag: 'fr', rating: 89, region: 'europa-sur', kit: kit('#1c2f6b', RED, W, RED, 'liso', W) },
    { code: 'IRL', name: 'Irlanda', flag: 'ie', rating: 90, region: 'europa-norte', kit: kit(GREEN, W, W, GREEN, 'liso', W) },
    { code: 'ITA', name: 'Italia', flag: 'it', rating: 78, region: 'europa-sur', kit: kit('#1f6fc5', W, W, '#1f6fc5', 'liso', W) },
    { code: 'SCO', name: 'Escocia', flag: 'gb-sct', rating: 83, region: 'europa-norte', kit: kit('#1a2a5e', W, W, '#1a2a5e', 'liso', W) },
    { code: 'WAL', name: 'Gales', flag: 'gb-wls', rating: 75, region: 'europa-norte', kit: kit(RED, W, W, RED, 'liso', W) },
    // --- Pacífico y Asia ---
    { code: 'FIJ', name: 'Fiyi', flag: 'fj', rating: 79, region: 'pacifico', kit: kit(W, K, W, K, 'liso', K) },
    { code: 'JPN', name: 'Japón', flag: 'jp', rating: 74, region: 'asia', kit: kit(RED, W, W, RED, 'aros', NAVY) },
    { code: 'SAM', name: 'Samoa', flag: 'ws', rating: 70, region: 'pacifico', kit: kit('#0b3b8c', W, W, '#0b3b8c', 'liso', W) },
    { code: 'TGA', name: 'Tonga', flag: 'to', rating: 68, region: 'pacifico', kit: kit(RED, W, W, RED, 'liso', W) },
    { code: 'HKG', name: 'Hong Kong China', flag: 'hk', rating: 58, region: 'asia', kit: kit(RED, W, W, RED, 'liso', W) },
    // --- Américas ---
    { code: 'USA', name: 'Estados Unidos', flag: 'us', rating: 66, region: 'norteamerica', kit: kit(NAVY, RED, W, NAVY, 'banda', RED) },
    { code: 'CAN', name: 'Canadá', flag: 'ca', rating: 62, region: 'norteamerica', kit: kit(RED, K, K, RED, 'liso', K) },
    { code: 'URU', name: 'Uruguay', flag: 'uy', rating: 68, region: 'sudamerica', kit: kit('#64b5e6', K, K, '#64b5e6', 'liso', K) },
    { code: 'CHI', name: 'Chile', flag: 'cl', rating: 64, region: 'sudamerica', kit: kit(RED, W, ROYAL, RED, 'liso', ROYAL) },
    { code: 'BRA', name: 'Brasil', flag: 'br', rating: 55, region: 'sudamerica', kit: kit(YELLOW, GREEN, ROYAL, W, 'banda', GREEN) },
    { code: 'PAR', name: 'Paraguay', flag: 'py', rating: 52, region: 'sudamerica', kit: kit(RED, W, ROYAL, ROYAL, 'aros', W) },
    { code: 'COL', name: 'Colombia', flag: 'co', rating: 48, region: 'sudamerica', kit: kit(YELLOW, ROYAL, ROYAL, RED, 'liso', ROYAL) },
    { code: 'PER', name: 'Perú', flag: 'pe', rating: 44, region: 'sudamerica', kit: kit(W, RED, W, W, 'banda', RED) },
    { code: 'ECU', name: 'Ecuador', flag: 'ec', rating: 40, region: 'sudamerica', kit: kit(YELLOW, ROYAL, ROYAL, ROYAL, 'liso', ROYAL) },
    { code: 'VEN', name: 'Venezuela', flag: 've', rating: 40, region: 'sudamerica', kit: kit('#7a1f2e', W, W, '#7a1f2e', 'liso', W) },
    { code: 'GUA', name: 'Guatemala', flag: 'gt', rating: 38, region: 'sudamerica', kit: kit('#4aa3df', W, W, '#4aa3df', 'liso', W), approx: true },
    { code: 'HON', name: 'Honduras', flag: 'hn', rating: 36, region: 'sudamerica', kit: kit('#1e5aa8', W, W, '#1e5aa8', 'liso', W), approx: true },
    { code: 'DOM', name: 'República Dominicana', flag: 'do', rating: 36, region: 'sudamerica', kit: kit('#1b3a8c', RED, W, '#1b3a8c', 'banda', RED), approx: true },
    // --- Europa (Rugby Europe y Mundial) ---
    { code: 'GEO', name: 'Georgia', flag: 'ge', rating: 74, region: 'europa-este', kit: kit('#b3121f', W, W, '#b3121f', 'liso', W) },
    { code: 'ESP', name: 'España', flag: 'es', rating: 68, region: 'europa-sur', kit: kit(RED, YELLOW, NAVY, NAVY, 'liso', YELLOW) },
    { code: 'POR', name: 'Portugal', flag: 'pt', rating: 70, region: 'europa-sur', kit: kit(RED, GREEN, W, RED, 'liso', GREEN) },
    { code: 'ROU', name: 'Rumania', flag: 'ro', rating: 64, region: 'europa-este', kit: kit(YELLOW, ROYAL, ROYAL, RED, 'liso', ROYAL) },
    { code: 'GER', name: 'Alemania', flag: 'de', rating: 56, region: 'europa-norte', kit: kit(W, K, K, W, 'liso', K) },
    { code: 'BEL', name: 'Bélgica', flag: 'be', rating: 58, region: 'europa-norte', kit: kit(RED, K, K, RED, 'liso', YELLOW) },
    { code: 'DEN', name: 'Dinamarca', flag: 'dk', rating: 42, region: 'europa-norte', kit: kit(RED, W, W, RED, 'liso', W), approx: true },
    { code: 'LTU', name: 'Lituania', flag: 'lt', rating: 44, region: 'europa-este', kit: kit(YELLOW, GREEN, GREEN, RED, 'banda', RED), approx: true },
    { code: 'MLT', name: 'Malta', flag: 'mt', rating: 40, region: 'europa-sur', kit: kit(RED, W, W, RED, 'liso', W), approx: true },
    { code: 'CZE', name: 'República Checa', flag: 'cz', rating: 46, region: 'europa-este', kit: kit(W, RED, ROYAL, RED, 'banda', ROYAL), approx: true },
    { code: 'SWE', name: 'Suecia', flag: 'se', rating: 42, region: 'europa-norte', kit: kit('#1f5aa6', YELLOW, '#1f5aa6', YELLOW, 'banda', YELLOW), approx: true },
    { code: 'AND', name: 'Andorra', flag: 'ad', rating: 36, region: 'europa-sur', kit: kit(ROYAL, YELLOW, RED, ROYAL, 'banda', YELLOW), approx: true },
    { code: 'AUT', name: 'Austria', flag: 'at', rating: 34, region: 'europa-norte', kit: kit(RED, W, W, RED, 'banda', W), approx: true },
    { code: 'BUL', name: 'Bulgaria', flag: 'bg', rating: 34, region: 'europa-este', kit: kit(GREEN, W, W, RED, 'banda', RED), approx: true },
    { code: 'CYP', name: 'Chipre', flag: 'cy', rating: 36, region: 'europa-sur', kit: kit(W, '#d57800', ROYAL, W, 'banda', '#d57800'), approx: true },
    { code: 'CRO', name: 'Croacia', flag: 'hr', rating: 38, region: 'europa-este', kit: kit(RED, W, W, ROYAL, 'aros', ROYAL), approx: true },
    { code: 'SLO', name: 'Eslovenia', flag: 'si', rating: 34, region: 'europa-este', kit: kit(W, ROYAL, ROYAL, RED, 'banda', RED), approx: true },
    { code: 'EST', name: 'Estonia', flag: 'ee', rating: 32, region: 'europa-norte', kit: kit('#2f6fbf', K, K, W, 'banda', K), approx: true },
    { code: 'FIN', name: 'Finlandia', flag: 'fi', rating: 34, region: 'europa-norte', kit: kit(W, ROYAL, ROYAL, W, 'banda', ROYAL), approx: true },
    { code: 'GIB', name: 'Gibraltar', flag: 'gi', rating: 30, region: 'europa-sur', kit: kit(W, RED, RED, W, 'banda', RED), approx: true },
    { code: 'GRE', name: 'Grecia', flag: 'gr', rating: 32, region: 'europa-sur', kit: kit('#2266b8', W, W, '#2266b8', 'aros', W), approx: true },
    { code: 'ISR', name: 'Israel', flag: 'il', rating: 34, region: 'medio-oriente', kit: kit(W, ROYAL, ROYAL, W, 'banda', ROYAL), approx: true },
    { code: 'KOS', name: 'Kosovo', flag: 'xk', rating: 28, region: 'europa-este', kit: kit('#2449a8', YELLOW, '#2449a8', YELLOW, 'liso', YELLOW), approx: true },
    { code: 'LUX', name: 'Luxemburgo', flag: 'lu', rating: 34, region: 'europa-norte', kit: kit(RED, '#4ab3e6', W, '#4ab3e6', 'banda', '#4ab3e6'), approx: true },
    { code: 'MDA', name: 'Moldavia', flag: 'md', rating: 36, region: 'europa-este', kit: kit(ROYAL, YELLOW, RED, ROYAL, 'banda', YELLOW), approx: true },
    { code: 'MNE', name: 'Montenegro', flag: 'me', rating: 28, region: 'europa-este', kit: kit(RED, '#d4a017', RED, RED, 'banda', '#d4a017'), approx: true },
    { code: 'NOR', name: 'Noruega', flag: 'no', rating: 30, region: 'europa-norte', kit: kit(RED, NAVY, NAVY, RED, 'banda', NAVY), approx: true },
    { code: 'SRB', name: 'Serbia', flag: 'rs', rating: 32, region: 'europa-este', kit: kit(RED, '#1f3b73', '#1f3b73', W, 'banda', W), approx: true },
    { code: 'TUR', name: 'Turquía', flag: 'tr', rating: 32, region: 'medio-oriente', kit: kit(RED, W, W, RED, 'liso', W), approx: true },
    { code: 'UKR', name: 'Ucrania', flag: 'ua', rating: 38, region: 'europa-este', kit: kit(YELLOW, ROYAL, ROYAL, YELLOW, 'liso', ROYAL), approx: true },
    // --- África ---
    { code: 'ZIM', name: 'Zimbabue', flag: 'zw', rating: 57, region: 'africa', kit: kit(GREEN, W, W, GREEN, 'liso', W) },
    { code: 'KEN', name: 'Kenia', flag: 'ke', rating: 60, region: 'africa', kit: kit(RED, GREEN, K, RED, 'banda', GREEN) },
    // Para la clasificación al Mundial (Road to RWC): camisetas armadas con la bandera.
    { code: 'NAM', name: 'Namibia', flag: 'na', rating: 58, region: 'africa', kit: kit(ROYAL, RED, W, ROYAL, 'banda', RED), approx: true },
    { code: 'ALG', name: 'Argelia', flag: 'dz', rating: 46, region: 'africa', kit: kit(GREEN, W, W, GREEN, 'liso', W), approx: true },
    { code: 'UGA', name: 'Uganda', flag: 'ug', rating: 46, region: 'africa', kit: kit(K, YELLOW, K, RED, 'aros', YELLOW), approx: true },
    { code: 'CIV', name: 'Costa de Marfil', flag: 'ci', rating: 42, region: 'africa', kit: kit('#f77f00', GREEN, W, '#f77f00', 'liso', GREEN), approx: true },
    { code: 'SEN', name: 'Senegal', flag: 'sn', rating: 40, region: 'africa', kit: kit(GREEN, YELLOW, W, GREEN, 'banda', YELLOW), approx: true },
    { code: 'ZAM', name: 'Zambia', flag: 'zm', rating: 38, region: 'africa', kit: kit(GREEN, '#ef7d1a', K, GREEN, 'liso', '#ef7d1a'), approx: true },
    // --- Asia (Asia Rugby Championship) ---
    { code: 'KOR', name: 'Corea del Sur', flag: 'kr', rating: 50, region: 'asia', kit: kit(W, RED, ROYAL, W, 'banda', RED), approx: true },
    { code: 'UAE', name: 'Emiratos Árabes', flag: 'ae', rating: 46, region: 'asia', kit: kit(W, GREEN, K, RED, 'banda', RED), approx: true },
    { code: 'MAS', name: 'Malasia', flag: 'my', rating: 40, region: 'asia', kit: kit(NAVY, YELLOW, NAVY, RED, 'banda', YELLOW), approx: true },
    // --- Europa (Rugby Europe Championship) ---
    { code: 'NED', name: 'Países Bajos', flag: 'nl', rating: 52, region: 'europa-norte', kit: kit('#ef7d1a', W, K, '#ef7d1a', 'liso', W), approx: true },
    { code: 'SUI', name: 'Suiza', flag: 'ch', rating: 44, region: 'europa-norte', kit: kit(RED, W, W, RED, 'liso', W), approx: true },
];

/*
 * Selecciones que solo están en la rama femenina (no tienen seleccionado de
 * varones en el juego): China, México, Polonia y Kazajistán juegan el circuito
 * de seven y los torneos continentales.
 */
const FEM_ONLY: NationDef[] = [
    { code: 'CHN', name: 'China', flag: 'cn', rating: 50, region: 'asia', kit: kit(RED, YELLOW, RED, RED, 'liso', YELLOW), approx: true },
    { code: 'MEX', name: 'México', flag: 'mx', rating: 45, region: 'norteamerica', kit: kit(GREEN, W, W, RED, 'banda', RED), approx: true },
    { code: 'POL', name: 'Polonia', flag: 'pl', rating: 44, region: 'europa-este', kit: kit(W, RED, RED, W, 'banda', RED), approx: true },
    { code: 'KAZ', name: 'Kazajistán', flag: 'kz', rating: 42, region: 'asia', kit: kit('#2aa7d8', YELLOW, '#2aa7d8', '#2aa7d8', 'liso', YELLOW), approx: true },
];

/*
 * Nivel de cada seleccionado femenino, por el escalón que juega: las del WXV 1
 * y la élite del circuito de seven arriba (Inglaterra, Nueva Zelanda, Canadá,
 * Francia), después el WXV 2 y las que pelean cuartos en el seven, el WXV 3 y
 * las campeonas continentales, y abajo las que recién arman su programa. Las
 * que no están acá salen del nivel de los varones, bajado: un país sin
 * seleccionado femenino fuerte no hereda la fuerza de su pack.
 */
const FEM_RATING: Record<string, number> = {
    ENG: 93, NZL: 92, CAN: 89, FRA: 88, AUS: 86, USA: 84, IRL: 80, FIJ: 78, ITA: 77, SCO: 75, CHN: 74,
    WAL: 72, JPN: 72, ESP: 72, RSA: 70, BRA: 68, ARG: 66, SAM: 64, NED: 62, KEN: 60, KAZ: 60, POL: 60,
    MEX: 58, COL: 58, HKG: 58, BEL: 58, GER: 56, POR: 56, PAR: 56, SWE: 54, CHI: 54, UGA: 54, URU: 52, TGA: 52,
    CZE: 48, VEN: 48, ROU: 46, ZIM: 46, PER: 46, SUI: 46, GUA: 44, DEN: 44, NOR: 44, ECU: 42, DOM: 42, NAM: 42,
    FIN: 42, KOR: 42, MAS: 40, GEO: 40, HON: 40, LTU: 40,
};
const femRating = (d: NationDef) => FEM_RATING[d.code] ?? Math.round(30 + (d.rating - 30) * 0.45);

/* ---- planteles por región ---- */

interface Pool {
    skin: number[]; // pesos por tono, del más claro al más oscuro
    hair: number[]; // pesos por color de pelo (mismo orden que HAIR_COLORS)
    style: number[]; // pesos por peinado (mismo orden que HAIR_STYLES)
    beard: number;
}

//                 corto rulos afro rapado rodete vincha trenzas pelado
const STYLE_EU = [6, 2, 0, 3, 0.4, 0.6, 0, 1];
const STYLE_MIX = [5, 3, 1, 3, 0.6, 0.8, 0.5, 1];
const STYLE_PAC = [2, 3, 2, 4, 2, 1, 1, 1.5];
const STYLE_AFR = [1, 1, 3, 5, 0, 0.6, 1.5, 1.5];

const POOLS: Record<Region, Pool> = {
    'europa-norte': { skin: [5, 4, 1, 0.3, 0.2, 0.2, 0.1], hair: [2, 3, 2, 3, 1.5, 1, 0.5, 0.3], style: STYLE_EU, beard: 0.35 },
    'europa-sur': { skin: [2, 4, 3, 1, 0.3, 0.2, 0.1], hair: [4, 4, 2, 0.5, 0.2, 0.2, 2, 0.2], style: STYLE_EU, beard: 0.4 },
    'europa-este': { skin: [4, 4, 1.5, 0.3, 0.1, 0.1, 0], hair: [3, 4, 2, 1, 0.3, 0.3, 1, 0.2], style: STYLE_EU, beard: 0.45 },
    'medio-oriente': { skin: [1, 3, 3, 2, 0.5, 0.2, 0.1], hair: [5, 3, 1, 0.2, 0, 0, 3, 0.2], style: STYLE_EU, beard: 0.45 },
    sudamerica: { skin: [1.5, 3, 3, 2, 1, 0.5, 0.3], hair: [4, 4, 2, 0.6, 0.2, 0.2, 2, 0.1], style: STYLE_MIX, beard: 0.35 },
    norteamerica: { skin: [3, 2.5, 1.5, 1, 1, 1, 0.8], hair: [3, 3, 2, 1.5, 0.5, 0.3, 2, 0.2], style: STYLE_MIX, beard: 0.35 },
    oceania: { skin: [2.5, 2, 1, 1, 1.5, 1.5, 1], hair: [3, 2, 1.5, 1.5, 0.3, 0.3, 3, 0.2], style: STYLE_MIX, beard: 0.35 },
    pacifico: { skin: [0, 0, 0.3, 1.5, 3, 3, 2], hair: [4, 1, 0, 0, 0, 0, 5, 0], style: STYLE_PAC, beard: 0.3 },
    'africa-sur': { skin: [2.5, 1.5, 1, 1, 1, 1.5, 2], hair: [3, 2, 1.5, 1, 0.5, 0.3, 3, 0.2], style: STYLE_MIX, beard: 0.35 },
    africa: { skin: [0, 0, 0, 0.5, 1.5, 3, 4], hair: [3, 0.5, 0, 0, 0, 0, 6, 0], style: STYLE_AFR, beard: 0.25 },
    asia: { skin: [3, 4, 2, 0.5, 0, 0, 0], hair: [3, 1, 0.3, 0, 0, 0, 6, 0], style: [6, 1, 0, 4, 0.3, 0.5, 0, 0.8], beard: 0.1 },
};

function seeded(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
}

function pick(weights: number[], r: () => number): number {
    const total = weights.reduce((a, b) => a + b, 0);
    let x = r() * total;
    for (let i = 0; i < weights.length; i++) {
        x -= weights[i];
        if (x < 0) return i;
    }
    return weights.length - 1;
}

export function squadFor(code: string, region: Region): Look[] {
    const pool = POOLS[region];
    const r = seeded(hash(code));
    return Array.from({ length: 7 }, () => {
        const skin = pick(pool.skin, r);
        let hair = pick(pool.hair, r);
        // Rubio o colorado sobre piel muy oscura casi no aparece: se corrige a negro.
        if (skin >= 5 && (hair === 3 || hair === 4)) hair = 6;
        return { skin, hair, style: pick(pool.style.slice(0, HAIR_STYLES.length), r), beard: r() < pool.beard };
    });
}

export const NATIONS: SevenTeam[] = DEFS.map((d) => ({
    id: `nat-${d.code.toLowerCase()}`,
    name: d.name,
    short: d.code,
    kit: d.kit,
    players: squadFor(d.code, d.region),
    rating: d.rating,
    flag: d.flag,
    // Los 7 con más puntos de la selección en la base (apellido recortado); sin datos, los de fábrica.
    names: AR_SEVEN_ROSTERS[`nat-${d.code.toLowerCase()}`]?.map((short) => {
        const [first, ...rest] = short.split(' ');
        return { first, last: rest.join(' '), short };
    }),
}));

/** Todas las selecciones, también en femenino. El código de la jugadora es el del país con "-F" (ARG-F). */
const FEM_DEFS = [...DEFS, ...FEM_ONLY];
export const femCode = (code: string) => `${code}-F`;
export const FEM_NATIONS: SevenTeam[] = FEM_DEFS.map((d) => ({
    id: `natf-${d.code.toLowerCase()}`,
    name: d.name,
    short: d.code,
    kit: d.kit,
    players: squadFor(femCode(d.code), d.region).map(femLook),
    rating: femRating(d),
    flag: d.flag,
    fem: true,
}));

export const NATION_BY_CODE: Record<string, SevenTeam> = Object.fromEntries([
    ...DEFS.map((d, i) => [d.code, NATIONS[i]] as const),
    ...FEM_DEFS.map((d, i) => [femCode(d.code), FEM_NATIONS[i]] as const),
]);

/** Continentes para elegir selección: se pasan uno por uno con las flechas. */
export type Zone = 'América' | 'Europa' | 'África' | 'Asia' | 'Oceanía';
export const ZONES: Zone[] = ['América', 'Europa', 'África', 'Asia', 'Oceanía'];
const ZONE_OF_REGION: Record<Region, Zone> = {
    sudamerica: 'América',
    norteamerica: 'América',
    'europa-norte': 'Europa',
    'europa-sur': 'Europa',
    'europa-este': 'Europa',
    'medio-oriente': 'Europa', // Israel y Turquía juegan en Rugby Europe
    pacifico: 'Oceanía',
    oceania: 'Oceanía',
    asia: 'Asia',
    'africa-sur': 'África',
    africa: 'África',
};
/** Zona de cada selección, para filtrar la lista. */
export const NATION_ZONE: Record<string, Zone> = Object.fromEntries([
    ...DEFS.map((d) => [`nat-${d.code.toLowerCase()}`, ZONE_OF_REGION[d.region]] as const),
    ...FEM_DEFS.map((d) => [`natf-${d.code.toLowerCase()}`, ZONE_OF_REGION[d.region]] as const),
]);

/** Selecciones cuya camiseta sale de la bandera, para avisarlo en pantalla. */
export const APPROX_KIT = new Set(FEM_DEFS.filter((d) => d.approx).flatMap((d) => [`nat-${d.code.toLowerCase()}`, `natf-${d.code.toLowerCase()}`]));

/** Región geográfica por código (para saber qué clasificatorio al Mundial juega cada selección). */
export const REGION_BY_CODE: Record<string, Region> = Object.fromEntries(FEM_DEFS.map((d) => [d.code, d.region]));
