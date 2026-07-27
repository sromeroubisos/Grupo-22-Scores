// Rutas de carrera y escalafón de mercado. Puro y determinístico.
//
// Idea central: un único ESCALAFÓN GLOBAL (`marketRung`) que ordena a todos los
// clubes del catálogo, vengan del roster estático internacional o del snapshot
// AR/UY/CL de Supabase. Con eso:
//   · el club inicial sale de la RUTA del jugador (nacionalidad → país → escalón
//     de entrada), nunca de un sorteo global por tier;
//   · un fichaje se mueve como mucho ±1 escalón, salvo excepción marcada;
//   · pasar de una competición a otra PARALELA no puede leerse como ascenso,
//     porque el escalafón las deja a la misma altura (o a distancia prohibida).
//
// Una copa nunca aparece acá: el pool son CLUBES, y todo club pertenece a una liga.

import type { ClubDef } from '../data/clubs.ts';
import { CLUBS } from '../data/clubs.ts';
import { countryCodeOfNationality, regionOfCountry } from '../data/nations.ts';
import { economicModelOf, sportingBandOf } from '../data/competition-levels2026.ts';
import type { EmploymentStatus, SquadTrack } from './contracts.ts';
import type { EconomicModel } from '../data/competition-levels2026.ts';
import type { MovementKind, StartRouteId } from '../types/career.ts';
import { sameDomesticSystem } from './domestic-system.ts';
import type { Rng } from './random.ts';

export type CountryCode = string;

/** Versión del contrato de rutas de mercado (sella la reproducibilidad). */
export const TRANSFER_RULES_VERSION = '2026-07.3';

/**
 * Clasifica el movimiento en terminología de rugby (UAR). Es lo que decide el
 * TEXTO: un club amateur NUNCA "ofrece un contrato" — se hace un PASE. Solo los
 * clubes profesionales firman contrato.
 *   · development → invitación a la academia (cualquier país);
 *   · club amateur mismo país, misma unión  → pase amateur;
 *   · club amateur mismo país, otra unión    → pase interuniones;
 *   · club amateur de otro país              → pase internacional;
 *   · club mixto/pro senior full-time        → contrato profesional;
 *   · resto mixto/pro senior                  → acuerdo semiprofesional.
 */
export function classifyMovement(
    current: ClubDef,
    target: ClubDef,
    offeredEmployment: EmploymentStatus,
    offeredTrack: SquadTrack,
): MovementKind {
    if (target.id === current.id) return 'stay';
    if (offeredTrack === 'development') return 'development-invite';

    if (economicModelOf(target) === 'amateur') {
        const sameCountry =
            current.countryCode === target.countryCode
            && current.countryCode !== 'multi'
            && target.countryCode !== 'multi';
        if (!sameCountry) return 'international-pass';
        return sameDomesticSystem(current, target) ? 'amateur-pass' : 'inter-union-pass';
    }

    if (offeredEmployment === 'full-time-professional') return 'professional-contract';
    return 'semi-pro-agreement';
}

// ── Escalafón global ─────────────────────────────────────────────────────────
export const MIN_RUNG = 0;
export const MAX_RUNG = 8;

/**
 * Escalón de mercado del club. Ya NO tiene tabla propia: es exactamente la
 * `sportingBand` de `competition-levels2026.ts`. Antes convivían dos tablas
 * globales (`LEVEL_RUNG` acá y `level` en clubs.ts) que se contradecían — por
 * ejemplo Currie Cup Premier valía 5 en una y 6 en la calibración aprobada.
 */
export function marketRung(club: ClubDef): number {
    return sportingBandOf(club);
}

/** Dirección del movimiento. Entre competiciones paralelas siempre es lateral. */
export type MovementDirection = 'up' | 'lateral' | 'down';

export function movementBetween(from: ClubDef, to: ClubDef): MovementDirection {
    const delta = marketRung(to) - marketRung(from);
    if (delta > 0) return 'up';
    if (delta < 0) return 'down';
    return 'lateral';
}

