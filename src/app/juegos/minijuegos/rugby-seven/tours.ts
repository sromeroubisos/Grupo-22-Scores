/*
 * Torneos internacionales del Seven: los mismos que tiene registrados la web
 * (tabla `tournaments`, se guarda su id), jugados con su formato real:
 *
 *   - liga: todos contra todos, a una o dos vueltas (Six Nations, Rugby
 *     Championship, Tri Nations, Rugby Europe Trophy).
 *   - grupos: zonas sorteadas por ranking (bombos), clasifican los primeros
 *     (y los mejores terceros si corresponde) a un cuadro de eliminación
 *     (World Cup, Sudamericano Seven, Pacific Nations Cup...). Con `cross`
 *     cada equipo juega contra los de la otra conferencia y los dos primeros
 *     van a la final (Nations Championship).
 *
 * Los que vienen de FlashScore no tienen participantes en la base: su
 * composición está escrita acá (`source: 'real'`). Los que sí (Sudamericano
 * Seven, SVNS 2, Rugby Europe Trophy y Conference) la copian (`source: 'base'`).
 */

import { AR_CLUBS, AR_TOURS } from './arClubs';
import { CLUB_TOURS, CLUBS } from './clubs';
import { FEM_NATIONS, NATIONS, NATION_BY_CODE } from './nations';
import type { Difficulty, Duration } from './teams';
import type { CareerState } from './career';
import type { MiClubState } from './miClub';
import type { RoadState } from './road';
import type { SvnsState } from './svns';
import type { IntlState } from './intl';

export type Stage =
    | { kind: 'liga'; legs: 1 | 2 }
    // `noKo`: grupos que terminan en la tabla (clasificatorios), sin cuadro.
    | { kind: 'grupos'; groups: number | string[][]; advance: number; bestThirds?: number; cross?: boolean; noKo?: boolean; legs?: 1 | 2; rep?: boolean }
    // Eliminación directa desde el primer partido (repechajes, copas).
    // `fixed`: el cuadro va en el orden de `teams` (1 contra 2, 3 contra 4…), sin sembrar por ranking.
    | { kind: 'ko'; fixed?: boolean };

export interface TourDef {
    id: string; // id del torneo en la web
    name: string;
    sub: string;
    formatLabel: string;
    teams: string[]; // códigos de nations.ts
    source: 'base' | 'real' | 'custom';
    /** Torneo de clubes: los participantes son ids de club (club-…), no códigos de país. */
    clubs?: boolean;
    /** Categoría de la tarjeta donde aparece (Internacional, Francia, Argentina…). Sin esto, Internacional. */
    cat?: string;
    stage: Stage;
}

/** Torneos de selecciones. Los de clubes viven en clubs.ts y se suman abajo, en TOURS. */
const INTERNATIONAL: TourDef[] = [
    {
        id: '79d7f5bf-812b-431e-9841-f9c70a3e979d', name: 'World Cup', sub: 'Las 24 de 2027.',
        formatLabel: '6 grupos de 4 · pasan los dos primeros y los 4 mejores terceros · octavos', source: 'real',
        teams: ['ARG', 'AUS', 'CAN', 'CHI', 'ENG', 'FIJ', 'FRA', 'GEO', 'HKG', 'IRL', 'ITA', 'JPN', 'NZL', 'POR', 'ROU', 'SAM', 'SCO', 'RSA', 'ESP', 'TGA', 'URU', 'USA', 'WAL', 'ZIM'],
        stage: { kind: 'grupos', groups: 6, advance: 2, bestThirds: 4 },
    },
    {
        id: 'b08da45c-d6f4-4e5f-9cde-038e9542e0af', name: 'Rugby Championship', sub: 'Argentina, Australia, Nueva Zelanda y Sudáfrica.',
        formatLabel: 'Liga a dos vueltas', source: 'real', teams: ['ARG', 'AUS', 'NZL', 'RSA'], stage: { kind: 'liga', legs: 2 },
    },
    {
        id: 'f496f76c-5bbf-478c-8dd3-023b404825ce', name: 'Six Nations', sub: 'Las seis del hemisferio norte.',
        formatLabel: 'Liga a una vuelta', source: 'real', teams: ['ENG', 'FRA', 'IRL', 'ITA', 'SCO', 'WAL'], stage: { kind: 'liga', legs: 1 },
    },
    {
        id: '55b736fb-4662-4cf9-aae1-a8f3b5eb3002', name: 'Nations Championship', sub: 'Hemisferio norte contra hemisferio sur.',
        formatLabel: 'Dos conferencias de 6 · cada uno juega con los de la otra · final entre los primeros', source: 'real',
        teams: ['ENG', 'FRA', 'IRL', 'ITA', 'SCO', 'WAL', 'ARG', 'AUS', 'NZL', 'RSA', 'FIJ', 'JPN'],
        stage: { kind: 'grupos', groups: [['ENG', 'FRA', 'IRL', 'ITA', 'SCO', 'WAL'], ['ARG', 'AUS', 'NZL', 'RSA', 'FIJ', 'JPN']], advance: 1, cross: true },
    },
    {
        id: '57029e55-e8b0-4d68-a58a-f62e5e5cbc3e', name: 'Pacific Nations Cup', sub: 'El Pacífico, Japón y Norteamérica.',
        formatLabel: '2 grupos de 3 · semifinales y final', source: 'real', teams: ['CAN', 'FIJ', 'JPN', 'SAM', 'TGA', 'USA'],
        stage: { kind: 'grupos', groups: 2, advance: 2 },
    },
    {
        id: 'cb55b162-bbd2-4508-b79e-39f8f1d39ac0', name: 'Sudamericano de Rugby Seven', sub: 'Las doce de la región.',
        formatLabel: '3 grupos de 4 · pasan dos y los 2 mejores terceros · cuartos', source: 'base',
        teams: ['ARG', 'BRA', 'CHI', 'COL', 'ECU', 'GUA', 'HON', 'PAR', 'PER', 'DOM', 'URU', 'VEN'],
        stage: { kind: 'grupos', groups: 3, advance: 2, bestThirds: 2 },
    },
    {
        id: '991f1733-1c72-433a-9dbc-70dca5451bea', name: 'SVNS 2 - Masculino', sub: 'La segunda división del circuito de seven.',
        formatLabel: '2 grupos de 3 · semifinales y final', source: 'base', teams: ['GER', 'BEL', 'CAN', 'KEN', 'URU', 'USA'],
        stage: { kind: 'grupos', groups: 2, advance: 2 },
    },
    {
        id: '74638d9c-5ce9-43b6-8a8c-2482e7bbe892', name: 'Autumn Nations Cup', sub: 'El Seis Naciones más Fiyi y Georgia.',
        formatLabel: '2 grupos de 4 · final entre los primeros', source: 'real', teams: ['ENG', 'FRA', 'IRL', 'ITA', 'SCO', 'WAL', 'FIJ', 'GEO'],
        stage: { kind: 'grupos', groups: 2, advance: 1 },
    },
    {
        id: '4613d26d-9c07-412a-9b25-af20401f5f5b', name: 'Tri Nations', sub: 'El clásico del sur, antes de que entrara Argentina.',
        formatLabel: 'Liga a dos vueltas', source: 'real', teams: ['NZL', 'AUS', 'RSA'], stage: { kind: 'liga', legs: 2 },
    },
    {
        id: 'cfabc135-7b9e-4a3f-8eb5-61f0a8f456d0', name: "Rugby Europe Men's Trophy", sub: 'El segundo escalón europeo.',
        formatLabel: 'Liga a una vuelta', source: 'base', teams: ['GER', 'DEN', 'LTU', 'MLT', 'CZE', 'SWE'], stage: { kind: 'liga', legs: 1 },
    },
    {
        id: '0a0a22db-44b1-444c-9d2b-06a4af819086', name: "Rugby Europe Men's Conference", sub: 'Diecinueve selecciones.',
        formatLabel: '4 grupos · los ganadores a semifinales', source: 'base',
        teams: ['AND', 'AUT', 'BUL', 'CYP', 'CRO', 'SLO', 'EST', 'FIN', 'GIB', 'GRE', 'ISR', 'KOS', 'LUX', 'MDA', 'MNE', 'NOR', 'SRB', 'TUR', 'UKR'],
        stage: { kind: 'grupos', groups: 4, advance: 1 },
    },
];

