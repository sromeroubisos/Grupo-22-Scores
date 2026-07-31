// EL CALENDARIO INTERNACIONAL — fuente ÚNICA de cuántos partidos juega una
// unión en una temporada.
//
// Antes esto era una tabla por reputación (`TESTS_BY_REPUTATION` en
// `engine/national-team.ts`, borrada): una aproximación que decía "una tier 1
// juega 11-13 tests, una rep 0 juega 4-5". El problema no era el número sino que
// el número no salía de ningún lado. Acá sale del fixture: Tailandia juega tres
// partidos al año porque el Asia Rugby Championship son tres partidos, no porque
// una tabla lo diga.
//
// De acá salen dos cosas y ninguna se calcula en otro lado:
//
//   1. EL TOPE DURO DE CAPS. Nadie puede sumar más caps en una temporada que
//      partidos jugó su unión. Ni por evento, ni por bono, ni por redondeo.
//   2. Qué se puede ganar. Todas las uniones modeladas tienen algo por lo que
//      jugar, no sólo las doce de arriba.
//
// Efecto de segundo orden buscado: Georgia juega siete partidos por temporada y
// Argentina trece. El georgiano necesita casi el doble de temporadas para llegar
// a los mismos caps, sin que ningún umbral lo diga.

import { unionReputation } from './nations.ts';
import { CATALOG_SEASON } from './clubs2026/rosters2026.ts';

export const INTERNATIONAL_CALENDAR_VERSION = '2026-07.2';

// ── Años ─────────────────────────────────────────────────────────────────────
//
// La temporada 0 es la del catálogo. El año se deriva del índice: el motor no
// lee el reloj (CLAUDE.md §1) y no hace falta guardar nada.
export const FIRST_SEASON_YEAR = Number(CATALOG_SEASON.slice(0, 4));

export function seasonYear(seasonIndex: number): number {
    return FIRST_SEASON_YEAR + seasonIndex;
}

// ── Trofeos ──────────────────────────────────────────────────────────────────

export type TrophyTier = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * `requires` describe la condición EXTRA sobre ganar el torneo:
 *   · `win-all` — el Grand Slam: ganás el torneo Y los cinco partidos.
 *   · `beat-all-home-unions` — la Triple Corona, sólo para las británicas e irlandesa.
 */
export interface Trophy {
    id: string;
    name: string;
    tier: TrophyTier;
    /** Subconjunto de los participantes que puede ganarlo. Ausente = todos. */
    eligible?: readonly string[];
    requires?: 'win-all' | 'beat-all-home-unions' | null;
}

/**
 * QUÉ CLASE DE PARTIDO reparte esta entrada del calendario.
 *
 *   · `tournament` — el torneo donde se juega el año. Es partido PRIMARIO.
 *   · `window` — la ventana de julio y la de noviembre: rival de turno, medio
 *     plantel descansando, y el pibe que entra veinte minutos. Es SECUNDARIO, y
 *     por eso es la puerta por la que se debuta (ver `secondaryMatches`).
 */
export type InternationalCompetitionKind = 'tournament' | 'window';

export interface InternationalCompetition {
    id: string;
    name: string;
    kind: InternationalCompetitionKind;
    /** Uniones que lo juegan. Códigos de `countries.generated` (= código de unión). */
    participants: readonly string[];
    /** Partidos que juega CADA participante en una edición. */
    matchesPerEdition: number;
    /** 1 = anual, 2 = bianual, 4 = mundial. */
    everyNSeasons: number;
    /** Año calendario de la primera edición modelada. */
    firstSeason: number;
    /**
     * Torneos que OCUPAN SU LUGAR en el calendario. Si la unión juega alguno de
     * éstos esa temporada, esta entrada no se juega.
     *
     * Es el mecanismo que evita contar dos veces la misma fecha: los cruzados
     * del Nations Championship se juegan en julio y en noviembre, así que **son**
     * las dos ventanas, no algo que se les sume. Sin esto Irlanda terminaba con
     * 16 tests en una temporada, que no existe.
     *
     * Se evalúa POR UNIÓN: que Irlanda juegue el Nations Championship no le tapa
     * la ventana de noviembre a Namibia.
     */
    replacedBy?: readonly string[];
    /**
     * LA COMPOSICIÓN DE ESTA ENTRADA ES UNA APROXIMACIÓN, no la grilla real.
     *
     * De las competiciones de abajo tenemos los RECUENTOS de miembros de cada
     * asociación verificados, pero no las listas nominales de cada división. Así
     * que la división se arma con los miembros de la región que no están en la
     * división de arriba, con partidos parejos — y se marca, en vez de dejar que
     * dentro de tres meses se lea como un dato confirmado.
     *
     * Verificadas y por lo tanto SIN esta marca: el Rugby Europe Championship
     * 2026 (ocho equipos, cinco partidos) y el Asia Rugby Championship 2026 (tres
     * equipos, dos partidos).
     *
     * Advertencia para el que vaya a confirmarlas: las páginas de Rugby Europe
     * mezclan el torneo masculino y el femenino en el mismo artículo. Si un dato
     * sorprende —una unión fuerte en una división baja— casi siempre es eso.
     */
    approximate?: boolean;
    trophies: readonly Trophy[];
}