// ── Escaleras domésticas ─────────────────────────────────────────────────────
// Pirámides reales, de la categoría más baja a la más alta. Los países cuyo
// rugby de clubes vive en una liga regional (Irlanda, Gales, Escocia, Australia)
// NO tienen escalera doméstica propia: se resuelven por ruta migratoria.
const STATIC_LADDER: Record<CountryCode, string[]> = {
    fr: ['nationale', 'prod2', 'top14'],
    'gb-eng': ['championship', 'prem'],
    es: ['esp-dhb', 'esp-dhelite', 'esp-dh'],
    jp: ['jpn-d3', 'jpn-d2', 'jpn-d1'],
    nz: ['npc'],
    za: ['currie-first', 'currie-premier'],
};

const SA_COUNTRIES: CountryCode[] = ['ar', 'uy', 'cl'];

export interface LadderRung {
    countryCode: CountryCode;
    competitionId: string;
    /** Solo AR/UY/CL: división real dentro de la liga doméstica. */
    divisionTier: number | null;
    clubs: ClubDef[];
}

// Las escaleras AR/UY/CL se DERIVAN del snapshot: Uruguay hoy solo tiene una
// división cargada y Chile otra, así que hardcodearlas dejaría rutas vacías.
function buildLadders(): Record<CountryCode, LadderRung[]> {
    const ladders: Record<CountryCode, LadderRung[]> = {};

    for (const [countryCode, competitions] of Object.entries(STATIC_LADDER)) {
        const rungs = competitions
            .map((competitionId) => ({
                countryCode,
                competitionId,
                divisionTier: null,
                clubs: CLUBS.filter((c) => c.competitionId === competitionId),
            }))
            .filter((rung) => rung.clubs.length > 0);
        if (rungs.length > 0) ladders[countryCode] = rungs;
    }

    for (const countryCode of SA_COUNTRIES) {
        const competitionId = `sa-${countryCode}`;
        const clubs = CLUBS.filter((c) => c.competitionId === competitionId);
        if (clubs.length === 0) continue;
        const tiers = [...new Set(clubs.map((c) => c.divisionTier ?? 3))].sort((a, b) => b - a);
        ladders[countryCode] = tiers.map((divisionTier) => ({
            countryCode,
            competitionId,
            divisionTier,
            clubs: clubs.filter((c) => (c.divisionTier ?? 3) === divisionTier),
        }));
    }

    return ladders;
}

const LADDERS = buildLadders();

export function domesticLadder(countryCode: CountryCode): LadderRung[] {
    return LADDERS[countryCode] ?? [];
}

export function countriesWithLadder(): CountryCode[] {
    return Object.keys(LADDERS).sort();
}

// ── Nacionalidad → país ──────────────────────────────────────────────────────
/** País de la nacionalidad (identidad), tenga o no escalera doméstica. */
export function countryOf(nationality: string): CountryCode | null {
    return countryCodeOfNationality(nationality);
}

/** País con escalera doméstica propia para esa nacionalidad, o null. */
export function homeCountryOf(nationality: string): CountryCode | null {
    const code = countryCodeOfNationality(nationality);
    return code !== null && domesticLadder(code).length > 0 ? code : null;
}

// ── Rutas migratorias ────────────────────────────────────────────────────────
// Para nacionalidades sin liga modelada. Ponderadas por afinidad real (cercanía
// geográfica, vínculos históricos y por dónde emigran de hecho los jugadores).
export type MigrationRegion =
    | 'south-america' | 'north-america' | 'british-isles' | 'europe'
    | 'africa' | 'pacific' | 'oceania' | 'asia';