/** Los códigos de las selecciones femeninas: el del país con "-F". */
const fem = (...codes: string[]) => codes.map((c) => `${c}-F`);
const FEM_CAT = 'Internacional femenino';

/*
 * Torneos de selecciones femeninas, con su formato real. Los niveles de cada
 * seleccionado salen de FEM_RATING (nations.ts), por el escalón que juega.
 */
const INTERNATIONAL_FEM: TourDef[] = [
    {
        id: 'fem-world-cup-2025', name: 'Women’s Rugby World Cup', sub: 'Las 16 de Inglaterra 2025.', cat: FEM_CAT,
        formatLabel: '4 grupos de 4 · pasan las dos primeras · cuartos', source: 'real',
        teams: fem('ENG', 'USA', 'SAM', 'AUS', 'CAN', 'SCO', 'WAL', 'FIJ', 'NZL', 'IRL', 'JPN', 'ESP', 'FRA', 'ITA', 'RSA', 'BRA'),
        stage: { kind: 'grupos', groups: [fem('ENG', 'USA', 'SAM', 'AUS'), fem('CAN', 'SCO', 'WAL', 'FIJ'), fem('NZL', 'IRL', 'JPN', 'ESP'), fem('FRA', 'ITA', 'RSA', 'BRA')], advance: 2 },
    },
    {
        id: 'fem-six-nations', name: 'Women’s Six Nations', sub: 'Las seis del hemisferio norte.', cat: FEM_CAT,
        formatLabel: 'Liga a una vuelta', source: 'real', teams: fem('ENG', 'FRA', 'IRL', 'ITA', 'SCO', 'WAL'), stage: { kind: 'liga', legs: 1 },
    },
    {
        id: 'fem-svns', name: 'SVNS femenino', sub: 'El circuito mundial de seven: las doce de la élite.', cat: FEM_CAT,
        formatLabel: '3 grupos de 4 · pasan dos y las 2 mejores terceras · cuartos', source: 'real',
        teams: fem('NZL', 'AUS', 'CAN', 'FRA', 'USA', 'FIJ', 'ENG', 'IRL', 'JPN', 'BRA', 'ESP', 'CHN'),
        stage: { kind: 'grupos', groups: 3, advance: 2, bestThirds: 2 },
    },
    {
        id: 'fem-olimpicos', name: 'Juegos Olímpicos · seven femenino', sub: 'Las doce de París 2024.', cat: FEM_CAT,
        formatLabel: '3 grupos de 4 · pasan dos y las 2 mejores terceras · cuartos', source: 'real',
        teams: fem('FRA', 'NZL', 'AUS', 'CAN', 'USA', 'FIJ', 'ENG', 'IRL', 'BRA', 'CHN', 'JPN', 'RSA'),
        stage: { kind: 'grupos', groups: 3, advance: 2, bestThirds: 2 },
    },
    {
        id: 'fem-wxv1', name: 'WXV 1', sub: 'El primer escalón mundial: las seis mejores.', cat: FEM_CAT,
        formatLabel: 'Liga a una vuelta', source: 'real', teams: fem('ENG', 'NZL', 'CAN', 'FRA', 'USA', 'IRL'), stage: { kind: 'liga', legs: 1 },
    },
    {
        id: 'fem-wxv2', name: 'WXV 2', sub: 'El segundo escalón mundial.', cat: FEM_CAT,
        formatLabel: 'Liga a una vuelta', source: 'real', teams: fem('AUS', 'ITA', 'SCO', 'WAL', 'JPN', 'RSA'), stage: { kind: 'liga', legs: 1 },
    },
    {
        id: 'fem-wxv3', name: 'WXV 3', sub: 'El tercer escalón: las campeonas continentales.', cat: FEM_CAT,
        formatLabel: 'Liga a una vuelta', source: 'real', teams: fem('FIJ', 'ESP', 'SAM', 'NED', 'KAZ', 'HKG'), stage: { kind: 'liga', legs: 1 },
    },
    {
        id: 'fem-pacific-four', name: 'Pacific Four Series', sub: 'Nueva Zelanda, Australia, Canadá y Estados Unidos.', cat: FEM_CAT,
        formatLabel: 'Liga a una vuelta', source: 'real', teams: fem('NZL', 'AUS', 'CAN', 'USA'), stage: { kind: 'liga', legs: 1 },
    },
    {
        id: 'fem-sudamericano-seven', name: 'Sudamericano de Seven femenino', sub: 'Las ocho de la región.', cat: FEM_CAT,
        formatLabel: '2 grupos de 4 · semifinales y final', source: 'real',
        teams: fem('BRA', 'ARG', 'COL', 'PAR', 'CHI', 'URU', 'VEN', 'PER'),
        stage: { kind: 'grupos', groups: 2, advance: 2 },
    },
    {
        id: 'fem-rugby-europe', name: 'Rugby Europe Women’s Championship', sub: 'España y las que la persiguen.', cat: FEM_CAT,
        formatLabel: 'Liga a una vuelta', source: 'real', teams: fem('ESP', 'NED', 'POR', 'BEL', 'SWE'), stage: { kind: 'liga', legs: 1 },
    },
    {
        id: 'fem-asia', name: 'Asia Rugby Women’s Championship', sub: 'Japón, China, Kazajistán y Hong Kong.', cat: FEM_CAT,
        formatLabel: 'Liga a una vuelta', source: 'real', teams: fem('JPN', 'CHN', 'KAZ', 'HKG'), stage: { kind: 'liga', legs: 1 },
    },
    {
        id: 'fem-africa', name: 'Rugby Africa Women’s Cup', sub: 'Sudáfrica, Kenia, Uganda y Zimbabue.', cat: FEM_CAT,
        formatLabel: 'Liga a una vuelta', source: 'real', teams: fem('RSA', 'KEN', 'UGA', 'ZIM'), stage: { kind: 'liga', legs: 1 },
    },
];

