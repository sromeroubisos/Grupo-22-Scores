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
import { AR_DIVISIONS, isArDivision } from '../data/clubs2026/arSystem2026.ts';
import { economicModelOf, sportingBandOf } from '../data/competition-levels2026.ts';
import type { EmploymentStatus, SquadTrack } from './contracts.ts';
import type { EconomicModel } from '../data/competition-levels2026.ts';
import type { MovementKind } from '../types/career.ts';
import { sameDomesticSystem } from './domestic-system.ts';
import type { Rng } from './random.ts';

export type CountryCode = string;

/** Versión del contrato de rutas de mercado (sella la reproducibilidad). */
export const TRANSFER_RULES_VERSION = '2026-07.6';

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
    fr: ['fr-federale2', 'fr-federale1', 'nationale', 'prod2', 'top14'],
    'gb-eng': ['eng-national2', 'eng-national1', 'championship', 'prem'],
    es: ['esp-dhb', 'esp-dhelite', 'esp-dh'],
    jp: ['jpn-regional', 'jpn-d3', 'jpn-d2', 'jpn-d1'],
    nz: ['nz-heartland', 'npc'],
    za: ['za-community', 'currie-first', 'currie-premier'],
    // ESTADOS UNIDOS: la escalera es UNIVERSIDAD → MLR, que es la carrera real de
    // un estadounidense. Ojo con lo que esta lista NO dice: que se ascienda de una
    // a otra. Es el orden del ESCALAFÓN —cuán arriba se juega— y de acá sale de
    // dónde arranca un debutante; el paso del universitario a la MLR es una vía de
    // jugador (`us-college-to-mlr`) y no un ascenso de nadie, porque la MLR es una
    // liga cerrada de franquicias.
    //
    // Y NCR va debajo de la D1A por lo mismo: son dos pirámides paralelas, pero la
    // D1A es la máxima categoría de facto y el escalafón tiene que poder decirlo.
    us: ['us-ncr-d1', 'us-d1a', 'us-mlr'],
    // ITALIA: los dos escalones domésticos. Benetton y Zebre NO están —viven en la
    // URC— y eso no es un olvido: están fuera de la pirámide italiana por decisión
    // de la FIR, así que un italiano llega a ellas por vía, no subiendo un peldaño.
    it: ['ita-serie-a', 'ita-serie-a-elite'],
    // PORTUGAL Y BRASIL: un solo escalón cada uno, y las consecuencias son
    // distintas. El Super 12 brasileño es amateur, así que la ruta amateur funciona
    // normalmente. La Divisão de Honra portuguesa es SEMIPROFESIONAL y es lo único
    // que hay: la ruta amateur de un portugués degrada a un club pago y lo declara
    // con `routeDowngraded`. Es el hueco que Francia y Nueva Zelanda tenían antes de
    // la Fédérale 2 y la Heartland, y se cierra igual —cargando la I Divisão, que
    // hoy no está (ver `PENDING_COMPETITIONS`)— y no bajándole el nivel a la DH.
    pt: ['pt-honra'],
    br: ['br-super12'],
};