/** Marca de composición aproximada. Ver `approximate`. */
const APROXIMADO = { approximate: true } as const;

// ── Los participantes ────────────────────────────────────────────────────────

const SIX_NATIONS = ['gb-eng', 'fr', 'ie', 'it', 'gb-sct', 'gb-wls'] as const;
const RUGBY_CHAMPIONSHIP = ['nz', 'za', 'au', 'ar'] as const;
/** Las cuatro que pueden ganar la Triple Corona. No es lo mismo que "británicas". */
const HOME_UNIONS = ['gb-eng', 'ie', 'gb-sct', 'gb-wls'] as const;

/**
 * El campo del Mundial: los 24 CLASIFICADOS REALES a 2027 (12 automáticos por
 * el Mundial anterior + 12 por clasificación).
 *
 * Se escriben, no se derivan de la reputación. La derivación daba 24 exactos
 * —las uniones con reputación ≥ 1— pero metía a Namibia y dejaba afuera a
 * Zimbabue, y es al revés: Zimbabue ganó la Africa Cup 2025 y Namibia perdió el
 * repechaje. El campo queda CONGELADO para 2031 y 2035 porque el motor no
 * simula la clasificación; inventarle un campo distinto a cada edición sería
 * inventar resultados que no tenemos.
 */
const WORLD_CUP_FIELD = [
    'nz', 'za', 'ie', 'fr', 'gb-eng', 'au', 'ar', 'gb-wls', 'gb-sct', 'it',
    'jp', 'fj', 'ge', 'ws', 'to', 'uy', 'pt', 'es', 'us', 'ro', 'cl', 'ca', 'zw', 'hk',
] as const;

export const WORLD_CUP_ID = 'world-cup';
export const NATIONS_CHAMPIONSHIP_ID = 'nations-championship';
export const JULY_WINDOW_ID = 'july-window';
export const NOVEMBER_WINDOW_ID = 'november-window';

/**
 * Las diez que juegan las dos ventanas: las seis del Seis Naciones más las
 * cuatro del Rugby Championship. Es una lista explícita y no un corte por
 * reputación a propósito — quién recibe invitaciones es un dato del calendario,
 * no una consecuencia de un número.
 */
const TIER1_UNIONS = [...SIX_NATIONS, ...RUGBY_CHAMPIONSHIP] as const;

/** Las que juegan un solo bloque de ventana, el de noviembre. */
const TIER2_UNIONS = [
    'jp', 'fj', 'ws', 'to', 'ge', 'pt', 'es', 'ro', 'uy', 'cl', 'us', 'ca', 'na', 'hk',
] as const;

/**
 * EL CALENDARIO. Array y no objeto a propósito: el orden es explícito y estable,
 * y nada se elige iterando claves (CLAUDE.md §1).
 */
