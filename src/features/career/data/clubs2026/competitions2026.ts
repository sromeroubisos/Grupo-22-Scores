// Grafo de competiciones y copas 2026-27. Puro y determinístico (sin red).
//  - 5 tipos: liga, copa eliminatoria, copa de liga, supercopa, copa internacional.
//  - CLASIFICACIÓN por CRITERIO REAL (pertenencia a la liga o POSICIÓN FINAL +
//    plazas), NUNCA por umbral de rating: el rating influye en simular el
//    resultado de una competición, no en quién entra a ella.
//  - Ascensos/descensos declarativos (nunca entre competiciones PARALELAS).
//  - Clasificar ≠ participar ≠ ganar. Este archivo resuelve QUIÉN PARTICIPA;
//    el resultado (y el título) lo resuelve engine/competition-results.ts.
//  - Una copa NUNCA es destino de fichaje.

import type { ClubDef } from '../clubs.ts';
import { LEAGUES } from '../clubs.ts';
import type { ClubLevel } from './rosters2026.ts';
import { CATALOG_SEASON, EXPECTED_COUNTS } from './rosters2026.ts';
import {
    AR_DIVISIONS,
    NACIONAL_DE_CLUBES_ID,
    TDI_A_ID,
    TDI_A_SLOTS,
    TDI_B_ID,
    TDI_B_SLOTS,
    TDI_CUPOS_2026,
    arDivisionOf,
} from './arSystem2026.ts';

export type CompetitionKind =
    | 'league' | 'knockout-cup' | 'league-cup' | 'super-cup' | 'continental-cup'
    /**
     * Torneo de SELECCIONES (Seis Naciones, Rugby Championship, Mundial…). No
     * aparece en `ALL_COMPETITIONS` —el calendario internacional es su propio
     * catálogo, en `data/international-calendar.ts`— pero sí en `TitleWon`, que es
     * donde conviven los honores de club y los de selección.
     */
    | 'national-tournament';
export type CompetitionScope = 'domestic' | 'regional' | 'continental' | 'national-team';

/** Cómo se entra a una competición. */
export type QualificationCriterion =
    | 'membership' // el club pertenece a esa competición (liga propia, copa de liga)
    | 'league-position' // terminó entre las posiciones [from..to] de una liga
    | 'invitation'; // plaza de invitación (asignada por el organizador)

export interface QualificationRule {
    criterion: QualificationCriterion;
    /** Liga de origen. null solo para plazas de invitación. */
    sourceCompetitionId: string | null;
    /** Rango de posiciones finales (1 = campeón). null si el criterio no es posicional. */
    fromPosition: number | null;
    toPosition: number | null;
    slots: number;
    note?: string;
}

/** Posición final de un club en su liga (la unidad de clasificación). */
export interface LeagueStanding {
    competitionId: string;
    position: number; // 1 = campeón
    teams: number;
}

export interface CompetitionDef {
    id: string;
    label: string;
    kind: CompetitionKind;
    scope: CompetitionScope;
    region: string;
    seasonVersion: string;
    isTransferDestination: boolean; // ligas sí; copas NO
    /** Plazas totales (null = todos los miembros de la competición de origen). */
    totalTeams: number | null;
    /**
     * Dispersión del resultado, en puntos de rating. Cuanto más alta, más
     * probable es que gane un club que no es el más fuerte del campo. Una liga
     * larga es menos aleatoria que una final única.
     */
    volatility: number;
    qualification: QualificationRule[];
}

// Título concreto ganado (para titlesWon[]).
/**
 * Un título ganado. Sirve para las dos clases de honor que existen en una
 * carrera, y por eso `club` y `union` son excluyentes en vez de un solo campo
 * "ganador": un título de club se muestra con el escudo y uno de selección con la
 * bandera, y colapsarlos en un string obligaría a adivinar cuál es cuál.
 *
 * Exactamente uno de los dos está poblado. Hay un test que lo exige.
 */
export interface TitleWon {
    competitionId: string;
    season: string;
    /** Id del club campeón. `null` en un título de selección. */
    club: string | null;
    /** Código de la unión campeona. `null` en un título de club. */
    union: string | null;
    category: CompetitionKind;
    scope: CompetitionScope;
}