/** Todos los torneos de fábrica: primero los de selecciones, después los de clubes. */
export const TOURS: TourDef[] = [...INTERNATIONAL, ...INTERNATIONAL_FEM, ...CLUB_TOURS, ...AR_TOURS];

/** Las tarjetas de categoría, en el orden en que se muestran. */
export const TOUR_CATS: { id: string; sub: string }[] = [
    { id: 'Internacional', sub: 'Mundial, Six Nations, Rugby Championship y más.' },
    { id: 'Internacional femenino', sub: 'Mundial, Six Nations, WXV, SVNS, Juegos Olímpicos y los continentales.' },
    { id: 'Argentina', sub: 'Nacional de Clubes, Torneo del Interior, URBA y regionales.' },
    { id: 'Chile', sub: 'ARUSA: Top 10, Segunda, Tercera y Cuarta.' },
    { id: 'Uruguay', sub: 'Uruguayo de Clubes.' },
    { id: 'Brasil', sub: 'Super 12: Primeira y Segunda Divisão.' },
    { id: 'España', sub: 'División de Honor, Honor Élite y Honor B; Liga Iberdrola y Honor B femenina.' },
    { id: 'Europa', sub: 'Champions Cup, Challenge Cup, URC y la Supercopa Europea.' },
    { id: 'Francia', sub: 'Top 14 y Pro D2; en el modo carrera, de la Élite 14 al Federal Uno, y la Élite 14 femenina.' },
    { id: 'Inglaterra', sub: 'Premiership; en el modo carrera, Premier Union y Challenger Union.' },
    { id: 'Sudáfrica', sub: 'Copa Curry: la Élite y el Ascenso.' },
    { id: 'Portugal', sub: 'Campeonato Lusitano: Divisão de Honra y Primeira Divisão.' },
    { id: 'Alemania', sub: 'Liga Federal Alemana: Primera y Segunda.' },
    { id: 'Polonia', sub: 'Liga Extra y Liga Uno de Polonia.' },
    { id: 'Georgia', sub: 'Liga Gran 10 y Liga Primera de Georgia.' },
    { id: 'Rusia', sub: 'Liga Pro y Liga Mayor de Rusia.' },
    { id: 'Australia', sub: 'Liga Escudo de Sídney y Liga Premier de Queensland.' },
    { id: 'Chequia', sub: 'Liga Extra y Primera Liga Checa.' },
    { id: 'Bolivia', sub: 'Liga Altiplano de Bolivia.' },
    { id: 'Perú', sub: 'Liga Andina del Perú.' },
    { id: 'México', sub: 'Liga Azteca de México.' },
    { id: 'Hemisferio sur', sub: 'Super Rugby Pacific y Currie Cup.' },
    { id: 'América', sub: 'Super Rugby Americas y Major League Rugby.' },
    { id: 'Japón', sub: 'Japan League One D1 y D2.' },
];
export const catOf = (d: TourDef) => d.cat ?? 'Internacional';

export interface Row {
    team: string; // id de equipo
    pj: number;
    g: number;
    e: number;
    p: number;
    pf: number;
    pc: number;
    pts: number;
}

export interface Result {
    a: string;
    b: string;
    sa: number;
    sb: number;
    /** Tries de cada lado cuando se conocen (los del partido que juega el usuario). */
    ta?: number;
    tb?: number;
}

