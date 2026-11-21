/*
 * Modo carrera del rugby argentino: un club, varias temporadas.
 *
 * LA TEMPORADA. El club juega su división y, en paralelo, el torneo federal al
 * que haya clasificado con la tabla de la temporada ANTERIOR (la de 2026 sale
 * del orden de nivel). Las fechas se intercalan según el avance de cada uno, y
 * todos los demás torneos (las otras divisiones, los otros federales) avanzan a
 * la par para poder seguirlos.
 *
 * LOS FEDERALES. Zonas de cuatro a dos ruedas; 1.º y 2.º van a cuartos. El 3.º
 * y el 4.º de cada zona juegan un REPECHAJE cruzado (3.º A contra 4.º B…); los
 * que lo pierden juegan la RE VÁLIDA contra los cuatro semifinalistas del
 * federal de abajo. Si gana el de abajo, la región del ganador se lleva esa
 * plaza para el año siguiente y la del perdedor la cede: las plazas son de la
 * región, no del club.
 *
 * EL NACIONAL DE CLUBES. Al cerrar cada temporada se elige cómo se juega el
 * Nacional de dentro de DOS temporadas:
 *   · final: campeón del Top 14 contra campeón del TDI A.
 *   · semis: los dos primeros de cada lado, cruzados (1.º contra 2.º).
 *   · grupos8: los cuatro primeros de cada lado en dos zonas mezcladas,
 *     semifinales y final.
 *   · ab: Nacional A (los 8 mejores de la URBA y los 8 mejores del interior),
 *     Nacional B (los 6 de abajo del Top 14 y 10 del interior), y abajo el TDI A
 *     y el TDI B con los que siguen. Es la temporada federal entera: el campeón
 *     del Nacional A es el campeón argentino. Las plazas del interior se mueven
 *     con el mismo repechaje y reválida entre cada nivel; las de la URBA quedan
 *     fijas (8 y 6, según la tabla del Top 14).
 *
 * LAS DIVISIONES. URBA: suben dos, bajan dos (de Tercera y Desarrollo, uno).
 * Interior: el campeón de cada división juega la PROMOCIÓN contra el último de
 * la de arriba.
 *
 * LOS PLANTELES. Cada club tiene sus siete jugadores con edad y nivel. Cada año
 * cumplen uno: los jóvenes mejoran, los veteranos caen y se retiran, y llega
 * uno nuevo de la cantera. Eso, más lo que rinde en la cancha (que se diluye si
 * no se sostiene), es el nivel del club: un título no te deja arriba para
 * siempre. Los nombres del plantel propio se pueden editar.
 *
 * Una etapa terminada se "asienta" una sola vez (settleCareer): ahí se simula lo
 * que no juega el usuario, y el cartel dice exactamente lo que después pasa.
 */

import { AR_LABEL_OVERRIDE, AR_SEVEN_CUPOS, AR_SEVEN_DIVISIONS, arClubById, CBA_DESARROLLO_ZONES, FEM_GUEST_IDS, isArgBranch, type ArBranch } from './arClubs';
import { femLook, isFemClub, randomLook, type Look } from './sprites';
import { PALMARES_KEYS, PALMARES_LABEL, realTitles, type TitleRow } from './palmares';
import { defaultNames, nameFromSeed, nameFromText, type PlayerName } from './names';
import type { Difficulty, Duration, SevenTeam } from './teams';
import type { PlayerSkill } from './engine';
import {
    baseRatingOf,
    closeRound,
    createTour,
    defOf,
    finalRanking,
    groupStandings,
    myFixture,
    nextOpponent,
    ratingOf,
    roundLabel,
    scoreEvents,
    setCareerContext,
    setRatingBoost,
    simulate,
    topStats,
    type FixtureItem,
    type ScoreEvent,
    type TourDef,
    type TourState,
} from './tours';

type Branch = ArBranch;
/** ¿Es una carrera del rugby argentino (con TDI y Nacional)? Las de Chile, Uruguay y Brasil van aparte. */
export const isArgCareer = (r: CareerState) => isArgBranch(r.branch);
export type CareerPhase = 'liga' | 'copa' | 'playoff' | 'promocion' | 'tdi' | 'nacional' | 'sudam';
export type NacFormat = 'final' | 'semis' | 'grupos8' | 'ab';
export type TierId = 'nacA' | 'nacB' | 'tdiA' | 'tdiB';
type Cupo = { region: string; source: string; tdiA: number; tdiB: number };
type CupoAB = { region: string; source: string; n: [number, number, number, number] };
type Tiers = Partial<Record<TierId, string[]>>;

interface Promo {
    up: string; // división de arriba
    down: string; // división de abajo
    top: string; // campeón de la de abajo
    bottom: string; // el que defiende el lugar arriba
    winner?: string;
    score?: [number, number]; // [bottom, top]
    /** Adónde baja el de arriba si pierde (si no es la división de abajo: un andino vuelve al Andino). */
    bottomTo?: string;
    /** Cómo llegó el de abajo, para el cartel ("campeón del Regional A"). */
    via?: string;
}

/**
 * Una copa de fin de fase regular: el Regional A y el B de Córdoba, la
 * liguilla del Litoral, el playoff por el ascenso de cada división de la URBA.
 */
interface Cup {
    key: string;
    name: string;
    sub: string;
    teams: string[];
    kind: 'ko' | 'liga' | 'grupos';
    /** Para las copas por grupos: los grupos (pasan los dos primeros de cada uno, o `advance`). */
    groups?: string[][];
    advance?: number;
    /** Después de los grupos hay cuadro (semifinales y final). */
    ko?: boolean;
    champion?: string;
    /** Orden final de la copa (para las que reparten lugares, como la Repescagem). */
    ranking?: string[];
}

/** Un partido por una plaza: `a` es el del nivel de arriba. */
interface PlazaMatch {
    a: string;
    b: string;
    winner?: string;
    score?: [number, number];
}

/** La disputa de plazas entre dos niveles federales seguidos. */
interface Dispute {
    up: TierId;
    low: TierId;
    rep: PlazaMatch[]; // repechaje: 3.º contra 4.º de zonas cruzadas del de arriba
    rev: PlazaMatch[] | null; // reválida: perdedores del repechaje contra semifinalistas del de abajo
    semis: string[]; // semifinalistas del de abajo
    /** Repechaje del TDI B contra los que no tienen plaza: el último de cada zona contra el mejor sin plaza de otra región. */
    outside?: boolean;
}

/** Por qué un jugador no está: lesión, franquicia del Super Rugby Américas, club de Europa o Pumas. */
export type OutKind = 'inj' | 'fra' | 'eur' | 'pum';

export interface Player {
    /** Id dentro del club (los siete de las partidas viejas son 0 a 6, su puesto de entonces). */
    id?: number;
    age: number;
    /** Solo partidas viejas: nivel respecto del promedio del club (−6 a 6). */
    q: number;
    gen: number; // partidas viejas: cuántas veces se renovó ese puesto (da el nombre)
    name?: string; // el que escribió el usuario
    /** Valoración general, de 1 a 10 (el 10 casi no existe). */
    ovr?: number;
    /** Skills de 1 a 10: velocidad, patada, tackle y resistencia. */
    s?: [number, number, number, number];
    /** Moral, de −2 a 2. */
    m?: number;
    /** Peso (kg) y altura (cm): el scrum y el line. */
    b?: [number, number];
    /** Si no está: por qué, hasta qué altura de la temporada (0 a 1; 2 = toda) y quién se lo llevó. */
    out?: { kind: OutKind; until: number; by?: string };
}

/** Una noticia del club que se muestra en un cartel (convocatorias, lesiones, vueltas). */
export interface CareerNews {
    season: number;
    kind: OutKind | 'back' | 'youth' | 'train' | 'club';
    title: string;
    text: string;
    /** El jugador de la noticia (id en el plantel propio). */
    who?: number;
}

/** Cómo le fue a una categoría del club en la temporada. */
export interface YouthRow {
    cat: string;
    place: number;
    of: number;
    /** Nacional de la categoría (M16, M17 y M19): hasta dónde llegó. */
    nac?: string;
    /** Campeón del nacional de la categoría. */
    champ?: string;
}

export interface Award {
    name: string;
    club: string;
    n: number;
}

export interface CareerState {
    v: 1;
    me: string;
    branch: Branch;
    season: number;
    phase: CareerPhase;
    /** Qué clubes juegan cada división de la rama esta temporada (cambia con ascensos y descensos). */
    divisions: Record<string, string[]>;
    /** Plazas de cada región en el TDI A y B (formatos de Nacional que no son A/B). */
    cupos: Cupo[];
    /** Plazas de cada región en Nacional A, Nacional B, TDI A y TDI B (formato A/B). */
    cuposAB?: CupoAB[];
    /** Quiénes juegan cada nivel federal esta temporada (clasificados con la tabla del año anterior). */
    tiers?: Tiers;
    /** Partidas guardadas antes de los niveles: solo el TDI A y B. */
    tdi?: { A: string[]; B: string[] };
    /** Cómo se juega el Nacional cada temporada (se elige dos temporadas antes). */
    nacFormat?: Record<string, NacFormat>;
    /** El nombre del entrenador (lo pone el usuario al empezar). */
    coach?: string;
    /** Campeón de cada competición en cada temporada de esta carrera: clave del palmarés → [temporada, club]. */
    champions?: Record<string, [number, string][]>;
    /** El otro torneo que el club juega en paralelo (el federal o la división, el que no está en pantalla). */
    parallel?: TourState | null;
    /** Los demás torneos de la temporada, que avanzan fecha a fecha junto con el del usuario. */
    others?: Record<string, TourState> | null;
    /** Lo que se jugó después de la fase regular (playoffs, promociones, plazas, Nacional, Sudamericano), para mirarlo. */
    archive?: Record<string, TourState> | null;
    /** Ascensos y descensos de la última temporada cerrada. */
    movesLog?: { season: number; lines: string[] } | null;
    /** Lo que rindió cada club en la cancha (se diluye cada año). */
    ratings?: Record<string, number>;
    /** Plantel de cada club de la rama. */
    rosters?: Record<string, Player[]>;
    /** Goleadores y tryman de cada torneo jugado por el club. */
    awards?: { season: number; comp: string; tries: Award[]; points: Award[] }[];
    /** Etapa que ya se asentó (lo que no juega el usuario ya está simulado). */
    settled?: CareerPhase | null;
    /** El siete inicial elegido (ids del plantel propio, en el orden de los puestos). */
    lineup?: number[];
    /** Cansancio del plantel propio por la seguidilla de partidos (0 a 2). */
    fat?: number;
    /** Bajas de la temporada en curso (lesionados más convocados): nunca más de 3. */
    bajas?: number;
    /** La pretemporada de este año: en qué paso va y lo que se eligió. */
    pre?: { step: 'punto' | 'entreno' | 'amistosos' | 'listo'; punto?: 'juveniles' | 'primera'; trained?: { id: number; result: 'up' | 'same' | 'inj' }[]; friendlies?: { opp: string; us: number; them: number }[] } | null;
    /** Ya se resolvieron las convocatorias de mitad de temporada (Pumas, Europa). */
    midDone?: boolean;
    /** Noticias del club, y cuántas ya se vieron. */
    news?: CareerNews[];
    newsSeen?: number;
    /** Camadas de juveniles de cada club: M15, M16, M17 y M19 (fuerza de 1 a 10). */
    youth?: Record<string, [number, number, number, number]>;
    /** Lo que invirtió el club propio en juveniles (sube su cantera). */
    invest?: number;
    /** Reportes de juveniles y divisiones del club, por temporada. */
    reports?: { season: number; rows: YouthRow[] }[];
    /** Historial contra cada rival: ganados, empatados, perdidos, a favor, en contra y el último [temporada, nosotros, ellos]. */
    h2h?: Record<string, [number, number, number, number, number, number, number, number]>;
    /** Versión de la carrera: las partidas viejas se llevan a la actual al abrirse (ver migrateCareer). */
    cv?: number;
    /** Lo que hizo cada jugador del club en toda la carrera: tries, puntos, partidos y el nombre (de los que ya no están). */
    legends?: Record<string, [number, number, number, string?]>;
    /** Lo que dejó la temporada en curso; se aplica al cerrarla. */
    pending: {
        moves: { club: string; from: string; to: string }[];
        regional: Record<string, string[]>; // orden final de cada primera regional (reparte los federales del año que viene)
        rankings?: Record<string, string[]>; // orden final de cada división
        urbaOrder?: string[]; // tabla final del Top 14 (en una carrera del interior, simulada)
        promos?: Promo[];
        myPromo?: number | null;
        disputes?: Dispute[];
        my?: { d: number; kind: 'rep' | 'rev'; i: number } | null;
        nacional?: { format: NacFormat; teams: string[]; groups?: string[][]; alive?: string[]; champion?: string } | null;
        bonus?: Record<string, number>; // nivel que suman los títulos
        tdi: 'A' | 'B' | null; // solo partidas viejas: el TDI como etapa aparte
        nextTier?: TierId | null; // a qué nivel federal clasificó el club para la temporada siguiente
        tierResult?: { tier: TierId; place: number; champion: boolean } | null;
        nacionalRival: string | null; // solo partidas viejas
        cupoDelta: Record<string, number>; // plazas de TDI A que gana (+) o pierde (−) cada región
        cupoDeltaB?: Record<string, number>; // plazas de TDI B que gana o pierde cada región (repechaje con los que no tienen)
        cups?: Cup[];
        myCup?: number | null;
        /** Sudamericano de Clubes de la temporada: los campeones de los cuatro países. */
        sud?: { teams: string[]; champion?: string } | null;
        deltaAB?: Record<string, [number, number, number, number]>;
        note: string[];
        /** Títulos que ganó el club esta temporada (para el festejo). */
        wins?: string[];
        /** Cuántos de esos ya se festejaron. */
        celebrated?: number;
        /** Cuántas notas había al empezar la etapa en curso (el cartel muestra las nuevas). */
        noteMark?: number;
    };
    history: { season: number; division: string; place: number; note: string; rating?: number }[];
    log: string[];
}

const DIV = Object.fromEntries(AR_SEVEN_DIVISIONS.map((d) => [d.id, d]));
const REGION_OF_CLUB: Record<string, string> = {};
for (const d of AR_SEVEN_DIVISIONS) for (const c of d.clubs) REGION_OF_CLUB[c] ??= d.region;
const byRating = (a: string, b: string) => ratingOf(b) - ratingOf(a);
const nm = (id: string) => arClubById(id)?.name ?? id;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export const divisionLabel = (id: string) => AR_LABEL_OVERRIDE[id] ?? DIV[id]?.label ?? id;

export const TIER_NAME: Record<TierId, string> = {
    nacA: 'Nacional de Clubes A',
    nacB: 'Nacional de Clubes B',
    tdiA: 'Torneo del Interior A',
    tdiB: 'Torneo del Interior B',
};

export const NAC_FORMATS: { id: NacFormat; label: string; hint: string }[] = [
    { id: 'final', label: 'Final única', hint: 'Campeón del Top 14 contra campeón del TDI A.' },
    { id: 'semis', label: 'Semifinales cruzadas', hint: 'Los dos primeros de la URBA y del TDI A: campeón contra subcampeón del otro lado, y final.' },
    { id: 'grupos8', label: 'Dos zonas de cuatro', hint: 'Los cuatro primeros de cada lado en dos zonas mezcladas, semifinales y final.' },
    { id: 'ab', label: 'Nacional A y B', hint: '8 de la URBA y 8 del interior en el A, 6 y 10 en el B; abajo el TDI A y el B. Las plazas se mueven con repechaje y reválida.' },
];

const TIERS_OF: Record<NacFormat, TierId[]> = {
    final: ['tdiA', 'tdiB'],
    semis: ['tdiA', 'tdiB'],
    grupos8: ['tdiA', 'tdiB'],
    ab: ['nacA', 'nacB', 'tdiA', 'tdiB'],
};

export const formatOf = (r: CareerState, season: number): NacFormat => r.nacFormat?.[String(season)] ?? 'final';

/** División en la que juega el club esta temporada. */
export function divisionOf(r: CareerState, club: string): string | null {
    return Object.keys(r.divisions).find((d) => r.divisions[d].includes(club)) ?? null;
}

/* ───────────────────────── planteles ───────────────────────── */

/** Doce por club: siete titulares y cinco suplentes. */
export const SQUAD = 12;
/** Nunca más de tres bajas (lesionados más convocados) en una temporada. */
export const MAX_BAJAS = 3;
/** Lo que vale jugar de local en la fase regular (puntos de nivel, escala 30-95). */
export const HOME_ADV = 3;
export const SKILL_LABEL = ['Velocidad', 'Pase y patada', 'Tackle', 'Resistencia'] as const;