// Cuanto más corta y eliminatoria es la competición, más azar admite.
//
// EXCLUYE a los torneos de selecciones a propósito, y no por comodidad: este
// archivo es el grafo de competiciones de CLUBES, y un torneo de selecciones no
// entra nunca en `ALL_COMPETITIONS`. Su dispersión vive donde vive su resolución,
// en `engine/international-results.ts`. Escribir acá un número que nadie lee sería
// una tabla que envejece sin que nada la contradiga.
const KIND_VOLATILITY: Record<Exclude<CompetitionKind, 'national-tournament'>, number> = {
    league: 6,
    'league-cup': 9,
    'continental-cup': 10,
    'knockout-cup': 11,
    'super-cup': 14,
};

// Las ligas de nivel bajo son más parejas (menos separación real entre clubes).
const LEVEL_VOLATILITY_BONUS: Record<ClubLevel, number> = {
    'elite-world': 0,
    'elite-pro': 0,
    'pro-second': 1,
    'pro-regional': 1,
    semipro: 2,
    development: 2,
    amateur: 3,
};

function membership(competitionId: string, slots: number, note?: string): QualificationRule {
    return { criterion: 'membership', sourceCompetitionId: competitionId, fromPosition: null, toPosition: null, slots, note };
}

function byPosition(competitionId: string, from: number, to: number, note?: string): QualificationRule {
    return {
        criterion: 'league-position',
        sourceCompetitionId: competitionId,
        fromPosition: from,
        toPosition: to,
        slots: to - from + 1,
        note,
    };
}

function invitation(slots: number, note: string): QualificationRule {
    return { criterion: 'invitation', sourceCompetitionId: null, fromPosition: null, toPosition: null, slots, note };
}

// ── Ligas (una por competición del catálogo) + ids simbólicos AR/UY/CL ───────
function buildLeagues(): CompetitionDef[] {
    const leagues: CompetitionDef[] = Object.values(LEAGUES).map((lg) => ({
        id: lg.id,
        label: lg.labelEs,
        kind: 'league' as const,
        scope: lg.kind === 'regional-franchise' ? ('regional' as const) : ('domestic' as const),
        region: lg.region,
        seasonVersion: CATALOG_SEASON,
        isTransferDestination: true,
        // Las divisiones argentinas declaran su plantel en el canon; el resto en
        // EXPECTED_COUNTS. Se lee del canon para que no haya dos conteos que se
        // puedan contradecir.
        totalTeams: arDivisionOf(lg.id)?.clubs.length ?? EXPECTED_COUNTS[lg.id] ?? null,
        volatility: KIND_VOLATILITY.league + LEVEL_VOLATILITY_BONUS[lg.level],
        qualification: [membership(lg.id, EXPECTED_COUNTS[lg.id] ?? 0, 'pertenece a la liga')],
    }));

    // Ligas UY/CL: si el snapshot de Supabase las pobló ya vienen de LEAGUES; si
    // no (snapshot vacío), se registran igual como ids simbólicos para que el
    // grafo no quede con referencias colgando. Argentina no necesita este
    // resguardo: sus divisiones salen del canon, que nunca viene vacío.
    const present = new Set(leagues.map((l) => l.id));
    for (const [id, label] of [['sa-uy', 'Liga Uruguaya'], ['sa-cl', 'Liga Chilena']] as const) {
        if (present.has(id)) continue;
        leagues.push({
            id, label, kind: 'league', scope: 'domestic', region: 'south-america',
            seasonVersion: CATALOG_SEASON, isTransferDestination: true, totalTeams: null,
            volatility: KIND_VOLATILITY.league + LEVEL_VOLATILITY_BONUS.amateur,
            qualification: [membership(id, 0, 'pertenece a la liga')],
        });
    }
    return leagues;
}

