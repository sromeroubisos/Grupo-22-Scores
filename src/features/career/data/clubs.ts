// Catálogo de clubes del motor. Se alimenta del CATÁLOGO REAL 2026-27
// (`clubs2026/rosters2026.ts`, nombres reales aportados por el usuario) con
// valoraciones GENÉRICAS por nivel. Preserva la API histórica del motor
// (getClub/clubLeague/clubTier/clubsByTier/CLUBS/LEAGUES) y agrega el contrato
// de club (level/rating/prestige/marketBand/region/competition/...).
//
// AR/UY/CL NO están acá: se cargan desde Supabase por DI (sub-etapa siguiente).

import { ROSTERS_2026_27, LEVEL_RATING, CATALOG_SEASON, type ClubLevel, type ProfessionalStatus } from './clubs2026/rosters2026.ts';
import { CLUB_STRENGTH, type ClubStrength } from './clubs2026/clubStrength.ts';
import { SA_CLUBS, SA_SNAPSHOT_VERSION } from './clubs2026/saClubs.generated.ts';
import { AR_CLUBS } from './clubs2026/arCatalog.ts';
import { AR_DIVISIONS, AR_SYSTEM_VERSION } from './clubs2026/arSystem2026.ts';

// 2026-27.8: Argentina deja de ser una liga paraguas de cuatro escalones y pasa
// a ser el sistema real de dos ramas (URBA + interior) declarado en
// `clubs2026/arSystem2026.ts`.
// 2026-27.9: entran cinco sistemas nuevos — Major League Rugby y el universitario
// de EE.UU. (dos pirámides paralelas: CRAA D1A y NCR DI), la Divisão de Honra
// portuguesa, la Serie A Élite italiana con su Serie A debajo, y el Super 12
// brasileño. Con ellos, cuatro países más tienen escalera doméstica propia (us,
// pt, it, br) y tres copas nuevas (Taça de Portugal, Supertaça, Coppa Italia).
// 2026-27.10: auditoría del canon argentino contra las temporadas 2025 y 2026.
// El interior se reordena: el "Ascenso del NEA" no existía (es la segunda fase
// del Regional A) y pasa a ser el Regional B/C; aparecen la Copa de Bronce del
// Oeste y el Torneo Andino (Catamarca y La Rioja); el Litoral pierde su tercer
// nivel, que el TRL eliminó en 2026; el Torneo Austral sube a Nivel 6 porque
// clasifica al Regional Patagónico. Cinco clubes estaban a mil kilómetros de su
// casa y volvieron a su región.
export const CLUB_CATALOG_VERSION = '2026-27.10';

/**
 * Versión del catálogo NORMALIZADO completo = estático internacional + snapshot
 * AR/UY/CL. `CLUB_CATALOG_VERSION` versiona los datos estáticos escritos a mano;
 * `SA_SNAPSHOT_VERSION` es el hash del contenido traído de Supabase. Una
 * constante escrita a mano no puede versionar filas remotas mutables: por eso
 * son dos piezas y la carrera sella las dos.
 */
export const NORMALIZED_CATALOG_VERSION = `${CLUB_CATALOG_VERSION}+sa.${SA_SNAPSHOT_VERSION}+ar.${AR_SYSTEM_VERSION}`;

export type MarketBand = number; // 1 amateur … 6 gigante
export type { ProfessionalStatus };

// Nivel → tier histórico (1 elite … 4 desarrollo) para compatibilidad del motor.
const LEVEL_TIER: Record<ClubLevel, number> = {
    'elite-world': 1,
    'elite-pro': 1,
    'pro-second': 2,
    'pro-regional': 3,
    semipro: 3,
    development: 4,
    amateur: 4,
};

const LEVEL_PRO: Record<ClubLevel, ProfessionalStatus> = {
    'elite-world': 'professional',
    'elite-pro': 'professional',
    'pro-second': 'professional',
    'pro-regional': 'semi',
    semipro: 'semi',
    development: 'amateur',
    amateur: 'amateur',
};

