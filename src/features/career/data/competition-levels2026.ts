// FUENTE ÚNICA del nivel deportivo y del modelo económico de cada competición.
//
// Antes esta información estaba repartida (y en desacuerdo) entre `clubs.ts`
// (`level`), `market-routes.ts` (`LEVEL_RUNG`) y `rosters2026.ts`
// (`professionalStatus`). Ahora todo se deriva de acá.
//
// TRES EJES DISTINTOS, que antes se usaban como si fueran uno:
//
//   · sportingBand  (0-8) — jerarquía DEPORTIVA global del torneo. Comparable
//     entre países. Es una CALIBRACIÓN DE GAMEPLAY, no un ranking oficial.
//   · economicModel — modelo predominante de la competición. NO define el
//     vínculo de cada jugador: una liga profesional tiene juveniles con
//     contrato de desarrollo.
//   · divisionTier — posición dentro de una escalera doméstica. NO es
//     comparable entre países (la 2ª de la URBA no equivale a la Pro D2).
//
// `rating`, `prestige` y `marketBand` siguen siendo del CLUB, no del torneo.

import type { ClubDef } from './clubs.ts';
import { AR_DIVISIONS, AR_PENDING_ROSTERS, AR_SPORTING_BAND } from './clubs2026/arSystem2026.ts';

// 2026-27.3: entran las divisiones reales del sistema argentino (dos ramas) y
// sale el perfil paraguas `sa-ar`, que metía siete niveles en cuatro escalones.
// 2026-27.4: entran los perfiles de las cinco ligas nuevas — MLR, universitario
// CRAA D1A y NCR DI, Divisão de Honra portuguesa, Serie A Élite italiana con su
// Serie A, y Super 12 brasileño.
export const COMPETITION_LEVELS_VERSION = '2026-27.5';

export type SportingBand = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

// ── LAS COMPETICIONES UNIVERSITARIAS NO FICHAN ADULTOS ───────────────────────
//
// Encontrado jugando: a un jugador pasados los veinte le llegaba una oferta de
// Lindenwood, D1A universitaria. Y eso no existe — a la D1A se entra siendo
// estudiante. Un club universitario no sale al mercado a buscar a alguien de 25
// que ya terminó la facultad.
//
// ES UN LÍMITE DE FICHAJE Y NO DE PERMANENCIA. El que ya está en un plantel
// universitario sigue jugando mientras el motor no lo mueva: lo que se cierra es
// la puerta de entrada. Un cumpleaños no te echa de tu club.
//
// El número es el de la puerta, no el de la graduación: a los 20 todavía se entra
// por transferencia entre programas, que es lo que pasa de verdad. La regla
// académica exacta de la CRAA es una de las preguntas abiertas del catálogo (ver
// `rosters2026.ts`), así que se elige el corte conservador y queda en un solo
// lugar para moverlo cuando se sepa.
export const UNIVERSITY_MAX_SIGNING_AGE = 20;

const UNIVERSITY_COMPETITIONS: ReadonlySet<string> = new Set(['us-d1a', 'us-ncr-d1']);

/**
 * Edad máxima para que esa competición FICHE a alguien de afuera, o `null` si no
 * tiene tope. Vive acá y no en el motor porque es una propiedad de la
 * competición: el día que entre otro circuito universitario —Japón y Sudáfrica
 * tienen el suyo— se agrega a la lista y no se toca nada más.
 */
export function maxSigningAgeOf(competitionId: string): number | null {
    return UNIVERSITY_COMPETITIONS.has(competitionId) ? UNIVERSITY_MAX_SIGNING_AGE : null;
}
export type EconomicModel = 'amateur' | 'mixed' | 'professional';

export type LevelEvidence =
    | 'official' // estructura y estatus documentados por el organizador
    | 'official-structure-inferred-status' // estructura oficial, estatus económico inferido
    | 'game-calibration'; // decisión de diseño del juego