export interface TourState {
    v: 2;
    tourId: string;
    me: string; // id de equipo
    difficulty: Difficulty;
    duration: Duration;
    stage: 'grupos' | 'ko';
    hasKo: boolean;
    cross: boolean;
    groups: string[][]; // ids por grupo (liga = un solo grupo)
    rounds: [string, string][][]; // fixture completo de la fase de grupos
    table: Row[];
    round: number; // fecha de la fase de grupos
    alive: string[]; // cuadro: los que siguen, en orden
    groupHistory: { label: string; results: Result[] }[];
    koHistory: { label: string; results: Result[] }[];
    koStart: number; // cuántos entraron al cuadro
    done: boolean;
    champion: string | null;
    eliminated: boolean;
    /**
     * Repechaje del usuario dentro del torneo (federales con `stage.rep`): si termina 3.º o 4.º
     * de su zona, juega 3.º contra 4.º de zonas cruzadas en la misma fecha que los cuartos.
     * `rep` es el cruce pendiente; `repResult`, cómo salió (la carrera lo toma para las plazas).
     */
    rep?: [string, string] | null;
    repResult?: Result | null;
    /**
     * Definición congelada del torneo: los personalizados, los que tienen
     * equipos reemplazados y las etapas del Road to RWC no están en TOURS.
     */
    def?: TourDef;
    /** Si es una etapa del camino al Mundial, el estado de todo el camino. */
    road?: RoadState;
    /** Si es una etapa del circuito SVNS, el estado de todo el circuito. */
    svns?: SvnsState;
    /** Si es una etapa de la carrera internacional, el estado de toda la carrera. */
    intl?: IntlState;
    /** Si es una etapa del modo carrera argentino, el estado de toda la carrera. */
    career?: CareerState;
    /** Si es una temporada de Mi Club, el estado de todo el club (la pirámide, el plantel, los créditos). */
    miclub?: MiClubState;
    /** Tries y puntos de cada jugador (`equipo#puesto`), si el torneo lleva goleadores. */
    stats?: Record<string, StatLine>;
}

/** La definición del torneo en curso: la congelada, o la de fábrica. */
export function defOf(s: TourState): TourDef | null {
    return s.def ?? TOURS.find((d) => d.id === s.tourId) ?? null;
}

export const teamIdOf = (code: string) => NATION_BY_CODE[code]?.id ?? code;
const RATING = new Map([...NATIONS, ...FEM_NATIONS, ...CLUBS, ...AR_CLUBS].map((t) => [t.id, t.rating ?? 60]));
/*
 * Contexto de nivel: los equipos propios del usuario (no están en el
 * catálogo) y lo que el modo carrera le sumó o le restó a cada club con las
 * temporadas. Lo fija la pantalla con la partida en curso.
 */
let CUSTOM: Record<string, number> = {};
let BOOST: Record<string, number> = {};
export function setRatingContext(custom: Record<string, number>, boost?: Record<string, number>) {
    CUSTOM = custom;
    BOOST = boost ?? {};
}
export function setRatingBoost(boost?: Record<string, number>) {
    BOOST = boost ?? {};
}
/*
 * Más contexto de la carrera: quién juega en cada puesto de cada club (los
 * goleadores se anotan por jugador, no por puesto) y cuánto vale la localía en
 * los partidos simulados de fase regular.
 */
let SLOT_IDS: Record<string, number[]> = {};
let HOME_ADV = 0;
export function setCareerContext(slotIds?: Record<string, number[]>, homeAdv = 0) {
    SLOT_IDS = slotIds ?? {};
    HOME_ADV = homeAdv;
}
/** El jugador (id) que ocupa un puesto de un club; fuera de la carrera, el puesto mismo. */
export const playerAt = (team: string, slot: number) => SLOT_IDS[team]?.[slot] ?? slot;
/** Lo que una carrera le cambió al nivel de un club (0 fuera de la carrera). */
export const ratingBoost = (id: string) => BOOST[id] ?? 0;
export const baseRatingOf = (id: string) => RATING.get(id) ?? CUSTOM[id] ?? 60;
export const ratingOf = (id: string) => Math.max(30, Math.min(95, baseRatingOf(id) + ratingBoost(id)));
export const GROUP_LETTERS = 'ABCDEFGH';

/** Orden de cuadro clásico: 1 contra el último, y los dos mejores en mitades distintas. */
/** Lugar vacío del cuadro: el que se enfrenta a un BYE pasa de ronda sin jugar. */
const BYE = '__bye__';

function seedOrder(n: number): number[] {
    let order = [0];
    while (order.length < n) {
        const size = order.length * 2;
        order = order.flatMap((s) => [s, size - 1 - s]);
    }
    return order;
}

/** Todos contra todos por el método del círculo; a dos vueltas repite con la localía al revés. */
function roundRobin(ids: string[], legs: 1 | 2): [string, string][][] {
    const list = [...ids];
    if (list.length % 2) list.push('__libre');
    const n = list.length;
    const rounds: [string, string][][] = [];
    for (let r = 0; r < n - 1; r++) {
        const pairs: [string, string][] = [];
        for (let i = 0; i < n / 2; i++) {
            const a = list[i];
            const b = list[n - 1 - i];
            if (a !== '__libre' && b !== '__libre') pairs.push(r % 2 ? [b, a] : [a, b]);
        }
        rounds.push(pairs);
        list.splice(1, 0, list.pop() as string);
    }
    if (legs === 2) return [...rounds, ...rounds.map((r) => r.map(([a, b]) => [b, a] as [string, string]))];
    return rounds;
}

/** Conferencias: cada uno juega una vez contra cada equipo de la otra. */
function crossRounds(a: string[], b: string[]): [string, string][][] {
    return a.map((_, r) => a.map((t, i) => [t, b[(i + r) % b.length]] as [string, string]));
}

/** Sorteo por bombos: los grupos quedan parejos, cada cabeza de serie en uno distinto. */
function drawGroups(ids: string[], n: number): string[][] {
    const ranked = [...ids].sort((x, y) => ratingOf(y) - ratingOf(x));
    const groups: string[][] = Array.from({ length: n }, () => []);
    for (let pot = 0; pot * n < ranked.length; pot++) {
        const slice = ranked.slice(pot * n, pot * n + n);
        // Dentro del bombo, al azar.
        for (let i = slice.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [slice[i], slice[j]] = [slice[j], slice[i]];
        }
        slice.forEach((t, i) => groups[i].push(t));
    }
    return groups;
}