// Uruguay y Chile siguen viviendo en una competición paraguas con divisiones
// deducidas. Argentina ya no: tiene su sistema declarado y se arma aparte.
const SA_COUNTRIES: CountryCode[] = ['uy', 'cl'];

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

    // ── Argentina: un escalón por NIVEL DEL CANON, no por división ────────────
    //
    // Las dos ramas comparten niveles: URBA Primera C, el Regional del NOA A, la
    // Segunda del Litoral, el Súper 9 B y la Copa de Plata cuyana son todos
    // Nivel 4. Un escalón de mercado mide CUÁN ARRIBA jugás, no en qué rama, así
    // que el escalón es el nivel y no la división.
    //
    // Ojo con lo que esto NO significa: que dos divisiones compartan escalón no
    // las conecta institucionalmente. El ascenso vive en `MOVEMENTS`, que nunca
    // cruza de rama, y el texto del pase lo decide `sameDomesticSystem`, que
    // distingue las uniones. Acá solo se resuelve de dónde sale el primer club.
    const arClubs = CLUBS.filter((c) => isArDivision(c.competitionId));
    if (arClubs.length > 0) {
        const levels = [...new Set(arClubs.map((c) => c.divisionTier ?? 7))].sort((a, b) => b - a);
        ladders.ar = levels.map((divisionTier) => ({
            countryCode: 'ar',
            competitionId: `ar#n${divisionTier}`,
            divisionTier,
            clubs: arClubs.filter((c) => (c.divisionTier ?? 7) === divisionTier),
        }));
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
    // Sudamérica sin liga propia modelada: el circuito natural es el rioplatense,
    // más Brasil desde que su Super 12 está cargado.
    'south-america': [{ countryCode: 'ar', weight: 6 }, { countryCode: 'uy', weight: 2 }, { countryCode: 'cl', weight: 2 }, { countryCode: 'br', weight: 2 }],
    // Norteamérica cambió de forma con la MLR y el universitario adentro: hasta acá,
    // un canadiense o un jamaiquino sin liga propia tenía que cruzar el Atlántico
    // para empezar a jugar. Estados Unidos entra con el peso más alto porque es el
    // destino de al lado, y sigue teniendo la escalera más baja de la región (la Ivy
    // en NCR), así que un debutante puede entrar por abajo de verdad.
    'north-america': [{ countryCode: 'us', weight: 5 }, { countryCode: 'gb-eng', weight: 3 }, { countryCode: 'fr', weight: 3 }, { countryCode: 'jp', weight: 2 }],
    // Islas Británicas: su rugby de clubes es regional (URC), así que emigran.
    'british-isles': [{ countryCode: 'gb-eng', weight: 5 }, { countryCode: 'fr', weight: 4 }, { countryCode: 'jp', weight: 1 }],
    // Europa suma Italia con peso bajo: la Serie A Élite importa jugadores de la
    // Europa emergente (rumanos, georgianos), pero no es un destino masivo.
    //
    // PORTUGAL NO ENTRA, Y NO ES UN OLVIDO. Se probó y el resultado fue un francés
    // de 18 debutando en el Técnico de Lisboa: la Divisão de Honra es el único
    // escalón portugués del catálogo y es semiprofesional, así que un migrante que
    // cae ahí entra a un plantel pago en vez de empezar por abajo. Mandar
    // extranjeros a una escalera de un solo peldaño convierte una liga nueva en un
    // atajo. La DH se llena igual —los portugueses arrancan ahí por ruta doméstica—
    // y el día que entre la I Divisão, Portugal puede volver a esta lista.
    europe: [{ countryCode: 'fr', weight: 4 }, { countryCode: 'gb-eng', weight: 3 }, { countryCode: 'es', weight: 3 }, { countryCode: 'it', weight: 2 }],
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
    /**
     * Clubes de origen, cuando la vía nace en CLUBES CONCRETOS y no en una
     * competición entera. Se suma a `fromCompetitions`: una vía se abre si el club
     * actual está en cualquiera de las dos listas.
     *
     * Existe por el reparto de academias italiano, que no se puede expresar de otra
     * forma: la FIR reparte a los juveniles DE BENETTON Y ZEBRE entre los clubes de
     * la Serie A Élite, y las dos franquicias viven en `urc`. Declarar la vía desde
     * `urc` habría hecho que a un juvenil de Leinster le llegaran ofertas de Viadana
     * por un mecanismo que sólo existe en Italia.
     *
     * Es la simetría de `toClubIds`, que ya permitía declarar el destino por club.
     * Que el origen no se pudiera declarar igual era el hueco, no una decisión.
     */
    fromClubIds?: string[];
    /** Destino como CONJUNTO (competición y/o lista de clubes), nunca un club único fijo. */
    toCompetitions?: string[];
    toClubIds?: string[];
    /** Cuánto se relaja la exigencia del destino. Una vía normal no es un regalo. */
    demandTolerance: number;
    /** Peso relativo de la vía al ponderar candidatos. */
    weight: number;
    /**
     * OVR CRUDO mínimo del jugador para tomar la vía. Es la media que se ve en la
     * cabecera, no `marketValue` ni `effectiveOvr`.
     *
     * REEMPLAZÓ A `minSourceBand`, que era una banda deportiva mínima del club de
     * ORIGEN. La banda existía para frenar el salto absurdo "4ª división amateur →
     * franquicia profesional", y para eso servía: era un proxy razonable de cuánto
     * valía el jugador. Pero un proxy sobra cuando hay medición directa, y sobre
     * todo se equivoca en los dos extremos — dejaba afuera al de 59 que juega en
     * Primera B (invisible por el escudo que tiene puesto, no por lo que vale) y
     * dejaba entrar al de 48 de Primera A, porque el filtro de aceptación corre
     * contra `marketValue`, que a un pibe de 18 le suma hasta 12 puntos de
     * proyección. Medido con la banda: el 62% de los debutantes de la rama larga
     * recibía oferta de la SRA.
     *
     * Las ofertas dependen de la MEDIA del jugador. Ahora eso está escrito como
     * condición y no como presunción.
     */
    minOvr?: number;
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
    // Cobras es la franquicia de la CONFEDERACIÓN, no de un club: Brasil no aporta
    // clubes del Super 12 a Super Rugby Americas, aporta a los Cobras, que son el
    // brazo profesional de la CBRu y la antesala de los Tupis. Que aparezca acá es
    // lo que hace que para un brasileño firmar en Cobras cuente como el paso
    // profesional más doméstico que tiene, y no como emigrar.
    //
    // Estaba pendiente: `za-domestic-to-cobras` ya llevaba jugadores sudafricanos
    // ahí por convenio, pero sin esta línea Cobras no era de nadie.
    br: ['cobras-brasil-rugby'],
};
// Las dos franquicias italianas de alto rendimiento. NO son un escalón de la
// pirámide italiana: la FIR las financia aparte y compiten en la URC, así que
// están fuera de ascensos y descensos. Se declaran acá porque son el ORIGEN y el
// DESTINO de las dos vías que conectan las capas del rugby italiano.
const ITA_FRANCHISES = ['benetton-treviso', 'zebre-parma'];