export const INTERNATIONAL_COMPETITIONS: readonly InternationalCompetition[] = [
    {
        id: 'six-nations',
        name: 'Seis Naciones',
        kind: 'tournament',
        participants: SIX_NATIONS,
        matchesPerEdition: 5,
        everyNSeasons: 1,
        firstSeason: FIRST_SEASON_YEAR,
        trophies: [
            { id: 'six-nations', name: 'Seis Naciones', tier: 4 },
            { id: 'grand-slam', name: 'Grand Slam', tier: 5, requires: 'win-all' },
            { id: 'triple-crown', name: 'Triple Corona', tier: 5, eligible: HOME_UNIONS, requires: 'beat-all-home-unions' },
        ],
    },
    {
        id: 'rugby-championship',
        name: 'The Rugby Championship',
        kind: 'tournament',
        participants: RUGBY_CHAMPIONSHIP,
        matchesPerEdition: 6,
        everyNSeasons: 1,
        firstSeason: FIRST_SEASON_YEAR,
        trophies: [{ id: 'rugby-championship', name: 'The Rugby Championship', tier: 4 }],
    },
    {
        // Formato nuevo y todavía en discusión. Se modela SIMPLE, como pidió el
        // diseño: torneo cruzado bianual para los doce de arriba, con la final de
        // ubicación de noviembre incluida en el conteo (6 + 1).
        //
        // Sus partidos cruzados SON la ventana de noviembre: en un año de Nations
        // Championship la ventana no se suma (ver `tourWindow`). Sin eso, Irlanda
        // terminaba con 16 tests en una temporada, que no existe.
        id: NATIONS_CHAMPIONSHIP_ID,
        name: 'Nations Championship',
        kind: 'tournament',
        participants: [...SIX_NATIONS, ...RUGBY_CHAMPIONSHIP, 'jp', 'fj'],
        matchesPerEdition: 7,
        everyNSeasons: 2,
        firstSeason: FIRST_SEASON_YEAR,
        trophies: [{ id: 'nations-championship', name: 'Nations Championship', tier: 3 }],
    },
    {
        // VERIFICADO contra la edición 2026: ocho equipos, cinco partidos cada uno
        // (tres de grupo en serpentina más dos de play-off). Polonia y Chequia NO
        // están: bajan al Trophy.
        id: 'rugby-europe-championship',
        name: 'Rugby Europe Championship',
        kind: 'tournament',
        participants: ['be', 'ge', 'de', 'nl', 'pt', 'ro', 'es', 'ch'],
        matchesPerEdition: 5,
        everyNSeasons: 1,
        firstSeason: FIRST_SEASON_YEAR,
        trophies: [{ id: 'rugby-europe-championship', name: 'Rugby Europe Championship', tier: 6 }],
    },
    {
        ...APROXIMADO,
        id: 'rugby-europe-trophy',
        name: 'Rugby Europe Trophy',
        kind: 'tournament',
        participants: ['pl', 'cz', 'se', 'lt', 'ua', 'hr', 'hu', 'mt'],
        matchesPerEdition: 4,
        everyNSeasons: 1,
        firstSeason: FIRST_SEASON_YEAR,
        trophies: [{ id: 'rugby-europe-trophy', name: 'Rugby Europe Trophy', tier: 6 }],
    },
    {
        ...APROXIMADO,
        id: 'rugby-europe-conference',
        name: 'Rugby Europe Conference',
        kind: 'tournament',
        participants: [
            'il', 'md', 'lv', 'dk', 'rs', 'ba', 'bg', 'at', 'no', 'fi', 'lu', 'si', 'gr', 'tr', 'ee',
            'ad', 'mc',
            'az', 'cy', 'me', 'sk',
        ],
        matchesPerEdition: 3,
        everyNSeasons: 1,
        firstSeason: FIRST_SEASON_YEAR,
        trophies: [{ id: 'rugby-europe-conference', name: 'Rugby Europe Conference', tier: 6 }],
    },
    {
        id: 'pacific-nations-cup',
        name: 'Pacific Nations Cup',
        kind: 'tournament',
        participants: ['jp', 'fj', 'ws', 'to', 'us', 'ca'],
        matchesPerEdition: 4,
        everyNSeasons: 1,
        firstSeason: FIRST_SEASON_YEAR,
        trophies: [{ id: 'pacific-nations-cup', name: 'Pacific Nations Cup', tier: 6 }],
    },
    {
        id: 'sudamerica-rugby-championship',
        name: 'Sudamérica Rugby Championship',
        kind: 'tournament',
        participants: ['uy', 'cl', 'br', 'py', 'pe'],
        matchesPerEdition: 4,
        everyNSeasons: 1,
        firstSeason: FIRST_SEASON_YEAR,
        trophies: [{ id: 'sudamerica-rugby-championship', name: 'Sudamérica Rugby Championship', tier: 6 }],
    },
    {
        ...APROXIMADO,
        id: 'sudamerica-rugby-b',
        name: 'Sudamérica Rugby B',
        kind: 'tournament',
        participants: ['co', 've', 'ec', 'bo'],
        matchesPerEdition: 3,
        everyNSeasons: 1,
        firstSeason: FIRST_SEASON_YEAR,
        trophies: [{ id: 'sudamerica-rugby-b', name: 'Sudamérica Rugby B', tier: 6 }],
    },
    {
        ...APROXIMADO,
        id: 'rugby-africa-cup',
        name: 'Rugby Africa Cup',
        kind: 'tournament',
        participants: ['zw', 'dz', 'na', 'ke', 'ug', 'ma', 'sn', 'ci'],
        matchesPerEdition: 3,
        everyNSeasons: 1,
        firstSeason: FIRST_SEASON_YEAR,
        trophies: [{ id: 'rugby-africa-cup', name: 'Rugby Africa Cup', tier: 6 }],
    },
    {
        ...APROXIMADO,
        id: 'rugby-africa-division-1',
        name: 'Rugby Africa División 1',
        kind: 'tournament',
        participants: ['eg', 'tn', 'bw', 'bf', 'bi', 'cm', 'sz', 'gh', 'ls', 'mg', 'mu', 'ng', 'rw', 'zm', 'cd'],
        matchesPerEdition: 3,
        everyNSeasons: 1,
        firstSeason: FIRST_SEASON_YEAR,
        trophies: [{ id: 'rugby-africa-division-1', name: 'Rugby Africa División 1', tier: 6 }],
    },
    {
        // VERIFICADO contra la edición 2026: TRES equipos y DOS partidos cada uno.
        // Emiratos se bajó en abril por seguridad regional. La primera división
        // asiática es todavía más chica de lo que suponía el modelo viejo, que le
        // daba nueve equipos y tres partidos.
        //
        // JAPÓN NO JUEGA ACÁ, y es el error fácil de cometer: está en el Pacific
        // Nations Cup y en el Nations Championship.
        id: 'asia-rugby-championship',
        name: 'Asia Rugby Championship',
        kind: 'tournament',
        participants: ['hk', 'kr', 'lk'],
        matchesPerEdition: 2,
        everyNSeasons: 1,
        firstSeason: FIRST_SEASON_YEAR,
        trophies: [{ id: 'asia-rugby-championship', name: 'Asia Rugby Championship', tier: 6 }],
    },
    {
        ...APROXIMADO,
        id: 'asia-rugby-division-1',
        name: 'Asia Rugby División 1',
        kind: 'tournament',
        participants: ['cn', 'my', 'sg', 'ph', 'th', 'in', 'id', 'tw', 'uz', 'kz', 'qa', 'ae'],
        matchesPerEdition: 3,
        everyNSeasons: 1,
        firstSeason: FIRST_SEASON_YEAR,
        trophies: [{ id: 'asia-rugby-division-1', name: 'Asia Rugby División 1', tier: 6 }],
    },
    {
        ...APROXIMADO,
        id: 'asia-rugby-division-2',
        name: 'Asia Rugby División 2',
        kind: 'tournament',
        participants: ['sa', 'ir', 'np', 'pk', 'bd', 'kh', 'kg', 'lb', 'mn', 'sy', 'la'],
        matchesPerEdition: 3,
        everyNSeasons: 1,
        firstSeason: FIRST_SEASON_YEAR,
        trophies: [{ id: 'asia-rugby-division-2', name: 'Asia Rugby División 2', tier: 6 }],
    },
    {
        ...APROXIMADO,
        id: 'oceania-cup',
        name: 'Oceania Cup',
        kind: 'tournament',
        participants: ['pg', 'ck', 'nu', 'vu', 'sb', 'pf', 'as', 'gu', 'mp'],
        matchesPerEdition: 3,
        everyNSeasons: 1,
        firstSeason: FIRST_SEASON_YEAR,
        trophies: [{ id: 'oceania-cup', name: 'Oceania Cup', tier: 6 }],
    },
    {
        ...APROXIMADO,
        id: 'ran-championship',
        name: 'RAN Championship',
        kind: 'tournament',
        participants: ['mx', 'jm', 'tt', 'bb', 'bs', 'bm', 'ky', 'gy', 'cw', 'vg', 'vc'],
        matchesPerEdition: 3,
        everyNSeasons: 1,
        firstSeason: FIRST_SEASON_YEAR,
        trophies: [{ id: 'ran-championship', name: 'RAN Championship', tier: 6 }],
    },
    {
        // 4 de fase de grupos para todos; el que avanza suma los partidos de
        // llave aparte (ver `knockoutMatches`). `matchesPerEdition` es lo que
        // juega CADA participante, y eso son los cuatro del grupo.
        id: WORLD_CUP_ID,
        name: 'Mundial',
        kind: 'tournament',
        participants: WORLD_CUP_FIELD,
        matchesPerEdition: 4,
        everyNSeasons: 4,
        firstSeason: 2027,
        trophies: [{ id: 'world-cup', name: 'Mundial', tier: 1 }],
    },

    // ── Las ventanas ─────────────────────────────────────────────────────────
    //
    // Acá vivía `TOUR_WINDOW_BY_REPUTATION = [0, 2, 2, 4, 4, 4]`, el último resto
    // de la aproximación vieja: la misma clase de cosa que `TESTS_BY_REPUTATION`,
    // con el mismo error escondido adentro. Se vio con `nt-tour-vs-rest`: gatear
    // la gira con `tourMatches > 0` se la sacaba a las doce uniones de arriba en
    // año de Nations Championship, porque los cruzados de noviembre SON ese
    // torneo — y eso no se podía ver mirando una tabla por reputación, porque la
    // tabla no sabe qué más hay en el calendario.
    //
    // Ahora las ventanas son entradas como cualquier otra, con lista explícita de
    // participantes y con `replacedBy` diciendo quién les ocupa la fecha.
    {
        id: JULY_WINDOW_ID,
        name: 'Ventana de julio',
        kind: 'window',
        // Sólo las diez de arriba. Es la gira de mitad de año: el que viaja es el
        // tier 1, y el tier 2 recibe — pero sus dos tests de ventana se cuentan
        // una sola vez, en noviembre, que es donde de verdad juega su bloque.
        participants: TIER1_UNIONS,
        matchesPerEdition: 2,
        everyNSeasons: 1,
        firstSeason: FIRST_SEASON_YEAR,
        replacedBy: [NATIONS_CHAMPIONSHIP_ID, WORLD_CUP_ID],
        trophies: [],
    },
    {
        id: NOVEMBER_WINDOW_ID,
        name: 'Ventana de noviembre',
        kind: 'window',
        participants: [...TIER1_UNIONS, ...TIER2_UNIONS],
        matchesPerEdition: 2,
        everyNSeasons: 1,
        firstSeason: FIRST_SEASON_YEAR,
        replacedBy: [NATIONS_CHAMPIONSHIP_ID, WORLD_CUP_ID],
        trophies: [],
    },
    {
        // El año del Mundial no tiene ventanas: tiene preparación. Van para todo
        // el campo por igual y no por reputación, porque todos los clasificados
        // juegan amistosos antes de viajar — Zimbabue también.
        id: 'world-cup-warm-ups',
        name: 'Amistosos de preparación',
        kind: 'window',
        participants: WORLD_CUP_FIELD,
        matchesPerEdition: 2,
        everyNSeasons: 4,
        firstSeason: 2027,
        trophies: [],
    },
];