/** Azar con semilla (para que convertir una partida vieja dé siempre lo mismo). */
function seededRand(seed: string): () => number {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    let a = h >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const gauss = (r: () => number) => (r() + r() + r() - 1.5) * 1.15;
const r1 = (v: number) => Math.round(v * 10) / 10;
const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** El centro de nivel de un club en la escala de 1 a 10, desde su nivel de catálogo. */
const centerOf = (club: string) => clampN(1 + (baseRatingOf(club) - 40) / 6, 1.5, 8.6);
/** Nivel de un club (escala 30-95) que da un promedio de valoración. */
const ratingFromOvr = (avg: number) => 40 + (avg - 1) * 6;

/** La valoración nunca pasa de 10, y arriba de 9 cuesta muchísimo. */
const capOvr = (v: number) => r1(clampN(v > 9 ? 9 + (v - 9) * 0.35 : v, 1, 10));

function makeSkills(ovr: number, r: () => number): [number, number, number, number] {
    const one = () => Math.round(clampN(ovr + gauss(r) * 1.3, 1, 10));
    return [one(), one(), one(), one()];
}

/** Peso y altura: los pesados tienden a ser altos; de 76 a 118 kg y de 1,70 a 2,02 m. */
function makeBody(r: () => number): [number, number] {
    const kg = Math.round(76 + r() * 42);
    return [kg, Math.round(clampN(168 + (kg - 76) * 0.45 + r() * 16, 170, 202))];
}

function makePlayer(id: number, ovr: number, age: number, r: () => number = Math.random): Player {
    const o = capOvr(ovr);
    return { id, age, q: 0, gen: 0, ovr: o, s: makeSkills(o, r), m: 0, b: makeBody(r) };
}

function newRoster(club: string, r: () => number = Math.random): Player[] {
    const c = centerOf(club);
    return Array.from({ length: SQUAD }, (_, id) => makePlayer(id, c + gauss(r) * 0.8 - (id >= 7 ? 0.5 : 0), 19 + Math.floor(r() * 15), r));
}

/** Pasa un plantel de las partidas viejas (siete, con `q`) al de doce con skills. Siempre da lo mismo. */
function upgradeRoster(club: string, old: Player[]): Player[] {
    const r = seededRand(`${club}:plantel`);
    const c = centerOf(club);
    const out = old.slice(0, 7).map((p, i): Player => ({ ...p, ...makePlayer(i, c + p.q * 0.5, p.age, r), gen: p.gen, ...(p.name ? { name: p.name } : {}) }));
    for (let id = out.length; id < SQUAD; id++) out.push(makePlayer(id, c - 0.5 + gauss(r) * 0.8, 19 + Math.floor(r() * 15), r));
    return out;
}

/** Lleva una partida vieja al formato actual (planteles de 12, camadas). No toca las que ya están. */
function upgradeCareer(r: CareerState) {
    if (!r.rosters) {
        r.rosters = {};
        for (const clubs of Object.values(r.divisions)) for (const c of clubs) r.rosters[c] = newRoster(c, seededRand(`${c}:nuevo`));
    }
    for (const [club, ro] of Object.entries(r.rosters)) if (ro.length < SQUAD || ro.some((p) => p.id === undefined || p.ovr === undefined)) r.rosters[club] = upgradeRoster(club, ro);
    // Divisiones nuevas del juego (el Desarrollo de Córdoba): entran con sus clubes.
    for (const d of AR_SEVEN_DIVISIONS) if (d.branch === r.branch && !r.divisions[d.id]) r.divisions[d.id] = [...d.clubs].sort(byRating);
    for (const clubs of Object.values(r.divisions)) for (const c of clubs) if (!r.rosters[c]) r.rosters[c] = newRoster(c, seededRand(`${c}:nuevo`));
    if (r.youth) for (const c of Object.keys(r.rosters)) if (!r.youth[c]) r.youth[c] = initialYouth({ ...r, rosters: { [c]: r.rosters[c] } })[c];
    for (const [club, ro] of Object.entries(r.rosters)) {
        const rb = seededRand(`${club}:cuerpos`);
        for (const p of ro) if (!p.b) p.b = makeBody(rb);
    }
    if (!r.youth) r.youth = initialYouth(r);
}

/** Versión actual de la carrera (2: plantel de 12, niveles desde el ranking, peso y altura). */
const CAREER_VERSION = 3;

const needsUpgrade = (r: CareerState) =>
    (r.cv ?? 0) < CAREER_VERSION ||
    AR_SEVEN_DIVISIONS.some((d) => d.branch === r.branch && !r.divisions[d.id]) || !r.youth || Object.values(r.rosters ?? {}).some((ro) => ro.length < SQUAD || ro.some((p) => p.id === undefined || p.ovr === undefined || !p.b));

/**
 * Lleva una carrera guardada a la versión actual, para que las partidas que ya
 * estaban vean todo lo nuevo: planteles de 12 con skills, peso y altura; el
 * nivel de cada club re-centrado en el ranking de clubes (lo jugado se
 * conserva en parte); y, si la temporada no empezó, la pretemporada. Si ya
 * está en juego, avisa las novedades y la franquicia puede llamar a alguien.
 */
function migrateCareer(s: TourState, r: CareerState) {
    upgradeCareer(r);
    if ((r.cv ?? 0) >= CAREER_VERSION) return;
    if ((r.cv ?? 0) >= 2) {
        // De la 2 a la 3: el sistema de ascensos de cada región.
        r.cv = CAREER_VERSION;
        pushNews(r, {
            kind: 'club',
            title: 'Nuevos ascensos y descensos',
            text: 'URBA: el 1.º sube y del 2.º al 5.º juegan un playoff por el otro lugar. Córdoba: Regional A y B con el Andino, y el Desarrollo. Litoral: liguilla. Patagonia: el Regional se arma con los torneos del sur. TDI B: repechaje con los que no tienen plaza.',
        });
        forget(r);
        return;
    }
    for (const [club, roster] of Object.entries(r.rosters ?? {})) {
        const mean = roster.reduce((a, p) => a + (p.ovr ?? 5), 0) / Math.max(1, roster.length);
        const delta = (centerOf(club) - 0.2 - mean) * 0.7;
        if (Math.abs(delta) < 0.05) continue;
        for (const p of roster) {
            p.ovr = capOvr((p.ovr ?? 5) + delta);
            if (p.s) p.s = p.s.map((v) => Math.round(clampN(v + delta, 1, 10))) as Player['s'];
        }
    }
    r.cv = CAREER_VERSION;
    const played = s.groupHistory.length + s.koHistory.length + (r.parallel ? r.parallel.groupHistory.length + r.parallel.koHistory.length : 0);
    if (r.phase === 'liga' && played === 0 && !r.pre) {
        startPreseason(r);
    } else if (!r.pre) {
        r.pre = { step: 'listo' };
        r.bajas ??= 0;
        pushNews(r, {
            kind: 'club',
            title: 'Novedades en el club',
            text: 'Ahora el plantel es de doce, con valoración, skills, peso y altura: armá tu siete en Plantel. Hay moral, cansancio, convocatorias y juveniles. La pretemporada llega al empezar el año que viene.',
        });
        if (r.phase === 'liga' && seasonClock(s) < 0.4) franchiseCall(r);
    }
    forget(r);
}

export const available = (p: Player) => !p.out;
/** Valoración con la moral encima (lo que rinde hoy). */
const formOvr = (p: Player) => (p.ovr ?? 5) + (p.m ?? 0) * 0.3;

/**
 * El siete de un club: los mejores disponibles, cada uno en el puesto que le
 * queda: el que mejor patea de apertura, los más rápidos afuera, los que más
 * tacklean adelante. Con `keep`, respeta los que eligió el usuario.
 */
export function autoLineup(roster: Player[], keep?: number[]): number[] {
    const ok = roster.filter(available);
    const byId = new Map(ok.map((p) => [p.id as number, p]));
    const slots: (number | null)[] = Array(7).fill(null);
    const used = new Set<number>();
    keep?.forEach((id, i) => {
        if (i < 7 && byId.has(id) && !used.has(id)) {
            slots[i] = id;
            used.add(id);
        }
    });
    const pool = ok.filter((p) => !used.has(p.id as number)).sort((a, b) => formOvr(b) - formOvr(a)).slice(0, 7 - used.size);
    const take = (score: (p: Player) => number) => {
        pool.sort((a, b) => score(b) - score(a));
        const p = pool.shift();
        return p ? (p.id as number) : null;
    };
    const order: [number, (p: Player) => number][] = [
        [4, (p) => (p.s?.[1] ?? 5) * 2 + formOvr(p)],
        [6, (p) => (p.s?.[0] ?? 5) * 2 + formOvr(p)],
        [5, (p) => (p.s?.[0] ?? 5) + (p.s?.[2] ?? 5) + formOvr(p)],
        [0, (p) => (p.s?.[2] ?? 5) * 2 + formOvr(p) + ((p.b?.[0] ?? 95) - 95) / 8],
        [2, (p) => (p.s?.[2] ?? 5) * 2 + formOvr(p) + ((p.b?.[0] ?? 95) - 95) / 8],
        [1, (p) => (p.s?.[2] ?? 5) + (p.s?.[3] ?? 5) + formOvr(p) + ((p.b?.[1] ?? 185) - 185) / 8],
        [3, (p) => (p.s?.[0] ?? 5) + (p.s?.[3] ?? 5) + formOvr(p)],
    ];
    for (const [slot, score] of order) if (slots[slot] === null) slots[slot] = take(score);
    // Si faltara gente (no debería: con 12 y tope de 3 bajas siempre hay 9), se repite el primero.
    const fallback = (roster[0]?.id as number) ?? 0;
    return slots.map((x) => x ?? fallback);
}

/** El siete del club del usuario: el que eligió, con los que no están reemplazados. */
export function myLineup(r: CareerState): number[] {
    return autoLineup(r.rosters?.[r.me] ?? [], r.lineup);
}

const lineupOf = (r: CareerState, club: string) => (club === r.me ? myLineup(r) : autoLineup(r.rosters?.[club] ?? []));

/** Un club de la máquina que juega dos torneos a la vez llega más cansado. */
const busy = (r: CareerState, club: string) => r.phase === 'liga' && Object.values(r.tiers ?? {}).some((t) => t?.includes(club));

/** Nivel de un club (escala 30-95) por su siete de hoy, con moral y cansancio. */
function rosterRating(r: CareerState, club: string): number | null {
    const roster = r.rosters?.[club];
    if (!roster?.length || roster[0].ovr === undefined) return null;
    const ids = lineupOf(r, club);
    const by = new Map(roster.map((p) => [p.id, p]));
    const avg = ids.reduce((a, id) => a + formOvr(by.get(id) ?? roster[0]), 0) / ids.length;
    const tired = club === r.me ? (r.fat ?? 0) * 1.5 : busy(r, club) ? 1.5 : 0;
    return ratingFromOvr(avg) - tired;
}

const boostCache = new WeakMap<CareerState, Record<string, number>>();
const slotCache = new WeakMap<CareerState, Record<string, number[]>>();
/** Lo que cambió el nivel de cada club: rendimiento (diluido) más lo que vale su plantel hoy. */
export function careerBoosts(r: CareerState): Record<string, number> {
    const hit = boostCache.get(r);
    if (hit) return hit;
    const out: Record<string, number> = { ...(r.ratings ?? {}) };
    for (const club of Object.keys(r.rosters ?? {})) {
        const rr = rosterRating(r, club);
        if (rr !== null) out[club] = (out[club] ?? 0) + rr - baseRatingOf(club);
    }
    boostCache.set(r, out);
    return out;
}

/** Quién juega en cada puesto de cada club: los goleadores se anotan por jugador. */
export function careerSlots(r: CareerState): Record<string, number[]> {
    const hit = slotCache.get(r);
    if (hit) return hit;
    const out: Record<string, number[]> = {};
    for (const club of Object.keys(r.rosters ?? {})) out[club] = lineupOf(r, club);
    slotCache.set(r, out);
    return out;
}

const forget = (r: CareerState) => {
    boostCache.delete(r);
    slotCache.delete(r);
};

const applyBoosts = (r: CareerState) => {
    setRatingBoost(careerBoosts(r));
    setCareerContext(careerSlots(r), HOME_ADV);
};

/** Lo que la pantalla tiene que fijar antes de jugar o simular dentro de una carrera. */
export const applyCareerContext = applyBoosts;

/** Nivel actual de un club dentro de la carrera, redondeado. */
export const careerRating = (r: CareerState, club: string) => {
    applyBoosts(r);
    return Math.round(ratingOf(club));
};

/** El nombre de un jugador de un club por su id (los que se fueron, por el nombre que quedó guardado). */
export function careerPlayerName(r: CareerState, team: SevenTeam, id: number): PlayerName {
    const p = r.rosters?.[team.id]?.find((x) => x.id === id);
    if (!p) {
        const gone = team.id === r.me ? r.legends?.[String(id)]?.[3] : undefined;
        if (gone) return nameFromText(gone);
        return defaultNames(team)[id] ?? nameFromSeed(team, `${team.id}:n${id}`);
    }
    if (p.name) return nameFromText(p.name);
    if (id < 7) return p.gen === 0 ? defaultNames(team)[id] : nameFromSeed(team, `${team.id}:${id}:${p.gen}`);
    return nameFromSeed(team, `${team.id}:n${id}`);
}

/** La cara de un jugador: siempre la misma para el mismo jugador del mismo club. */
export const playerLook = (club: string, id: number): Look => {
    const look = randomLook(seededRand(`${club}:cara:${id}`));
    return isFemClub(club) ? femLook(look) : look;
};

/** Los nombres de los siete de un club, en el orden de los puestos (para el partido). */
export function careerNames(r: CareerState, team: SevenTeam): PlayerName[] | null {
    if (!r.rosters?.[team.id]) return null;
    return lineupOf(r, team.id).map((id) => careerPlayerName(r, team, id));
}

/** Las skills de los siete de un club para el partido, con la moral y el cansancio de la temporada. */
export function careerSkills(r: CareerState, club: string): PlayerSkill[] | null {
    const roster = r.rosters?.[club];
    if (!roster?.length || !roster[0].s) return null;
    const by = new Map(roster.map((p) => [p.id, p]));
    const fat0 = club === r.me ? (r.fat ?? 0) * 0.6 : busy(r, club) ? 0.6 : 0;
    return lineupOf(r, club).map((id) => {
        const p = by.get(id) ?? roster[0];
        const m = (p.m ?? 0) * 0.3;
        const [spd, kick, tkl, sta] = p.s ?? [6, 6, 6, 6];
        return { spd: clampN(spd + m, 1, 10), kick: clampN(kick + m, 1, 10), tkl: clampN(tkl + m, 1, 10), sta, fat0, kg: p.b?.[0], cm: p.b?.[1] };
    });
}

export interface RosterRow {
    id: number;
    name: PlayerName;
    age: number;
    ovr: number;
    s: [number, number, number, number];
    m: number;
    out?: Player['out'];
    /** Peso (kg) y altura (cm). */
    b: [number, number];
    /** Puesto en el siete inicial (0 a 6), o null si es suplente. */
    slot: number | null;
}

/** El plantel del club del usuario, para mostrarlo y armar el siete. */
export function myRoster(r: CareerState): RosterRow[] {
    const team = arClubById(r.me);
    const roster = r.rosters?.[r.me];
    if (!team || !roster) return [];
    const lineup = myLineup(r);
    return roster.map((p) => {
        const id = p.id as number;
        const slot = lineup.indexOf(id);
        return { id, name: careerPlayerName(r, team, id), age: p.age, ovr: p.ovr ?? 5, s: p.s ?? [5, 5, 5, 5], m: p.m ?? 0, out: p.out, b: p.b ?? [95, 185], slot: slot >= 0 && available(p) ? slot : null };
    });
}

/** Cambia el nombre de un jugador del plantel propio. */
export function renamePlayer(s: TourState, id: number, text: string): TourState {
    const r = s.career;
    const roster = r?.rosters?.[r.me];
    if (!r || !roster?.some((p) => p.id === id)) return s;
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 40);
    const next = roster.map((p) => (p.id === id ? { ...p, name: clean || undefined } : p));
    return { ...s, career: { ...r, rosters: { ...r.rosters, [r.me]: next } } };
}

/** Pone a un jugador en un puesto del siete (si ya estaba en otro, intercambian). */
export function setLineupSlot(s: TourState, slot: number, id: number): TourState {
    const r = s.career;
    const p = r?.rosters?.[r.me]?.find((x) => x.id === id);
    if (!r || !p || !available(p) || slot < 0 || slot > 6) return s;
    const cur = myLineup(r);
    const next = [...cur];
    const was = cur.indexOf(id);
    if (was >= 0) next[was] = cur[slot];
    next[slot] = id;
    return { ...s, career: { ...r, lineup: next } };
}

/** Vuelve al siete que arma el cuerpo técnico (los mejores en su puesto). */
export function resetLineup(s: TourState): TourState {
    const r = s.career;
    if (!r) return s;
    return { ...s, career: { ...r, lineup: autoLineup(r.rosters?.[r.me] ?? []) } };
}

/** Un jugador nuevo de la cantera: sale de la camada de M19 del club. */
function fromYouth(r: CareerState, club: string, id: number): Player {
    const cam = r.youth?.[club]?.[3] ?? centerOf(club);
    return makePlayer(id, cam - 1.6 + Math.random() * 1.6, 18 + Math.floor(Math.random() * 3));
}

const nextId = (roster: Player[]) => Math.max(-1, ...roster.map((p) => p.id ?? 0)) + 1;

/** Guarda el nombre de un jugador que se va (para la historia del club). */
function archiveLegend(r: CareerState, id: number, name: string) {
    const row = r.legends?.[String(id)];
    if (row) row[3] = name;
}

/**
 * Un año más para todos: los jóvenes mejoran, los veteranos caen y se retiran,
 * los que se fueron a Europa no vuelven, y los lugares los llenan los de la
 * cantera (mejores cuanto mejor viene la camada de M19).
 */
function evolveRosters(r: CareerState) {
    const mine: string[] = [];
    const team = arClubById(r.me);
    for (const [club, roster] of Object.entries(r.rosters ?? {})) {
        const keep: Player[] = [];
        for (const p of roster) {
            const name = club === r.me && team ? careerPlayerName(r, team, p.id as number) : null;
            const full = name ? `${name.first} ${name.last}`.trim() : '';
            if (p.out?.kind === 'eur') {
                if (name) mine.push(`${full} se quedó en Europa.`);
                if (club === r.me) archiveLegend(r, p.id as number, full);
                continue;
            }
            p.age += 1;
            const o = p.ovr ?? 5;
            let d: number;
            if (p.age <= 22) d = rand(0.1, 0.8);
            else if (p.age <= 27) d = rand(-0.25, 0.4);
            else if (p.age <= 30) d = rand(-0.55, 0.15);
            else d = rand(-1.0, -0.1);
            if (d > 0 && o > 8) d *= 0.45; // arriba cuesta más
            // Cada club tira hacia su nivel de cantera: sin esto, con los años todos suben.
            d += (canteraOf(r, club) - 0.2 - o) * 0.14;
            p.ovr = capOvr(o + d);
            p.s = (p.s ?? makeSkills(p.ovr, Math.random)).map((v, k) => Math.round(clampN(v + d + (k === 0 && p.age > 29 ? -0.4 : 0) + (Math.random() - 0.5) * 0.8, 1, 10))) as Player['s'];
            p.m = 0;
            delete p.out;
            const retires = p.age >= 37 || (p.age >= 31 && Math.random() < (p.age - 30) * 0.22);
            if (retires) {
                if (name) mine.push(`Se retiró ${full} (${p.age} años).`);
                if (club === r.me) archiveLegend(r, p.id as number, full);
                continue;
            }
            keep.push(p);
        }
        while (keep.length < SQUAD) {
            const np = fromYouth(r, club, nextId([...roster, ...keep]));
            keep.push(np);
            if (club === r.me && team) {
                const n = careerPlayerName({ ...r, rosters: { ...r.rosters, [club]: keep } }, team, np.id as number);
                mine.push(`Sube de la cantera ${n.first} ${n.last} (${np.age} años, valoración ${(np.ovr ?? 0).toFixed(1)}).`);
            }
        }
        r.rosters![club] = keep;
    }
    if (r.lineup) r.lineup = autoLineup(r.rosters?.[r.me] ?? [], r.lineup);
    return mine;
}

/* ───────────────────────── franquicias, Europa y Pumas ───────────────────────── */

const CAPIBARAS_CORDOBA = new Set(['ar-jockey-club-villa-maria', 'ar-san-martin-de-villa-maria', 'ar-aero-club-rio-iv', 'ar-uru-cure-rugby-club']);

/** La franquicia del Super Rugby Américas que mira a los jugadores de un club. */
export function franchiseOf(club: string): string {
    if (CAPIBARAS_CORDOBA.has(club)) return 'Capibaras';
    const region = REGION_OF_CLUB[club];
    if (region === 'chile') return 'Selknam';
    if (region === 'uruguay') return 'Peñarol';
    if (region === 'brasil') return 'Cobras';
    if (region === 'espana' || region === 'femenino') return '';
    if (region === 'noa') return 'Tarucas';
    if (region === 'nea') return 'Yacaré XV';
    if (region === 'centro' || region === 'oeste') return 'Dogos XV';
    if (region === 'litoral') return 'Capibaras';
    return 'Pampas'; // URBA, Pampeana y Patagonia
}

const EUROPE = ['Bath', 'Toulouse', 'Clermont', 'Benetton', 'Exeter', 'Montpellier', 'Leicester', 'Zebre', 'Bayonne', 'Pau'];

const fullName = (r: CareerState, id: number) => {
    const team = arClubById(r.me);
    if (!team) return '';
    const n = careerPlayerName(r, team, id);
    return `${n.first} ${n.last}`.trim();
};

function pushNews(r: CareerState, n: Omit<CareerNews, 'season'>) {
    (r.news ??= []).push({ season: r.season, ...n });
    if (r.news.length > 40) {
        const drop = r.news.length - 40;
        r.news = r.news.slice(drop);
        r.newsSeen = Math.max(0, (r.newsSeen ?? 0) - drop);
    }
}

/** Saca a un jugador por un tiempo, si quedan bajas en la temporada. Devuelve si lo sacó. */
function takeOut(r: CareerState, p: Player, kind: OutKind, until: number, by?: string): boolean {
    if ((r.bajas ?? 0) >= MAX_BAJAS || p.out) return false;
    p.out = { kind, until, ...(by ? { by } : {}) };
    r.bajas = (r.bajas ?? 0) + 1;
    return true;
}

/** Arranque de temporada: la franquicia de la región puede llevarse a un joven muy bueno la primera mitad. */
function franchiseCall(r: CareerState) {
    const roster = r.rosters?.[r.me] ?? [];
    const cands = roster.filter((p) => p.age >= 19 && p.age <= 25 && (p.ovr ?? 0) >= 6.8 && !p.out).sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
    const p = cands[0];
    if (!p || Math.random() >= clampN(((p.ovr ?? 0) - 6.5) * 0.2, 0, 0.65)) return;
    const fr = franchiseOf(r.me);
    if (!fr || !takeOut(r, p, 'fra', 0.5, fr)) return;
    pushNews(r, {
        kind: 'fra', who: p.id,
        title: `${fr} convocó a ${fullName(r, p.id as number)}`,
        text: 'La franquicia del Super Rugby Américas se lo lleva para su temporada. Se pierde la primera mitad del año y vuelve con más rodaje.',
    });
}