/**
 * DE QUÉ PAÍS ES CADA FRANQUICIA REGIONAL.
 *
 * El catálogo las marca `countryCode: 'multi'` y para su liga eso es correcto —la
 * URC es multipaís, el Super Rugby también— pero los Stormers son sudafricanos y
 * los Crusaders neozelandeses. Sin esta tabla, para un sudafricano firmar en los
 * Stormers contaba como irse al exterior, que es lo contrario de lo que es: es el
 * paso profesional más doméstico que tiene.
 *
 * No se declara nada nuevo: se DA VUELTA el conocimiento que ya vivía en las tres
 * constantes de arriba, que son las que usan las vías. Si mañana entra una
 * franquicia, entra en un solo lugar y las dos lecturas la ven.
 */
const FRANCHISE_COUNTRY: Record<string, CountryCode> = {
    ...Object.fromEntries(NZ_SUPER_FRANCHISES.map((id) => [id, 'nz'])),
    ...Object.fromEntries(SA_URC_FRANCHISES.map((id) => [id, 'za'])),
    // Benetton y Zebre son italianas aunque jueguen la URC, exactamente como los
    // Stormers son sudafricanos. Para un italiano firmar ahí es el paso profesional
    // más doméstico que tiene, no emigrar — y sin esta línea el motor lo contaba al
    // revés.
    ...Object.fromEntries(ITA_FRANCHISES.map((id) => [id, 'it'])),
    ...Object.fromEntries(
        Object.entries(SRA_BY_COUNTRY).flatMap(([country, ids]) => ids.map((id) => [id, country])),
    ),
};

/**
 * País del club para decidir CERCANÍA: el suyo, y si es una franquicia regional,
 * el de la unión que representa. Devuelve `null` cuando no hay nación resoluble
 * (una franquicia multinacional de verdad, como Moana Pasifika o los Drua para
 * este catálogo).
 *
 * OJO CON DÓNDE SE USA: sirve para PESAR, no para habilitar. La frontera cerrada
 * del amateur (`windowStaysHome`) se sigue midiendo con el país del catálogo a
 * propósito — si una franquicia contara como doméstica ahí, un pibe de 18
 * alcanzaría la SRA por la ventana y se saltearía el `minOvr` de la vía, que es
 * justamente la puerta que le pusimos.
 */
export function affinityCountryOf(club: ClubDef): CountryCode | null {
    if (club.countryCode !== 'multi') return club.countryCode;
    return FRANCHISE_COUNTRY[club.id] ?? null;
}