const BY_ID = new Map(INTERNATIONAL_COMPETITIONS.map((c) => [c.id, c]));

export function getInternationalCompetition(id: string): InternationalCompetition | null {
    return BY_ID.get(id) ?? null;
}

/** Uniones con fixture internacional modelado, sin repetir. Orden estable. */
export const UNIONS_WITH_FIXTURE: readonly string[] = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const comp of INTERNATIONAL_COMPETITIONS) {
        for (const union of comp.participants) {
            if (seen.has(union)) continue;
            seen.add(union);
            out.push(union);
        }
    }
    return out;
})();

/**
 * Partidos de llave en el Mundial, por reputación. Todos juegan los cuatro del
 * grupo; cuartos, semi y final los juega el que llega, y quién llega no es una
 * incógnita: Hong Kong no pasa de grupos.
 *
 * ES LO ÚNICO QUE SIGUE SALIENDO DE LA REPUTACIÓN, y no es un resto de la
 * aproximación vieja: contesta una pregunta distinta. El calendario dice qué hay
 * en tu fixture; esto dice hasta dónde llegás dentro de un torneo a eliminación,
 * que es una consecuencia deportiva y no una fecha. Una lista explícita acá sería
 * escribir el resultado del Mundial a mano.
 */
const KNOCKOUT_BY_REPUTATION = [0, 0, 1, 2, 3, 3] as const;