/** El seleccionado del país del club. */
export function nationalTeamOf(club: string): string {
    const region = REGION_OF_CLUB[club];
    if (region === 'espana') return club.startsWith('ef-') ? 'Las Leonas' : 'Los Leones';
    if (region === 'femenino') return 'Las Yaguaretés';
    return region === 'chile' ? 'Los Cóndores' : region === 'uruguay' ? 'Los Teros' : region === 'brasil' ? 'Os Tupis' : 'Los Pumas';
}

/** Mitad de temporada: vuelven los de la franquicia, y a los muy buenos los pueden llamar los Pumas o un club de Europa. */
function midSeason(r: CareerState) {
    const roster = r.rosters?.[r.me] ?? [];
    for (const p of roster) {
        if (p.out?.kind === 'fra') {
            delete p.out;
            p.ovr = capOvr((p.ovr ?? 5) + 0.5);
            pushNews(r, { kind: 'back', who: p.id, title: `Volvió ${fullName(r, p.id as number)}`, text: `Terminó su temporada con ${franchiseOf(r.me)} y vuelve al club con medio punto más de valoración.` });
        }
    }
    if (r.midDone) return;
    r.midDone = true;
    const best = roster.filter((p) => !p.out).sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
    const puma = best.find((p) => p.age >= 20 && p.age <= 32 && (p.ovr ?? 0) >= 8.5);
    if (puma) {
        const o = puma.ovr ?? 0;
        const chance = o >= 9.5 ? 0.92 : clampN((o - 8.3) * 0.4, 0, 0.6);
        const nt = nationalTeamOf(r.me);
        // Fuera de la Argentina el seleccionado llama con un poco menos de nivel.
        const c2 = isArgBranch(r.branch) ? chance : clampN(chance + 0.15, 0, 0.95);
        if (Math.random() < c2 && takeOut(r, puma, 'pum', 2, nt)) {
            pushNews(r, { kind: 'pum', who: puma.id, title: `${nt} convocaron a ${fullName(r, puma.id as number)}`, text: 'Se va con el seleccionado lo que queda de la temporada. Vuelve el año que viene.' });
            return;
        }
    }
    const eur = best.find((p) => p.age >= 21 && p.age <= 30 && (p.ovr ?? 0) >= 7.8);
    if (eur && Math.random() < clampN(((eur.ovr ?? 0) - 7.5) * 0.15, 0, 0.35)) {
        const club = EUROPE[Math.floor(Math.random() * EUROPE.length)];
        if (takeOut(r, eur, 'eur', 2, club)) {
            pushNews(r, { kind: 'eur', who: eur.id, title: `${club} se llevó a ${fullName(r, eur.id as number)}`, text: 'Firmó en Europa: no termina la temporada con el club y no vuelve.' });
        }
    }
}

/** Los que ya cumplieron su lesión vuelven. */
function heal(r: CareerState, clock: number) {
    for (const p of r.rosters?.[r.me] ?? []) {
        if (p.out?.kind === 'inj' && p.out.until <= clock) {
            delete p.out;
            pushNews(r, { kind: 'back', who: p.id, title: `${fullName(r, p.id as number)} está de alta`, text: 'Se recuperó de la lesión y vuelve a estar a disposición.' });
        }
    }
}

/* ───────────────────────── juveniles y divisiones ───────────────────────── */

export const YOUTH_CATS = ['M15', 'M16', 'M17', 'M19'] as const;
const NAC_CATS: Record<number, string> = { 1: 'nac-m16', 2: 'nac-m17', 3: 'nac-m19' };
export const JUV_LABEL: Record<string, string> = { 'nac-m16': 'Nacional M16', 'nac-m17': 'Nacional M17', 'nac-m19': 'Nacional M19' };

/** La cantera de un club: de su nivel, más lo que invirtió el usuario si es el propio. */
const canteraOf = (r: CareerState, club: string) => centerOf(club) + (club === r.me ? r.invest ?? 0 : 0);

function initialYouth(r: CareerState): Record<string, [number, number, number, number]> {
    const out: Record<string, [number, number, number, number]> = {};
    for (const club of Object.keys(r.rosters ?? {})) {
        const rr = seededRand(`${club}:juveniles`);
        const c = canteraOf(r, club);
        out[club] = [0, 1, 2, 3].map(() => r1(clampN(c + gauss(rr) * 1.1, 1, 10))) as [number, number, number, number];
    }
    return out;
}

/** Cada año la camada sube de categoría (con un poco de cambio) y llega una nueva a M15. */
function ageYouth(r: CareerState) {
    const y = (r.youth ??= initialYouth(r));
    for (const club of Object.keys(r.rosters ?? {})) {
        const cur = y[club] ?? [5, 5, 5, 5];
        const drift = () => (Math.random() - 0.5) * 0.9;
        y[club] = [
            r1(clampN(canteraOf(r, club) + gauss(Math.random) * 1.1, 1, 10)),
            r1(clampN(cur[0] + drift(), 1, 10)),
            r1(clampN(cur[1] + drift(), 1, 10)),
            r1(clampN(cur[2] + drift(), 1, 10)),
        ];
    }
}

const REGIONS = [...new Set(AR_SEVEN_DIVISIONS.map((d) => d.region))];
const ARG_REGIONS = new Set(AR_SEVEN_DIVISIONS.filter((d) => isArgBranch(d.branch)).map((d) => d.region));
const REGION_LABEL: Record<string, string> = { urba: 'URBA', centro: 'Córdoba', litoral: 'Litoral', oeste: 'Cuyo', noa: 'NOA', nea: 'NEA', pampeana: 'Pampeana', patagonia: 'Patagonia' };
export const regionLabel = (region: string) => REGION_LABEL[region] ?? region;

/** Los clubes de una región (de su catálogo), sin repetir. */
const clubsOfRegion = (region: string) => [...new Set(AR_SEVEN_DIVISIONS.filter((d) => d.region === region).flatMap((d) => d.clubs))];

/**
 * El año de los juveniles: en cada categoría, la tabla de cada región sale de
 * la fuerza de las camadas más un poco de azar; en M16, M17 y M19 los campeones
 * de cada región juegan el nacional. Devuelve lo del club propio, más sus
 * divisiones de mayores (Intermedia, Pre A...).
 */
function youthSeason(r: CareerState): YouthRow[] {
    const rows: YouthRow[] = [];
    const myRegion = REGION_OF_CLUB[r.me];
    const arg = isArgBranch(r.branch);
    const regions = REGIONS.filter((reg) => (arg ? ARG_REGIONS.has(reg) : reg === myRegion));
    const camada = (club: string, k: number) => r.youth?.[club]?.[k] ?? r1(centerOf(club) + gauss(Math.random) * 1.1);
    YOUTH_CATS.forEach((cat, k) => {
        const champs: { club: string; v: number }[] = [];
        let myPlace = 0;
        let myOf = 0;
        for (const region of regions) {
            const table = clubsOfRegion(region)
                .map((club) => ({ club, v: camada(club, k) + gauss(Math.random) * 0.7 }))
                .sort((a, b) => b.v - a.v);
            if (table[0]) champs.push(table[0]);
            if (region === myRegion) {
                myPlace = table.findIndex((x) => x.club === r.me) + 1;
                myOf = table.length;
            }
        }
        const row: YouthRow = { cat, place: myPlace, of: myOf };
        const nacKey = arg ? NAC_CATS[k] : undefined;
        if (nacKey) {
            // Cuartos, semis y final entre los campeones regionales.
            let alive = [...champs].sort(() => Math.random() - 0.5);
            const fell = new Map<string, string>();
            const rounds = ['cuartos', 'semis', 'la final'];
            for (let ri = 0; alive.length > 1 && ri < 3; ri++) {
                const next: typeof alive = [];
                for (let i = 0; i < alive.length; i += 2) {
                    const a = alive[i];
                    const b = alive[i + 1];
                    if (!b) {
                        next.push(a);
                        continue;
                    }
                    const aw = a.v + gauss(Math.random) * 0.8 > b.v + gauss(Math.random) * 0.8;
                    next.push(aw ? a : b);
                    fell.set(aw ? b.club : a.club, rounds[ri]);
                }
                alive = next;
            }
            const champ = alive[0]?.club;
            if (champ) addChampion(r, nacKey, champ);
            row.champ = champ;
            if (champs.some((c) => c.club === r.me)) row.nac = champ === r.me ? 'Campeón' : `Perdió en ${fell.get(r.me) ?? 'cuartos'}`;
            else row.nac = 'No clasificó';
        }
        rows.push(row);
    });
    // Las divisiones de mayores: tantas como tiene un club de su tamaño, contra los de su misma división.
    const div = divisionOf(r, r.me) ?? '';
    const level = DIV[div]?.level ?? 5;
    const n = r.branch === 'urba' ? [0, 5, 4, 3, 3, 2, 2, 1][level] ?? 1 : !arg ? (level <= 1 ? 3 : 2) : level <= 2 ? 3 : level <= 5 ? 2 : 1;
    const names = ['Intermedia', 'Pre A', 'Pre B', 'Pre C', 'Pre D'].slice(0, n);
    const rivals = r.divisions[div] ?? [r.me];
    names.forEach((cat, k) => {
        const table = rivals
            .map((club) => ({ club, v: centerOf(club) + (r.ratings?.[club] ?? 0) / 6 + ((camada(club, 3) - centerOf(club)) * 0.4 * (k + 1)) / n + gauss(Math.random) * 0.9 }))
            .sort((a, b) => b.v - a.v);
        rows.push({ cat, place: table.findIndex((x) => x.club === r.me) + 1, of: table.length });
    });
    return rows;
}

/* ───────────────────────── después de cada fecha ───────────────────────── */

/** Qué parte de la temporada va (0 a 1) mirando los torneos del club; fuera de la fase regular, 1. */
const clockOf = (s: TourState) => (s.career?.phase === 'liga' ? seasonClock(s) : 1);

/**
 * Cierra la fecha del club en la carrera: el resultado en el torneo (closeRound)
 * y lo que deja en el plantel: moral, cansancio, alguna lesión, el historial
 * contra el rival y los números de cada jugador. Fuera de una carrera es
 * closeRound y nada más. `misses`: ids de los que erraron conversiones.
 */
export function careerRound(s: TourState, mine: [number, number] | null, events?: ScoreEvent[], misses: number[] = []): TourState {
    const opp = nextOpponent(s);
    if (s.career) applyBoosts(s.career);
    const next = closeRound(s, mine, events);
    if (!next.career) return next;
    const r = next.career; // closeRound ya lo clonó
    upgradeCareer(r);
    const roster = r.rosters?.[r.me] ?? [];
    const lineup = myLineup(r);
    if (opp && mine) {
        const [us, them] = mine;
        // Historial contra el rival.
        const h = ((r.h2h ??= {})[opp] ??= [0, 0, 0, 0, 0, 0, 0, 0]);
        if (us > them) h[0] += 1;
        else if (us === them) h[1] += 1;
        else h[2] += 1;
        h[3] += us;
        h[4] += them;
        h[5] = r.season;
        h[6] = us;
        h[7] = them;
        // Los números de cada jugador en el club, partido a partido.
        const myEvents = (events?.length ? events : scoreEvents(r.me, us)).filter((e) => e.team === r.me);
        const L = (r.legends ??= {});
        for (const id of lineup) (L[String(id)] ??= [0, 0, 0])[2] += 1;
        for (const e of myEvents) {
            const row = (L[String(e.slot)] ??= [0, 0, 0]);
            if (e.kind === 'try') row[0] += 1;
            row[1] += e.kind === 'try' ? 5 : e.kind === 'conv' ? 2 : 3;
        }
        // Moral: el resultado, el que apoyó y el pateador que erra.
        const by = new Map(roster.map((p) => [p.id, p]));
        const delta = us > them ? 0.4 : us < them ? -0.4 : 0;
        for (const p of roster) p.m = r1(clampN((p.m ?? 0) * 0.85 + (lineup.includes(p.id as number) ? delta : delta / 2), -2, 2));
        for (const e of myEvents) {
            const p = by.get(e.slot);
            if (p) p.m = r1(clampN((p.m ?? 0) + (e.kind === 'try' ? 0.4 : 0.1), -2, 2));
        }
        for (const id of misses) {
            const p = by.get(id);
            if (p) p.m = r1(clampN((p.m ?? 0) - 0.35, -2, 2));
        }
        // Cansancio: jugar los dos torneos a la vez pesa el doble.
        const two = !!r.parallel && !r.parallel.done;
        r.fat = r1(clampN((r.fat ?? 0) + (two ? 0.42 : 0.22), 0, 2));
        // Alguna lesión de partido (cuenta para el tope de bajas).
        if (Math.random() < 0.06) {
            const id = lineup[Math.floor(Math.random() * lineup.length)];
            const p = by.get(id);
            const dates = 2 + Math.floor(Math.random() * 3);
            if (p && takeOut(r, p, 'inj', clockOf(next) + dates * 0.07)) {
                pushNews(r, { kind: 'inj', who: id, title: `Lesión de ${fullName(r, id)}`, text: `Se golpeó en el partido y se pierde unas ${dates} fechas.` });
            }
        }
    } else if (!opp) {
        // Fecha libre: descanso.
        r.fat = r1(clampN((r.fat ?? 0) - 0.5, 0, 2));
    }
    const clock = clockOf(next);
    heal(r, clock);
    if (r.phase === 'liga' && clock >= 0.5) midSeason(r);
    if (r.lineup) r.lineup = autoLineup(roster, r.lineup);
    return next;
}

/** El cartel de antes del partido: cómo te fue contra este rival. */
export function headToHead(r: CareerState, opp: string): string | null {
    const h = r.h2h?.[opp];
    if (!h) return null;
    const n = h[0] + h[1] + h[2];
    const pl = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;
    return `Jugaste ${n === 1 ? 'una vez' : `${n} veces`} contra ${nm(opp)}: ${pl(h[0], 'ganado')}, ${pl(h[1], 'empatado')}, ${pl(h[2], 'perdido')}. La última, ${h[6]}-${h[7]} en ${h[5]}.`;
}

/** Los récords del club en toda la carrera: máximo anotador, máximo tryman y el de más partidos. */
export function clubRecords(r: CareerState): { label: string; name: string; n: string }[] {
    const team = arClubById(r.me);
    const L = Object.entries(r.legends ?? {});
    if (!team || !L.length) return [];
    const name = (id: string) => {
        const n = careerPlayerName(r, team, Number(id));
        return `${n.first} ${n.last}`.trim();
    };
    const top = (k: 0 | 1 | 2) => [...L].sort((a, b) => b[1][k] - a[1][k])[0];
    const out: { label: string; name: string; n: string }[] = [];
    const pts = top(1);
    if (pts && pts[1][1] > 0) out.push({ label: 'Máximo anotador', name: name(pts[0]), n: `${pts[1][1]} puntos` });
    const tr = top(0);
    if (tr && tr[1][0] > 0) out.push({ label: 'Máximo tryman', name: name(tr[0]), n: `${tr[1][0]} tr${tr[1][0] === 1 ? 'y' : 'ies'}` });
    const pj = top(2);
    if (pj && pj[1][2] > 0) out.push({ label: 'Más partidos', name: name(pj[0]), n: `${pj[1][2]} partido${pj[1][2] === 1 ? '' : 's'}` });
    return out;
}

/** Las noticias que todavía no se mostraron. */
export const unseenNews = (r: CareerState) => (r.news ?? []).slice(r.newsSeen ?? 0);

export function markNewsSeen(s: TourState): TourState {
    const r = s.career;
    if (!r) return s;
    return { ...s, career: { ...r, newsSeen: r.news?.length ?? 0 } };
}

/* ───────────────────────── pretemporada ───────────────────────── */

/** La pretemporada está pendiente: antes del primer partido del año. */
export const inPreseason = (r: CareerState) => !!r.pre && r.pre.step !== 'listo' && r.phase === 'liga';

export const TRAIN_ODDS = { up: 60, same: 25, inj: 15 };

/** El punto de la pretemporada: a los juveniles (la cantera) o a la primera (descanso y moral). */
export function preseasonPoint(s: TourState, punto: 'juveniles' | 'primera'): TourState {
    const r0 = s.career;
    if (!r0 || r0.pre?.step !== 'punto') return s;
    const r: CareerState = JSON.parse(JSON.stringify(r0));
    if (punto === 'juveniles') {
        r.invest = r1((r.invest ?? 0) + 0.3);
        const y = r.youth?.[r.me];
        if (y) r.youth![r.me] = y.map((v) => r1(clampN(v + 0.5, 1, 10))) as [number, number, number, number];
    } else {
        r.fat = 0;
        for (const p of r.rosters?.[r.me] ?? []) p.m = r1(clampN((p.m ?? 0) + 1, -2, 2));
    }
    r.pre = { ...r.pre!, step: 'entreno', punto };
    return { ...s, career: r };
}

/** Entrenar a tres: cada uno puede subir un punto, quedar igual o lesionarse. */
export function preseasonTrain(s: TourState, ids: number[]): TourState {
    const r0 = s.career;
    if (!r0 || r0.pre?.step !== 'entreno') return s;
    const r: CareerState = JSON.parse(JSON.stringify(r0));
    const trained: { id: number; result: 'up' | 'same' | 'inj' }[] = [];
    for (const id of ids.slice(0, 3)) {
        const p = r.rosters?.[r.me]?.find((x) => x.id === id);
        if (!p || p.out) continue;
        const x = Math.random() * 100;
        if (x < TRAIN_ODDS.up) {
            p.ovr = capOvr((p.ovr ?? 5) + 1);
            const k = Math.floor(Math.random() * 4);
            if (p.s) p.s[k] = Math.min(10, p.s[k] + 1);
            trained.push({ id, result: 'up' });
        } else if (x < TRAIN_ODDS.up + TRAIN_ODDS.inj && takeOut(r, p, 'inj', 0.5)) {
            trained.push({ id, result: 'inj' });
            pushNews(r, { kind: 'inj', who: id, title: `Lesión de ${fullName(r, id)} en la pretemporada`, text: 'Se lesionó entrenando: se pierde la primera mitad de la temporada.' });
        } else {
            trained.push({ id, result: 'same' });
        }
    }
    r.pre = { ...r.pre!, step: 'amistosos', trained };
    if (r.lineup) r.lineup = autoLineup(r.rosters?.[r.me] ?? [], r.lineup);
    return { ...s, career: r };
}

/** Un amistoso de pretemporada: ganarlo sube la moral de todos; perderlo la baja y arriesga una lesión. */
export function preseasonFriendly(s: TourState, opp: string, score: [number, number]): TourState {
    const r0 = s.career;
    if (!r0 || r0.pre?.step !== 'amistosos') return s;
    const r: CareerState = JSON.parse(JSON.stringify(r0));
    const roster = r.rosters?.[r.me] ?? [];
    const won = score[0] > score[1];
    for (const p of roster) p.m = r1(clampN((p.m ?? 0) + (won ? 2 : -1), -2, 2));
    if (!won && Math.random() < 0.35) {
        const lineup = myLineup(r);
        const id = lineup[Math.floor(Math.random() * lineup.length)];
        const p = roster.find((x) => x.id === id);
        if (p && takeOut(r, p, 'inj', 0.25)) pushNews(r, { kind: 'inj', who: id, title: `Lesión de ${fullName(r, id)} en el amistoso`, text: 'Se pierde el primer cuarto de la temporada.' });
    }
    const friendlies = [...(r.pre?.friendlies ?? []), { opp, us: score[0], them: score[1] }];
    r.pre = { ...r.pre!, friendlies, step: friendlies.length >= 2 ? 'listo' : 'amistosos' };
    if (r.lineup) r.lineup = autoLineup(roster, r.lineup);
    return { ...s, career: r };
}

/** Terminar la pretemporada (sin amistosos, o después de uno). */
export function preseasonDone(s: TourState): TourState {
    const r = s.career;
    if (!r?.pre) return s;
    return { ...s, career: { ...r, pre: { ...r.pre, step: 'listo' } } };
}

/** Arranca la pretemporada del año (y la convocatoria de la franquicia). */
function startPreseason(r: CareerState) {
    r.pre = { step: 'punto' };
    r.bajas = 0;
    r.midDone = false;
    r.fat = 0;
    franchiseCall(r);
}