export function createTour(def: TourDef, me: string, difficulty: Difficulty, duration: Duration): TourState {
    const ids = def.teams.map(teamIdOf);
    let groups: string[][];
    let rounds: [string, string][][];
    let cross = false;
    const frozen = TOURS.some((d) => d === def) ? undefined : def;
    if (def.stage.kind === 'ko') {
        // Cuadro directo, sembrado por ranking.
        const ranked = [...ids].sort((x, y) => ratingOf(y) - ratingOf(x));
        // Si la cantidad no es potencia de dos, los mejor sembrados quedan libres en la primera ronda.
        let size = 2;
        while (size < ranked.length) size *= 2;
        const padded = [...ranked, ...Array<string>(size - ranked.length).fill(BYE)];
        return {
            v: 2, tourId: def.id, me, difficulty, duration, stage: 'ko', hasKo: true, cross: false,
            groups: [ids], rounds: [], table: ids.map((team) => ({ team, pj: 0, g: 0, e: 0, p: 0, pf: 0, pc: 0, pts: 0 })),
            round: 0, alive: def.stage.fixed ? [...ids] : seedOrder(size).map((i) => padded[i]), groupHistory: [], koHistory: [], koStart: def.stage.fixed ? ranked.length : size,
            done: false, champion: null, eliminated: false, def: frozen, stats: {},
        };
    }
    if (def.stage.kind === 'liga') {
        groups = [ids];
        rounds = roundRobin([...ids].sort(() => Math.random() - 0.5), def.stage.legs);
    } else {
        groups = Array.isArray(def.stage.groups) ? def.stage.groups.map((g) => g.map(teamIdOf)) : drawGroups(ids, def.stage.groups);
        cross = !!def.stage.cross;
        if (cross) rounds = crossRounds(groups[0], groups[1]);
        else {
            const per = groups.map((g) => roundRobin(g, def.stage.kind === 'grupos' ? def.stage.legs ?? 1 : 1));
            const len = Math.max(...per.map((r) => r.length));
            rounds = Array.from({ length: len }, (_, r) => per.flatMap((g) => g[r] ?? []));
        }
    }
    return {
        v: 2,
        tourId: def.id,
        me,
        difficulty,
        duration,
        stage: 'grupos',
        hasKo: def.stage.kind === 'grupos' && !def.stage.noKo,
        cross,
        groups,
        rounds,
        table: ids.map((team) => ({ team, pj: 0, g: 0, e: 0, p: 0, pf: 0, pc: 0, pts: 0 })),
        round: 0,
        alive: [],
        groupHistory: [],
        koHistory: [],
        koStart: 0,
        done: false,
        champion: null,
        eliminated: false,
        def: frozen,
        stats: {},
    };
}

export function koLabel(n: number): string {
    switch (n) {
        case 2: return 'Final';
        case 4: return 'Semifinal';
        case 8: return 'Cuartos de final';
        case 16: return 'Octavos de final';
        case 32: return 'Dieciseisavos de final';
        case 64: return 'Treintaidosavos de final';
        default: return `Ronda de ${n}`;
    }
}

/** Los cruces del repechaje: 3.º de una zona contra 4.º de la zona cruzada (A-B, B-A, C-D, D-C). */
export function repechajePairs(s: TourState): [string, string][] {
    const at = (gi: number, pos: number) => groupStandings(s, gi)[pos]?.team;
    return ([[0, 1], [1, 0], [2, 3], [3, 2]] as const)
        .map(([g3, g4]) => [at(g3, 2), at(g4, 3)] as const)
        .filter((p): p is readonly [string, string] => !!p[0] && !!p[1])
        .map(([a, b]) => [a, b] as [string, string]);
}

export function roundLabel(s: TourState): string {
    if (s.stage === 'ko' && s.rep?.includes(s.me)) return 'Repechaje por la plaza';
    if (s.stage === 'ko') return koLabel(s.alive.length);
    if (!s.hasKo) return `Fecha ${s.round + 1} de ${s.rounds.length}`;
    if (s.groups.length === 1) return `Fase regular · fecha ${s.round + 1} de ${s.rounds.length}`;
    return `Fase de grupos · fecha ${s.round + 1} de ${s.rounds.length}`;
}

/** Los cruces del cuadro, con los libres (BYE) incluidos. */
function koPairs(s: TourState): [string, string][] {
    const pairs: [string, string][] = [];
    for (let i = 0; i + 1 < s.alive.length; i += 2) pairs.push([s.alive[i], s.alive[i + 1]]);
    return pairs;
}

/** Los partidos que se juegan en la fecha actual: los cruces con un libre no cuentan. */
function currentPairs(s: TourState): [string, string][] {
    if (s.stage === 'grupos') return s.rounds[s.round] ?? [];
    const pairs = koPairs(s).filter(([a, b]) => a !== BYE && b !== BYE);
    return s.rep ? [...pairs, s.rep] : pairs;
}

/** El rival del usuario en la fecha actual, o null si tiene fecha libre o ya no juega. */
export function nextOpponent(s: TourState): string | null {
    if (s.done || s.eliminated) return null;
    const mine = currentPairs(s).find(([a, b]) => a === s.me || b === s.me);
    if (!mine) return null;
    return mine[0] === s.me ? mine[1] : mine[0];
}

/** ¿El usuario juega de local la fecha actual? (en el cuadro, la cancha es neutral: false) */
export function nextIsHome(s: TourState): boolean {
    if (s.stage !== 'grupos') return false;
    return (s.rounds[s.round] ?? []).some(([a]) => a === s.me);
}

/** El grupo del equipo (índice), o -1. */
export function groupOf(s: TourState, id: string): number {
    return s.groups.findIndex((g) => g.includes(id));
}

function poisson(lambda: number): number {
    const l = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
        k += 1;
        p *= Math.random();
    } while (p > l);
    return k - 1;
}

/** Quién sumó un tanto: el equipo, el puesto (0-6) y cómo. */
export interface ScoreEvent {
    team: string;
    slot: number;
    kind: 'try' | 'conv' | 'drop' | 'tackle' | 'missTackle';
}