export interface CompetitionLevelProfile {
    competitionId: string;
    sportingBand: SportingBand;
    economicModel: EconomicModel;
    label: string;
    sourceUrls: readonly string[];
    evidence: LevelEvidence;
    /**
     * Fechas de temporada regular DEL EQUIPO. No son partidos jugados por el
     * jugador: de acá salen los disponibles, y el rol/las lesiones deciden
     * cuántos disputa realmente.
     */
    regularSeasonMatches: number;
    /** Evidencia del calendario, que puede ser peor que la del nivel. */
    matchesEvidence: LevelEvidence;
    /**
     * Solo ligas domésticas AR/UY/CL: la banda sale de la división real que
     * disputa el club, porque `sa-ar` agrupa cuatro categorías distintas.
     */
    bandByDivisionTier?: Readonly<Record<number, SportingBand>>;
}

const EPCR = 'https://www.epcrugby.com/champions-cup/qualification';
const LNR = 'https://www.lnr.fr/';
const PREM = 'https://www.premiershiprugby.com/';
const URC = 'https://www.unitedrugby.com/';
const SUPER = 'https://super.rugby/superrugby/';
const NZR = 'https://www.nzrugby.co.nz/';
const SARU = 'https://www.springboks.rugby/';
const JRLO = 'https://league-one.jp/en/';
const FER = 'https://ferugby.es/';
const SRA = 'https://www.superrugbyamericas.com/';
const REU = 'https://www.rugbyeurope.eu/';
const FFR = 'https://www.ffr.fr/';
const RFU = 'https://www.englandrugby.com/';
const MLR = 'https://www.majorleague.rugby/';
const USAR = 'https://www.usa.rugby/';
const NCR = 'https://www.ncr.rugby/';
const FPR = 'https://www.fpr.pt/';
const FIR = 'https://www.federugby.it/';
const CBRU = 'https://www.brasilrugby.com.br/';

// Escalera doméstica UY/CL: la banda depende de la división real, porque
// `sa-uy`/`sa-cl` siguen agrupando varias categorías en una sola competición.
// Argentina YA NO usa esto: cada una de sus divisiones tiene perfil propio.
const SA_BANDS: Readonly<Record<number, SportingBand>> = { 1: 3, 2: 2, 3: 1, 4: 0 };

const UAR = 'https://www.uar.com.ar/';
const URBA = 'https://www.urba.org.ar/';

/**
 * Perfiles de las divisiones argentinas, DERIVADOS del canon en vez de
 * transcritos: veintitantas entradas escritas a mano acá se desincronizarían de
 * `arSystem2026.ts` en la primera edición del sistema.
 *
 * La banda deportiva sale de `AR_SPORTING_BAND` (nivel del canon → banda global)
 * y el modelo económico es amateur para todas: el rugby de clubes argentino lo es
 * por regulación de la UAR, del Top 14 al último torneo local.
 */
const AR_LEVELS: readonly CompetitionLevelProfile[] = AR_DIVISIONS.map((division) => {
    const rosterIsPartial = AR_PENDING_ROSTERS.some((p) => p.competitionId === division.competitionId);
    return {
        competitionId: division.competitionId,
        sportingBand: AR_SPORTING_BAND[division.canonLevel],
        economicModel: 'amateur' as const,
        label: division.label,
        sourceUrls: division.branch === 'urba' ? [URBA, UAR] : [UAR],
        // Estructura oficial y estatus económico inferido, salvo donde el propio
        // canon avisa que la nómina no está publicada: ahí es calibración.
        evidence: rosterIsPartial ? 'game-calibration' : 'official-structure-inferred-status',
        regularSeasonMatches: division.regularSeasonMatches,
        matchesEvidence: 'game-calibration' as const,
    };
});