// Había acá un `NATIONAL_FRANCHISES` que mapeaba país → franquicias que lo
// representan, y existía para que la ruta profesional de un argentino pudiera
// arrancar en Dogos/Pampas/Tarucas: su profesionalismo doméstico no está en la
// pirámide de clubes sino en Super Rugby Americas. Con el arranque unificado en
// amateur (1.26.0) nadie empieza en una franquicia, así que la tabla quedó sin
// lector. El conocimiento no se perdió: vive en las tres constantes de arriba, que
// son las que usan las vías de `TRANSFER_PATHWAYS` — y ésa es la puerta por la que
// el argentino llega a Dogos, que es como llega en la realidad.

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
        // TODAS las divisiones del sistema: la vía se abre por NIVEL del jugador
        // (`minOvr`), no por la división en la que juega. Un 59 de Primera B
        // entra igual que un 59 del Top 14, que es lo que pasa en la realidad.
        fromCompetitions: AR_DIVISIONS.map((d) => d.competitionId),
        toClubIds: SRA_BY_COUNTRY.ar,
        demandTolerance: 12,
        weight: 3,
        // 59 es el rating de la franquicia más floja del conjunto (Tarucas), así
        // que es el piso honesto: el que ya vale lo que vale la franquicia entra,
        // juegue en Primera A o en la B.
        minOvr: 59,
        note: 'salto al profesionalismo sin salir del país, por nivel y no por división',
    },
    {
        id: 'uy-domestic-to-sra',
        label: 'Clubes uruguayos → franquicia uruguaya de Super Rugby Americas',
        fromCompetitions: ['sa-uy'],
        toClubIds: SRA_BY_COUNTRY.uy,
        demandTolerance: 12,
        weight: 4,
        minOvr: 59,
        note: 'hoy hay una sola franquicia uruguaya; el conjunto crece si aparecen más',
    },
    {
        id: 'cl-domestic-to-sra',
        label: 'Clubes chilenos → franquicia chilena de Super Rugby Americas',
        fromCompetitions: ['sa-cl'],
        toClubIds: SRA_BY_COUNTRY.cl,
        demandTolerance: 12,
        weight: 4,
        minOvr: 59,
        note: 'hoy hay una sola franquicia chilena; el conjunto crece si aparecen más',
    },
    {
        id: 'za-domestic-to-cobras',
        label: 'Clubes sudafricanos → Cobras Brasil (Super Rugby Americas)',
        // EL CONVENIO, DECLARADO. La franquicia brasileña se nutre de jugadores
        // sudafricanos, y eso es una vía real: un convenio entre sistemas, con su
        // nivel mínimo y su tolerancia, no una oferta que aparece porque el club
        // quedó dentro del escalón.
        //
        // Existe porque la ventana de un amateur dejó de cruzar la frontera (ver
        // `windowStaysHome` en club-offers.ts). Antes Cobras llegaba al sudafricano
        // de 18 por la puerta equivocada —el mercado abierto, el mismo por el que
        // le llegaban clubes de la Tercera de la URBA— y ahora llega por la suya.
        fromCompetitions: ['currie-premier', 'currie-first', 'za-community'],
        toClubIds: ['cobras-brasil-rugby'],
        demandTolerance: 12,
        weight: 3,
        // El mismo piso que las vías a la SRA: el rating de la franquicia. Una vía
        // NO garantiza oferta —sin nivel no hay convenio que alcance— y es lo que
        // hace que el destino siga al jugador y no al pasaporte.
        minOvr: 59,
        note: 'convenio Sudáfrica → Cobras; misma puerta que la SRA sudamericana, por nivel',
    },
    {
        id: 'br-super12-to-cobras',
        label: 'Clubes brasileños → Cobras Brasil (Super Rugby Americas)',
        // Misma puerta que la argentina, uruguaya y chilena, y por el mismo motivo:
        // el profesionalismo brasileño NO está en la pirámide de clubes. Brasil no
        // aporta clubes del Super 12 a Super Rugby Americas — aporta a los Cobras,
        // franquicia gestionada directamente por la confederación, que es el brazo
        // profesional y la antesala de los Tupis. Los calendarios están diseñados
        // para no solaparse (SRA de febrero a junio, Super 12 desde el 20 de junio),
        // así que el jugador que da el salto no juega las dos cosas: cambia de sitio.
        fromCompetitions: ['br-super12'],
        toClubIds: SRA_BY_COUNTRY.br,
        demandTolerance: 12,
        weight: 4,
        // El mismo 59 que la vía sudafricana al mismo destino. Es el piso de las
        // vías a la SRA, y usar dos números distintos para la misma puerta sería
        // incoherente: el que entra a Cobras entra por lo que vale, venga de
        // Jacareí o de la Currie Cup.
        minOvr: 59,
        note: 'la única salida profesional de un brasileño sin irse del país',
    },
    {
        id: 'ita-elite-to-franchises',
        label: 'Serie A Élite → Benetton y Zebre (permit players)',
        // LA VÍA DE ASCENSO INDIVIDUAL AL PROFESIONALISMO ITALIANO, y es la única
        // que hay: todo italiano que llega a nivel profesional pleno termina en
        // Benetton, Zebre o Francia. El mecanismo real se llama "permit player" —un
        // jugador de club doméstico convocable por una de las dos franquicias— y no
        // es un ascenso de nadie: Benetton y Zebre están fuera de la pirámide.
        fromCompetitions: ['ita-serie-a-elite'],
        toClubIds: ITA_FRANCHISES,
        demandTolerance: 12,
        weight: 3,
        // El rating de la franquicia más floja del conjunto (Zebre, 64), igual que
        // en la SRA. La Élite topea en 60, así que la vía exige ser mejor que el
        // mejor club de tu liga — que es exactamente lo que pide un permit.
        minOvr: 64,
        note: 'permit players: la puerta al profesionalismo sin salir de Italia',
    },
    {
        id: 'ita-franchise-academy-to-elite',
        label: 'Academias de Benetton y Zebre → clubes de la Serie A Élite',
        // EL REPARTO DE ACADEMIAS, y va en la dirección contraria a todas las demás
        // vías del archivo: acá el jugador BAJA para jugar.
        //
        // Desde 2023-24 la FIR reparte a los juveniles de las academias de Benetton y
        // Zebre entre los clubes de la Serie A Élite para garantizarles minutos, con
        // lógica declaradamente inspirada en el draft de la NBA (favorecer a los peor
        // clasificados). En el primer reparto fueron 19 atletas a Mogliano, Viadana,
        // Rovigo, Valorugby, Vicenza, Colorno y Lyons.
        //
        // Se declara por CLUB de origen y no por competición: las dos franquicias
        // viven en `urc`, y una vía desde `urc` le habría llevado ofertas de Viadana
        // a un juvenil de Leinster por un mecanismo que sólo existe en Italia. Ver
        // `fromClubIds`.
        //
        // Sin `minOvr`: el mecanismo existe justamente para el que NO tiene nivel de
        // primera todavía. Poner un piso sería cerrarle la puerta a su destinatario.
        fromCompetitions: [],
        fromClubIds: ITA_FRANCHISES,
        toCompetitions: ['ita-serie-a-elite'],
        demandTolerance: 10,
        weight: 2,
        note: 'la FIR manda a los juveniles de la franquicia a jugar donde sumen minutos',
    },
    {
        id: 'pt-honra-to-lusitanos',
        label: 'Divisão de Honra → Lusitanos XV',
        // EL PUENTE PORTUGUÉS, DECLARADO. Lusitanos XV es una franquicia con base en
        // Lisboa formada SOLO por jugadores radicados en Portugal, que juega la Rugby
        // Europe Super Cup y funciona de hecho como segunda selección. El Plan de
        // Actividades 2026 de la FPR establece que sus jugadores podrán ser
        // contratados directamente por la federación: contratos centralizados para
        // profesionalizar el núcleo.
        //
        // Hace falta una vía y no alcanza la ventana porque Lusitanos lleva
        // `countryCode: 'multi'` como toda franquicia de la Super Cup: para un
        // portugués amateur, la ventana se queda en Portugal y Lusitanos no cuenta
        // como portuguesa ahí.
        fromCompetitions: ['pt-honra'],
        toClubIds: ['lusitanos-xv'],
        demandTolerance: 12,
        weight: 4,
        // El rating de Lusitanos (60), mismo criterio que las demás franquicias. Es
        // dos puntos arriba del mejor club de la Divisão de Honra, y eso es correcto:
        // a Lusitanos se entra siendo de lo mejor que hay jugando en Portugal.
        minOvr: 60,
        note: 'la franquicia de los radicados en Portugal; la FPR va a contratarlos directamente',
    },
    {
        id: 'us-college-to-mlr',
        label: 'Universitario de EE.UU. → Major League Rugby',
        // LAS DOS PIRÁMIDES UNIVERSITARIAS SALEN AL MISMO LUGAR, y es lo único que
        // las conecta: no hay ascenso entre CRAA y NCR, pero un jugador de cualquiera
        // de las dos puede firmar en la MLR. No hay draft — la MLR ficha directo— y
        // tampoco hay exención de tope para un fichaje estrella: el tope se amplía
        // cumpliendo objetivos de desarrollo de base, no fichando.
        fromCompetitions: ['us-d1a', 'us-ncr-d1'],
        toCompetitions: ['us-mlr'],
        demandTolerance: 12,
        weight: 3,
        // El rating de la franquicia más floja de la liga (Anthem RC, 57). Con seis
        // equipos y un tope de ~500.000 USD por club, los planteles son chicos y la
        // puerta es angosta: cada temporada entran muy pocos universitarios.
        minOvr: 57,
        note: 'la salida de las dos pirámides universitarias, que entre sí no se conectan',
    },
    {
        id: 'emerging-europe-to-pro',
        label: 'Europa emergente (España, Portugal, Italia) → profesionalismo europeo',
        // Portugal e Italia entran acá por la misma razón que España: son el tercer
        // escalón semiprofesional de su país y su salida natural son las ligas
        // profesionales francesas e inglesas.
        //
        // En el caso portugués eso NO es una analogía, es dónde está el equipo
        // nacional: el núcleo de Os Lobos juega en Francia (Top 14, Pro D2,
        // Nationale), no en Portugal. El Top 14 no está entre los destinos porque
        // ningún jugador salta del tercer escalón a la élite en una ventana; se llega
        // desde la Pro D2, que es como se llega en la realidad.
        fromCompetitions: ['super-cup', 'esp-dh', 'esp-dhelite', 'pt-honra', 'ita-serie-a-elite'],
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
    {
        id: 'mlr-to-abroad',
        label: 'Major League Rugby → profesionalismo europeo y japonés',
        // LA LIGA SE ESTÁ CONTRAYENDO Y ESO ES UNA PUERTA DE SALIDA, no un detalle
        // de color: pasó de once equipos a seis en un año, para 2027 no hay ningún
        // equipo de expansión confirmado y el propio co-presidente admitió
        // públicamente que no le sorprendería que "uno a tres" de los proyectos en
        // conversaciones no lleguen. Con cinco planteles menos, el jugador que se
        // queda sin lugar tiene que poder buscarlo afuera.
        fromCompetitions: ['us-mlr'],
        toCompetitions: ['prod2', 'championship', 'jpn-d2', 'nationale'],
        demandTolerance: 7,
        weight: 2,
        note: 'con la liga contrayéndose, la salida al exterior es parte de la carrera',
    },
];