/** Tries, puntos y tackles de cada jugador en un torneo: clave `equipo#puesto`. Los tackles faltan en las partidas viejas. */
export type StatLine = [number, number, number?];

// En el seven los tries los apoyan más los de afuera; patea el apertura (puesto 5).
const TRY_W = [1, 1, 1, 2, 3, 4, 5];

/** Reparte un tanteador simulado en tries, conversiones y drops, y le pone nombre a cada uno. */
function splitScore(score: number): { t: number; c: number; d: number } {
    let best: { t: number; c: number; d: number } | null = null;
    for (let t = Math.floor(score / 5); t >= 0 && !best; t--) {
        let rest = score - 5 * t;
        let d = 0;
        while (rest % 2 !== 0 && rest >= 3) {
            rest -= 3;
            d += 1;
        }
        if (rest % 2 === 0 && rest / 2 <= t) best = { t, c: rest / 2, d };
    }
    return best ?? { t: Math.floor(score / 5), c: 0, d: 0 };
}

/** Cuántos tries explica un tanteador (el reparto más generoso en tries). */
export const triesOfScore = (score: number) => splitScore(score).t;

export function scoreEvents(team: string, score: number): ScoreEvent[] {
    const b = splitScore(score);
    const total = TRY_W.reduce((x, y) => x + y, 0);
    const pick = () => {
        let r = Math.random() * total;
        for (let i = 0; i < TRY_W.length; i++) if ((r -= TRY_W[i]) < 0) return i;
        return TRY_W.length - 1;
    };
    const out: ScoreEvent[] = [];
    for (let i = 0; i < b.t; i++) out.push({ team, slot: playerAt(team, pick()), kind: 'try' });
    for (let i = 0; i < b.c; i++) out.push({ team, slot: playerAt(team, 4), kind: 'conv' });
    for (let i = 0; i < b.d; i++) out.push({ team, slot: playerAt(team, 4), kind: 'drop' });
    return out;
}

const POINTS = { try: 5, conv: 2, drop: 3 } as const;

/**
 * Los tackles de un equipo en un partido simulado: dependen de cuánto atacó el
 * rival (más puntos en contra, más defensa) y los de adelante tacklean más.
 */
export function tackleEvents(team: string, oppScore: number): ScoreEvent[] {
    const w = [4, 4, 4, 3, 2, 3, 2];
    const total = w.reduce((x, y) => x + y, 0);
    const n = 14 + Math.round(oppScore * 0.8);
    const out: ScoreEvent[] = [];
    for (let i = 0; i < n; i++) {
        let r = Math.random() * total;
        let slot = w.length - 1;
        for (let j = 0; j < w.length; j++) if ((r -= w[j]) < 0) { slot = j; break; }
        out.push({ team, slot: playerAt(team, slot), kind: 'tackle' });
    }
    return out;
}

export function addStats(stats: Record<string, StatLine>, events: ScoreEvent[]) {
    for (const e of events) {
        const k = `${e.team}#${e.slot}`;
        // El tackle errado no suma en las tablas del torneo: lo usa la carrera para revisar la habilidad.
        if (e.kind === 'missTackle') continue;
        const line = (stats[k] ??= [0, 0, 0]);
        if (e.kind === 'tackle') {
            line[2] = (line[2] ?? 0) + 1;
            continue;
        }
        if (e.kind === 'try') line[0] += 1;
        line[1] += POINTS[e.kind];
    }
}

/**
 * La nota del jugador del torneo: lo que anota más lo que defiende. Un punto por
 * punto y uno por tackle, así el que hace de todo le gana al que hace una sola cosa.
 */
export const playerRating = (points: number, tackles: number) => points + tackles;

export type StatBy = 'tries' | 'points' | 'tackles' | 'rating';

/** Los mejores de un torneo: tryman, goleador (puntos), defensor (tackles) o el mejor jugador (nota general). */
export function topStats(stats: Record<string, StatLine> | undefined, by: StatBy, n = 10): { team: string; slot: number; tries: number; points: number; tackles: number; rating: number }[] {
    if (!stats) return [];
    const value = (x: { tries: number; points: number; tackles: number; rating: number }) => (by === 'tries' ? x.tries : by === 'points' ? x.points : by === 'tackles' ? x.tackles : x.rating);
    return Object.entries(stats)
        .map(([k, [tries, points, tk]]) => {
            const [team, slot] = k.split('#');
            const tackles = tk ?? 0;
            return { team, slot: Number(slot), tries, points, tackles, rating: playerRating(points, tackles) };
        })
        .filter((x) => value(x) > 0)
        // Desempates estables: el valor, después puntos, tackles y el nombre de la clave.
        .sort((a, b) => value(b) - value(a) || b.points - a.points || b.tackles - a.tackles || a.team.localeCompare(b.team) || a.slot - b.slot)
        .slice(0, n);
}

/**
 * Resultado de un partido que no juega el usuario, a partir del ranking. En
 * fase regular el local (`a`) suma la localía de la carrera. En eliminación no
 * hay empate: un minuto extra (lo gana el que termine arriba) y, si siguen
 * iguales, muerte súbita.
 */
export function simulate(a: string, b: string, knockout: boolean, homeAdv = knockout ? 0 : HOME_ADV): [number, number] {
    const pa = 1 / (1 + 10 ** ((ratingOf(b) - ratingOf(a) - homeAdv) / 18));
    const ta = poisson(1 + 4 * pa);
    const tb = poisson(1 + 4 * (1 - pa));
    const pts = (t: number) => {
        let sc = t * 5;
        for (let i = 0; i < t; i++) if (Math.random() < 0.65) sc += 2;
        return sc;
    };
    let sa = pts(ta);
    let sb = pts(tb);
    if (knockout && sa === sb) {
        const first = Math.random() < pa ? 0 : 1;
        // Minuto extra: más o menos una de cada tres veces alguien marca y se lo lleva.
        if (Math.random() < 0.35) {
            const add = Math.random() < 0.85 ? (Math.random() < 0.65 ? 7 : 5) : 3;
            if (first === 0) sa += add;
            else sb += add;
        } else if (first === 0) sa += 5; // muerte súbita: el primero que apoya
        else sb += 5;
    }
    return [sa, sb];
}