/* ───────────────────────── definiciones ───────────────────────── */

/** Las dos zonas del Desarrollo de Córdoba con los clubes de este año (el que baja del Súper 9 va a la más chica). */
function cbaZones(clubs: string[]): string[][] {
    const z = CBA_DESARROLLO_ZONES.map((zone) => clubs.filter((c) => zone.includes(c)));
    for (const c of clubs) if (!z.some((g) => g.includes(c))) (z[0].length <= z[1].length ? z[0] : z[1]).push(c);
    return z.filter((g) => g.length);
}

function leagueDef(divId: string, clubs: string[], season: number): TourDef {
    const base = { id: `career-${divId}-${season}`, name: `${divisionLabel(divId)} ${season}`, sub: 'Modo carrera.', source: 'real' as const, clubs: true, cat: 'Argentina', teams: [...clubs] };
    if (divId === 'ar-centro-desarrollo') {
        const zones = cbaZones(clubs);
        if (zones.length === 2) return { ...base, formatLabel: 'Dos zonas (Capital-Este y Sur-Centro) a una rueda · final entre los ganadores', stage: { kind: 'grupos', groups: zones, advance: 1 } };
    }
    // Uruguay: Apertura a una rueda con semifinales y final (el Clausura y la superfinal son copas).
    if (divId === 'uy-uruguayo') {
        return { ...base, name: `Uruguayo de Clubes · Apertura ${season}`, formatLabel: 'Apertura a una rueda · semifinales y final · después, el Clausura y la superfinal', stage: { kind: 'grupos', groups: 1, advance: 4, legs: 1 } };
    }
    // España: la División de Honor B en grupos, con cuadro entre los ganadores.
    if (divId === 'es-dhb') {
        return { ...base, formatLabel: 'Cuatro grupos a dos ruedas · los ganadores juegan semifinales y final: el campeón sube', stage: { kind: 'grupos', groups: 4, advance: 1, legs: 2 } };
    }
    // Brasil: Super 12 en tres grupos de cuatro (a dos ruedas). Después, Hexagonal y final, o Repescagem.
    if (divId === 'br-super12' || divId === 'br-segunda') {
        const after = divId === 'br-super12' ? 'los 2 primeros de cada grupo al Hexagonal (y los 2 mejores, a la final); el resto, a la Repescagem' : 'los 2 primeros de cada grupo, a la Repescagem por un lugar en la Primeira';
        return { ...base, formatLabel: `Tres grupos de cuatro a dos ruedas · ${after}`, stage: { kind: 'grupos', groups: 3, advance: 2, legs: 2, noKo: true } };
    }
    // URBA (menos el Top 14): el primero de la tabla es el campeón y sube; del 2.º al 5.º, playoff por el otro ascenso.
    if (DIV[divId]?.branch === 'urba' && divId !== 'ar-urba-top14') {
        const rule = swapsFrom(divId) === 2 ? 'el 1.º es campeón y sube; del 2.º al 5.º, playoff por el otro ascenso' : 'el 1.º es campeón y sube';
        return { ...base, formatLabel: `Fase regular a dos vueltas · ${rule}`, stage: { kind: 'grupos', groups: 1, advance: 1, legs: 2, noKo: true } };
    }
    // Córdoba: los dos primeros van directo a semifinales y del 3.º al 6.º juegan cuartos.
    const top = divId === 'ar-centro-top10' ? 6 : clubs.length >= 6 ? 4 : 2;
    const fase = top === 6 ? 'cuartos y semifinales con los 6 primeros (1.º y 2.º, libres)' : `${top === 4 ? 'semifinales' : 'final'} con los ${top} primeros`;
    return {
        id: `career-${divId}-${season}`,
        name: `${divisionLabel(divId)} ${season}`,
        sub: 'Modo carrera.',
        source: 'real',
        clubs: true,
        cat: 'Argentina',
        teams: [...clubs],
        formatLabel: `Fase regular a dos vueltas · ${fase}`,
        stage: { kind: 'grupos', groups: 1, advance: top, legs: 2 },
    };
}

const tierDef = (t: TierId, teams: string[], season: number): TourDef => ({
    id: `career-tier-${t}-${season}`,
    name: `${TIER_NAME[t]} ${season}`,
    sub: 'Modo carrera.',
    source: 'real',
    clubs: true,
    cat: 'Argentina',
    teams,
    formatLabel: '4 zonas de 4 a dos ruedas · 1.º y 2.º a cuartos · 3.º y 4.º al repechaje',
    stage: { kind: 'grupos', groups: 4, advance: 2, legs: 2 },
});

const legacyTdiDef = (which: 'A' | 'B', teams: string[], season: number): TourDef => ({
    ...tierDef(which === 'A' ? 'tdiA' : 'tdiB', teams, season),
    id: `career-tdi-${which}-${season}`,
    stage: { kind: 'grupos', groups: 4, advance: 2 },
});

const promoDef = (p: Promo, season: number): TourDef => ({
    id: `career-promo-${p.up}-${season}`,
    name: `Promoción ${divisionLabel(p.up)} ${season}`,
    sub: `El último del ${divisionLabel(p.up)} contra el ${p.via ?? `campeón del ${divisionLabel(p.down)}`}.`,
    source: 'real',
    clubs: true,
    cat: 'Argentina',
    teams: [p.bottom, p.top],
    formatLabel: 'Partido único · el que gana juega arriba',
    stage: { kind: 'ko' },
});

const plazaDef = (d: Dispute, kind: 'rep' | 'rev', m: PlazaMatch, season: number): TourDef => ({
    id: `career-${kind}-${d.up}-${d.outside ? 'afuera-' : ''}${season}`,
    name: d.outside ? `Repechaje del Torneo del Interior B ${season}` : kind === 'rep' ? `Repechaje del ${TIER_NAME[d.up]} ${season}` : `Reválida ${TIER_NAME[d.up]} – ${TIER_NAME[d.low].replace('Torneo del Interior', 'TDI').replace('Nacional de Clubes', 'Nacional')} ${season}`,
    sub: d.outside ? 'El último de una zona contra el mejor sin plaza de otra región: el que gana deja la plaza en su región.' : kind === 'rep' ? 'El 3.º contra el 4.º de otra zona: el que pierde va a la reválida.' : 'El que gana deja la plaza en su región para el año que viene.',
    source: 'real',
    clubs: true,
    cat: 'Argentina',
    teams: [m.a, m.b],
    formatLabel: 'Partido único',
    stage: { kind: 'ko' },
});

function nacionalDef(n: NonNullable<CareerState['pending']['nacional']>, season: number): TourDef {
    const base = { id: `career-nacional-${season}`, name: `Nacional de Clubes ${season}`, source: 'real' as const, clubs: true, cat: 'Argentina', teams: n.teams };
    if (n.format === 'grupos8' && n.groups) {
        return { ...base, sub: 'Los cuatro primeros de la URBA y del TDI A.', formatLabel: 'Dos zonas de 4 · semifinales y final', stage: { kind: 'grupos', groups: n.groups, advance: 2 } };
    }
    return {
        ...base,
        sub: n.format === 'semis' ? 'Campeón contra subcampeón del otro lado.' : 'Campeón del Top 14 contra campeón del TDI A.',
        formatLabel: n.format === 'semis' ? 'Semifinales cruzadas y final' : 'Final única',
        stage: { kind: 'ko' },
    };
}

/** El Nacional armado como torneo (con los cruces fijos de las semifinales). */
function nacionalTour(n: NonNullable<CareerState['pending']['nacional']>, season: number, me: string, difficulty: Difficulty, duration: Duration): TourState {
    const def = nacionalDef(n, season);
    const t = { ...createTour(def, me, difficulty, duration), def };
    if (n.alive) t.alive = [...n.alive];
    return t;
}

/** ¿Este estado es un torneo federal de la carrera (Nacional A/B o TDI)? */
export const isTierTour = (t: TourState) => {
    const id = t.def?.id ?? t.tourId;
    return id.startsWith('career-tier-') || id.startsWith('career-tdi-');
};
const tierOfTour = (t: TourState): TierId | null => {
    const id = t.def?.id ?? t.tourId;
    const m = /^career-tier-(nacA|nacB|tdiA|tdiB)-/.exec(id);
    if (m) return m[1] as TierId;
    const l = /^career-tdi-(A|B)-/.exec(id);
    return l ? (l[1] === 'A' ? 'tdiA' : 'tdiB') : null;
};

function stage(r: CareerState, def: TourDef, difficulty: Difficulty, duration: Duration): TourState {
    return { ...createTour(def, r.me, difficulty, duration), def, career: r };
}

const emptyPending = (): CareerState['pending'] => ({ moves: [], regional: {}, tdi: null, nacionalRival: null, cupoDelta: {}, note: [] });

/* ───────────────────────── clasificación a los federales ───────────────────────── */

/** Orden de una primera regional para repartir plazas: su tabla del año, o el nivel si todavía no hay. */
function regionalOrder(r: CareerState, source: string, regional: Record<string, string[]>): string[] {
    if (r.branch === 'interior') return regional[source]?.length ? regional[source] : [...(r.divisions[source] ?? [])].sort(byRating);
    return [...(DIV[source]?.clubs ?? [])].sort(byRating);
}

/** Tabla del Top 14 que reparte las plazas de la URBA en el formato A/B. */
function urbaOrderFor(r: CareerState, urbaOrder?: string[]): string[] {
    if (urbaOrder?.length) return urbaOrder;
    if (r.branch === 'urba') return [...(r.divisions['ar-urba-top14'] ?? [])].sort(byRating);
    return [...(DIV['ar-urba-top14']?.clubs ?? [])].sort(byRating);
}

/** Reparto inicial de plazas A/B: los clubes del interior ordenados por nivel, 8 + 10 + 16 + 16. */
function initialCuposAB(r: CareerState): CupoAB[] {
    const all = r.cupos.flatMap((c) => regionalOrder(r, c.source, {}).map((club) => ({ club, region: c.region })));
    all.sort((a, b) => byRating(a.club, b.club));
    const sizes = [8, 10, 16, 16];
    const tierOf = (i: number): number => (i < sizes[0] ? 0 : i < sizes[0] + sizes[1] ? 1 : i < sizes[0] + sizes[1] + sizes[2] ? 2 : i < 50 ? 3 : -1);
    const out: CupoAB[] = r.cupos.map((c) => ({ region: c.region, source: c.source, n: [0, 0, 0, 0] }));
    all.forEach((x, i) => {
        const t = tierOf(i);
        const row = out.find((o) => o.region === x.region);
        if (t >= 0 && row) row.n[t] += 1;
    });
    return out;
}

/** Quiénes juegan cada nivel federal con un formato, unas plazas y unas tablas. */
function tierFields(r: CareerState, fmt: NacFormat, cupos: Cupo[], cuposAB: CupoAB[] | undefined, regional: Record<string, string[]>, urbaOrder?: string[]): Tiers {
    if (fmt !== 'ab') {
        const A: string[] = [];
        const B: string[] = [];
        for (const c of cupos) {
            const order = regionalOrder(r, c.source, regional);
            A.push(...order.slice(0, c.tdiA));
            B.push(...order.slice(c.tdiA, c.tdiA + c.tdiB));
        }
        return { tdiA: A.slice(0, 16), tdiB: B.slice(0, 16) };
    }
    const ab = cuposAB ?? initialCuposAB(r);
    const out: Record<TierId, string[]> = { nacA: [], nacB: [], tdiA: [], tdiB: [] };
    const ids: TierId[] = ['nacA', 'nacB', 'tdiA', 'tdiB'];
    for (const c of ab) {
        const order = regionalOrder(r, c.source, regional);
        let from = 0;
        c.n.forEach((k, t) => {
            out[ids[t]].push(...order.slice(from, from + k));
            from += k;
        });
    }
    const urba = urbaOrderFor(r, urbaOrder);
    out.nacA = [...urba.slice(0, 8), ...out.nacA];
    out.nacB = [...urba.slice(8, 14), ...out.nacB];
    for (const t of ids) out[t] = out[t].slice(0, 16);
    return out;
}

const tiersOf = (r: CareerState): Tiers => r.tiers ?? (r.tdi ? { tdiA: r.tdi.A, tdiB: r.tdi.B } : {});
const myTier = (r: CareerState): TierId | null => {
    const t = tiersOf(r);
    return (['nacA', 'nacB', 'tdiA', 'tdiB'] as TierId[]).find((k) => t[k]?.includes(r.me)) ?? null;
};

/* ───────────────────────── arranque de temporada ───────────────────────── */

/** Arranca la temporada: la división en pantalla, el federal en paralelo y todo lo demás a la par. */
function seasonStart(r: CareerState, difficulty: Difficulty, duration: Duration): TourState {
    startPreseason(r);
    forget(r);
    applyBoosts(r);
    const div = divisionOf(r, r.me) ?? Object.keys(r.divisions)[0];
    const tiers = tiersOf(r);
    const mineTier = myTier(r);
    const parallel = mineTier && tiers[mineTier] ? { ...createTour(tierDef(mineTier, tiers[mineTier]!, r.season), r.me, difficulty, duration), def: tierDef(mineTier, tiers[mineTier]!, r.season) } : null;
    const others = buildOthers(r);
    return stage({ ...r, parallel, others, phase: 'liga', settled: null }, leagueDef(div, [...r.divisions[div]].sort(byRating), r.season), difficulty, duration);
}

/** Los torneos que se juegan a la par del club: las otras divisiones, los federales y las primeras de otros países. */
function buildOthers(r: CareerState): Record<string, TourState> {
    const div = divisionOf(r, r.me) ?? Object.keys(r.divisions)[0];
    const tiers = tiersOf(r);
    const mineTier = myTier(r);
    const others: Record<string, TourState> = {};
    const add = (key: string, def: TourDef) => {
        const t: TourState = { ...createTour(def, '__nadie', 'normal', 3), def };
        delete t.stats; // los goleadores se llevan en los torneos del club
        others[key] = t;
    };
    for (const d of Object.keys(r.divisions)) if (d !== div && r.divisions[d].length >= 2) add(`div:${d}`, leagueDef(d, [...r.divisions[d]].sort(byRating), r.season));
    for (const t of TIERS_OF[formatOf(r, r.season)]) if (t !== mineTier && (tiers[t]?.length ?? 0) >= 2) add(`tier:${t}`, tierDef(t, tiers[t]!, r.season));
    // La primera de los otros países: se juega a la par y se puede mirar (no cruza con la carrera, salvo en el Sudamericano).
    const mine = countryOf(r.branch);
    if (mine) for (const [c, d] of Object.entries(COUNTRY_TOP)) if (c !== mine && DIV[d]) add(`ext:${d}`, leagueDef(d, [...DIV[d].clubs].sort(byRating), r.season));
    return others;
}

/** Partidas guardadas antes de los torneos en paralelo: se arman una vez, se ponen al día y se guardan. */
export function ensureOthers(s: TourState): TourState | null {
    if (!s.career || s.career.phase !== 'liga' || s.career.others) return null;
    return advanceOthers(withOthers(s));
}

function withOthers(s: TourState): TourState {
    const r = s.career;
    if (!r || r.phase !== 'liga' || r.others) return s;
    return { ...s, career: { ...r, others: buildOthers(r) } };
}

/** Arranca la carrera con el club elegido, en su división de 2026. */
export function createCareer(meId: string, difficulty: Difficulty, duration: Duration, coach?: string): TourState {
    setRatingBoost({});
    const home = AR_SEVEN_DIVISIONS.find((d) => d.clubs.includes(meId));
    const branch: Branch = home?.branch ?? 'urba';
    const divisions: Record<string, string[]> = {};
    for (const d of AR_SEVEN_DIVISIONS) if (d.branch === branch) divisions[d.id] = [...d.clubs].sort(byRating);
    const rosters: Record<string, Player[]> = {};
    for (const clubs of Object.values(divisions)) for (const c of clubs) rosters[c] = newRoster(c);
    const r: CareerState = {
        v: 1, me: meId, branch, season: 2026, phase: 'liga', divisions,
        cupos: isArgBranch(branch) ? AR_SEVEN_CUPOS.map((c) => ({ region: c.region, source: c.sourceCompetitionId, tdiA: c.tdiA, tdiB: c.tdiB })) : [],
        nacFormat: { '2026': 'final', '2027': 'final' },
        coach: coach?.trim().slice(0, 40) || undefined,
        champions: {},
        ratings: {}, rosters, awards: [], settled: null, parallel: null,
        pending: emptyPending(), history: [], log: [],
    };
    // 2026: los federales los juegan los de más nivel de cada regional, con las plazas de fábrica.
    r.tiers = isArgBranch(branch) ? tierFields(r, 'final', r.cupos, undefined, {}) : {};
    r.youth = initialYouth(r);
    r.cv = CAREER_VERSION;
    return seasonStart(r, difficulty, duration);
}

/* ───────────────────────── avance en paralelo ───────────────────────── */

/** Cuántas fechas tiene un torneo en total (fase de grupos más rondas de cuadro). */
function totalDates(t: TourState): number {
    const def = defOf(t);
    let ko = 0;
    if (def?.stage.kind === 'ko') ko = Math.ceil(Math.log2(Math.max(2, def.teams.length)));
    else if (t.hasKo && def?.stage.kind === 'grupos') ko = Math.ceil(Math.log2(Math.max(2, def.stage.advance * t.groups.length + (def.stage.bestThirds ?? 0))));
    return Math.max(1, t.rounds.length + ko);
}

/** En qué punto de la temporada cae la próxima fecha de un torneo (0 a 1). */
const nextDateAt = (t: TourState) => (t.groupHistory.length + t.koHistory.length + 0.5) / totalDates(t);

/**
 * Elige qué torneo se juega ahora entre los dos de la temporada (el de la
 * fecha más temprana) y hace avanzar los demás hasta la misma altura.
 */
export function careerTick(s0: TourState): TourState {
    const s = advanceOthers(withOthers(s0));
    const r = s.career;
    const o = r?.parallel;
    if (!r || !o || o.done) return s;
    if (!s.done && nextDateAt(s) <= nextDateAt(o)) return s;
    const cur: TourState = { ...s };
    delete cur.career;
    return { ...o, difficulty: s.difficulty, duration: s.duration, career: { ...r, parallel: cur } };
}

/** Qué parte de la temporada ya jugó el club (0 a 1), mirando sus dos torneos. */
function seasonClock(s: TourState): number {
    const mine = [s, ...(s.career?.parallel ? [s.career.parallel] : [])];
    const live = mine.filter((t) => !t.done);
    return live.length ? Math.max(...live.map((t) => (t.groupHistory.length + t.koHistory.length) / totalDates(t))) : 1;
}

function advanceOthers(s: TourState): TourState {
    const r = s.career;
    if (!r?.others || r.phase !== 'liga') return s;
    const clock = seasonClock(s);
    let changed = false;
    const others: Record<string, TourState> = {};
    applyBoosts(r);
    for (const [k, t0] of Object.entries(r.others)) {
        let t = t0;
        for (let guard = 0; guard < 60 && !t.done && nextDateAt(t) <= clock; guard++) t = closeRound(t, null);
        if (t !== t0) changed = true;
        others[k] = t;
    }
    return changed ? { ...s, career: { ...r, others } } : s;
}

function finish(t: TourState): TourState {
    let x = t;
    for (let guard = 0; guard < 200 && !x.done; guard++) x = closeRound(x, null);
    return x;
}