// Fuerza por defecto (solo si un club no tuviera entrada explícita): punto medio
// de la banda de referencia del nivel. En la práctica todos tienen valor explícito.
function fallbackStrength(level: ClubLevel): ClubStrength {
    const [lo, hi] = LEVEL_RATING[level];
    const mid = Math.round((lo + hi) / 2);
    const band: Record<ClubLevel, number> = {
        'elite-world': 6, 'elite-pro': 6, 'pro-second': 4, 'pro-regional': 3, semipro: 3, development: 2, amateur: 1,
    };
    return { rating: mid, prestige: mid, marketBand: band[level] };
}

// Competiciones europeas con acceso a copa continental (Champions/Challenge).
const CONTINENTAL_COMPS = new Set(['top14', 'prod2', 'prem', 'championship', 'urc']);

// ── Contrato de club ─────────────────────────────────────────────────────────
export interface ClubDef {
    id: string;
    labelEs: string; // = name (compat con la API vieja)
    league: string; // = competitionId (compat)
    prestige: number;

    // Contrato 2026-27
    name: string;
    shortName: string;
    countryCode: string;
    region: string;
    competitionId: string;
    level: ClubLevel;
    rating: number;
    marketBand: MarketBand;
    professionalStatus: ProfessionalStatus;
    /**
     * De dónde salió el club:
     *   · `career-static` — roster internacional escrito a mano en este repo;
     *   · `canon-ar` — sistema argentino declarado en `arSystem2026.ts` (la
     *     división y la fuerza salen del canon; el `sourceId` con el que se pide
     *     el escudo se hereda del catálogo real);
     *   · `supabase` — fila del catálogo real (hoy Uruguay y Chile).
     */
    source: 'career-static' | 'canon-ar' | 'supabase';
    sourceId: string | null;
    seasonVersion: string;

    // División doméstica real (solo AR/UY/CL, deducida del torneo disputado).
    // El catálogo estático internacional ya expresa el nivel en `competitionId`.
    divisionName?: string | null;
    divisionTier?: number | null;
}

export interface LeagueDef {
    id: string;
    labelEs: string;
    tier: number;
    continental: boolean;
    kind: 'domestic-league' | 'regional-franchise';
    region: string;
    level: ClubLevel;
}