/** Vías abiertas desde el club actual: por su competición o por el club mismo. */
export function pathwaysFrom(club: ClubDef): TransferPathway[] {
    return TRANSFER_PATHWAYS.filter(
        (p) => p.fromCompetitions.includes(club.competitionId) || (p.fromClubIds?.includes(club.id) ?? false),
    );
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

/**
 * NIVEL MÍNIMO PARA ENTRAR A UNA COMPETICIÓN, por cualquier puerta.
 *
 * El `minOvr` de una vía es un requisito de INGRESO —cuánto hay que valer para que
 * una franquicia te saque de tu liga doméstica—, no un peaje de esa vía en
 * particular. Y la ventana de mercado lo esquivaba: la SRA está en el escalón 5, así
 * que cualquiera parado en el 4 o el 6 la alcanzaba por el camino normal sin que
 * nadie le pidiera los 59 puntos que la vía declara. Un argentino de 56 en Cambridge
 * recibía oferta de Dogos, que es exactamente lo que el `minOvr` existe para evitar.
 *
 * Se lee del DATO: si mañana una vía cambia su piso, la ventana se entera sola.
 */
export function entryFloorOf(competitionId: string): number | null {
    let floor: number | null = null;
    for (const pathway of TRANSFER_PATHWAYS) {
        if (pathway.minOvr === undefined) continue;
        const apunta = (pathway.toCompetitions ?? []).includes(competitionId)
            || pathwayTargets(pathway).some((c) => c.competitionId === competitionId);
        if (!apunta) continue;
        floor = floor === null ? pathway.minOvr : Math.min(floor, pathway.minOvr);
    }
    return floor;
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

/** Orden económico, para medir "cuán lejos" quedó una degradación. */
const MODEL_ORDER: EconomicModel[] = ['amateur', 'mixed', 'professional'];

/**
 * Techo de debut para el que arranca YA en un club semipro o profesional.
 *
 * No alcanza con levantar `MAX_ENTRY_RUNG`: ese techo está en 4 justamente para
 * que un juvenil no debute en la Premiership, y los clubes semipro/pro viven
 * arriba de él, así que aplicárselo los borra a todos. Pero borrar el techo del
 * todo mete al pibe de 18 en Leinster, que es el bug del otro lado.
 *
 * 6 es la segunda división profesional y el piso de las franquicias regionales:
 * arrancar ahí es "te vio alguien y firmaste joven", que es una historia real.
 * Arrancar en el escalón 8 no lo es para nadie.
 */
export const MAX_PRO_ENTRY_RUNG = 6;

/**
 * Clubes del PRIMER club, según arranques amateur o ya con un pie adentro.
 *
 * 1.26.0 lo había dejado en "siempre amateur", y era demasiado parejo: en rugby
 * el pibe que a los 18 ya está en la academia de una franquicia existe, y su
 * carrera no arranca en el mismo lugar que la del que juega en el club del barrio.
 * La rama sorteada vuelve a decidir ESO —dónde arrancás— y de ahí sale el nivel,
 * en vez de que el nivel salga de una tabla y el club sea siempre el mismo.
 *
 * La degradación se conserva y ahora sirve de verdad: un país sin clubes semipro
 * ni profesionales modelados devuelve el pool amateur con `downgraded`, y el
 * jugador arranca amateur aunque le haya tocado la rama corta. Es lo correcto —en
 * Chequia no hay a qué franquicia entrar— y el testigo lo deja dicho en vez de
 * inventar un club profesional que no existe.
 */
function clubsForFirstClub(
    ladder: LadderRung[],
    proStart: boolean,
    countryCode: string,
): { clubs: ClubDef[]; model: EconomicModel; downgraded: boolean } {
    const all = ladder.flatMap((rung) => rung.clubs);

    if (proStart) {
        // EL POOL SALE DEL PAÍS, NO DE LA ESCALERA, y la diferencia decide si esta
        // regla existe en Sudamérica o no.
        //
        // Las escaleras de Argentina, Uruguay y Chile son AMATEUR PURAS: sus
        // escalones son divisiones de clubes, y las franquicias profesionales
        // —Dogos, Pampas, Peñarol, Selknam— no son un escalón de esa escalera sino
        // un destino de VÍA. Buscando sólo en la escalera, el 97% de los argentinos
        // que sacaban la rama corta caían igual en un club amateur y la regla
        // quedaba en un adorno justo en el país que más importa.
        //
        // Y NO ALCANZA CON FILTRAR `CLUBS` POR PAÍS: las franquicias regionales
        // llevan `countryCode: 'multi'` —Dogos, Pampas, Peñarol y Selknam son de
        // Sudamérica, no de un país— así que un filtro por 'ar' devuelve cero.
        //
        // El pool se arma entonces con las dos puertas que el motor ya conoce: los
        // clubes del propio país y los destinos de las VÍAS que salen de su
        // escalera, que es exactamente el dato que dice "por acá se profesionaliza
        // un sudamericano". Reusarlo evita inventar un mapeo país→franquicia que
        // se desincronizaría del catálogo de vías a la primera edición.
        const elegible = (c: ClubDef): boolean => {
            const model = economicModelOf(c);
            return (model === 'mixed' || model === 'professional') && marketRung(c) <= MAX_PRO_ENTRY_RUNG;
        };
        const porPais = CLUBS.filter((c) => c.countryCode === countryCode && elegible(c));
        const porVia = all
            .flatMap((c) => pathwaysFrom(c))
            .flatMap((p) => pathwayTargets(p))
            .filter(elegible);
        // Dedup estable por id: una vía puede apuntar al mismo club que otra, y el
        // orden no puede depender del recorrido (CLAUDE.md §1).
        const vistos = new Set<string>();
        const pro = [...porPais, ...porVia]
            .filter((c) => (vistos.has(c.id) ? false : (vistos.add(c.id), true)))
            .sort((a, b) => a.id.localeCompare(b.id));
        // El modelo se declara desde el club que se va a elegir, no desde la
        // intención: si el pool mezcla semipro y pro, manda el más bajo, que es el
        // que describe al plantel donde entra un juvenil.
        if (pro.length > 0) {
            const model: EconomicModel = pro.some((c) => economicModelOf(c) === 'mixed') ? 'mixed' : 'professional';
            return { clubs: pro, model, downgraded: false };
        }
    }

    const direct = all.filter((c) => economicModelOf(c) === 'amateur');
    if (direct.length > 0) return { clubs: direct, model: 'amateur', downgraded: proStart };

    // Sin clubes amateur: el modelo disponible más cercano al amateur.
    const available = MODEL_ORDER.filter((m) => all.some((c) => economicModelOf(c) === m));
    if (available.length === 0) return { clubs: all, model: 'amateur', downgraded: true };
    return { clubs: all.filter((c) => economicModelOf(c) === available[0]), model: available[0], downgraded: true };
}

/**
 * LOS CLUBES ENTRE LOS QUE EL JUGADOR PUEDE ELEGIR SU ARRANQUE.
 *
 * Determinística y sin RNG: la UI la llama apenas se elige la nacionalidad, o
 * sea antes de que exista la semilla. Devuelve los clubes AMATEUR del país,
 * TODOS y no sólo los escalones de entrada: elegir es justamente lo contrario de
 * que te toque, y un pibe de 18 debutando en la primera de un club grande del
 * amateurismo es una historia corriente del rugby, no una anomalía.
 *
 * Lista vacía = ese país no tiene escalera propia modelada (un checo, un
 * jamaiquino). Ahí el club lo sigue poniendo el motor por ruta migratoria y la
 * UI tiene que decirlo en vez de ofrecer una lista vacía.
 *
 * Ojo con lo que NO incluye: las franquicias profesionales. El arranque en
 * academia lo sortea el motor (`drawStartRoute`) y se descubre jugando; ofrecer
 * Dogos en la pantalla de creación convertiría en elección lo que el juego
 * decidió que fuera un descubrimiento.
 */
export function startClubChoices(countryCode: string): ClubDef[] {
    const ladder = domesticLadder(countryCode);
    if (ladder.length === 0) return [];
    const { clubs, model } = clubsForFirstClub(ladder, false, countryCode);
    if (model !== 'amateur') return [];
    // Del más fuerte al más flojo, con desempate estable por id: es el orden en
    // el que se lee una pirámide y no depende del recorrido del catálogo.
    return [...clubs].sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id));
}