/** Clasificatorias, en las dos temporadas previas, para el que no entra directo. */
const QUALIFIER_MATCHES = 2;
const QUALIFIER_SEASONS_BEFORE = 2;

function repOf(unionCode: string): number {
    return Math.max(0, Math.min(5, unionReputation(unionCode)));
}

// ── Ediciones ────────────────────────────────────────────────────────────────

export function isEditionSeason(competition: InternationalCompetition, seasonIndex: number): boolean {
    const year = seasonYear(seasonIndex);
    if (year < competition.firstSeason) return false;
    return (year - competition.firstSeason) % competition.everyNSeasons === 0;
}

export function isWorldCupYear(seasonIndex: number): boolean {
    return isEditionSeason(BY_ID.get(WORLD_CUP_ID)!, seasonIndex);
}

/**
 * La temporada PREVIA al Mundial, que es cuando el umbral de convocatoria
 * afloja: las listas son de 33 y entra gente que otro año no entraría.
 */
export function isPreWorldCupSeason(seasonIndex: number): boolean {
    return isWorldCupYear(seasonIndex + 1);
}

/** ¿Esa unión juega esa competición esa temporada, sin mirar reemplazos? */
function isScheduled(competition: InternationalCompetition, unionCode: string, seasonIndex: number): boolean {
    return competition.participants.includes(unionCode) && isEditionSeason(competition, seasonIndex);
}