/** Los otros torneos de la temporada, para mirarlos: los federales y la región del club primero. */
export function otherTours(s: TourState): { key: string; name: string; state: TourState }[] {
    const r = s.career;
    if (!r) return [];
    // Lo que ya se jugó después de la fase regular: playoffs, promociones, plazas, Nacional, Sudamericano.
    const ARC_ORDER = ['nacional', 'sudamericano', 'plazas', 'promos'];
    const archived = Object.entries(r.archive ?? {})
        .map(([key, state]) => ({ key: `arc:${key}`, name: defOf(state)?.name ?? key, state }))
        .sort((a, b) => {
            const ia = ARC_ORDER.indexOf(a.key.slice(4));
            const ib = ARC_ORDER.indexOf(b.key.slice(4));
            return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib) || a.name.localeCompare(b.name);
        });
    if (!r.others) return archived;
    const myRegion = DIV[divisionOf(r, r.me) ?? '']?.region;
    const order = ['nacA', 'nacB', 'tdiA', 'tdiB'];
    const rank = (k: string): [number, string, number] => {
        if (k.startsWith('tier:')) return [0, '', order.indexOf(k.slice(5))];
        const d = DIV[k.slice(4)];
        return [d?.region === myRegion ? 1 : 2, d?.region ?? '', d?.level ?? 9];
    };
    return Object.entries(r.others)
        .map(([key, state]) => ({ key, name: (defOf(state)?.name ?? key).replace(/ \d{4}$/, ''), state }))
        .sort((a, b) => {
            const [ra, ga, la] = rank(a.key);
            const [rb, gb, lb] = rank(b.key);
            return ra - rb || ga.localeCompare(gb) || la - lb || a.name.localeCompare(b.name);
        })
        .concat(archived);
}

/** El otro torneo que se juega en paralelo, para mirarlo (con la carrera puesta). */
export function parallelView(s: TourState): TourState | null {
    const o = s.career?.parallel;
    return o ? { ...o, career: s.career } : null;
}

/** La división y el federal de la temporada, estén en pantalla o en paralelo. */
function seasonTours(s: TourState): { regional: TourState; tier: TourState | null } {
    const o = s.career?.parallel ?? null;
    if (isTierTour(s)) return { regional: o ?? s, tier: s };
    return { regional: s, tier: o };
}

/* ───────────────────────── cierre de la fase regular ───────────────────────── */

/** Cuántos suben de esta división a la de arriba (y cuántos bajan de allá), en la URBA. */
const swapsFrom = (divId: string) => (divId !== 'ar-urba-tercera' && divId !== 'ar-urba-desarrollo' ? 2 : 1);

/** Anota el campeón de una competición en la historia de esta carrera (y, si es el club propio, para festejar). */
function addChampion(r: CareerState, key: string, club: string | null | undefined) {
    if (!club) return;
    const list = ((r.champions ??= {})[key] ??= []);
    if (list.some(([season]) => season === r.season)) return;
    list.push([r.season, club]);
    if (club === r.me && !JUV_LABEL[key]) (r.pending.wins ??= []).push(palmaresLabel(key));
}

const addBonus = (r: CareerState, club: string | null | undefined, v: number) => {
    if (!club) return;
    const b = (r.pending.bonus ??= {});
    b[club] = (b[club] ?? 0) + v;
};

/** Goleadores y tryman de un torneo, con los nombres de este año. */
function awardsOf(r: CareerState, t: TourState, comp: string) {
    const name = (team: string, id: number) => {
        const club = arClubById(team);
        if (!club) return '—';
        const n = careerPlayerName(r, club, id);
        return `${n.first} ${n.last}`.trim();
    };
    const map = (by: 'tries' | 'points') => topStats(t.stats, by, 5).map((x) => ({ name: name(x.team, x.slot), club: x.team, n: by === 'tries' ? x.tries : x.points }));
    const tries = map('tries');
    const points = map('points');
    if (tries.length || points.length) (r.awards ??= []).push({ season: r.season, comp, tries, points });
}

/** Cierra la fase regular y los federales: simula el resto y decide qué viene. */
function settleLiga(s: TourState, r: CareerState) {
    r.archive = {};
    const { regional, tier } = seasonTours(s);
    const fmt = formatOf(r, r.season);
    const myDiv = divisionOf(r, r.me) ?? '';
    if (r.others) for (const k of Object.keys(r.others)) r.others[k] = finish(r.others[k]);

    const rankings: Record<string, string[]> = {};
    for (const divId of Object.keys(r.divisions)) {
        const other = r.others?.[`div:${divId}`];
        rankings[divId] = divId === myDiv ? finalRanking(regional) : other ? finalRanking(other) : finalRanking(finish({ ...createTour(leagueDef(divId, r.divisions[divId], r.season), '__nadie', 'normal', 3) }));
    }
    r.pending.rankings = rankings;
    for (const divId of Object.keys(rankings)) {
        if (divId === 'br-super12' || divId === 'uy-uruguayo') continue; // el campeón sale de la final (o de la superfinal)
        addBonus(r, rankings[divId][0], 1);
        addChampion(r, divId, rankings[divId][0]);
    }
    r.history.push({ season: r.season, division: myDiv, place: rankings[myDiv].indexOf(r.me) + 1, note: '' });
    awardsOf(r, regional, divisionLabel(myDiv));

    // Ascensos y descensos.
    r.pending.cups = [];
    r.pending.myCup = null;
    r.pending.promos = [];
    r.pending.myPromo = null;
    if (r.branch === 'urba') {
        const moves: CareerState['pending']['moves'] = [];
        for (const divId of Object.keys(r.divisions)) {
            const up = DIV[divId]?.promotesTo;
            const rk = rankings[divId] ?? [];
            if (!up || !r.divisions[up] || !rk.length) continue;
            const n = swapsFrom(divId);
            // El campeón (el 1.º de la tabla) sube; bajan los últimos de arriba.
            moves.push({ club: rk[0], from: divId, to: up });
            for (const club of (rankings[up] ?? []).slice(-n)) moves.push({ club, from: up, to: divId });
            // Del 2.º al 5.º juegan el playoff por el otro ascenso.
            if (n === 2 && rk.length >= 5) {
                addCup(r, { key: `asc:${divId}`, name: `Playoff por el ascenso · ${divisionLabel(divId)}`, sub: `Del 2.º al 5.º: el que gana sube al ${divisionLabel(up)}.`, teams: [rk[1], rk[4], rk[2], rk[3]], kind: 'ko' });
            }
        }
        r.pending.moves = moves;
        const mine = moves.find((m) => m.club === r.me);
        if (mine) r.pending.note.push(`${DIV[mine.from]?.promotesTo === mine.to ? 'Campeón y ascenso' : 'Descenso'}: el año que viene, ${divisionLabel(mine.to)}.`);
        r.pending.urbaOrder = rankings['ar-urba-top14'];
        resolveCups(r);
    } else if (!isArgBranch(r.branch)) {
        foreignRules(r, rankings);
    } else {
        cordobaRules(r, rankings);
        litoralRules(r, rankings);
        patagoniaRules(r, rankings);
        const promos: Promo[] = r.pending.promos;
        for (const up of Object.keys(r.divisions)) {
            if (CUSTOM_UPS.has(up)) continue;
            const lowers = Object.keys(r.divisions)
                .filter((d) => DIV[d]?.promotesTo === up)
                .sort((a, b) => (DIV[a]?.level ?? 0) - (DIV[b]?.level ?? 0) || a.localeCompare(b));
            const upper = rankings[up] ?? [];
            lowers.forEach((down, i) => {
                const top = rankings[down]?.[0];
                const bottom = upper[upper.length - 1 - i];
                if (top && bottom && top !== bottom) promos.push({ up, down, top, bottom });
            });
        }
        r.pending.promos = promos;
        promos.forEach((p) => {
            if (!p.winner && p.top !== r.me && p.bottom !== r.me) resolvePromo(r, p, simulate(p.bottom, p.top, true));
        });
        promos.forEach((p, i) => {
            if (p.winner || (p.top !== r.me && p.bottom !== r.me)) return;
            markMyPromo(r, p, i);
        });
        resolveCups(r);
        for (const cupo of r.cupos) r.pending.regional[cupo.source] = rankings[cupo.source] ?? [];
        // El Top 14 de este año (para el Nacional y las plazas de la URBA en el formato A/B).
        r.pending.urbaOrder = finalRanking(finish(createTour(leagueDef('ar-urba-top14', [...(DIV['ar-urba-top14']?.clubs ?? [])].sort(byRating), r.season), '__nadie', 'normal', 3)));
        addChampion(r, 'ar-urba-top14', r.pending.urbaOrder[0]);
    }

    // Los federales: el del club tal como lo jugó, los otros como corrieron.
    const states: Partial<Record<TierId, TourState>> = {};
    const tiers = tiersOf(r);
    for (const t of TIERS_OF[fmt]) {
        const mineT = tier && tierOfTour(tier) === t ? tier : null;
        const st = mineT ?? r.others?.[`tier:${t}`] ?? ((tiers[t]?.length ?? 0) >= 2 ? finish(createTour(tierDef(t, tiers[t]!, r.season), '__nadie', 'normal', 3)) : null);
        if (st) states[t] = st;
    }
    for (const [t, st] of Object.entries(states) as [TierId, TourState][]) {
        if (st.champion) {
            addBonus(r, st.champion, t === 'nacA' ? 3 : t === 'tdiA' || t === 'nacB' ? 2 : 1.5);
            r.log.push(`${r.season}: ${nm(st.champion)} campeón del ${TIER_NAME[t]}.`);
            // En el formato A/B el Nacional A es el Nacional de Clubes y el B, el Nacional B.
            addChampion(r, t === 'nacA' ? 'nacional' : t === 'nacB' ? 'nacionalB' : t, st.champion);
        }
    }
    if (tier) {
        const t = tierOfTour(tier);
        if (t) {
            const place = finalRanking(tier).indexOf(r.me) + 1;
            r.pending.tierResult = { tier: t, place, champion: tier.champion === r.me };
            r.pending.note.push(tier.champion === r.me ? `Campeón del ${TIER_NAME[t]}.` : `${TIER_NAME[t]}: terminaste ${place}.º.`);
            awardsOf(r, tier, TIER_NAME[t]);
            if (t === 'nacA' && tier.champion === r.me) r.pending.note.push('Campeón argentino de clubes.');
        }
    }

    // Disputas de plazas entre niveles seguidos.
    const order = TIERS_OF[fmt];
    const disputes: Dispute[] = [];
    for (let i = 0; i + 1 < order.length; i++) {
        const up = states[order[i]];
        const low = states[order[i + 1]];
        if (!up || !low || up.groups.length < 4) continue;
        const zone = (gi: number, pos: number) => groupStandings(up, gi)[pos]?.team;
        const rep: PlazaMatch[] = [
            [0, 1],
            [1, 0],
            [2, 3],
            [3, 2],
        ]
            .map(([g3, g4]) => ({ a: zone(g3, 2), b: zone(g4, 3) }))
            .filter((m): m is PlazaMatch => !!m.a && !!m.b);
        const semis = low.koHistory.find((h) => h.results.length === 2)?.results.flatMap((x) => [x.a, x.b]) ?? [];
        disputes.push({ up: order[i], low: order[i + 1], rep, rev: null, semis });
    }
    if (states.tdiB) {
        const out = tdiBOutside(r, states.tdiB, rankings);
        if (out) disputes.push(out);
    }
    r.pending.disputes = disputes;
    resolveDisputes(r);

    // El Nacional de Clubes (en el formato A/B, el campeón es el del Nacional A). Las carreras de afuera no lo tienen.
    if (!isArgBranch(r.branch)) {
        r.pending.nacional = null;
    } else if (fmt === 'ab') {
        const champ = states.nacA?.champion;
        if (champ) r.log.push(`${r.season}: ${nm(champ)} campeón argentino (Nacional A).`);
        r.pending.nacional = null;
    } else {
        const urba = r.pending.urbaOrder ?? urbaOrderFor(r);
        const inter = states.tdiA ? finalRanking(states.tdiA) : [];
        const n = fmt === 'final' ? 1 : fmt === 'semis' ? 2 : 4;
        const U = urba.slice(0, n);
        const I = inter.slice(0, n);
        if (U.length === n && I.length === n) {
            const nac: NonNullable<CareerState['pending']['nacional']> = { format: fmt, teams: [...U, ...I] };
            if (fmt === 'semis') nac.alive = [U[0], I[1], I[0], U[1]];
            if (fmt === 'grupos8') nac.groups = [[U[0], U[3], I[1], I[2]], [I[0], I[3], U[1], U[2]]];
            if (fmt === 'final') nac.alive = [U[0], I[0]];
            r.pending.nacional = nac;
            if (nac.teams.includes(r.me)) r.pending.note.push(`Clasificaste al Nacional de Clubes (${NAC_FORMATS.find((f) => f.id === fmt)?.label.toLowerCase()}).`);
            else {
                const sim = finish(nacionalTour(nac, r.season, '__nadie', 'normal', 3));
                archiveTour(r, 'nacional', sim);
                nac.champion = sim.champion ?? undefined;
                addChampion(r, 'nacional', sim.champion);
                addBonus(r, sim.champion, 2);
                if (sim.champion) r.log.push(`${r.season}: ${nm(sim.champion)} campeón del Nacional de Clubes.`);
            }
        }
    }

    // Lo que dejó esta tabla para los federales del año que viene.
    previewNext(r);
}

/* ───────────────────────── reglas de cada región ───────────────────────── */

/** Divisiones de arriba con reglas propias (no la promoción genérica campeón contra último). */
const CUSTOM_UPS = new Set(['ar-centro-top10', 'ar-centro-super9b', 'ar-litoral-top10', 'ar-patagonia-regional']);

/** Nombres de las copas para el palmarés. */
export const CUP_LABEL: Record<string, string> = { 'cba-regA': 'Regional A de Córdoba', 'cba-regB': 'Regional B de Córdoba', sudamericano: 'Sudamericano de Clubes', 'nacional-fem': 'Nacional de Clubes Femenino' };

function addCup(r: CareerState, c: Cup) {
    if (c.teams.length >= 2) (r.pending.cups ??= []).push(c);
}

const cupDef = (c: Cup, season: number): TourDef => ({
    id: `career-cup-${c.key}-${season}`,
    name: `${c.name} ${season}`,
    sub: c.sub,
    source: 'real',
    clubs: true,
    cat: 'Argentina',
    teams: [...c.teams],
    formatLabel: c.kind === 'ko' ? 'Eliminación directa' : c.kind === 'grupos' ? 'Grupos a una rueda · pasan los dos primeros de cada uno' : 'Todos contra todos, a una rueda',
    stage: c.kind === 'ko' ? { kind: 'ko', fixed: true } : c.kind === 'grupos' && c.groups ? { kind: 'grupos', groups: c.groups, advance: c.advance ?? 2, noKo: !c.ko } : { kind: 'liga', legs: 1 },
});

/** Juega las copas que no son del usuario y deja anotada la suya. */
function resolveCups(r: CareerState) {
    (r.pending.cups ?? []).forEach((c, i) => {
        if (c.champion) return;
        if (c.teams.includes(r.me)) {
            r.pending.myCup ??= i;
            if (r.pending.myCup === i) r.pending.note.push(`Jugás el ${c.name}.`);
            return;
        }
        applyCup(r, c, finish(createTour(cupDef(c, r.season), '__nadie', 'normal', 3)));
    });
}

/** Lo que deja una copa terminada: ascensos, la promoción del campeón del Regional A, títulos. */
function applyCup(r: CareerState, c: Cup, t: TourState) {
    const order = finalRanking(t);
    const w = t.champion ?? order[0];
    if (!w) return;
    archiveTour(r, `cup:${c.key}`, t);
    c.champion = w;
    c.ranking = order;
    if (c.key === 'br-hex') {
        // Los dos mejores del Hexagonal juegan la final del Super 12.
        const fin: Cup = { key: 'br-final', name: 'Final del Super 12', sub: 'Los dos mejores del Hexagonal.', teams: order.slice(0, 2), kind: 'ko' };
        const list = (r.pending.cups ??= []);
        list.push(fin);
        if (fin.teams.includes(r.me)) {
            r.pending.myCup = list.length - 1;
            r.pending.note.push('Jugás la final del Super 12.');
        } else applyCup(r, fin, finish(createTour(cupDef(fin, r.season), '__nadie', 'normal', 3)));
        return;
    }
    if (c.key === 'uy-clausura') {
        // Si el campeón del Clausura es el mismo del Apertura, es el campeón uruguayo; si no, superfinal.
        const ap = r.pending.rankings?.['uy-uruguayo']?.[0];
        r.log.push(`${r.season}: ${nm(w)} campeón del Clausura uruguayo.`);
        if (!ap || ap === w) {
            addChampion(r, 'uy-uruguayo', w);
            r.log.push(`${r.season}: ${nm(w)} ganó el Apertura y el Clausura: campeón uruguayo.`);
            return;
        }
        const fin: Cup = { key: 'uy-final', name: 'Superfinal uruguaya', sub: 'El campeón del Apertura contra el del Clausura.', teams: [ap, w], kind: 'ko' };
        const list = (r.pending.cups ??= []);
        list.push(fin);
        if (fin.teams.includes(r.me)) {
            r.pending.myCup = list.length - 1;
            r.pending.note.push('Jugás la superfinal uruguaya.');
        } else applyCup(r, fin, finish(createTour(cupDef(fin, r.season), '__nadie', 'normal', 3)));
        return;
    }
    if (c.key === 'uy-final') {
        addChampion(r, 'uy-uruguayo', w);
        addBonus(r, w, 2);
        r.log.push(`${r.season}: ${nm(w)} campeón uruguayo (superfinal).`);
        return;
    }
    if (c.key === 'nac-fem') {
        addChampion(r, 'nacional-fem', w);
        addBonus(r, w, 2);
        r.log.push(`${r.season}: ${nm(w)} campeón del Nacional de Clubes Femenino.`);
        return;
    }
    if (c.key === 'br-final') {
        addChampion(r, 'br-super12', w);
        addBonus(r, w, 2);
        r.log.push(`${r.season}: ${nm(w)} campeón del Super 12.`);
        return;
    }
    if (c.key === 'br-rep') {
        // Los dos primeros de cada grupo juegan la Primeira; el resto, la Segunda.
        const up = new Set(order.slice(0, 6));
        for (const club of c.teams) {
            const inPrimera = r.divisions['br-super12']?.includes(club);
            if (inPrimera && !up.has(club)) r.pending.moves.push({ club, from: 'br-super12', to: 'br-segunda' });
            if (!inPrimera && up.has(club)) r.pending.moves.push({ club, from: 'br-segunda', to: 'br-super12' });
        }
        if (c.teams.includes(r.me)) r.pending.note.push(up.has(r.me) ? 'Repescagem: el año que viene, Primeira Divisão.' : 'Repescagem: el año que viene, Segunda Divisão.');
        return;
    }
    if (c.key.startsWith('asc:')) {
        const div = c.key.slice(4);
        const up = DIV[div]?.promotesTo;
        if (up) r.pending.moves.push({ club: w, from: div, to: up });
        r.log.push(`${r.season}: ${nm(w)} ganó el ${c.name.toLowerCase()} y sube al ${divisionLabel(up ?? '')}.`);
        if (w === r.me) r.pending.note.push(`Ganaste el playoff: el año que viene, ${divisionLabel(up ?? '')}.`);
        return;
    }
    if (c.key === 'cba-regA' || c.key === 'cba-regB') {
        addChampion(r, c.key, w);
        r.log.push(`${r.season}: ${nm(w)} campeón del ${CUP_LABEL[c.key]}.`);
        if (c.key === 'cba-regA') {
            const top = r.pending.rankings?.['ar-centro-top10'] ?? [];
            const bottom = top[top.length - 1];
            const from = divisionOf(r, w) ?? 'ar-centro-super9b';
            if (bottom && bottom !== w) {
                const p: Promo = { up: 'ar-centro-top10', down: from, top: w, bottom, bottomTo: homeSecond(bottom), via: 'campeón del Regional A de Córdoba' };
                const list = (r.pending.promos ??= []);
                list.push(p);
                if (p.top === r.me || p.bottom === r.me) markMyPromo(r, p, list.length - 1);
                else resolvePromo(r, p, simulate(p.bottom, p.top, true));
            }
        }
        return;
    }
    if (c.key === 'lit-liguilla') {
        const top = r.pending.rankings?.['ar-litoral-top10'] ?? [];
        const pen = top[top.length - 2];
        if (w !== pen) {
            r.pending.moves.push({ club: w, from: 'ar-litoral-segunda', to: 'ar-litoral-top10' }, { club: pen, from: 'ar-litoral-top10', to: 'ar-litoral-segunda' });
            r.log.push(`${r.season}: ${nm(w)} ganó la liguilla del Litoral y sube al Top 10; ${nm(pen)} baja.`);
        } else r.log.push(`${r.season}: ${nm(pen)} ganó la liguilla y se queda en el Top 10.`);
    }
}