export const MIGRATION_ROUTES: Record<MigrationRegion, { countryCode: CountryCode; weight: number }[]> = {
    // Sudamérica sin liga propia modelada: el circuito natural es el rioplatense.
    'south-america': [{ countryCode: 'ar', weight: 6 }, { countryCode: 'uy', weight: 2 }, { countryCode: 'cl', weight: 2 }],
    'north-america': [{ countryCode: 'gb-eng', weight: 3 }, { countryCode: 'fr', weight: 3 }, { countryCode: 'jp', weight: 2 }],
    // Islas Británicas: su rugby de clubes es regional (URC), así que emigran.
    'british-isles': [{ countryCode: 'gb-eng', weight: 5 }, { countryCode: 'fr', weight: 4 }, { countryCode: 'jp', weight: 1 }],
    europe: [{ countryCode: 'fr', weight: 4 }, { countryCode: 'gb-eng', weight: 3 }, { countryCode: 'es', weight: 3 }],
    africa: [{ countryCode: 'za', weight: 6 }, { countryCode: 'fr', weight: 3 }, { countryCode: 'gb-eng', weight: 1 }],
    pacific: [{ countryCode: 'nz', weight: 5 }, { countryCode: 'jp', weight: 3 }, { countryCode: 'fr', weight: 2 }],
    oceania: [{ countryCode: 'nz', weight: 5 }, { countryCode: 'jp', weight: 3 }, { countryCode: 'gb-eng', weight: 2 }],
    asia: [{ countryCode: 'jp', weight: 7 }, { countryCode: 'nz', weight: 2 }, { countryCode: 'gb-eng', weight: 1 }],
};

/**
 * Región migratoria de último recurso. Solo se usa para una nacionalidad que NO
 * está en el catálogo (no debería pasar: los 255 países tienen región
 * explícita y hay un test que lo verifica). No es un cajón de sastre.
 */
export const FALLBACK_MIGRATION_REGION: MigrationRegion = 'europe';

/**
 * Región migratoria del jugador. Sale del catálogo de países, donde cada uno
 * tiene su región ASIGNADA a mano: ningún país cae en Europa por descarte.
 */
export function migrationRegionOf(nationality: string): MigrationRegion {
    const code = countryCodeOfNationality(nationality);
    return (code !== null ? regionOfCountry(code) : null) ?? FALLBACK_MIGRATION_REGION;
}

/** Igual que `migrationRegionOf`, pero desde el código de país. */
export function migrationRegionOfCountry(countryCode: string): MigrationRegion {
    return regionOfCountry(countryCode) ?? FALLBACK_MIGRATION_REGION;
}

/** ¿El país tiene una escalera doméstica modelada? */
export function hasDomesticCompetition(countryCode: string): boolean {
    return domesticLadder(countryCode).length > 0;
}

/** Banda más baja disponible en la escalera de un país. */
export function lowestEntryBandOf(countryCode: string): number {
    const ladder = domesticLadder(countryCode);
    if (ladder.length === 0) return Number.POSITIVE_INFINITY;
    return Math.min(...ladder.flatMap((rung) => rung.clubs.map(sportingBandOf)));
}

export type EntryMode = 'domestic-senior' | 'foreign-amateur' | 'external-development';

export interface StartRoute {
    countryCode: CountryCode;
    kind: 'domestic' | 'migration';
    region: MigrationRegion | null;
    /**
     * Cómo entra el jugador. Un migrante a una liga cuyo escalón más bajo ya es
     * profesional NO debuta como senior full-time: entra por academia/desarrollo.
     */
    entryMode: EntryMode;
}

/** Banda a partir de la cual un migrante entra por desarrollo, no como senior. */
export const FOREIGN_SENIOR_MAX_BAND = 4;

/**
 * Ruta de entrada del jugador. Si su país tiene escalera doméstica, empieza ahí;
 * si no, se sortea un destino por afinidad regional documentada, PRIORIZANDO los
 * de banda de entrada más baja: un jugador sin liga propia no aterriza en la
 * élite, entra por abajo o por academia. El origen `exterior-academia` fuerza
 * la ruta migratoria: se fue de pibe.
 */