/** ¿Ese club es una opción válida de arranque para esa nacionalidad? */
export function isStartClubChoice(countryCode: string, clubId: string): boolean {
    return startClubChoices(countryCode).some((c) => c.id === clubId);
}

export function pickInitialClub(
    nationality: string,
    originId: string,
    startTier: number,
    rng: Rng,
    proStart = false,
): InitialPlacement {
    const route = resolveStartRoute(nationality, originId, rng);
    const ladder = domesticLadder(route.countryCode);
    if (ladder.length === 0) {
        const club = [...CLUBS].sort((a, b) => a.rating - b.rating)[0];
        return { club, entryMode: route.entryMode, resolvedModel: economicModelOf(club), routeDowngraded: true };
    }

    const { clubs, model, downgraded } = clubsForFirstClub(ladder, proStart, route.countryCode);

    // El techo de debut se conserva PARA EL ARRANQUE AMATEUR: un pibe no arranca
    // en la categoría más alta del amateurismo sólo porque exista. El arranque
    // profesional ya trae su propio techo (`MAX_PRO_ENTRY_RUNG`) desde el filtro
    // de arriba, y volver a acotarlo por escalón de entrada lo dejaría sin pool.
    const pool = model === 'amateur' ? restrictToEntryRungs(ladder, clubs, startTier) : clubs;

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