function addToTable(table: Row[], r: Result) {
    const ra = table.find((x) => x.team === r.a);
    const rb = table.find((x) => x.team === r.b);
    if (!ra || !rb) return;
    for (const [row, f, c, tries] of [[ra, r.sa, r.sb, r.ta ?? triesOfScore(r.sa)], [rb, r.sb, r.sa, r.tb ?? triesOfScore(r.sb)]] as [Row, number, number, number][]) {
        row.pj += 1;
        if (tries >= 4) row.pts += 1; // bonus ofensivo: 4 tries, gane o pierda
        row.pf += f;
        row.pc += c;
        if (f > c) {
            row.g += 1;
            row.pts += 4;
        } else if (f === c) {
            row.e += 1;
            row.pts += 2;
        } else {
            row.p += 1;
            if (c - f <= 7) row.pts += 1; // bonus defensivo
        }
    }
}

const byStanding = (x: Row, y: Row) => y.pts - x.pts || y.pf - y.pc - (x.pf - x.pc) || y.pf - x.pf;

/** Tabla de un grupo, ordenada. */
export function groupStandings(s: TourState, gi: number): Row[] {
    return s.table.filter((r) => s.groups[gi]?.includes(r.team)).sort(byStanding);
}

/** Quiénes pasan al cuadro, ya sembrados: ganadores, segundos y mejores terceros. */
function qualifiers(s: TourState, def: TourDef): string[] {
    if (def.stage.kind !== 'grupos') return [];
    const { advance, bestThirds = 0 } = def.stage;
    const tables = s.groups.map((_, gi) => groupStandings(s, gi));
    const tiers: Row[][] = [];
    for (let pos = 0; pos < advance; pos++) tiers.push(tables.map((t) => t[pos]).filter(Boolean).sort(byStanding));
    if (bestThirds) tiers.push(tables.map((t) => t[advance]).filter(Boolean).sort(byStanding).slice(0, bestThirds));
    return tiers.flat().map((r) => r.team);
}

/**
 * Cierra la fecha: anota el partido del usuario (si jugó), simula el resto y
 * avanza. Devuelve un estado nuevo; no muta el que recibe.
 */
export function closeRound(prev: TourState, mine: [number, number] | null, mineEvents?: ScoreEvent[]): TourState {
    const s: TourState = JSON.parse(JSON.stringify(prev));
    const def = defOf(s);
    if (!def) return s;
    const knockout = s.stage === 'ko';
    const label = roundLabel(s);
    const results: Result[] = currentPairs(s).map(([a, b]) => {
        if (mine && (a === s.me || b === s.me)) {
            const [us, them] = mine;
            const res: Result = a === s.me ? { a, b, sa: us, sb: them } : { a, b, sa: them, sb: us };
            if (mineEvents?.length) {
                const tries = (team: string) => mineEvents.filter((e) => e.team === team && e.kind === 'try').length;
                res.ta = tries(a);
                res.tb = tries(b);
            }
            return res;
        }
        const [sa, sb] = simulate(a, b, knockout);
        return { a, b, sa, sb };
    });
    if (s.stats) {
        for (const r of results) {
            const isMine = !!mine && (r.a === s.me || r.b === s.me);
            if (isMine && mineEvents?.length) {
                addStats(s.stats, mineEvents);
                // Un partido que se miró (sin tackles registrados) los reparte como uno simulado.
                if (!mineEvents.some((e) => e.kind === 'tackle')) addStats(s.stats, [...tackleEvents(r.a, r.sb), ...tackleEvents(r.b, r.sa)]);
            } else addStats(s.stats, [...scoreEvents(r.a, r.sa), ...scoreEvents(r.b, r.sb), ...tackleEvents(r.a, r.sb), ...tackleEvents(r.b, r.sa)]);
        }
    }

    if (s.stage === 'grupos') {
        s.groupHistory.push({ label, results });
        for (const r of results) addToTable(s.table, r);
        s.round += 1;
        if (s.round >= s.rounds.length) {
            if (!s.hasKo) {
                s.done = true;
                s.champion = finalRanking(s)[0];
                return s;
            }
            const q = qualifiers(s, def);
            s.stage = 'ko';
            // Si el cuadro no es potencia de dos (6 clasificados), los mejor sembrados quedan libres en la primera ronda.
            let size = 2;
            while (size < q.length) size *= 2;
            const padded = [...q, ...Array<string>(size - q.length).fill(BYE)];
            s.koStart = size;
            s.alive = seedOrder(size).map((i) => padded[i]);
            if (!s.alive.includes(s.me)) {
                // Federales: el 3.º y el 4.º de su zona no quedan afuera, juegan el repechaje con los cuartos.
                const repPair = def.stage.kind === 'grupos' && def.stage.rep && s.groups.length >= 4 ? repechajePairs(s).find((p) => p.includes(s.me)) : undefined;
                if (repPair) s.rep = repPair;
                else s.eliminated = true;
            }
        }
    } else {
        let koResults = results;
        const repPair = s.rep;
        if (repPair) {
            // El repechaje del usuario se juega en la fecha de los cuartos, pero no es parte del cuadro.
            const rr = results.find((r) => r.a === repPair[0] && r.b === repPair[1]);
            if (rr) {
                s.repResult = rr;
                s.koHistory.push({ label: 'Repechaje por la plaza', results: [rr] });
                koResults = results.filter((r) => r !== rr);
            }
            s.rep = null;
        }
        s.koHistory.push({ label: koLabel(s.alive.length), results: koResults });
        const winner = new Map(koResults.map((r) => [`${r.a}|${r.b}`, r.sa > r.sb ? r.a : r.b]));
        s.alive = koPairs(s).map(([a, b]) => (a === BYE ? b : b === BYE ? a : winner.get(`${a}|${b}`) as string));
        if (!s.alive.includes(s.me)) s.eliminated = true;
        if (s.alive.length === 1) {
            s.done = true;
            s.champion = s.alive[0];
        }
    }
    // Afuera: el resto del torneo se juega solo, para saber quién salió campeón.
    // Los torneos que nadie juega ('__nadie') NO: van fecha por fecha al ritmo de la temporada
    // del usuario; si se resolvieran de un saque, el cuadro entero aparecería terminado a mitad de año.
    return s.eliminated && !s.done && s.me !== '__nadie' ? closeRound(s, null) : s;
}