export const COMPETITION_LEVELS: readonly CompetitionLevelProfile[] = [
    // ── Banda 8 · élite mundial ──────────────────────────────────────────────
    { competitionId: 'top14', sportingBand: 8, economicModel: 'professional', label: 'Top 14', sourceUrls: [LNR, EPCR], evidence: 'official', regularSeasonMatches: 26, matchesEvidence: 'official' },
    { competitionId: 'prem', sportingBand: 8, economicModel: 'professional', label: 'Gallagher PREM', sourceUrls: [PREM, EPCR], evidence: 'official', regularSeasonMatches: 18, matchesEvidence: 'official-structure-inferred-status' },
    { competitionId: 'urc', sportingBand: 8, economicModel: 'professional', label: 'URC', sourceUrls: [URC, EPCR], evidence: 'official', regularSeasonMatches: 18, matchesEvidence: 'official' },
    { competitionId: 'super-rugby', sportingBand: 8, economicModel: 'professional', label: 'Super Rugby Pacific', sourceUrls: [SUPER], evidence: 'official', regularSeasonMatches: 14, matchesEvidence: 'game-calibration' },

    // ── Banda 7 ──────────────────────────────────────────────────────────────
    { competitionId: 'jpn-d1', sportingBand: 7, economicModel: 'professional', label: 'Japan Rugby League One D1', sourceUrls: [JRLO], evidence: 'official', regularSeasonMatches: 18, matchesEvidence: 'official' },

    // ── Banda 6 · segunda línea profesional ──────────────────────────────────
    { competitionId: 'prod2', sportingBand: 6, economicModel: 'professional', label: 'Pro D2', sourceUrls: [LNR], evidence: 'official', regularSeasonMatches: 30, matchesEvidence: 'official' },
    { competitionId: 'championship', sportingBand: 6, economicModel: 'professional', label: 'Champ Rugby', sourceUrls: [PREM], evidence: 'official-structure-inferred-status', regularSeasonMatches: 26, matchesEvidence: 'official-structure-inferred-status' },
    { competitionId: 'npc', sportingBand: 6, economicModel: 'professional', label: 'NPC', sourceUrls: [NZR], evidence: 'official', regularSeasonMatches: 10, matchesEvidence: 'official-structure-inferred-status' },
    { competitionId: 'currie-premier', sportingBand: 6, economicModel: 'mixed', label: 'Currie Cup Premier', sourceUrls: [SARU], evidence: 'official-structure-inferred-status', regularSeasonMatches: 14, matchesEvidence: 'official-structure-inferred-status' },
    { competitionId: 'jpn-d2', sportingBand: 6, economicModel: 'mixed', label: 'Japan Rugby League One D2', sourceUrls: [JRLO], evidence: 'official-structure-inferred-status', regularSeasonMatches: 14, matchesEvidence: 'official' },

    // ── Banda 5 · profesional/regional ───────────────────────────────────────
    { competitionId: 'nationale', sportingBand: 5, economicModel: 'mixed', label: 'Nationale', sourceUrls: [FFR], evidence: 'official-structure-inferred-status', regularSeasonMatches: 26, matchesEvidence: 'official-structure-inferred-status' },
    { competitionId: 'sra', sportingBand: 5, economicModel: 'professional', label: 'Super Rugby Americas', sourceUrls: [SRA], evidence: 'official', regularSeasonMatches: 14, matchesEvidence: 'game-calibration' },
    { competitionId: 'super-cup', sportingBand: 5, economicModel: 'mixed', label: 'Rugby Europe Super Cup', sourceUrls: [REU], evidence: 'official-structure-inferred-status', regularSeasonMatches: 8, matchesEvidence: 'game-calibration' },
    // MLR: LOS DOS EJES DICEN COSAS DISTINTAS Y ESO NO ES UNA CONTRADICCIÓN.
    // `economicModel: 'professional'` porque lo es —convenio colectivo firmado en
    // febrero de 2026 con la USRPA, jugadores a tiempo completo— y banda 5 porque
    // el nivel deportivo que sostiene un tope de ~500.000 USD por club no es el de
    // la Pro D2 ni el del Championship. Es exactamente el caso de Super Rugby
    // Americas, y por eso comparte banda con ella.
    //
    // Diez fechas de temporada regular es DATO, no calibración: tabla única de seis
    // equipos, ida y vuelta, once semanas, del 28 de marzo al 7 de junio.
    { competitionId: 'us-mlr', sportingBand: 5, economicModel: 'professional', label: 'Major League Rugby', sourceUrls: [MLR], evidence: 'official', regularSeasonMatches: 10, matchesEvidence: 'official' },

    // ── Banda 4 ──────────────────────────────────────────────────────────────
    { competitionId: 'esp-dh', sportingBand: 4, economicModel: 'mixed', label: 'División de Honor', sourceUrls: [FER], evidence: 'official-structure-inferred-status', regularSeasonMatches: 18, matchesEvidence: 'official-structure-inferred-status' },
    { competitionId: 'currie-first', sportingBand: 4, economicModel: 'mixed', label: 'Currie Cup First Division', sourceUrls: [SARU], evidence: 'official-structure-inferred-status', regularSeasonMatches: 10, matchesEvidence: 'official-structure-inferred-status' },
    { competitionId: 'jpn-d3', sportingBand: 4, economicModel: 'mixed', label: 'Japan Rugby League One D3', sourceUrls: [JRLO], evidence: 'official-structure-inferred-status', regularSeasonMatches: 12, matchesEvidence: 'official' },
    // Portugal y la Serie A Élite comparten banda con la División de Honor
    // española, y no por comodidad: son las tres el TERCER escalón de su país,
    // semiprofesionales, con el mejor rugby nacional jugándose afuera.
    //
    // Las 16 fechas portuguesas son 6 + 10: la fase regular son tres grupos de
    // cuatro a ida y vuelta, y la fase final son dos grupos de seis a ida y vuelta.
    // No hay playoff ni final — el campeón es el 1º del Grupo do Título— así que no
    // hay fechas de eliminatoria que sumar.
    { competitionId: 'pt-honra', sportingBand: 4, economicModel: 'mixed', label: 'Divisão de Honra', sourceUrls: [FPR], evidence: 'official-structure-inferred-status', regularSeasonMatches: 16, matchesEvidence: 'official-structure-inferred-status' },
    // Italia: 18 fechas es la liga a doble vuelta con diez equipos, tal como está
    // prevista para 2026-27. En 2025-26 fueron 16 porque Colorno fue excluido el 2
    // de marzo y sus partidos se borraron — ése es el número de una temporada
    // accidentada, no el del formato.
    { competitionId: 'ita-serie-a-elite', sportingBand: 4, economicModel: 'mixed', label: 'Serie A Élite', sourceUrls: [FIR], evidence: 'official-structure-inferred-status', regularSeasonMatches: 18, matchesEvidence: 'official-structure-inferred-status' },

    // ── Banda 3 ──────────────────────────────────────────────────────────────
    { competitionId: 'esp-dhelite', sportingBand: 3, economicModel: 'mixed', label: 'División de Honor Élite', sourceUrls: [FER], evidence: 'official-structure-inferred-status', regularSeasonMatches: 18, matchesEvidence: 'official-structure-inferred-status' },

    // ── Banda 2 ──────────────────────────────────────────────────────────────
    { competitionId: 'esp-dhb', sportingBand: 2, economicModel: 'amateur', label: 'División de Honor B', sourceUrls: [FER], evidence: 'official-structure-inferred-status', regularSeasonMatches: 14, matchesEvidence: 'official-structure-inferred-status' },
    // Tercer escalón francés e inglés: estructura oficial, plantel amateur con
    // algún jugador compensado. Es el techo REALISTA de una carrera amateur.
    { competitionId: 'fr-federale1', sportingBand: 2, economicModel: 'amateur', label: 'Fédérale 1', sourceUrls: [FFR], evidence: 'game-calibration', regularSeasonMatches: 18, matchesEvidence: 'game-calibration' },
    { competitionId: 'eng-national1', sportingBand: 2, economicModel: 'amateur', label: 'National League 1', sourceUrls: [RFU], evidence: 'game-calibration', regularSeasonMatches: 26, matchesEvidence: 'game-calibration' },
    // D1A universitaria: banda 2 y modelo AMATEUR. El rugby masculino no es deporte
    // NCAA, así que no hay beca de equivalencia ni salario: las becas se articulan
    // caso por caso vía universidad o fundraising. Lo que un programa universitario
    // sí tiene —cancha, preparador, viajes, calendario— es estructura, y de ahí sale
    // que esté un escalón arriba de la Ivy y no empatada con ella.
    //
    // `game-calibration` en las dos evidencias por el mismo motivo: la competición y
    // su lugar en la pirámide son oficiales, pero el roster cargado son los doce
    // mejores programas por ranking y no la división completa, y las fechas de
    // conferencia varían por región.
    { competitionId: 'us-d1a', sportingBand: 2, economicModel: 'amateur', label: 'D1A universitaria (CRAA)', sourceUrls: [USAR], evidence: 'game-calibration', regularSeasonMatches: 10, matchesEvidence: 'game-calibration' },
    // Super 12: la primera división de Brasil, amateur/semiprofesional por
    // declaración de la propia CBRu. Banda 2 —y no 3— porque el profesionalismo
    // brasileño NO está en la pirámide de clubes: está en Cobras, que es de la
    // confederación. Si el Super 12 empatara con el URBA Top 14, el salto a Cobras
    // entraría por la ventana de ±1 escalón y la vía declarada dejaría de hacer
    // falta, que es el mismo error que se corrigió en Argentina.
    //
    // Once fechas: 6 de grupos regionalizados + 5 del hexagonal. La Grande Final es
    // partido único y no hay semifinales, así que no hay ronda intermedia que sumar.
    // Los seis que no entran al hexagonal juegan la Repescagem, que es otro torneo.
    { competitionId: 'br-super12', sportingBand: 2, economicModel: 'amateur', label: 'Super 12', sourceUrls: [CBRU], evidence: 'official-structure-inferred-status', regularSeasonMatches: 11, matchesEvidence: 'official-structure-inferred-status' },

    // ── Banda 1 · el piso amateur de cada pirámide ───────────────────────────
    // Sin estos escalones, elegir la ruta AMATEUR en Francia, Inglaterra, Nueva
    // Zelanda, Sudáfrica o Japón degradaba a un club profesional: el catálogo se
    // cortaba por arriba y no había dónde empezar de abajo.
    //
    // Evidencia 'game-calibration': las competiciones son reales y su lugar en
    // la pirámide es oficial, pero los rosters cargados son REPRESENTATIVOS —
    // no la lista publicada de la temporada. Se documenta en vez de disfrazarlo.
    { competitionId: 'fr-federale2', sportingBand: 1, economicModel: 'amateur', label: 'Fédérale 2', sourceUrls: [FFR], evidence: 'game-calibration', regularSeasonMatches: 18, matchesEvidence: 'game-calibration' },
    { competitionId: 'eng-national2', sportingBand: 1, economicModel: 'amateur', label: 'National League 2', sourceUrls: [RFU], evidence: 'game-calibration', regularSeasonMatches: 26, matchesEvidence: 'game-calibration' },
    { competitionId: 'nz-heartland', sportingBand: 1, economicModel: 'amateur', label: 'Heartland Championship', sourceUrls: [NZR], evidence: 'game-calibration', regularSeasonMatches: 8, matchesEvidence: 'game-calibration' },
    { competitionId: 'za-community', sportingBand: 1, economicModel: 'amateur', label: 'Community Cup', sourceUrls: [SARU], evidence: 'game-calibration', regularSeasonMatches: 10, matchesEvidence: 'game-calibration' },
    { competitionId: 'jpn-regional', sportingBand: 1, economicModel: 'amateur', label: 'Ligas regionales japonesas', sourceUrls: [JRLO], evidence: 'game-calibration', regularSeasonMatches: 10, matchesEvidence: 'game-calibration' },
    // Serie A italiana: el piso amateur de Italia, y existe por el mismo motivo que
    // los cinco de arriba. Sin él, elegir la ruta AMATEUR en Italia degradaba en
    // silencio a un club semiprofesional de la Élite.
    { competitionId: 'ita-serie-a', sportingBand: 1, economicModel: 'amateur', label: 'Serie A', sourceUrls: [FIR], evidence: 'game-calibration', regularSeasonMatches: 18, matchesEvidence: 'game-calibration' },
    // NCR DI: la OTRA pirámide universitaria, la que corona en diciembre. Va una
    // banda abajo de la D1A porque D1A es la máxima categoría de facto, no porque
    // la Ivy no sepa jugar: sus ocho miembros están acá desde 2022 y siguen dándose
    // su propio título Ivy por dentro.
    { competitionId: 'us-ncr-d1', sportingBand: 1, economicModel: 'amateur', label: 'DI universitaria (NCR)', sourceUrls: [NCR], evidence: 'game-calibration', regularSeasonMatches: 8, matchesEvidence: 'game-calibration' },

    // ── Divisiones argentinas · una por división real ─────────────────────────
    // Van al final del array, derivadas del canon. Antes había acá un único
    // perfil paraguas `sa-ar` con `bandByDivisionTier`, y no alcanzaba: metía la
    // URBA entera y las siete regiones del interior en cuatro escalones, así que
    // el Torneo Local de la URNE terminaba por arriba de URBA Primera B.
    ...AR_LEVELS,

    // ── Ligas domésticas UY/CL · banda por división ───────────────────────────
    // Uruguay y Chile: INFERENCIA VERSIONADA. No se encontró un marco oficial
    // que declare un estatus profesional para el rugby doméstico de clubes;
    // se modela amateur hasta tener una fuente que diga otra cosa. Las
    // franquicias de Super Rugby Americas (Peñarol, Selknam) NO entran acá:
    // tienen su propia competición y son profesionales.
    {
        competitionId: 'sa-uy', sportingBand: 2, economicModel: 'amateur', label: 'Rugby doméstico uruguayo',
        sourceUrls: ['https://www.uru.rugby/'], evidence: 'official-structure-inferred-status', regularSeasonMatches: 16, matchesEvidence: 'game-calibration', bandByDivisionTier: SA_BANDS,
    },
    {
        competitionId: 'sa-cl', sportingBand: 2, economicModel: 'amateur', label: 'Rugby doméstico chileno',
        sourceUrls: ['https://www.chilerugby.cl/'], evidence: 'official-structure-inferred-status', regularSeasonMatches: 16, matchesEvidence: 'game-calibration', bandByDivisionTier: SA_BANDS,
    },
];