// ── Helpers de construcción ──────────────────────────────────────────────────
function slugify(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function shortNameOf(name: string): string {
    const words = name.split(/[^A-Za-zÀ-ÿ0-9]+/).filter((w) => w.length > 0 && !/^(de|la|el|xv|rc|cs|us|ca|sc|as|fc|so|rec|ec)$/i.test(w));
    if (words.length >= 2) {
        return words.slice(0, 4).map((w) => w[0].toUpperCase()).join('');
    }
    const w = name.replace(/[^A-Za-zÀ-ÿ0-9]/g, '');
    return w.slice(0, 3).toUpperCase();
}

// ── Construcción del catálogo desde los rosters reales ───────────────────────
function buildCatalog(): { clubs: ClubDef[]; leagues: Record<string, LeagueDef> } {
    const clubs: ClubDef[] = [];
    const leagues: Record<string, LeagueDef> = {};
    const usedIds = new Set<string>();

    for (const group of ROSTERS_2026_27) {
        leagues[group.competitionId] = {
            id: group.competitionId,
            labelEs: group.label,
            tier: LEVEL_TIER[group.level],
            continental: CONTINENTAL_COMPS.has(group.competitionId),
            kind: group.kind,
            region: group.region,
            level: group.level,
        };

        for (const name of group.clubs) {
            let id = slugify(name);
            while (usedIds.has(id)) id = `${id}-x`;
            usedIds.add(id);

            const s = CLUB_STRENGTH[name] ?? fallbackStrength(group.level);
            clubs.push({
                id,
                labelEs: name,
                league: group.competitionId,
                prestige: s.prestige,
                name,
                shortName: shortNameOf(name),
                countryCode: group.countryCode,
                region: group.region,
                competitionId: group.competitionId,
                level: group.level,
                rating: s.rating,
                marketBand: s.marketBand,
                professionalStatus: group.professionalStatus ?? LEVEL_PRO[group.level],
                source: 'career-static',
                sourceId: null,
                seasonVersion: CATALOG_SEASON,
            });
        }
    }

    // ── Argentina: una liga POR DIVISIÓN REAL ────────────────────────────────
    //
    // No hay "Liga Argentina". El rugby argentino son dos ramas paralelas —la
    // URBA y el interior— y cada división es su propia competición, igual que
    // Pro D2 o Fédérale 1. Es lo que permite declarar que el campeón de Primera
    // A asciende al Top 14 sin que ascienda también el campeón de Córdoba, y que
    // los cupos del Torneo del Interior salgan de cada regional.
    for (const division of AR_DIVISIONS) {
        leagues[division.competitionId] = {
            id: division.competitionId,
            labelEs: division.label,
            tier: LEVEL_TIER.amateur,
            continental: false,
            kind: 'domestic-league',
            region: 'south-america',
            level: 'amateur',
        };
    }
    for (const club of AR_CLUBS) {
        if (usedIds.has(club.id)) continue;
        usedIds.add(club.id);
        clubs.push(club);
    }

    // Ligas domésticas UY/CL: siguen saliendo del snapshot generado desde
    // Supabase, que es la única fuente que hay para ellas. Se registran solo si
    // hay clubes, para que `clubLeague()` resuelva y el grafo no quede con ligas
    // fantasma. `sa-ar` ya no está: lo reemplaza el sistema de arriba.
    const SA_LEAGUES: [string, string, string][] = [
        ['sa-uy', 'Liga Uruguaya', 'uy'],
        ['sa-cl', 'Liga Chilena', 'cl'],
    ];
    for (const [id, labelEs, countryCode] of SA_LEAGUES) {
        const members = SA_CLUBS.filter((c) => c.competitionId === id);
        if (members.length === 0) continue;
        leagues[id] = {
            id, labelEs, tier: LEVEL_TIER.amateur, continental: false,
            kind: 'domestic-league', region: 'south-america', level: 'amateur',
        };
        for (const club of members) {
            if (usedIds.has(club.id)) continue; // el catálogo estático gana
            usedIds.add(club.id);
            clubs.push(club);
        }
        void countryCode;
    }

    return { clubs, leagues };
}

const built = buildCatalog();
export const CLUBS: ClubDef[] = built.clubs;
export const LEAGUES: Record<string, LeagueDef> = built.leagues;

const CLUB_BY_ID: Record<string, ClubDef> = Object.fromEntries(CLUBS.map((c) => [c.id, c]));
// Club por defecto estable (para fallbacks): el de menor prestigio.
const DEFAULT_CLUB: ClubDef = [...CLUBS].sort((a, b) => a.prestige - b.prestige)[0];

// ── API (compatible con la histórica) ────────────────────────────────────────
export function getClub(id: string): ClubDef {
    return CLUB_BY_ID[id] ?? DEFAULT_CLUB;
}

export function clubLeague(id: string): LeagueDef {
    return LEAGUES[getClub(id).league];
}

export function clubTier(id: string): number {
    return clubLeague(id).tier;
}

export function leagueTier(id: string): number {
    return LEAGUES[id]?.tier ?? 4;
}

export function clubsByTier(tier: number): ClubDef[] {
    return CLUBS.filter((c) => LEVEL_TIER[c.level] === tier);
}

export function clubsByLeague(league: string): ClubDef[] {
    return CLUBS.filter((c) => c.competitionId === league);
}

// ── Accesores nuevos del contrato ────────────────────────────────────────────
export function clubLevel(id: string): ClubLevel {
    return getClub(id).level;
}

export function clubRegion(id: string): string {
    return getClub(id).region;
}

export function clubMarketBand(id: string): MarketBand {
    return getClub(id).marketBand;
}

export function clubsByLevel(level: ClubLevel): ClubDef[] {
    return CLUBS.filter((c) => c.level === level);
}