export function resolveStartRoute(nationality: string, originId: string, rng: Rng): StartRoute {
    const home = homeCountryOf(nationality);
    if (home && originId !== 'exterior-academia') {
        return { countryCode: home, kind: 'domestic', region: null, entryMode: 'domestic-senior' };
    }

    const region = migrationRegionOf(nationality);
    const options = MIGRATION_ROUTES[region].filter((o) => hasDomesticCompetition(o.countryCode));
    // Nunca se emigra al propio país: eso sería la ruta doméstica.
    const abroad = options.filter((o) => o.countryCode !== home);
    const pool = abroad.length > 0 ? abroad : options;
    // Prioriza destinos de banda de entrada baja: el peso documentado se corrige
    // a favor de las ligas donde un debutante extranjero puede entrar por abajo.
    const chosen = rng.weighted(pool, (o) => o.weight * (1 + Math.max(0, 6 - lowestEntryBandOf(o.countryCode)) * 0.4));
    const entryMode: EntryMode = lowestEntryBandOf(chosen.countryCode) > FOREIGN_SENIOR_MAX_BAND
        ? 'external-development'
        : 'foreign-amateur';
    return { countryCode: chosen.countryCode, kind: 'migration', region, entryMode };
}

// ── Grafo de CIRCULACIÓN DE JUGADORES ────────────────────────────────────────
//
// Ojo con la distinción, que es la corrección central de esta versión:
//
//   `MOVEMENTS` (competitions2026.ts) = grafo INSTITUCIONAL. Un CLUB sube o
//   baja de división dentro de un mismo sistema vertical. Nunca conecta
//   competiciones paralelas. NPC no "asciende" a Super Rugby.
//
//   `TRANSFER_PATHWAYS` (esto) = grafo de CIRCULACIÓN DE JUGADORES. Una vía
//   profesional normal por la que un JUGADOR pasa de una competición a otra.
//   SÍ puede conectar competiciones paralelas, y no implica ascenso de nadie:
//   que un jugador del NPC firme en los Crusaders es la carrera típica de un
//   neozelandés, no un ascenso de Canterbury.
//
// El escalafón (`marketRung`) sigue siendo el indicador de exigencia, pero ya
// no es lo único que decide si un pase es normal o extraordinario.

export interface TransferPathway {
    id: string;
    label: string;
    /** Competiciones de origen. */
    fromCompetitions: string[];
    /** Destino como CONJUNTO (competición y/o lista de clubes), nunca un club único fijo. */
    toCompetitions?: string[];
    toClubIds?: string[];
    /** Cuánto se relaja la exigencia del destino. Una vía normal no es un regalo. */
    demandTolerance: number;
    /** Peso relativo de la vía al ponderar candidatos. */
    weight: number;
    /**
     * Banda deportiva MÍNIMA del club de origen para tomar la vía. Impide el
     * salto absurdo "4ª división amateur → franquicia profesional": para llegar a
     * la SRA hay que estar arriba en la pirámide doméstica primero, no en la C.
     */
    minSourceBand?: number;
    note: string;
}

// Franquicias por país dentro de ligas regionales: el catálogo las marca como
// `countryCode: 'multi'`, así que el subconjunto nacional se declara acá.
const NZ_SUPER_FRANCHISES = ['blues', 'chiefs', 'crusaders', 'highlanders', 'hurricanes'];
const SA_URC_FRANCHISES = ['bulls', 'lions', 'sharks', 'stormers'];
const SRA_BY_COUNTRY: Record<CountryCode, string[]> = {
    ar: ['dogos-xv', 'pampas', 'tarucas'],
    uy: ['penarol-rugby'],
    cl: ['selknam'],
};

/**
 * Franquicias que REPRESENTAN a un país aunque el catálogo las marque como
 * `countryCode: 'multi'` (juegan una liga multinacional). Es lo que permite que
 * la ruta profesional de un argentino exista: su profesionalismo doméstico no
 * está en la pirámide de clubes, está en Super Rugby Americas.
 */
const NATIONAL_FRANCHISES: Record<CountryCode, string[]> = {
    ar: SRA_BY_COUNTRY.ar,
    uy: SRA_BY_COUNTRY.uy,
    cl: SRA_BY_COUNTRY.cl,
    nz: NZ_SUPER_FRANCHISES,
    za: SA_URC_FRANCHISES,
};