export function isTourState(v: unknown): v is TourState {
    const t = v as TourState;
    return (
        !!t && t.v === 2 && typeof t.tourId === 'string' && Array.isArray(t.groups) && Array.isArray(t.table) &&
        (TOURS.some((d) => d.id === t.tourId) || (!!t.def && Array.isArray(t.def.teams)))
    );
}

/**
 * Orden final de un torneo terminado: campeón, finalista, los que cayeron
 * antes en el cuadro, y el resto por la tabla (primeros de grupo, después
 * segundos, y así). Es lo que reparte los lugares de un clasificatorio.
 */
export function finalRanking(s: TourState): string[] {
    const out: string[] = [];
    const push = (id: string) => {
        if (id && !out.includes(id)) out.push(id);
    };
    if (s.champion && s.hasKo) push(s.champion);
    for (const h of [...s.koHistory].reverse()) {
        // Los que perdieron en esta ronda, el que perdió por menos primero.
        const losers = h.results
            .map((r) => (r.sa > r.sb ? { id: r.b, diff: r.sb - r.sa } : { id: r.a, diff: r.sa - r.sb }))
            .sort((x, y) => y.diff - x.diff);
        for (const l of losers) push(l.id);
    }
    const tables = s.groups.map((_, gi) => groupStandings(s, gi));
    const deepest = Math.max(0, ...tables.map((t) => t.length));
    for (let pos = 0; pos < deepest; pos++) {
        for (const r of tables.map((t) => t[pos]).filter(Boolean).sort(byStanding)) push(r.team);
    }
    return out;
}

/** Juega un torneo entero sin el usuario (para los clasificatorios de las otras regiones). */
export function playOut(def: TourDef): TourState {
    let s = createTour(def, '__nadie', 'normal', 3);
    for (let guard = 0; !s.done && guard < 200; guard++) s = closeRound(s, null);
    return s;
}

/** Cambia un equipo por otro en una definición (también en los grupos fijos). */
export function replaceInDef(def: TourDef, out: string, inn: string): TourDef {
    const swap = (c: string) => (c === out ? inn : c);
    const stage: Stage =
        def.stage.kind === 'grupos' && Array.isArray(def.stage.groups) ? { ...def.stage, groups: def.stage.groups.map((g) => g.map(swap)) } : def.stage;
    return { ...def, teams: def.teams.map(swap), stage };
}

export interface FixtureItem {
    label: string;
    opp: string | null; // null: fecha libre o rival por definir
    home: boolean;
    result?: [number, number]; // [nosotros, ellos]
    state: 'played' | 'next' | 'later' | 'maybe';
    note?: string;
}

/** El calendario del usuario en este torneo: lo jugado, lo que viene y el cuadro al que puede llegar. */
export function myFixture(s: TourState): FixtureItem[] {
    const out: FixtureItem[] = [];
    const me = s.me;
    const phaseName = s.groups.length > 1 ? 'Fase de grupos' : 'Fase regular';
    const mine = (r: Result): [number, number] => (r.a === me ? [r.sa, r.sb] : [r.sb, r.sa]);
    s.rounds.forEach((pairs, i) => {
        const label = `${phaseName} · fecha ${i + 1}`;
        const pair = pairs.find(([a, b]) => a === me || b === me);
        const played = i < s.groupHistory.length;
        if (!pair) {
            out.push({ label, opp: null, home: false, state: played ? 'played' : i === s.round && s.stage === 'grupos' ? 'next' : 'later', note: 'Fecha libre' });
            return;
        }
        const res = played ? s.groupHistory[i].results.find((r) => r.a === me || r.b === me) : undefined;
        out.push({
            label,
            opp: pair[0] === me ? pair[1] : pair[0],
            home: pair[0] === me,
            result: res ? mine(res) : undefined,
            state: res ? 'played' : s.stage === 'grupos' && i === s.round && !s.eliminated ? 'next' : 'later',
        });
    });
    for (const h of s.koHistory) {
        const r = h.results.find((x) => x.a === me || x.b === me);
        if (r) out.push({ label: h.label, opp: r.a === me ? r.b : r.a, home: r.a === me, result: mine(r), state: 'played' });
    }
    if (s.done || s.eliminated) return out;
    if (s.stage === 'ko') {
        const opp = nextOpponent(s);
        const libre = koPairs(s).some(([a, b]) => (a === me && b === BYE) || (b === me && a === BYE));
        if (libre) out.push({ label: koLabel(s.alive.length), opp: null, home: false, state: 'later', note: 'Libre: pasás directo' });
        else out.push({ label: koLabel(s.alive.length), opp, home: s.alive.indexOf(me) % 2 === 0, state: 'next' });
        for (let n = s.alive.length / 2; n >= 2; n /= 2) out.push({ label: koLabel(n), opp: null, home: false, state: 'maybe', note: 'Si ganás' });
        return out;
    }
    const def = defOf(s);
    if (s.hasKo && def?.stage.kind === 'grupos') {
        const n = def.stage.advance * s.groups.length + (def.stage.bestThirds ?? 0);
        const note = s.groups.length > 1 ? `Si pasás de grupo (${def.stage.advance} por grupo)` : `Si terminás entre los ${def.stage.advance} primeros`;
        for (let k = n, first = true; k >= 2; k /= 2, first = false) out.push({ label: koLabel(k), opp: null, home: false, state: 'maybe', note: first ? note : 'Si ganás' });
    }
    return out;
}