// ── Copas: clasificación por CRITERIO REAL, NUNCA destino de fichaje ─────────
export const CUPS: CompetitionDef[] = [
    {
        // Champions Cup 2026/27: 24 clubes = 8 Top 14 + 8 URC + 8 PREM, por
        // posición final en la liga de origen.
        // Fuente: https://www.epcrugby.com/champions-cup/qualification
        id: 'champions-cup', label: 'Champions Cup', kind: 'continental-cup', scope: 'continental', region: 'europe',
        seasonVersion: CATALOG_SEASON, isTransferDestination: false, totalTeams: 24,
        volatility: KIND_VOLATILITY['continental-cup'],
        qualification: [
            byPosition('top14', 1, 8, '8 plazas Top 14'),
            byPosition('urc', 1, 8, '8 plazas URC'),
            byPosition('prem', 1, 8, '8 plazas PREM'),
        ],
    },
    {
        // Challenge Cup 2026/27: 18 clubes = 8 URC + 6 Top 14 + 2 PREM + 2 invitados.
        // Los 2 invitados NO se inventan: quedan como plaza declarada sin asignar
        // hasta que EPCR los publique (ver PENDING_QUALIFICATIONS).
        // Fuentes: https://www.epcrugby.com/challenge-cup/ecc-qualification
        //          https://www.epcrugby.com/champions-cup/content/epcr-pool-draws-for-202627-season
        id: 'challenge-cup', label: 'Challenge Cup', kind: 'continental-cup', scope: 'continental', region: 'europe',
        seasonVersion: CATALOG_SEASON, isTransferDestination: false, totalTeams: 18,
        volatility: KIND_VOLATILITY['continental-cup'] + 1,
        qualification: [
            byPosition('urc', 9, 16, '8 plazas URC'),
            byPosition('top14', 9, 14, '6 plazas Top 14'),
            byPosition('prem', 9, 10, '2 plazas PREM'),
            invitation(2, 'invitados EPCR 2026/27 sin publicar'),
        ],
    },
    {
        id: 'prem-rugby-cup', label: 'PREM Rugby Cup', kind: 'league-cup', scope: 'domestic', region: 'europe',
        seasonVersion: CATALOG_SEASON, isTransferDestination: false, totalTeams: null,
        volatility: KIND_VOLATILITY['league-cup'],
        qualification: [membership('prem', 10, 'copa de liga: la disputan los clubes de PREM')],
    },
    {
        // Simplificación documentada: se modela abierta a División de Honor y
        // División de Honor Élite (criterio de PERTENENCIA, no de rating).
        id: 'copa-del-rey', label: 'Copa del Rey', kind: 'knockout-cup', scope: 'domestic', region: 'europe-emerging',
        seasonVersion: CATALOG_SEASON, isTransferDestination: false, totalTeams: null,
        volatility: KIND_VOLATILITY['knockout-cup'],
        qualification: [
            membership('esp-dh', 10, 'clubes de División de Honor'),
            membership('esp-dhelite', 10, 'clubes de División de Honor Élite'),
        ],
    },
    {
        // Supercopa: campeón de liga vs campeón de copa. Simplificación
        // documentada: las dos primeras posiciones de División de Honor.
        id: 'supercopa-esp', label: 'Supercopa de España', kind: 'super-cup', scope: 'domestic', region: 'europe-emerging',
        seasonVersion: CATALOG_SEASON, isTransferDestination: false, totalTeams: 2,
        volatility: KIND_VOLATILITY['super-cup'],
        qualification: [byPosition('esp-dh', 1, 2, 'campeón de liga + campeón de copa (aprox.)')],
    },

    // ── PORTUGAL · las copas abren la temporada, no la cierran ────────────────
    //
    // El calendario portugués está invertido respecto de lo esperable: la Taça
    // arranca en octubre y la Supertaça se juega el 1 de noviembre, ANTES de que
    // empiece la liga (30 de noviembre). Acá eso no cambia nada —el motor resuelve
    // las competiciones de una temporada en paralelo— pero conviene que quede
    // escrito: quien venga a modelar el orden del calendario no lo va a adivinar.
    //
    // Las dos llevan patrocinador en la realidad (Taça de Portugal Santander,
    // Supertaça Cartrack) y acá van sin él: el auspiciante cambia de temporada y el
    // título no, así que meterlo en el label envejecería el dato en un año.
    {
        id: 'taca-portugal', label: 'Taça de Portugal', kind: 'knockout-cup', scope: 'domestic', region: 'europe-emerging',
        seasonVersion: CATALOG_SEASON, isTransferDestination: false, totalTeams: null,
        volatility: KIND_VOLATILITY['knockout-cup'],
        qualification: [membership('pt-honra', 12, 'la disputan los clubes de la Divisão de Honra')],
    },
    {
        // Misma simplificación documentada que la Supercopa española: en la realidad
        // es campeón de liga contra campeón de copa, y el motor todavía no puede
        // leer "el que ganó la Taça" —el ganador de una copa no es un criterio de
        // clasificación disponible—, así que se aproxima con los dos primeros de la
        // liga.
        id: 'supertaca-pt', label: 'Supertaça', kind: 'super-cup', scope: 'domestic', region: 'europe-emerging',
        seasonVersion: CATALOG_SEASON, isTransferDestination: false, totalTeams: 2,
        volatility: KIND_VOLATILITY['super-cup'],
        qualification: [byPosition('pt-honra', 1, 2, 'campeón de liga + campeón de copa (aprox.)')],
    },

    // ── ITALIA ───────────────────────────────────────────────────────────────
    {
        // La Coppa Italia la disputan los clubes de la Serie A Élite. Valorugby hizo
        // el doblete en 2025-26: ganó la copa en febrero (26-10 a Petrarca) y el
        // Scudetto en junio (27-5, al mismo rival).
        //
        // OJO CON QUIÉN NO ESTÁ: Benetton y Zebre no la juegan, porque no están en la
        // pirámide doméstica. Es la misma consecuencia que hace que el Scudetto no lo
        // pelen los dos mejores clubes de Italia.
        id: 'coppa-italia', label: 'Coppa Italia', kind: 'knockout-cup', scope: 'domestic', region: 'europe-emerging',
        seasonVersion: CATALOG_SEASON, isTransferDestination: false, totalTeams: null,
        volatility: KIND_VOLATILITY['knockout-cup'],
        qualification: [membership('ita-serie-a-elite', 10, 'la disputan los clubes de la Serie A Élite')],
    },

    // ── ARGENTINA · el interior y el cruce entre las dos ramas ────────────────
    //
    // LAS PLAZAS DEL TDI NO PERTENECEN AL CLUB, PERTENECEN A LA REGIÓN. Por eso
    // la clasificación se declara por POSICIÓN FINAL en el regional de cada
    // región, con los cupos 2026 (`TDI_CUPOS_2026`). Un club que sale campeón de
    // su regional no juega el TDI A si su región no tiene el cupo: esa tensión es
    // parte del juego, no un bug.
    //
    // El TDI A y el TDI B NO son una escalera: no hay ascenso ni descenso entre
    // ellos, así que no aparecen en MOVEMENTS. Un campeón del A puede terminar
    // jugando el B dos años después si su regional lo relega.
    {
        id: TDI_A_ID, label: 'Torneo del Interior A', kind: 'knockout-cup', scope: 'domestic', region: 'south-america',
        seasonVersion: CATALOG_SEASON, isTransferDestination: false, totalTeams: TDI_A_SLOTS,
        volatility: KIND_VOLATILITY['knockout-cup'] + 2,
        qualification: TDI_CUPOS_2026.filter((c) => c.tdiA > 0).map((c) =>
            byPosition(c.sourceCompetitionId, 1, c.tdiA, `${c.tdiA} cupo(s) de ${c.region}`),
        ),
    },
    {
        id: TDI_B_ID, label: 'Torneo del Interior B', kind: 'knockout-cup', scope: 'domestic', region: 'south-america',
        seasonVersion: CATALOG_SEASON, isTransferDestination: false, totalTeams: TDI_B_SLOTS,
        volatility: KIND_VOLATILITY['knockout-cup'] + 3,
        qualification: TDI_CUPOS_2026.filter((c) => c.tdiB > 0).map((c) =>
            // Los cupos del B empiezan donde terminan los del A: si la región
            // pone 6 en el A, su plaza en el B es para el 7°.
            byPosition(c.sourceCompetitionId, c.tdiA + 1, c.tdiA + c.tdiB, `${c.tdiB} cupo(s) de ${c.region}`),
        ),
    },
    {
        // La ÚNICA competencia del año donde se cruzan las dos ramas.
        //
        // SIMPLIFICACIÓN DOCUMENTADA: en la realidad es un partido único entre el
        // campeón del Top 14 y el campeón del TDI A. El motor resuelve las copas
        // en paralelo, así que todavía no puede leer "el que ganó el TDI A" — el
        // ganador de una copa no es un criterio de clasificación disponible.
        // Se aproxima con el campeón de cada primera división regional que tiene
        // cupo al TDI A: son los cinco clubes que pueden llegar a esa final, y
        // entrar exige lo mismo que en la realidad (salir campeón). Lo que se
        // pierde es que compitan entre sí antes.
        id: NACIONAL_DE_CLUBES_ID, label: 'Nacional de Clubes', kind: 'super-cup', scope: 'domestic', region: 'south-america',
        seasonVersion: CATALOG_SEASON, isTransferDestination: false, totalTeams: 6,
        volatility: KIND_VOLATILITY['super-cup'],
        qualification: [
            byPosition('ar-urba-top14', 1, 1, 'campeón del URBA Top 14'),
            ...TDI_CUPOS_2026.filter((c) => c.tdiA > 0).map((c) =>
                byPosition(c.sourceCompetitionId, 1, 1, `campeón de ${c.region} (aprox. del campeón del TDI A)`),
            ),
        ],
    },
];