/** El partido del usuario en una promoción: queda pendiente y lo avisa. */
function markMyPromo(r: CareerState, p: Promo, i: number) {
    if (r.pending.myPromo !== null && r.pending.myPromo !== undefined) return;
    r.pending.myPromo = i;
    const rival = p.top === r.me ? p.bottom : p.top;
    r.pending.note.push(
        p.top === r.me
            ? `Jugás la promoción contra ${nm(rival)} por un lugar en el ${divisionLabel(p.up)}.`
            : `Último: jugás la promoción contra ${nm(rival)} para no bajar.`,
    );
}

/** Si un club del Top 10 de Córdoba baja, a dónde: los andinos vuelven al Andino, el resto al Súper 9. */
const homeSecond = (club: string) => (DIV['ar-noa-andina']?.clubs.includes(club) ? 'ar-noa-andina' : 'ar-centro-super9b');

/**
 * Córdoba: los 4 mejores del Súper 9 y del Andino juegan el Regional A (el
 * campeón juega la promoción con el último del Top 10); del 5.º al 8.º, el
 * Regional B. El último del Súper 9 juega el repechaje contra el campeón del
 * Desarrollo de Córdoba.
 */
function cordobaRules(r: CareerState, rankings: Record<string, string[]>) {
    const s9 = rankings['ar-centro-super9b'] ?? [];
    const an = rankings['ar-noa-andina'] ?? [];
    if (s9.length >= 4 && an.length >= 4) {
        addCup(r, { key: 'cba-regA', name: 'Regional A de Córdoba', sub: 'Los 4 mejores del Súper 9 y del Andino: el campeón juega la promoción con el último del Top 10.', teams: [s9[0], an[3], an[1], s9[2], an[0], s9[3], s9[1], an[2]], kind: 'ko' });
        addCup(r, { key: 'cba-regB', name: 'Regional B de Córdoba', sub: 'Del 5.º al 8.º del Súper 9 y del Andino.', teams: [...s9.slice(4, 8), ...an.slice(4, 8)], kind: 'liga' });
    } else {
        // Sin Andino (partidas raras): el campeón del Súper 9 juega directo la promoción.
        const top = rankings['ar-centro-top10'] ?? [];
        if (s9[0] && top.length) r.pending.promos!.push({ up: 'ar-centro-top10', down: 'ar-centro-super9b', top: s9[0], bottom: top[top.length - 1] });
    }
    const des = rankings['ar-centro-desarrollo'] ?? [];
    const last = s9[s9.length - 1];
    if (des[0] && last && s9.length >= 6) r.pending.promos!.push({ up: 'ar-centro-super9b', down: 'ar-centro-desarrollo', top: des[0], bottom: last, via: 'campeón del Desarrollo de Córdoba' });
}

/**
 * Litoral: el campeón de la Segunda sube y el último del Top 10 baja. El
 * penúltimo del Top 10 juega una liguilla con el 2.º, 3.º y 4.º de la Segunda:
 * el que la gana juega arriba. Hasta dos suben y dos bajan.
 */
function litoralRules(r: CareerState, rankings: Record<string, string[]>) {
    const top = rankings['ar-litoral-top10'] ?? [];
    const seg = rankings['ar-litoral-segunda'] ?? [];
    if (top.length < 4 || seg.length < 4) return;
    r.pending.moves.push({ club: seg[0], from: 'ar-litoral-segunda', to: 'ar-litoral-top10' }, { club: top[top.length - 1], from: 'ar-litoral-top10', to: 'ar-litoral-segunda' });
    if (seg[0] === r.me) r.pending.note.push('Campeón de la Segunda: el año que viene, Top 10 del Litoral.');
    if (top[top.length - 1] === r.me) r.pending.note.push('Último: el año que viene, Segunda del Litoral.');
    addCup(r, { key: 'lit-liguilla', name: 'Liguilla del Litoral', sub: 'El penúltimo del Top 10 con el 2.º, 3.º y 4.º de la Segunda: el que gana juega en el Top 10.', teams: [top[top.length - 2], seg[1], seg[2], seg[3]], kind: 'liga' });
}

/** De qué torneo del sur es cada club del Regional Patagónico, para volver cuando no clasifica. */
const PAT_HOME: Record<string, string> = {
    Trelew: 'ar-patagonia-austral', 'Bigornia Club': 'ar-patagonia-austral', Chenque: 'ar-patagonia-austral', 'Deportivo Portugués': 'ar-patagonia-austral',
    Roca: 'ar-patagonia-alto-valle', 'Neuquén': 'ar-patagonia-alto-valle', Marabunta: 'ar-patagonia-alto-valle', 'Las Águilas': 'ar-patagonia-tdf',
};
const PAT_FEEDERS = ['ar-patagonia-alto-valle', 'ar-patagonia-austral', 'ar-patagonia-tdf', 'ar-patagonia-santacruz'];

/**
 * El Regional Patagónico se arma con los torneos del sur: se quedan los 4
 * mejores del año, y los otros 4 lugares son de los campeones de Alto Valle,
 * Austral, Tierra del Fuego y Santa Cruz. Los que no siguen vuelven a su torneo.
 */
function patagoniaRules(r: CareerState, rankings: Record<string, string[]>) {
    const reg = rankings['ar-patagonia-regional'] ?? [];
    if (reg.length < 6) return;
    const champs = PAT_FEEDERS.map((f) => [f, rankings[f]?.[0]] as const).filter((x): x is readonly [string, string] => !!x[1]);
    const out = reg.slice(reg.length - champs.length);
    for (const club of out) {
        const cat = AR_SEVEN_DIVISIONS.find((d) => d.id !== 'ar-patagonia-regional' && d.clubs.includes(club))?.id;
        const home = cat ?? PAT_HOME[nm(club)] ?? 'ar-patagonia-austral';
        r.pending.moves.push({ club, from: 'ar-patagonia-regional', to: r.divisions[home] ? home : 'ar-patagonia-austral' });
        if (club === r.me) r.pending.note.push(`No seguís en el Regional Patagónico: el año que viene, ${divisionLabel(home)}.`);
    }
    for (const [f, club] of champs) {
        r.pending.moves.push({ club, from: f, to: 'ar-patagonia-regional' });
        if (club === r.me) r.pending.note.push('Campeón: el año que viene jugás el Regional Patagónico.');
    }
}

/**
 * TDI B: el último de cada zona juega un repechaje contra el mejor sin plaza
 * de otra región (el siguiente en la tabla de su regional). El que gana deja
 * la plaza en su región para el año que viene.
 */
function tdiBOutside(r: CareerState, b: TourState, rankings: Record<string, string[]>): Dispute | null {
    if (b.groups.length < 4) return null;
    const lasts = b.groups.map((_, gi) => groupStandings(b, gi).at(-1)?.team).filter((x): x is string => !!x);
    const inTiers = new Set(Object.values(tiersOf(r)).flatMap((x) => x ?? []));
    const ch: string[] = [];
    for (const c of r.cupos) {
        if (c.region === 'urba') continue;
        const order = rankings[c.source]?.length ? rankings[c.source] : regionalOrder(r, c.source, {});
        const next = order.find((x) => !inTiers.has(x));
        if (next) ch.push(next);
    }
    ch.sort(byRating);
    const n = Math.min(lasts.length, ch.length);
    if (!n) return null;
    return { up: 'tdiB', low: 'tdiB', rep: [], rev: Array.from({ length: n }, (_, i) => ({ a: lasts[i], b: ch[i] })), semis: [], outside: true };
}

/**
 * Las ligas de afuera. Chile (ARUSA): el campeón sube y el último baja en cada
 * escalón. Uruguay: una sola división. Brasil: los 2 primeros de cada grupo del
 * Super 12 van al Hexagonal (los 2 mejores, a la final); los otros 6 juegan la
 * Repescagem con los 6 mejores de la Segunda, por los 6 lugares que quedan.
 */
function foreignRules(r: CareerState, rankings: Record<string, string[]>) {
    if (r.branch === 'uruguay') {
        const ap = rankings['uy-uruguayo'] ?? [];
        if (ap.length >= 4) {
            r.log.push(`${r.season}: ${nm(ap[0])} campeón del Apertura uruguayo.`);
            addCup(r, { key: 'uy-clausura', name: 'Clausura uruguayo', sub: 'La vuelta del Apertura, con semifinales y final: su campeón juega la superfinal.', teams: [...ap], kind: 'grupos', groups: [[...ap]], advance: 4, ko: true });
        }
    }
    if (r.branch === 'fem') {
        // El Nacional de Clubes Femenino: los 2 mejores del Top 9 de la URBA y del Centro, más los de las otras regiones.
        const top = rankings['af-urba-top9'] ?? [];
        const cen = rankings['af-centro'] ?? [];
        const teams = [...top.slice(0, 2), ...cen.slice(0, 2), ...FEM_GUEST_IDS].sort(byRating);
        if (teams.length >= 8) {
            const groups: string[][] = [[], [], [], []];
            teams.slice(0, 12).forEach((club, i) => groups[Math.floor(i / 4) % 2 ? 3 - (i % 4) : i % 4].push(club));
            addCup(r, { key: 'nac-fem', name: 'Nacional de Clubes Femenino', sub: 'Los 2 mejores de la URBA y del Centro, y los de las otras regiones: cuatro zonas, semifinales y final.', teams: groups.flat(), kind: 'grupos', groups, advance: 1, ko: true });
        }
    }
    if (r.branch === 'chile' || r.branch === 'espana' || r.branch === 'espanaFem' || r.branch === 'fem') {
        for (const divId of Object.keys(r.divisions)) {
            const up = DIV[divId]?.promotesTo;
            const rk = rankings[divId] ?? [];
            const upper = up ? rankings[up] ?? [] : [];
            if (!up || !rk.length || !upper.length) continue;
            r.pending.moves.push({ club: rk[0], from: divId, to: up }, { club: upper[upper.length - 1], from: up, to: divId });
            if (rk[0] === r.me) r.pending.note.push(`Campeón y ascenso: el año que viene, ${divisionLabel(up)}.`);
            if (upper[upper.length - 1] === r.me) r.pending.note.push(`Último: el año que viene, ${divisionLabel(divId)}.`);
        }
    }
    if (r.branch === 'brasil') {
        const p = rankings['br-super12'] ?? [];
        const s = rankings['br-segunda'] ?? [];
        if (p.length >= 8) addCup(r, { key: 'br-hex', name: 'Hexagonal del Super 12', sub: 'Los 2 primeros de cada grupo: los 2 mejores juegan la final.', teams: p.slice(0, 6), kind: 'liga' });
        const rep = [...p.slice(6), ...s.slice(0, 6)].sort(byRating);
        if (rep.length >= 6) {
            // Grupos parejos: en serpentina por nivel.
            const groups: string[][] = [[], [], []];
            rep.forEach((club, i) => groups[Math.floor(i / 3) % 2 ? 2 - (i % 3) : i % 3].push(club));
            addCup(r, { key: 'br-rep', name: 'Repescagem', sub: 'Los 6 de abajo de la Primeira y los 6 mejores de la Segunda: los 2 primeros de cada grupo juegan la Primeira.', teams: rep, kind: 'grupos', groups });
        }
    }
    resolveCups(r);
}

/* ───────────────────────── Sudamericano de Clubes ───────────────────────── */

/** La primera de cada país (en la Argentina, el campeón sale del Nacional de Clubes). */
const COUNTRY_TOP: Record<string, string> = { ar: 'ar-urba-top14', uy: 'uy-uruguayo', br: 'br-super12', cl: 'cl-top10' };
const countryOf = (b: Branch) => (isArgBranch(b) ? 'ar' : b === 'uruguay' ? 'uy' : b === 'brasil' ? 'br' : b === 'chile' ? 'cl' : null);
const champOf = (r: CareerState, key: string) => r.champions?.[key]?.find(([season]) => season === r.season)?.[1] ?? null;

/** El campeón del año de un país: el de la carrera, o el de su primera jugada a la par. */
function countryChampion(r: CareerState, c: string): string | null {
    if (c === countryOf(r.branch)) {
        if (c === 'ar') return champOf(r, 'nacional') ?? champOf(r, r.branch === 'urba' ? 'ar-urba-top14' : 'tdiA');
        return champOf(r, COUNTRY_TOP[c]);
    }
    const div = COUNTRY_TOP[c];
    const t = r.others?.[`ext:${div}`] ?? (DIV[div] ? finish(createTour(leagueDef(div, [...DIV[div].clubs].sort(byRating), r.season), '__nadie', 'normal', 3)) : null);
    return t ? finalRanking(t.done ? t : finish(t))[0] ?? null : null;
}

/** Los cuatro del Sudamericano, cruzados: Argentina contra Chile y Brasil contra Uruguay. */
function sudTeams(r: CareerState): string[] | null {
    if (!countryOf(r.branch)) return null;
    const t = ['ar', 'cl', 'br', 'uy'].map((c) => countryChampion(r, c));
    return t.every(Boolean) && new Set(t).size === 4 ? (t as string[]) : null;
}

const sudDef = (teams: string[], season: number): TourDef => ({
    id: `career-sudamericano-${season}`,
    name: `Sudamericano de Clubes ${season}`,
    sub: 'Los campeones de Argentina, Uruguay, Brasil y Chile.',
    source: 'real',
    clubs: true,
    cat: 'Argentina',
    teams,
    formatLabel: 'Semifinales y final',
    stage: { kind: 'ko', fixed: true },
});

function applySud(r: CareerState, w: string | null | undefined) {
    const sud = r.pending.sud;
    if (!sud || !w) return;
    sud.champion = w;
    addChampion(r, 'sudamericano', w);
    addBonus(r, w, 2);
    r.log.push(`${r.season}: ${nm(w)} campeón del Sudamericano de Clubes.`);
}

/** Si el club del usuario se ganó el Sudamericano de este año y todavía no se jugó: sus rivales. */
export function sudamericanoFor(s: TourState): string[] | null {
    const r = settleCareer(s).career;
    if (!r || !closesSeason(s) || r.phase === 'sudam' || r.pending.sud?.champion) return null;
    const teams = r.pending.sud?.teams ?? sudTeams(r);
    return teams?.includes(r.me) ? teams : null;
}

/** Lo que dice el calendario sobre cómo se sube y se baja en una división. */
function ruleText(r: CareerState, div: string): string | null {
    if (r.branch === 'chile' || r.branch === 'espana' || r.branch === 'espanaFem' || r.branch === 'fem') {
        const base = [DIV[div]?.promotesTo ? 'El campeón sube.' : '', DIV[div]?.relegatesTo ? 'Baja el último.' : ''].filter(Boolean).join(' ');
        const nac = div === 'af-urba-top9' || div === 'af-centro' ? ' Las 2 mejores juegan el Nacional de Clubes Femenino.' : '';
        return (base + nac).trim() || null;
    }
    if (r.branch === 'uruguay') return 'Apertura y Clausura, cada uno con semifinales y final; si los ganan distintos, superfinal por el título.';
    if (div === 'br-super12') return 'Los 2 primeros de cada grupo, al Hexagonal (los 2 mejores juegan la final); el resto, a la Repescagem por seguir en la Primeira.';
    if (div === 'br-segunda') return 'Los 2 primeros de cada grupo, a la Repescagem por un lugar en la Primeira.';
    if (DIV[div]?.branch === 'urba') {
        if (div === 'ar-urba-top14') return 'Bajan los dos últimos.';
        if (div === 'ar-urba-desarrollo') return 'El 1.º es campeón y sube.';
        const down = DIV[div]?.relegatesTo ? (swapsFrom(DIV[div].relegatesTo as string) === 1 ? ' Baja el último.' : ' Bajan los dos últimos.') : '';
        return `El 1.º es campeón y sube; del 2.º al 5.º, playoff por el otro ascenso.${down}`;
    }
    const T: Record<string, string> = {
        'ar-centro-top10': 'El último juega la promoción contra el campeón del Regional A.',
        'ar-centro-super9b': 'Del 1.º al 4.º, Regional A (el campeón juega la promoción con el último del Top 10); del 5.º al 8.º, Regional B; el último, repechaje con el campeón del Desarrollo.',
        'ar-noa-andina': 'Del 1.º al 4.º, Regional A de Córdoba (el campeón juega la promoción con el último del Top 10); del 5.º en adelante, Regional B.',
        'ar-centro-desarrollo': 'Dos zonas y final: el campeón juega el repechaje contra el último del Súper 9.',
        'ar-litoral-top10': 'Baja el último; el penúltimo juega la liguilla con el 2.º, 3.º y 4.º de la Segunda.',
        'ar-litoral-segunda': 'El campeón sube; del 2.º al 4.º juegan la liguilla con el penúltimo del Top 10.',
        'ar-patagonia-regional': 'Se quedan los 4 mejores; los otros lugares son de los campeones de Alto Valle, Austral, Tierra del Fuego y Santa Cruz.',
        'ar-patagonia-alto-valle': 'El campeón juega el Regional Patagónico del año que viene.',
        'ar-patagonia-austral': 'El campeón juega el Regional Patagónico del año que viene.',
        'ar-patagonia-tdf': 'El campeón juega el Regional Patagónico del año que viene.',
        'ar-patagonia-santacruz': 'El campeón juega el Regional Patagónico del año que viene.',
    };
    return T[div] ?? (r.branch === 'interior' ? null : null);
}

/** Calcula a qué nivel federal clasificó el club para la temporada siguiente, y lo anota. */
function previewNext(r: CareerState, onlyIfChanged = false) {
    const { tiers } = nextTiers(r);
    const prev = r.pending.nextTier;
    r.pending.nextTier = (['nacA', 'nacB', 'tdiA', 'tdiB'] as TierId[]).find((t) => tiers[t]?.includes(r.me)) ?? null;
    if (onlyIfChanged && prev === r.pending.nextTier) return;
    const relevant = r.branch === 'interior' ? r.cupos.some((c) => c.source === (r.history.at(-1)?.division ?? '')) : r.history.at(-1)?.division === 'ar-urba-top14';
    const nextFmt = formatOf(r, r.season + 1);
    if (relevant && (r.branch === 'interior' || nextFmt === 'ab')) {
        r.pending.note.push(r.pending.nextTier ? `Para ${r.season + 1}: clasificaste al ${TIER_NAME[r.pending.nextTier]}.` : `Para ${r.season + 1}: no alcanzó para los federales.`);
    }
}

/** Plazas y clasificados de la temporada que viene (sin aplicar nada). */
function nextTiers(r: CareerState): { tiers: Tiers; cupos: Cupo[]; cuposAB: CupoAB[] | undefined } {
    if (!isArgBranch(r.branch)) return { tiers: {}, cupos: r.cupos, cuposAB: undefined };
    const fmt = formatOf(r, r.season);
    const nextFmt = formatOf(r, r.season + 1);
    const cupos = fmt === 'ab' ? r.cupos : cuposAfter(r.cupos, r.pending.cupoDelta, r.pending.cupoDeltaB);
    let cuposAB = r.cuposAB;
    if (fmt === 'ab' && cuposAB) cuposAB = cuposABAfter(cuposAB, r.pending.deltaAB ?? {});
    if (nextFmt === 'ab' && !cuposAB) cuposAB = initialCuposAB(r);
    return { tiers: tierFields(r, nextFmt, cupos, cuposAB, r.pending.regional, r.pending.urbaOrder), cupos, cuposAB };
}

function cuposAfter(cupos: Cupo[], delta: Record<string, number>, deltaB: Record<string, number> = {}): Cupo[] {
    return cupos.map((c) => {
        const tdiA = Math.max(0, Math.min(c.tdiA + c.tdiB, c.tdiA + (delta[c.region] ?? 0)));
        return { ...c, tdiA, tdiB: Math.max(0, c.tdiB + c.tdiA - tdiA + (deltaB[c.region] ?? 0)) };
    });
}

function cuposABAfter(cupos: CupoAB[], delta: Record<string, [number, number, number, number]>): CupoAB[] {
    return cupos.map((c) => {
        const d = delta[c.region];
        if (!d) return c;
        const n = c.n.map((v, i) => Math.max(0, v + d[i])) as [number, number, number, number];
        return { ...c, n };
    });
}