/**
 * Competiciones que ESA unión juega ESA temporada. Orden del calendario.
 *
 * El reemplazo se resuelve acá y no sumando y restando después: una entrada cuyo
 * lugar ocupa otro torneo simplemente no está en la lista, así que nada que
 * recorra esta función puede contarla por error.
 */
export function competitionsFor(unionCode: string, seasonIndex: number): InternationalCompetition[] {
    return INTERNATIONAL_COMPETITIONS.filter((c) => {
        if (!isScheduled(c, unionCode, seasonIndex)) return false;
        return !(c.replacedBy ?? []).some((id) => {
            const otra = BY_ID.get(id);
            return otra !== undefined && isScheduled(otra, unionCode, seasonIndex);
        });
    });
}

// ── El fixture de la temporada ───────────────────────────────────────────────

export interface InternationalSeason {
    seasonIndex: number;
    year: number;
    /** Torneos que juega esta temporada, en orden del calendario. */
    competitions: InternationalCompetition[];
    /** Partidos de esos torneos. */
    competitionMatches: number;
    /** Ventana de noviembre / giras (o amistosos de preparación en año de Mundial). */
    tourMatches: number;
    /** Cuartos, semi y final del Mundial, para el que llega. */
    knockoutMatches: number;
    /** Clasificatorias al Mundial, para el que no entra directo. */
    qualifierMatches: number;
    /**
     * PARTIDOS PRIMARIOS: los torneos y las llaves del Mundial. Seis Naciones,
     * Rugby Championship, Nations Championship, Mundial, y el torneo regional
     * principal de cada unión.
     *
     * Es donde se juega el año. Nadie debuta acá — se debuta en una gira.
     */
    primaryMatches: number;
    /**
     * PARTIDOS SECUNDARIOS: giras de julio, ventana de noviembre y
     * clasificatorias. Rival menor, medio plantel descansando, y el pibe que
     * entra veinte minutos.
     *
     * Ésta es la puerta por la que se debuta, y es lo que hace que exista el
     * jugador de un cap: te llevaron a la gira, jugaste, no volviste.
     */
    secondaryMatches: number;
    /** EL TOPE DURO: nadie suma más caps que esto en una temporada. */
    matches: number;
}