export const TRANSFER_PATHWAYS: TransferPathway[] = [
    {
        id: 'npc-to-super-rugby-nz',
        label: 'NPC → franquicias neozelandesas de Super Rugby',
        fromCompetitions: ['npc'],
        toClubIds: NZ_SUPER_FRANCHISES,
        demandTolerance: 10,
        weight: 3,
        note: 'vía habitual del rugby neozelandés; no es un ascenso de la provincia',
    },
    {
        id: 'currie-to-urc-sa',
        label: 'Currie Cup Premier → franquicias sudafricanas de URC',
        fromCompetitions: ['currie-premier'],
        toClubIds: SA_URC_FRANCHISES,
        demandTolerance: 9,
        weight: 3,
        note: 'las franquicias URC se nutren de la Currie Cup',
    },
    {
        id: 'ar-domestic-to-sra',
        label: 'Clubes argentinos → franquicias argentinas de Super Rugby Americas',
        fromCompetitions: ['sa-ar'],
        toClubIds: SRA_BY_COUNTRY.ar,
        demandTolerance: 12,
        weight: 3,
        // Solo desde la máxima/segunda categoría (Top 14/Primera A, banda ≥2): un
        // jugador de Primera B/C no da el salto directo a Dogos/Pampas.
        minSourceBand: 2,
        note: 'salto al profesionalismo sin salir del país, desde las divisiones altas',
    },
    {
        id: 'uy-domestic-to-sra',
        label: 'Clubes uruguayos → franquicia uruguaya de Super Rugby Americas',
        fromCompetitions: ['sa-uy'],
        toClubIds: SRA_BY_COUNTRY.uy,
        demandTolerance: 12,
        weight: 4,
        minSourceBand: 2,
        note: 'hoy hay una sola franquicia uruguaya; el conjunto crece si aparecen más',
    },
    {
        id: 'cl-domestic-to-sra',
        label: 'Clubes chilenos → franquicia chilena de Super Rugby Americas',
        fromCompetitions: ['sa-cl'],
        toClubIds: SRA_BY_COUNTRY.cl,
        demandTolerance: 12,
        weight: 4,
        minSourceBand: 2,
        note: 'hoy hay una sola franquicia chilena; el conjunto crece si aparecen más',
    },
    {
        id: 'emerging-europe-to-pro',
        label: 'Rugby Europe Super Cup y España → profesionalismo europeo',
        fromCompetitions: ['super-cup', 'esp-dh', 'esp-dhelite'],
        toCompetitions: ['nationale', 'prod2', 'championship'],
        demandTolerance: 7,
        weight: 2,
        note: 'salida natural del rugby europeo emergente hacia ligas profesionales',
    },
    {
        id: 'sra-to-abroad',
        label: 'Super Rugby Americas → profesionalismo europeo y japonés',
        fromCompetitions: ['sra'],
        toCompetitions: ['prod2', 'championship', 'jpn-d2', 'nationale'],
        demandTolerance: 7,
        weight: 2,
        note: 'el destino habitual del sudamericano que se profesionaliza',
    },
];

/** Vías abiertas desde la competición del club actual. */
export function pathwaysFrom(club: ClubDef): TransferPathway[] {
    return TRANSFER_PATHWAYS.filter((p) => p.fromCompetitions.includes(club.competitionId));
}