const TIER_INDEX: Record<TierId, number> = { nacA: 0, nacB: 1, tdiA: 2, tdiB: 3 };

/** Juega lo que falta de las disputas de plazas (salvo los partidos del usuario) y anota los cambios. */
function resolveDisputes(r: CareerState) {
    const ds = r.pending.disputes ?? [];
    const isMe = (m: PlazaMatch) => m.a === r.me || m.b === r.me;
    const play = (m: PlazaMatch) => {
        const [sa, sb] = simulate(m.a, m.b, true);
        m.score = [sa, sb];
        m.winner = sa > sb ? m.a : m.b;
    };
    r.pending.my = null;
    ds.forEach((d, di) => {
        d.rep.forEach((m, i) => {
            if (m.winner) return;
            if (isMe(m)) {
                r.pending.my ??= { d: di, kind: 'rep', i };
                return;
            }
            play(m);
            archiveMatch(r, 'plazas', 'Plazas de los federales', `Repechaje del ${TIER_NAME[d.up]}`, m.a, m.b, m.score![0], m.score![1]);
        });
        if (!d.rev && d.rep.every((m) => m.winner)) {
            // Los de la URBA no ponen en juego plazas (las suyas salen del Top 14).
            const losers = d.rep.map((m) => (m.winner === m.a ? m.b : m.a)).filter((c) => REGION_OF_CLUB[c] && REGION_OF_CLUB[c] !== 'urba');
            const semis = d.semis.filter((c) => REGION_OF_CLUB[c] && REGION_OF_CLUB[c] !== 'urba');
            const n = Math.min(losers.length, semis.length);
            d.rev = Array.from({ length: n }, (_, i) => ({ a: losers[i], b: semis[semis.length - 1 - i] }));
        }
        d.rev?.forEach((m, i) => {
            if (m.winner) return;
            if (isMe(m)) {
                r.pending.my ??= { d: di, kind: 'rev', i };
                return;
            }
            play(m);
            archiveMatch(r, 'plazas', 'Plazas de los federales', d.outside ? 'Repechaje del TDI B (con otra región)' : `Reválida ${TIER_NAME[d.up]}`, m.a, m.b, m.score![0], m.score![1]);
            applyRevalida(r, d, m);
        });
    });
}

/** Si en la reválida ganó el de abajo, su región se lleva la plaza y la del perdedor la cede. */
function applyRevalida(r: CareerState, d: Dispute, m: PlazaMatch) {
    if (m.winner !== m.b) return;
    const regUp = REGION_OF_CLUB[m.a];
    const regLow = REGION_OF_CLUB[m.b];
    if (!regUp || !regLow) return;
    if (d.outside) {
        if (regUp !== regLow) {
            if (formatOf(r, r.season) === 'ab') {
                const delta = (r.pending.deltaAB ??= {});
                (delta[regLow] ??= [0, 0, 0, 0])[3] += 1;
                (delta[regUp] ??= [0, 0, 0, 0])[3] -= 1;
            } else {
                const db = (r.pending.cupoDeltaB ??= {});
                db[regLow] = (db[regLow] ?? 0) + 1;
                db[regUp] = (db[regUp] ?? 0) - 1;
            }
        }
        r.log.push(`${r.season}: ${nm(m.b)} le ganó el repechaje a ${nm(m.a)}${regUp !== regLow ? ' y le da a su región una plaza del TDI B' : ''}.`);
        return;
    }
    if (regUp !== regLow) {
        if (d.up === 'tdiA' && d.low === 'tdiB' && formatOf(r, r.season) !== 'ab') {
            r.pending.cupoDelta[regLow] = (r.pending.cupoDelta[regLow] ?? 0) + 1;
            r.pending.cupoDelta[regUp] = (r.pending.cupoDelta[regUp] ?? 0) - 1;
        } else {
            const delta = (r.pending.deltaAB ??= {});
            const u = TIER_INDEX[d.up];
            const l = TIER_INDEX[d.low];
            const add = (reg: string, i: number, v: number) => {
                const row = (delta[reg] ??= [0, 0, 0, 0]);
                row[i] += v;
            };
            add(regLow, u, 1);
            add(regLow, l, -1);
            add(regUp, u, -1);
            add(regUp, l, 1);
        }
    }
    r.log.push(`${r.season}: ${nm(m.b)} le ganó la reválida a ${nm(m.a)}${regUp !== regLow ? ` y le da a su región una plaza del ${TIER_NAME[d.up]}` : ''}.`);
}

/** Guarda un torneo terminado de la temporada para mirarlo en "Otros torneos". */
function archiveTour(r: CareerState, key: string, t: TourState) {
    const x: TourState = { ...t };
    delete x.career;
    delete x.stats;
    (r.archive ??= {})[key] = x;
}

/** Suma un partido suelto (promoción, repechaje, reválida) a un "torneo" de resultados para mirar. */
function archiveMatch(r: CareerState, key: string, name: string, label: string, a: string, b: string, sa: number, sb: number) {
    const arc = (r.archive ??= {});
    let t = arc[key];
    if (!t) {
        const def: TourDef = { id: `career-res-${key}-${r.season}`, name: `${name} ${r.season}`, sub: '', source: 'real', clubs: true, cat: 'Argentina', teams: [], formatLabel: 'Partidos sueltos', stage: { kind: 'ko', fixed: true } };
        t = { ...createTour(def, '__nadie', 'normal', 3), def, done: true, hasKo: false, stage: 'ko', groups: [], table: [], alive: [], koHistory: [] };
        delete t.stats;
    }
    arc[key] = { ...t, koHistory: [...t.koHistory, { label, results: [{ a, b, sa, sb }] }] };
}

/** Anota el resultado de una promoción y, si ganó el de abajo, el cambio de lugar. */
function resolvePromo(r: CareerState, p: Promo, score: [number, number]) {
    p.score = score;
    archiveMatch(r, 'promos', 'Promociones', `${divisionLabel(p.up)}${p.via ? ` · ${p.via}` : ''}`, p.top, p.bottom, score[1], score[0]);
    p.winner = score[1] > score[0] ? p.top : p.bottom;
    if (p.winner === p.top) {
        r.pending.moves.push({ club: p.top, from: p.down, to: p.up }, { club: p.bottom, from: p.up, to: p.bottomTo ?? p.down });
        r.log.push(`${r.season}: ${nm(p.top)} le ganó la promoción a ${nm(p.bottom)} (${score[1]}-${score[0]}) y sube al ${divisionLabel(p.up)}.`);
        addBonus(r, p.top, 1);
    } else {
        r.log.push(`${r.season}: ${nm(p.bottom)} sostuvo el lugar en el ${divisionLabel(p.up)} ante ${nm(p.top)} (${score[0]}-${score[1]}).`);
    }
}

const scoreOf = (s: TourState, a: string): [number, number] | null => {
    const res = s.koHistory.at(-1)?.results[0];
    if (!res) return null;
    return res.a === a ? [res.sa, res.sb] : [res.sb, res.sa];
};

function settleCup(s: TourState, r: CareerState) {
    const c = r.pending.cups?.[r.pending.myCup ?? -1];
    if (!c) return;
    applyCup(r, c, s);
    const place = finalRanking(s).indexOf(r.me) + 1;
    r.pending.note.push(c.champion === r.me ? `Campeón del ${c.name}.` : `${c.name}: terminaste ${place}.º.`);
    awardsOf(r, s, c.name);
}

function settlePromo(s: TourState, r: CareerState) {
    const p = r.pending.promos?.[r.pending.myPromo ?? -1];
    if (!p) return;
    resolvePromo(r, p, scoreOf(s, p.bottom) ?? (s.champion === p.top ? [0, 1] : [1, 0]));
    const won = p.winner === r.me;
    if (p.top === r.me) r.pending.note.push(won ? `Ganaste la promoción: el año que viene, ${divisionLabel(p.up)}.` : `Perdiste la promoción: seguís en el ${divisionLabel(p.down)}.`);
    else r.pending.note.push(won ? `Ganaste la promoción: seguís en el ${divisionLabel(p.up)}.` : `Perdiste la promoción: el año que viene, ${divisionLabel(p.down)}.`);
}

function settlePlayoff(s: TourState, r: CareerState) {
    const my = r.pending.my;
    const d = my ? r.pending.disputes?.[my.d] : null;
    const m = d && my ? (my.kind === 'rep' ? d.rep[my.i] : d.rev?.[my.i]) : null;
    if (!d || !m || !my) return;
    m.score = scoreOf(s, m.a) ?? (s.champion === m.a ? [1, 0] : [0, 1]);
    m.winner = s.champion ?? (m.score[0] > m.score[1] ? m.a : m.b);
    archiveMatch(r, 'plazas', 'Plazas de los federales', my.kind === 'rep' ? `Repechaje del ${TIER_NAME[d.up]}` : d.outside ? 'Repechaje del TDI B (con otra región)' : `Reválida ${TIER_NAME[d.up]}`, m.a, m.b, m.score[0], m.score[1]);
    const won = m.winner === r.me;
    if (my.kind === 'rep') r.pending.note.push(won ? `Ganaste el repechaje: tu región conserva la plaza del ${TIER_NAME[d.up]}.` : 'Perdiste el repechaje: vas a la reválida.');
    else {
        applyRevalida(r, d, m);
        const upSide = m.a === r.me;
        r.pending.note.push(won ? (upSide ? `Ganaste la reválida: tu región conserva la plaza del ${TIER_NAME[d.up]}.` : `Ganaste la reválida: tu región suma una plaza del ${TIER_NAME[d.up]}.`) : upSide ? `Perdiste la reválida: tu región pierde una plaza del ${TIER_NAME[d.up]}.` : 'Perdiste la reválida.');
    }
    resolveDisputes(r);
    previewNext(r, true);
}

function settleNacional(s: TourState, r: CareerState) {
    archiveTour(r, 'nacional', s);
    addBonus(r, s.champion, 2);
    if (r.pending.nacional) r.pending.nacional.champion = s.champion ?? undefined;
    addChampion(r, 'nacional', s.champion);
    if (s.champion) r.log.push(`${r.season}: ${nm(s.champion)} campeón del Nacional de Clubes.`);
    r.pending.note.push(s.champion === r.me ? 'Campeón del Nacional de Clubes.' : `Nacional de Clubes: terminaste ${finalRanking(s).indexOf(r.me) + 1}.º.`);
}

/** Solo partidas guardadas antes de los federales en paralelo: el TDI como etapa aparte. */
function settleTdiLegacy(s: TourState, r: CareerState) {
    const which = r.pending.tdi ?? 'A';
    const place = finalRanking(s).indexOf(r.me) + 1;
    addBonus(r, s.champion, 2);
    r.pending.note.push(s.champion === r.me ? `Campeón del Torneo del Interior ${which}.` : `Torneo del Interior ${which}: terminaste ${place}.º.`);
}

/* ───────────────────────── cierre de temporada ───────────────────────── */

/**
 * El nivel de cada club después de la temporada: lo que traía (diluido), más
 * lo que rindió contra lo que se esperaba de él en su división, más los
 * títulos, más un poco de azar.
 */
function evolveRatings(r: CareerState) {
    applyBoosts(r);
    const prev = r.ratings ?? {};
    const next: Record<string, number> = {};
    const rankings = r.pending.rankings ?? {};
    for (const divId of Object.keys(r.divisions)) {
        const order = rankings[divId]?.length ? rankings[divId] : r.divisions[divId];
        const expected = [...order].sort(byRating);
        const n = Math.max(1, order.length - 1);
        order.forEach((club, place) => {
            const perf = (expected.indexOf(club) - place) / n; // de −1 a 1
            const v = (prev[club] ?? 0) * 0.7 + perf * 4 + (r.pending.bonus?.[club] ?? 0) + (Math.random() - 0.5) * 2;
            const rounded = Math.round(Math.max(-10, Math.min(10, v)) * 2) / 2;
            if (rounded) next[club] = rounded;
        });
    }
    r.ratings = next;
}

/** Cierra la temporada: niveles, planteles, ascensos, plazas y clasificados, y pasa a la siguiente. */
function closeSeason(r: CareerState, chosen?: NacFormat) {
    const before = careerRating(r, r.me);
    const { tiers, cupos, cuposAB } = nextTiers(r);
    evolveRatings(r);
    // Juveniles y divisiones del año: el reporte, y la camada de M19 que sube a la primera.
    const rows = youthSeason(r);
    r.reports = [...(r.reports ?? []), { season: r.season, rows }].slice(-12);
    const youthNote = rows.filter((x) => x.nac === 'Campeón' || (x.place === 1 && x.of > 1)).map((x) => (x.nac === 'Campeón' ? `${x.cat} campeón del Nacional.` : `${x.cat} campeón de la región.`));
    // El reporte llega como noticia: cómo terminó cada categoría y quién ganó los nacionales.
    const lines = rows.map((x) => `${x.cat}: ${x.place === 1 && x.of > 1 ? 'campeón' : `${x.place}.º de ${x.of}`}${x.nac ? ` · Nacional: ${x.nac === 'Campeón' ? 'campeón' : x.nac.toLowerCase()}` : ''}.`);
    const champs = rows.filter((x) => x.champ && x.champ !== r.me).map((x) => `${x.cat} ${nm(x.champ!)}`);
    pushNews(r, {
        kind: 'youth',
        title: `Reporte de juveniles ${r.season}`,
        text: [...lines, champs.length ? `Campeones nacionales: ${champs.join(', ')}.` : ''].filter(Boolean).join(' '),
    });
    const roster = evolveRosters(r);
    ageYouth(r);
    forget(r);
    const after = careerRating(r, r.me);
    const fmt = formatOf(r, r.season);
    if (fmt !== 'ab') {
        cupos.forEach((c, i) => {
            if (c.tdiA !== r.cupos[i].tdiA) r.log.push(`${r.season}: ${c.region} ${c.tdiA > r.cupos[i].tdiA ? 'gana' : 'pierde'} una plaza del TDI A.`);
            else if (c.tdiB !== r.cupos[i].tdiB) r.log.push(`${r.season}: ${c.region} ${c.tdiB > r.cupos[i].tdiB ? 'gana' : 'pierde'} una plaza del TDI B.`);
        });
    }
    r.cupos = cupos;
    r.cuposAB = cuposAB;
    r.tiers = tiers;
    delete r.tdi;
    for (const m of r.pending.moves) {
        r.divisions[m.from] = r.divisions[m.from].filter((c) => c !== m.club);
        r.divisions[m.to] = [...(r.divisions[m.to] ?? []), m.club];
    }
    // El Nacional de dentro de dos temporadas.
    const target = String(r.season + 2);
    r.nacFormat = { ...(r.nacFormat ?? {}), [target]: chosen ?? r.nacFormat?.[target] ?? formatOf(r, r.season + 1) };
    if (chosen) r.log.push(`${r.season}: el Nacional ${r.season + 2} se va a jugar con el formato "${NAC_FORMATS.find((f) => f.id === chosen)?.label}".`);
    const last = r.history.at(-1);
    if (last) {
        last.rating = after;
        last.note = [...r.pending.note, ...youthNote, ...roster, after !== before ? `Nivel ${before} → ${after}.` : `Nivel ${after}, sin cambios.`].join(' ');
    }
    const lvl = (d: string) => DIV[d]?.level ?? 9;
    const movesLines = r.pending.moves.map((m) => `${nm(m.club)} ${lvl(m.to) < lvl(m.from) ? 'sube' : 'baja'}: ${divisionLabel(m.from)} → ${divisionLabel(m.to)}`);
    r.season += 1;
    r.phase = 'liga';
    r.settled = null;
    r.parallel = null;
    r.others = null;
    r.movesLog = { season: r.season - 1, lines: movesLines };
    r.pending = emptyPending();
}

/* ───────────────────────── etapas ───────────────────────── */

/**
 * Asienta la etapa terminada: simula lo que no juega el usuario y deja todo
 * escrito en la carrera. Idempotente: si ya se asentó, devuelve lo mismo.
 * Con dos torneos en paralelo, espera a que terminen los dos.
 */
export function settleCareer(s0: TourState): TourState {
    const s = careerTick(upgraded(s0));
    if (!s.career || !s.done || s.career.settled === s.career.phase) return s;
    if (s.career.parallel && !s.career.parallel.done) return s;
    const r: CareerState = JSON.parse(JSON.stringify(s.career));
    applyBoosts(r);
    r.pending.noteMark = r.pending.note.length;
    if (r.phase === 'liga') settleLiga(s, r);
    else if (r.phase === 'playoff') settlePlayoff(s, r);
    else if (r.phase === 'copa') settleCup(s, r);
    else if (r.phase === 'sudam') {
        archiveTour(r, 'sudamericano', s);
        applySud(r, s.champion);
        r.pending.note.push(s.champion === r.me ? 'Campeón del Sudamericano de Clubes.' : `Sudamericano de Clubes: campeón ${nm(s.champion ?? '')}.`);
    }
    else if (r.phase === 'promocion') settlePromo(s, r);
    else if (r.phase === 'tdi') settleTdiLegacy(s, r);
    else settleNacional(s, r);
    r.settled = r.phase;
    return { ...s, career: r };
}

/** Una partida vieja, llevada al formato actual (planteles de 12 y camadas); las nuevas pasan tal cual. */
function upgraded(s: TourState): TourState {
    if (!s.career || !needsUpgrade(s.career)) return s;
    const r: CareerState = JSON.parse(JSON.stringify(s.career));
    migrateCareer(s, r);
    return { ...s, career: r };
}

/** Qué se juega después de la etapa en curso (null: se cierra la temporada). */
function nextStage(r: CareerState): { def: TourDef; phase: CareerPhase; alive?: string[] } | null {
    const p = r.pending;
    if (r.phase === 'sudam') return null;
    const cup = p.cups?.[p.myCup ?? -1];
    if (cup && !cup.champion) return { def: cupDef(cup, r.season), phase: 'copa' };
    const my = p.my;
    const d = my ? p.disputes?.[my.d] : null;
    const m = d && my ? (my.kind === 'rep' ? d.rep[my.i] : d.rev?.[my.i]) : null;
    if (d && m && my && !m.winner) return { def: plazaDef(d, my.kind, m, r.season), phase: 'playoff' };
    const promo = p.promos?.[p.myPromo ?? -1];
    if (promo && !promo.winner && r.phase !== 'promocion' && r.phase !== 'nacional') return { def: promoDef(promo, r.season), phase: 'promocion' };
    const nac = p.nacional;
    if (nac && !nac.champion && nac.teams.includes(r.me) && r.phase !== 'nacional') return { def: nacionalDef(nac, r.season), phase: 'nacional', alive: nac.alive };
    if (r.phase !== 'nacional' && p.nacionalRival) {
        const legacy = { format: 'final' as const, teams: [r.me, p.nacionalRival], alive: [r.me, p.nacionalRival] };
        return { def: nacionalDef(legacy, r.season), phase: 'nacional', alive: legacy.alive };
    }
    return null;
}

const NEXT_LABEL: Record<CareerPhase, string> = {
    liga: 'Fase regular',
    copa: 'Jugar la copa',
    sudam: 'Jugar el Sudamericano',
    playoff: 'Jugar por la plaza',
    promocion: 'Jugar la promoción',
    tdi: 'Jugar el Torneo del Interior',
    nacional: 'Jugar el Nacional',
};

/** ¿La etapa que terminó cierra la temporada? (ahí se pregunta por el Nacional de dentro de dos años) */
export function closesSeason(s: TourState): boolean {
    const r = settleCareer(s).career;
    return !!r && settleCareer(s).done && !nextStage(r);
}