/**
 * Desglose del fixture de una unión en una temporada. Devuelve el total en
 * `matches` y de dónde sale cada partido, para que cuando un número no cierre se
 * vea cuál lo mueve.
 *
 * Una unión sin fixture devuelve 0 y eso NO es un borde a parchear: Rusia está
 * en el catálogo de uniones y no juega ninguna competición porque está
 * suspendida. Cero partidos, cero caps. El motor no le inventa fixture.
 */
export function internationalSeason(unionCode: string | null, seasonIndex: number): InternationalSeason {
    const year = seasonYear(seasonIndex);
    const empty: InternationalSeason = {
        seasonIndex, year, competitions: [], competitionMatches: 0,
        tourMatches: 0, knockoutMatches: 0, qualifierMatches: 0,
        primaryMatches: 0, secondaryMatches: 0, matches: 0,
    };
    if (unionCode === null || !UNIONS_WITH_FIXTURE.includes(unionCode)) return empty;

    const rep = repOf(unionCode);
    // Ya vienen con los reemplazos resueltos: lo que está en la lista se juega.
    const competitions = competitionsFor(unionCode, seasonIndex);
    const sumar = (kind: InternationalCompetitionKind) => competitions
        .filter((c) => c.kind === kind)
        .reduce((sum, c) => sum + c.matchesPerEdition, 0);

    const competitionMatches = sumar('tournament');
    const tourMatches = sumar('window');

    const playsWorldCup = competitions.some((c) => c.id === WORLD_CUP_ID);
    const knockoutMatches = playsWorldCup ? KNOCKOUT_BY_REPUTATION[rep] : 0;

    // El que no entró directo al Mundial se lo juega en las dos temporadas
    // previas. Es lo que le da partidos extra al tailandés cada cuatro años.
    const inField = WORLD_CUP_FIELD.includes(unionCode as (typeof WORLD_CUP_FIELD)[number]);
    let qualifierMatches = 0;
    if (!inField) {
        for (let ahead = 1; ahead <= QUALIFIER_SEASONS_BEFORE; ahead++) {
            if (isWorldCupYear(seasonIndex + ahead)) {
                qualifierMatches = QUALIFIER_MATCHES;
                break;
            }
        }
    }

    return {
        seasonIndex,
        year,
        competitions,
        competitionMatches,
        tourMatches,
        knockoutMatches,
        qualifierMatches,
        // El Mundial es primario incluidas sus llaves; los amistosos de
        // preparación de ese mismo año, no. La clasificatoria es secundaria a
        // propósito: es contra rivales menores y es donde se prueba gente.
        primaryMatches: competitionMatches + knockoutMatches,
        secondaryMatches: tourMatches + qualifierMatches,
        matches: competitionMatches + tourMatches + knockoutMatches + qualifierMatches,
    };
}

/**
 * Partidos que juega la unión esa temporada. ES EL TOPE DURO DE CAPS: ninguna
 * ruta del motor —evento, bono, redondeo— puede pasarlo.
 */
export function internationalMatches(unionCode: string | null, seasonIndex: number): number {
    return internationalSeason(unionCode, seasonIndex).matches;
}

/**
 * ¿La unión VIAJA en la ventana de fin de año?
 *
 * No alcanza con mirar `tourMatches`, por dos motivos opuestos: en un año de
 * Nations Championship la ventana de noviembre no está en la lista porque ese
 * torneo le ocupa la fecha —y el jugador viaja igual—, y en un año de Mundial
 * `tourMatches` cuenta los amistosos de preparación, que son de agosto y no una
 * gira de fin de año. Se pregunta por las dos entradas que sí lo son.
 *
 * Lo usa `nt-tour-vs-rest`, para que ningún evento dé por sentado un fixture que
 * el calendario no tiene: al tailandés no lo invita nadie a girar.
 */
export function playsEndOfYearTour(unionCode: string | null, seasonIndex: number): boolean {
    return internationalSeason(unionCode, seasonIndex).competitions.some(
        (c) => c.id === NOVEMBER_WINDOW_ID || c.id === NATIONS_CHAMPIONSHIP_ID,
    );
}