export const LEAGUES_COMP: CompetitionDef[] = buildLeagues();
export const ALL_COMPETITIONS: CompetitionDef[] = [...LEAGUES_COMP, ...CUPS];

/**
 * Plazas declaradas cuyo ocupante todavía NO publicó el organizador. Se
 * documentan como pendientes (no se inventan) y no rompen el grafo: nadie
 * clasifica por esa vía hasta que exista el dato real.
 */
export const PENDING_QUALIFICATIONS: { competitionId: string; slots: number; note: string }[] = CUPS.flatMap((cup) =>
    cup.qualification
        .filter((rule) => rule.criterion === 'invitation')
        .map((rule) => ({ competitionId: cup.id, slots: rule.slots, note: rule.note ?? 'plaza de invitación sin asignar' })),
);

// ── Ascensos/descensos declarativos (solo escaleras domésticas verticales) ───
export interface MovementRule {
    from: string;
    to: string;
    slots: number;
    kind: 'auto' | 'playoff';
    direction: 'promotion' | 'relegation';
}

/**
 * Ascensos y descensos del sistema argentino, DERIVADOS del canon. Cada regla
 * queda dentro de su rama porque `promotesTo`/`relegatesTo` del canon nunca
 * cruzan de rama: un club de la URBA no puede ascender al interior ni al revés.
 *
 * `kind`: con un solo cupo el campeón sube directo (`auto`); con dos, el segundo
 * se define por playoff entre los puestos 2° a 5° (`playoff`).
 */