/** El cartel al terminar una etapa, antes de seguir. */
export function careerVerdict(s0: TourState): { title: string; text: string; next: string } {
    const s = settleCareer(s0);
    const r = s.career;
    if (!r) return { title: '', text: '', next: '' };
    const text = r.pending.note.slice(r.pending.noteMark ?? 0).join(' ');
    const nx = nextStage(r);
    const next = nx ? (nx.phase === 'playoff' || nx.phase === 'copa' ? `Jugar el ${nx.def.name.replace(/ \d{4}$/, '').toLowerCase()}` : NEXT_LABEL[nx.phase]) : `Temporada ${r.season + 1}`;
    if (r.phase === 'liga') {
        const { regional } = seasonTours(s);
        const place = (r.pending.rankings?.[divisionOf(r, r.me) ?? ''] ?? finalRanking(regional)).indexOf(r.me) + 1;
        return { title: regional.champion === r.me ? 'Campeón' : `Terminaste ${place}.º`, text: text || 'Ni ascenso ni descenso.', next };
    }
    const won = s.champion === r.me;
    if (r.phase === 'playoff') return { title: won ? 'Ganaste' : 'Perdiste', text, next };
    if (r.phase === 'copa') return { title: won ? 'Campeón' : 'Terminó la copa', text, next };
    if (r.phase === 'sudam') return { title: won ? 'Campeón sudamericano' : 'Terminó el Sudamericano', text, next };
    if (r.phase === 'promocion') return { title: won ? 'Ganaste la promoción' : 'Perdiste la promoción', text, next };
    if (r.phase === 'tdi') return { title: won ? 'Campeón del interior' : 'Terminó el Torneo del Interior', text, next };
    return { title: won ? 'Campeón del Nacional de Clubes' : 'Terminó el Nacional', text: text || `Temporada ${r.season} cerrada.`, next };
}

/** Pasa a la etapa siguiente de la carrera. Al cerrar la temporada, `chosen` fija el Nacional de dentro de dos años. */
export function advanceCareer(s0: TourState, chosen?: NacFormat, playSud = false): TourState {
    const s = settleCareer(s0);
    if (!s.career || !s.done || (s.career.parallel && !s.career.parallel.done)) return s;
    const r: CareerState = JSON.parse(JSON.stringify(s.career));
    applyBoosts(r);
    const nx = nextStage(r);
    if (nx) {
        const t = stage({ ...r, phase: nx.phase, settled: null, parallel: null }, nx.def, s.difficulty, s.duration);
        if (nx.alive) t.alive = [...nx.alive];
        return t;
    }
    // Antes de cerrar la temporada, el Sudamericano de Clubes (el usuario lo juega si clasificó y quiere).
    if (r.phase !== 'sudam' && !r.pending.sud?.champion && (r.phase !== 'liga' || !r.pending.tdi)) {
        const teams = r.pending.sud?.teams ?? sudTeams(r);
        if (teams) {
            r.pending.sud = { teams };
            if (playSud && teams.includes(r.me)) return stage({ ...r, phase: 'sudam', settled: null, parallel: null }, sudDef(teams, r.season), s.difficulty, s.duration);
            const sudT = finish(createTour(sudDef(teams, r.season), '__nadie', 'normal', 3));
            archiveTour(r, 'sudamericano', sudT);
            applySud(r, sudT.champion);
            if (teams.includes(r.me)) r.pending.note.push(r.pending.sud.champion === r.me ? 'Campeón del Sudamericano de Clubes (simulado).' : 'Sudamericano de Clubes simulado: no salió.');
        }
    }
    // Partida vieja que cerró la fase regular clasificada al TDI como etapa aparte: lo juega ahora.
    if (r.phase === 'liga' && r.pending.tdi && !r.tiers && !r.tdi) {
        const which = r.pending.tdi;
        const f = tierFields(r, 'final', r.cupos, undefined, r.pending.regional);
        return stage({ ...r, phase: 'tdi', settled: null, parallel: null }, legacyTdiDef(which, which === 'A' ? f.tdiA ?? [] : f.tdiB ?? [], r.season), s.difficulty, s.duration);
    }
    // Partidas guardadas sin planteles: se arman al cerrar la primera temporada.
    upgradeCareer(r);
    closeSeason(r, chosen);
    return seasonStart(r, s.difficulty, s.duration);
}

export function isCareerState(v: unknown): v is CareerState {
    const r = v as CareerState;
    return !!r && r.v === 1 && typeof r.me === 'string' && !!r.divisions && Array.isArray(r.history);
}

export const CAREER_PHASE_LABEL: Record<CareerPhase, string> = {
    liga: 'Temporada regular',
    copa: 'Copa de fin de temporada',
    sudam: 'Sudamericano de Clubes',
    playoff: 'Disputa de plazas',
    promocion: 'Promoción',
    tdi: 'Torneo del Interior',
    nacional: 'Nacional de Clubes',
};

/* ───────────────────────── para la pantalla ───────────────────────── */

export interface SeasonFixtureItem extends FixtureItem {
    comp: string;
}

/** Los partidos de la temporada, de los dos torneos intercalados por fecha. */
export function seasonFixture(s: TourState): SeasonFixtureItem[] {
    const tours = [s, ...(s.career?.parallel ? [s.career.parallel] : [])];
    const all = tours.flatMap((t, ti) => {
        const items = myFixture(t);
        const name = (defOf(t)?.name ?? '').replace(/ \d{4}$/, '');
        return items.map((f, i) => ({
            ...f,
            comp: name,
            state: ti > 0 && f.state === 'next' ? ('later' as const) : f.state,
            at: (i + 0.5) / Math.max(items.length, totalDates(t)),
            ti,
        }));
    });
    return all
        .sort((x, y) => x.at - y.at || x.ti - y.ti)
        .map((f) => ({ label: f.label, opp: f.opp, home: f.home, result: f.result, state: f.state, note: f.note, comp: f.comp }));
}

export interface SeasonItem {
    name: string;
    detail: string;
    state: 'live' | 'done' | 'next' | 'maybe' | 'out';
}

const nacHow = (fmt: NacFormat, branch: Branch) => {
    const side = branch === 'urba' ? 'del Top 14' : 'del TDI A';
    if (fmt === 'final') return `Si salís campeón ${side}`;
    if (fmt === 'semis') return `Si terminás 1.º o 2.º ${side}`;
    if (fmt === 'grupos8') return `Si terminás entre los 4 primeros ${side}`;
    return 'Se juega como Nacional A y B: el campeón del A es el campeón argentino';
};

/**
 * Todo lo que puede jugar el club en la temporada, en orden, con su estado:
 * lo que está en juego, lo ya jugado, a lo que clasificó y a lo que todavía
 * puede llegar (y cómo).
 */
export function seasonPlan(s: TourState): SeasonItem[] {
    const r = s.career;
    if (!r) return [];
    const p = r.pending;
    const inLiga = r.phase === 'liga';
    const { regional, tier } = inLiga ? seasonTours(s) : { regional: null, tier: null };
    const settledLiga = r.phase !== 'liga' || r.settled === 'liga';
    const myDiv = inLiga ? divisionOf(r, r.me) ?? '' : r.history.at(-1)?.division ?? divisionOf(r, r.me) ?? '';
    const fmt = formatOf(r, r.season);
    const items: SeasonItem[] = [];

    // 1. La división.
    if (regional && !regional.done) {
        const st = regional.def?.stage;
        const after = st?.kind === 'grupos' && st.noKo ? '' : ` · después, ${st?.kind === 'grupos' && st.advance === 2 ? 'final' : st?.kind === 'grupos' && st.advance === 1 ? 'final entre zonas' : 'semifinales'}`;
        items.push({ name: divisionLabel(myDiv), detail: `En juego · ${roundLabel(regional)}${after}`, state: 'live' });
    } else {
        const place = regional ? (p.rankings?.[myDiv] ?? finalRanking(regional)).indexOf(r.me) + 1 : r.history.at(-1)?.place ?? 0;
        items.push({ name: divisionLabel(myDiv), detail: regional?.champion === r.me ? 'Campeón' : `Terminaste ${place}.º`, state: 'done' });
    }

    // 2. El federal de esta temporada.
    const t = myTier(r);
    if (r.phase === 'tdi') {
        items.push({ name: `Torneo del Interior ${p.tdi ?? ''}`, detail: s.done ? `Terminaste ${finalRanking(s).indexOf(r.me) + 1}.º` : `En juego · ${roundLabel(s)}`, state: s.done ? 'done' : 'live' });
    } else if (t && tier) {
        items.push({
            name: TIER_NAME[t],
            detail: tier.done ? (tier.champion === r.me ? 'Campeón' : `Terminaste ${finalRanking(tier).indexOf(r.me) + 1}.º`) : `En juego, en paralelo · ${roundLabel(tier)}`,
            state: tier.done ? 'done' : 'live',
        });
    } else if (t && p.tierResult) {
        items.push({ name: TIER_NAME[t], detail: p.tierResult.champion ? 'Campeón' : `Terminaste ${p.tierResult.place}.º`, state: 'done' });
    } else if (r.branch === 'interior' || fmt === 'ab') {
        items.push({ name: fmt === 'ab' ? 'Nacional A y B · TDI' : 'Torneo del Interior', detail: r.season === 2026 ? 'No clasificaste este año' : `No clasificaste con la tabla de ${r.season - 1}`, state: 'out' });
    }

    // 3. Disputa de plazas (repechaje y reválida).
    const myMatches = (p.disputes ?? []).flatMap((d) => [...d.rep.map((m) => ({ d, m, kind: 'Repechaje' })), ...(d.rev ?? []).map((m) => ({ d, m, kind: d.outside ? 'Repechaje' : 'Reválida' }))]).filter((x) => x.m.a === r.me || x.m.b === r.me);
    for (const x of myMatches) {
        const rival = x.m.a === r.me ? x.m.b : x.m.a;
        items.push({
            name: `${x.kind} · ${TIER_NAME[x.d.up]}`,
            detail: x.m.winner ? (x.m.winner === r.me ? `Ganado contra ${nm(rival)}` : `Perdido contra ${nm(rival)}`) : `Te toca: contra ${nm(rival)}`,
            state: x.m.winner ? 'done' : r.phase === 'playoff' ? 'live' : 'next',
        });
    }
    if (!myMatches.length && t && !settledLiga) items.push({ name: 'Disputa de plazas', detail: 'Si terminás 3.º o 4.º de tu zona: repechaje, y si lo perdés, reválida', state: 'maybe' });

    // 3b. Copas de fin de fase y cómo se sube y se baja en la división.
    for (const c of p.cups ?? []) {
        if (!c.teams.includes(r.me)) continue;
        items.push({ name: c.name, detail: c.champion ? (c.champion === r.me ? 'Campeón' : `Campeón: ${nm(c.champion)}`) : r.phase === 'copa' ? 'En juego' : 'Clasificado', state: c.champion ? 'done' : r.phase === 'copa' ? 'live' : 'next' });
    }
    const rule = ruleText(r, myDiv);
    if (rule) items.push({ name: 'Ascensos y descensos', detail: rule, state: settledLiga ? 'done' : 'maybe' });

    // 4. Promoción (interior).
    if (r.branch === 'interior' && !CUSTOM_UPS.has(myDiv) && !CUSTOM_UPS.has(DIV[myDiv]?.promotesTo ?? '')) {
        const up = DIV[myDiv]?.promotesTo && r.divisions[DIV[myDiv].promotesTo as string] ? DIV[myDiv].promotesTo : null;
        const lower = Object.keys(r.divisions).find((d) => DIV[d]?.promotesTo === myDiv) ?? null;
        const promo = p.promos?.[p.myPromo ?? -1];
        if (promo) {
            const rival = promo.top === r.me ? promo.bottom : promo.top;
            items.push({
                name: `Promoción ${divisionLabel(promo.up)}`,
                detail: promo.winner ? (promo.winner === r.me ? 'Ganada' : 'Perdida') : `Te toca: contra ${nm(rival)}`,
                state: promo.winner ? 'done' : r.phase === 'promocion' ? 'live' : 'next',
            });
        } else if (!settledLiga && (up || lower)) {
            const ways = [up ? `si salís campeón, contra el último del ${divisionLabel(up)}` : '', lower ? `si terminás último, contra el campeón del ${divisionLabel(lower)}` : ''].filter(Boolean);
            items.push({ name: 'Promoción', detail: ways.join('; ').replace(/^./, (c) => c.toUpperCase()), state: 'maybe' });
        } else if (up || lower) {
            items.push({ name: 'Promoción', detail: 'No te toca este año', state: 'out' });
        }
    }

    // El Sudamericano de Clubes: los campeones de los cuatro países, al cerrar la temporada.
    const sud = p.sud;
    const sudItem: SeasonItem = sud?.champion
        ? { name: 'Sudamericano de Clubes', detail: sud.champion === r.me ? 'Campeón' : `Campeón: ${nm(sud.champion)}`, state: sud.teams.includes(r.me) ? 'done' : 'out' }
        : { name: 'Sudamericano de Clubes', detail: `Lo juegan los campeones de Argentina (el del Nacional), Uruguay, Brasil y Chile: semifinales y final. ${isArgBranch(r.branch) ? 'Si salís campeón del Nacional' : 'Si salís campeón'}, elegís si lo jugás.`, state: r.phase === 'sudam' ? 'live' : 'maybe' };

    // 5. Nacional de Clubes (solo en el rugby argentino).
    if (!isArgBranch(r.branch)) return countryOf(r.branch) ? [...items, sudItem] : items;
    const fmtLabel = NAC_FORMATS.find((f) => f.id === fmt)?.label ?? '';
    const nac = p.nacional;
    if (fmt === 'ab') {
        const doneA = settledLiga || !!tier?.done;
        items.push({
            name: `Nacional de Clubes · ${fmtLabel}`,
            detail: t === 'nacA' ? (doneA ? 'Ya jugado: el campeón del A es el campeón argentino' : 'Lo estás jugando: el campeón del A es el campeón argentino') : nacHow(fmt, r.branch),
            state: t === 'nacA' ? (doneA ? 'done' : 'live') : 'out',
        });
    } else if (r.phase === 'nacional') {
        items.push({ name: `Nacional de Clubes · ${fmtLabel}`, detail: s.done ? (s.champion === r.me ? 'Campeón' : `Terminaste ${finalRanking(s).indexOf(r.me) + 1}.º`) : `En juego · ${roundLabel(s)}`, state: s.done ? 'done' : 'live' });
    } else if (nac?.teams.includes(r.me)) {
        items.push({ name: `Nacional de Clubes · ${fmtLabel}`, detail: 'Clasificado', state: 'next' });
    } else if (!settledLiga) {
        const can = r.branch === 'urba' ? myDiv === 'ar-urba-top14' : t === 'tdiA';
        items.push({ name: `Nacional de Clubes · ${fmtLabel}`, detail: can ? nacHow(fmt, r.branch) : `Lo juegan los de arriba ${r.branch === 'urba' ? 'del Top 14' : 'del TDI A'}`, state: can ? 'maybe' : 'out' });
    } else {
        items.push({ name: `Nacional de Clubes · ${fmtLabel}`, detail: nac?.champion ? `Campeón: ${nm(nac.champion)}` : 'No clasificaste', state: 'out' });
    }

    // 6. Los federales del año que viene: se ganan con esta tabla.
    const nextFmt = formatOf(r, r.season + 1);
    const source = r.branch === 'interior' ? r.cupos.find((c) => c.source === myDiv) : null;
    const relevant = !!source || (r.branch === 'urba' && myDiv === 'ar-urba-top14' && nextFmt === 'ab');
    if (relevant) {
        const nextName = `Federales ${r.season + 1}`;
        if (settledLiga) {
            items.push(p.nextTier ? { name: nextName, detail: `Clasificado al ${TIER_NAME[p.nextTier]}`, state: 'next' } : { name: nextName, detail: 'No alcanzó', state: 'out' });
        } else if (r.branch === 'urba') {
            items.push({ name: nextName, detail: 'Con esta tabla: del 1.º al 8.º al Nacional A, del 9.º al 14.º al Nacional B', state: 'maybe' });
        } else if (source && nextFmt !== 'ab') {
            const parts = [source.tdiA ? `TDI A: del 1.º al ${source.tdiA}.º` : '', source.tdiB ? `TDI B: del ${source.tdiA + 1}.º al ${source.tdiA + source.tdiB}.º` : ''].filter(Boolean);
            items.push(parts.length ? { name: nextName, detail: `Se clasifica con esta tabla · ${parts.join(' · ')}`, state: 'maybe' } : { name: nextName, detail: 'Tu región no tiene plazas', state: 'out' });
        } else if (source) {
            const row = (r.cuposAB ?? initialCuposAB(r)).find((c) => c.source === source.source);
            const ids: TierId[] = ['nacA', 'nacB', 'tdiA', 'tdiB'];
            let from = 0;
            const parts = (row?.n ?? [0, 0, 0, 0]).map((k, i) => {
                const txt = k ? `${TIER_NAME[ids[i]].replace('Nacional de Clubes', 'Nac.').replace('Torneo del Interior', 'TDI')}: ${from + 1}.º–${from + k}.º` : '';
                from += k;
                return txt;
            }).filter(Boolean);
            items.push({ name: nextName, detail: parts.length ? `Se clasifica con esta tabla · ${parts.join(' · ')}` : 'Tu región no tiene plazas', state: parts.length ? 'maybe' : 'out' });
        }
    }
    return [...items, sudItem];
}

/** Goleadores y tryman en vivo de un torneo, con nombres. */
export function liveScorers(t: TourState, by: 'tries' | 'points', nameOf: (team: string, slot: number) => string, n = 10) {
    return topStats(t.stats, by, n).map((x) => ({ ...x, name: nameOf(x.team, x.slot) }));
}

/* ───────────────────────── palmarés y títulos ───────────────────────── */

/** Cómo se llama un palmarés: los nacionales por su nombre, las divisiones por la suya. */
export const palmaresLabel = (key: string) => PALMARES_LABEL[key] ?? JUV_LABEL[key] ?? CUP_LABEL[key] ?? divisionLabel(key);

/** Historia completa de una competición: la real (hasta 2025) y la de esta carrera, del más nuevo al más viejo. */
export function palmaresFor(r: CareerState, key: string): TitleRow[] {
    const game = (r.champions?.[key] ?? []).map(([season, club]) => ({ season, name: nm(club), club, game: true }));
    return [...realTitles(key), ...game].sort((a, b) => b.season - a.season);
}

/** Las competiciones con palmarés para mostrar: primero las de la rama y la región del club. */
export function palmaresKeys(r: CareerState): string[] {
    const mine = Object.keys(r.champions ?? {});
    const arg = isArgBranch(r.branch);
    const all = [...new Set([...(arg ? ['nacional', 'tdiA', 'tdiB', 'nacionalB'] : []), ...Object.keys(r.divisions).filter((d) => DIV[d]?.level !== undefined), ...(arg ? PALMARES_KEYS : []), ...mine])];
    const myDiv = divisionOf(r, r.me);
    const myRegion = myDiv ? DIV[myDiv]?.region : null;
    const rank = (k: string) => (k === myDiv ? 0 : ['nacional', 'tdiA', 'tdiB', 'nacionalB'].includes(k) ? 1 : DIV[k]?.region === myRegion ? 2 : 3);
    return all
        .filter((k) => realTitles(k).length > 0 || (r.champions?.[k]?.length ?? 0) > 0)
        .sort((a, b) => rank(a) - rank(b) || (DIV[a]?.level ?? 0) - (DIV[b]?.level ?? 0) || palmaresLabel(a).localeCompare(palmaresLabel(b)));
}

/** Los títulos del club del usuario en esta carrera (los de la insignia del entrenador). */
export function myTitles(r: CareerState): { key: string; label: string; season: number }[] {
    const out: { key: string; label: string; season: number }[] = [];
    for (const [key, list] of Object.entries(r.champions ?? {})) for (const [season, club] of list) if (club === r.me) out.push({ key, label: palmaresLabel(key), season });
    return out.sort((a, b) => b.season - a.season || a.label.localeCompare(b.label));
}

/** Títulos de esta temporada que todavía no se festejaron. */
export const pendingCelebration = (r: CareerState) => (r.pending.wins ?? []).slice(r.pending.celebrated ?? 0);

/** Marca los títulos como festejados (para no repetir el festejo al volver al torneo). */
export function markCelebrated(s: TourState): TourState {
    const r = s.career;
    if (!r) return s;
    return { ...s, career: { ...r, pending: { ...r.pending, celebrated: r.pending.wins?.length ?? 0 } } };
}