const BY_ID = new Map(COMPETITION_LEVELS.map((p) => [p.competitionId, p]));

export function levelProfileOf(competitionId: string): CompetitionLevelProfile | null {
    return BY_ID.get(competitionId) ?? null;
}

/** Banda deportiva del CLUB: usa su división real cuando la competición la tiene. */
export function sportingBandOf(club: ClubDef): SportingBand {
    const profile = BY_ID.get(club.competitionId);
    if (!profile) return 0;
    if (profile.bandByDivisionTier) {
        const tier = club.divisionTier ?? 3;
        return profile.bandByDivisionTier[Math.min(4, Math.max(1, tier))] ?? profile.sportingBand;
    }
    return profile.sportingBand;
}

export function economicModelOf(club: ClubDef): EconomicModel {
    return BY_ID.get(club.competitionId)?.economicModel ?? 'amateur';
}

/** Fechas de temporada regular del EQUIPO en esa competición. */
export function regularSeasonMatchesOf(competitionId: string): number {
    return BY_ID.get(competitionId)?.regularSeasonMatches ?? 16;
}

export function competitionLabelOf(competitionId: string): string {
    return BY_ID.get(competitionId)?.label ?? competitionId;
}

/** Ids con perfil declarado. Los tests exigen que cubra todo destino posible. */
export function profiledCompetitionIds(): string[] {
    return [...BY_ID.keys()].sort();
}