const AR_MOVEMENTS: MovementRule[] = AR_DIVISIONS.flatMap((division) => {
    const rules: MovementRule[] = [];
    if (division.promotesTo) {
        const slots = division.promotionSlots ?? 1;
        rules.push({ from: division.competitionId, to: division.promotesTo, slots, kind: slots > 1 ? 'playoff' : 'auto', direction: 'promotion' });
    }
    if (division.relegatesTo) {
        rules.push({ from: division.competitionId, to: division.relegatesTo, slots: division.relegationSlots ?? 1, kind: 'auto', direction: 'relegation' });
    }
    return rules;
});

export const MOVEMENTS: MovementRule[] = [
    ...AR_MOVEMENTS,
    { from: 'prod2', to: 'top14', slots: 2, kind: 'playoff', direction: 'promotion' },
    { from: 'nationale', to: 'prod2', slots: 1, kind: 'playoff', direction: 'promotion' },
    { from: 'championship', to: 'prem', slots: 1, kind: 'playoff', direction: 'promotion' },
    { from: 'esp-dhelite', to: 'esp-dh', slots: 1, kind: 'playoff', direction: 'promotion' },
    { from: 'esp-dhb', to: 'esp-dhelite', slots: 1, kind: 'playoff', direction: 'promotion' },
    { from: 'jpn-d2', to: 'jpn-d1', slots: 1, kind: 'playoff', direction: 'promotion' },
    { from: 'jpn-d3', to: 'jpn-d2', slots: 1, kind: 'playoff', direction: 'promotion' },
    { from: 'top14', to: 'prod2', slots: 2, kind: 'auto', direction: 'relegation' },
    { from: 'prod2', to: 'nationale', slots: 1, kind: 'auto', direction: 'relegation' },
    { from: 'prem', to: 'championship', slots: 1, kind: 'auto', direction: 'relegation' },
    { from: 'esp-dh', to: 'esp-dhelite', slots: 1, kind: 'auto', direction: 'relegation' },
    { from: 'esp-dhelite', to: 'esp-dhb', slots: 1, kind: 'auto', direction: 'relegation' },
    { from: 'jpn-d1', to: 'jpn-d2', slots: 1, kind: 'auto', direction: 'relegation' },
    { from: 'jpn-d2', to: 'jpn-d3', slots: 1, kind: 'auto', direction: 'relegation' },
    // ── ITALIA · la única escalera de las cinco ligas nuevas ──────────────────
    //
    // Se declara UNA plaza en cada dirección, y el razonamiento importa porque la
    // fuente no lo dice con esas palabras: la reforma 2026-27 amplía todas las
    // categorías inferiores pero deja la Élite CONGELADA EN 10, y para 2026-27 la
    // Élite son los 9 que quedaron más Parabiago, que sube. Diez plazas fijas con un
    // ascenso comprobado significa un intercambio de uno por uno.
    //
    // Lo que NO se declara es lo que pasó en 2025-26: HBS Colorno retiró su primer
    // equipo, fue excluido el 2 de marzo y el Consejo Federal ANULÓ la plaza de
    // descenso de esa temporada. Fue una decisión de una temporada accidentada, no
    // el formato, así que no se congela en el grafo.
    { from: 'ita-serie-a', to: 'ita-serie-a-elite', slots: 1, kind: 'playoff', direction: 'promotion' },
    { from: 'ita-serie-a-elite', to: 'ita-serie-a', slots: 1, kind: 'auto', direction: 'relegation' },
    // POR QUÉ NO HAY MOVIMIENTOS DE EE.UU., PORTUGAL NI BRASIL, que es tres motivos
    // distintos y no una omisión:
    //
    //   · EE.UU. — no existen. La MLR es una liga cerrada de franquicias (y en 2026
    //     se contrajo de once a seis: se retiraron cuatro clubes y dos se
    //     fusionaron), y el universitario son dos pirámides paralelas que no se
    //     reconocen entre sí: no hay ascenso de CRAA a NCR ni al revés, ni de
    //     ninguna de las dos a la MLR. El paso del universitario a la MLR es una VÍA
    //     de jugador, que es otra cosa y vive en `TRANSFER_PATHWAYS`.
    //   · Portugal — existen y no se pueden declarar: la I Divisão no está cargada, y
    //     además quedó sin confirmar quién la ganó en 2025-26 (o sea, cuál es el 12º
    //     equipo de 2026-27). Ver `PENDING_COMPETITIONS`.
    //   · Brasil — existen y son más raros que un ascenso: SEIS de las doce plazas de
    //     2027 salen de la Repescagem, que cruza a los dos peores de cada grupo de 1ª
    //     con los dos mejores de cada grupo de 2ª. Sin la 2ª divisão cargada, el
    //     grafo apuntaría a una liga vacía.
];