/** Clubes concretos a los que apunta una vía (conjunto, nunca un club fijo). */
export function pathwayTargets(pathway: TransferPathway): ClubDef[] {
    const byCompetition = pathway.toCompetitions
        ? CLUBS.filter((c) => pathway.toCompetitions!.includes(c.competitionId))
        : [];
    const byClub = pathway.toClubIds ? CLUBS.filter((c) => pathway.toClubIds!.includes(c.id)) : [];
    const seen = new Set<string>();
    return [...byCompetition, ...byClub].filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

/** Vía que habilita un destino concreto desde el club actual, si existe. */
export function pathwayFor(from: ClubDef, to: ClubDef): TransferPathway | null {
    for (const pathway of pathwaysFrom(from)) {
        if (pathwayTargets(pathway).some((c) => c.id === to.id)) return pathway;
    }
    return null;
}

/**
 * Techo del debut: un juvenil arranca como proyecto, en categorías de
 * desarrollo o semiprofesionales. Sin esto, escaleras cortas metían a un pibe
 * de 18 directo a la Premiership (Inglaterra) o a la Currie Cup Premier.
 *
 * LIMITACIÓN CONOCIDA DEL CATÁLOGO: Francia y Nueva Zelanda no tienen modelada
 * ninguna categoría por debajo de Nationale (escalón 5) y NPC (6) — no existen
 * en el catálogo la Fédérale francesa ni el rugby de clubes neozelandés. En
 * esos dos países el debut ocurre igual en el peldaño más bajo disponible, que
 * ya es profesional. Se documenta en vez de disfrazarlo.
 */
export const MAX_ENTRY_RUNG = 4;

function rungHeight(rung: LadderRung): number {
    return marketRung(rung.clubs[0]);
}

/**
 * Club inicial: el escalón más bajo de la escalera de destino, subiendo uno si
 * el origen del jugador lo justifica (una promesa de seleccionado juvenil no
 * arranca en la última categoría), sin pasar nunca del techo de debut.
 * Dentro del escalón se pondera a la inversa del rating: un prospecto cae más
 * seguido en un club modesto.
 */
export interface InitialPlacement {
    club: ClubDef;
    entryMode: EntryMode;
    /**
     * Modelo económico REALMENTE conseguido. Puede no ser el que pedía la ruta:
     * en Chile no hay clubes profesionales, así que un "profesional chileno"
     * degrada al modelo más cercano disponible. Se registra para poder
     * explicárselo al jugador en vez de mentirle.
     */
    resolvedModel: EconomicModel;
    /** true si hubo que degradar el modelo pedido por la ruta. */
    routeDowngraded: boolean;
}

/** Modelos económicos que acepta cada ruta de arranque. */
const MODELS_BY_ROUTE: Record<StartRouteId, EconomicModel[]> = {
    amateur: ['amateur'],
    development: ['mixed', 'professional'],
    professional: ['professional'],
};

/** Orden económico, para medir "cuán lejos" quedó una degradación. */
const MODEL_ORDER: EconomicModel[] = ['amateur', 'mixed', 'professional'];

/**
 * TODOS los clubes del país, no solo los de su escalera doméstica.
 *
 * La distinción importa y es la que hacía fracasar la ruta profesional en
 * Sudamérica: la escalera `sa-ar` es ÍNTEGRAMENTE amateur, y las franquicias
 * profesionales argentinas (Dogos, Pampas, Tarucas) viven en Super Rugby
 * Americas, que el catálogo marca como `countryCode: 'multi'`. Mirando solo la
 * escalera, un "profesional argentino" no tenía dónde arrancar y degradaba a
 * amateur — igual que un chileno, cuando el caso argentino sí tiene solución.
 */
function clubsOfCountry(countryCode: CountryCode): ClubDef[] {
    const propios = CLUBS.filter((c) => c.countryCode === countryCode);
    const franquicias = new Set(NATIONAL_FRANCHISES[countryCode] ?? []);
    const multinacionales = CLUBS.filter((c) => franquicias.has(c.id));
    return [...propios, ...multinacionales];
}

/**
 * Clubes que sirven para la ruta pedida. Si no hay ninguno, se degrada al modelo
 * DISPONIBLE más cercano (por distancia en `MODEL_ORDER`), sin fallar nunca: una
 * nacionalidad sin liga profesional propia tiene que poder empezar igual.
 */
function clubsForRoute(
    ladder: LadderRung[],
    countryCode: CountryCode,
    route: StartRouteId,
): { clubs: ClubDef[]; model: EconomicModel; downgraded: boolean } {
    // La ruta amateur se queda en la escalera (tiene techo de debut); las otras
    // dos miran el país entero, porque el profesionalismo puede estar fuera de
    // la pirámide doméstica.
    const all = route === 'amateur' ? ladder.flatMap((rung) => rung.clubs) : clubsOfCountry(countryCode);
    const wanted = MODELS_BY_ROUTE[route];

    const direct = all.filter((c) => wanted.includes(economicModelOf(c)));
    if (direct.length > 0) {
        // Dentro de lo pedido, el modelo más bajo: se entra por abajo, no por
        // la puerta grande. La ruta acota el universo; el rng elige el club.
        const model = MODEL_ORDER.find((m) => wanted.includes(m) && direct.some((c) => economicModelOf(c) === m))!;
        return { clubs: direct.filter((c) => economicModelOf(c) === model), model, downgraded: false };
    }

    // Degradación: el modelo disponible más cercano al que pedía la ruta.
    const target = MODEL_ORDER.indexOf(wanted[0]);
    const available = MODEL_ORDER
        .filter((m) => all.some((c) => economicModelOf(c) === m))
        .sort((a, b) => Math.abs(MODEL_ORDER.indexOf(a) - target) - Math.abs(MODEL_ORDER.indexOf(b) - target));

    if (available.length === 0) return { clubs: all, model: 'amateur', downgraded: true };
    const model = available[0];
    return { clubs: all.filter((c) => economicModelOf(c) === model), model, downgraded: true };
}

export function pickInitialClub(
    nationality: string,
    originId: string,
    startTier: number,
    rng: Rng,
    startRoute: StartRouteId = 'amateur',
): InitialPlacement {
    const route = resolveStartRoute(nationality, originId, rng);
    const ladder = domesticLadder(route.countryCode);
    if (ladder.length === 0) {
        const club = [...CLUBS].sort((a, b) => a.rating - b.rating)[0];
        return { club, entryMode: route.entryMode, resolvedModel: economicModelOf(club), routeDowngraded: true };
    }

    const { clubs, model, downgraded } = clubsForRoute(ladder, route.countryCode, startRoute);

    // La ruta amateur conserva el techo de debut: un pibe no arranca en la
    // categoría más alta del amateurismo solo porque exista. Las otras dos ya
    // están acotadas por el modelo económico, que es más restrictivo.
    const pool = startRoute === 'amateur'
        ? restrictToEntryRungs(ladder, clubs, startTier)
        : clubs;

    const strongest = Math.max(...pool.map((c) => c.rating));
    const ordered = [...pool].sort((a, b) => a.id.localeCompare(b.id));
    const club = rng.weighted(ordered, (c) => strongest - c.rating + 4);
    return { club, entryMode: route.entryMode, resolvedModel: model, routeDowngraded: downgraded };
}

/** Acota a los escalones de entrada (comportamiento histórico de la ruta amateur). */
function restrictToEntryRungs(ladder: LadderRung[], clubs: ClubDef[], startTier: number): ClubDef[] {
    const offset = startTier <= 2 ? 1 : 0;
    let index = Math.min(offset, ladder.length - 1);
    while (index > 0 && rungHeight(ladder[index]) > MAX_ENTRY_RUNG) index--;

    const allowed = new Set(ladder[index].clubs.map((c) => c.id));
    const restricted = clubs.filter((c) => allowed.has(c.id));
    return restricted.length > 0 ? restricted : clubs;
}

/**
 * Puntaje de un jugador como candidato de una VÍA, RELATIVO a su sistema, no en
 * valor absoluto. Es lo que permite que un destacado de la liga argentina entre
 * a una franquicia SRA sin tener el mismo valor absoluto que un titular de Dogos.
 */
export interface PathwayCandidateScore {
    relativeClubPerformance: number; // valor vs rating de su propio club
    relativeCompetitionPerformance: number; // banda doméstica que disputa
    starterStatus: boolean;
    form: number;
    age: number;
    potential: number;
    injuryAvailability: number; // 1 = disponible, baja con lesiones recientes
}

export function scorePathwayCandidate(score: PathwayCandidateScore): number {
    // Un destacado de su liga (rinde por encima de su club, titular, con forma)
    // suma; la edad joven y el potencial ayudan; las lesiones restan.
    return (
        score.relativeClubPerformance * 0.5
        + score.relativeCompetitionPerformance * 0.15
        + (score.starterStatus ? 1 : 0)
        + (score.form - 55) * 0.02
        + Math.max(0, 26 - score.age) * 0.05
        + Math.max(0, score.potential - 60) * 0.03
        + (score.injuryAvailability - 0.7) * 0.5
    );
}