// Competiciones PARALELAS: nunca hay ascenso/descenso entre ellas ni con ligas.
// `sra` (Super Rugby Americas) es paralela a las ligas domésticas AR/UY/CL:
// jugar ahí no es "ascender" desde el club doméstico.
//
// Las tres estadounidenses entran acá con motivos distintos y los tres son
// estructurales, no una limitación del catálogo:
//   · `us-mlr` — liga CERRADA de franquicias. No hay nada abajo que ascienda ni
//     nada arriba a lo que subir, y en 2026 el movimiento fue en la otra dirección:
//     de once equipos a seis.
//   · `us-d1a` y `us-ncr-d1` — DOS PIRÁMIDES PARALELAS con campeonatos nacionales
//     separados desde la escisión de 2021, una que corona en primavera y otra en
//     diciembre. No se reconocen entre sí, así que salir campeón de una no te mueve
//     ni un centímetro dentro de la otra.
//
// Portugal, Italia y Brasil NO están acá: sus ligas sí tienen ascensos y descensos
// reales. Italia los declara en `MOVEMENTS`; las otras dos no, porque les falta el
// escalón de abajo (ver el comentario de `MOVEMENTS`), y ésa es una ausencia de
// datos y no una propiedad de la competición.
//
// LAS DOS AUSTRALIANAS entran en `2026-27.11` por el mismo motivo que las dos
// pirámides universitarias estadounidenses: el Shute Shield y el Hospital Cup son
// competiciones de ESTADOS DISTINTOS —Nueva Gales del Sur y Queensland— que no se
// cruzan nunca y coronan cada una a su campeón. Salir campeón del Hospital Cup no
// te mueve un centímetro dentro del Shute Shield, y Australia no tiene liga
// nacional de clubes donde eso pudiera resolverse.
//
// Que el escalafón de mercado ponga a Sídney por encima de Brisbane es otra cosa
// —mide cuán arriba se juega, no quién asciende— y vive en `STATIC_LADDER`.
//
// El resto de las ligas nuevas NO está acá, y la diferencia importa: Gales,
// Irlanda, Escocia, Georgia, Rumania, Rusia, Fiyi, Canadá, Bélgica, Países Bajos y
// las cinco latinoamericanas SÍ tienen ascensos y descensos reales en su país. Lo
// que les falta es el escalón de abajo cargado (ver `PENDING_COMPETITIONS`), que
// es una ausencia de datos y no una propiedad de la competición.
export const PARALLEL_COMPETITIONS = new Set([
    'npc', 'super-rugby', 'urc', 'currie-premier', 'currie-first', 'super-cup', 'sra',
    'us-mlr', 'us-d1a', 'us-ncr-d1',
    'au-shute-shield', 'au-hospital-cup',
]);

// ── API ──────────────────────────────────────────────────────────────────────
/**
 * ¿El club CLASIFICA a esta competición, dada su posición final en la liga?
 * El rating NO participa de esta decisión.
 */
export function qualifiesFor(comp: CompetitionDef, club: ClubDef, standing: LeagueStanding | null): boolean {
    for (const rule of comp.qualification) {
        switch (rule.criterion) {
            case 'membership':
                if (club.competitionId === rule.sourceCompetitionId) return true;
                break;
            case 'league-position': {
                if (!standing || standing.competitionId !== rule.sourceCompetitionId) break;
                if (club.competitionId !== rule.sourceCompetitionId) break;
                const from = rule.fromPosition ?? 1;
                const to = rule.toPosition ?? standing.teams;
                if (standing.position >= from && standing.position <= to) return true;
                break;
            }
            case 'invitation':
                // Plaza sin asignar: nadie clasifica por invitación hasta tener el dato real.
                break;
        }
    }
    return false;
}

/**
 * Competiciones que el club DISPUTA esta temporada: su liga + las copas a las
 * que clasificó. Participar no es ganar: el resultado lo resuelve el motor.
 */
export function participatingCompetitions(club: ClubDef, standing: LeagueStanding | null): CompetitionDef[] {
    return ALL_COMPETITIONS.filter((comp) => qualifiesFor(comp, club, standing));
}

/** Destinos de FICHAJE posibles: solo ligas (una copa nunca es destino). */
export function transferDestinations(): CompetitionDef[] {
    return ALL_COMPETITIONS.filter((comp) => comp.isTransferDestination && comp.kind === 'league');
}

export function getCompetition(id: string): CompetitionDef | undefined {
    return ALL_COMPETITIONS.find((c) => c.id === id);
}
