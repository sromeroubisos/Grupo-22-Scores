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

import { AR_LABEL_OVERRIDE, arClubById } from './arClubs';
import { AR_SEVEN_CUPOS, AR_SEVEN_DIVISIONS } from './arClubs.generated';
import { defaultNames, nameFromSeed, nameFromText, POSITIONS, type PlayerName } from './names';
import type { Difficulty, Duration, SevenTeam } from './teams';
import {
    closeRound,
    createTour,
    defOf,
    finalRanking,
    groupStandings,
    myFixture,
    ratingOf,
    roundLabel,
    setRatingBoost,
    simulate,
    topStats,
    type FixtureItem,
    type TourDef,
    type TourState,
} from './tours';

type Branch = 'urba' | 'interior';
export type CareerPhase = 'liga' | 'playoff' | 'promocion' | 'tdi' | 'nacional';
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
}

export interface Player {
    age: number;
    q: number; // nivel respecto del promedio del club (−6 a 6)
    gen: number; // cuántas veces se renovó ese puesto (da el nombre del que llega)
    name?: string; // el que escribió el usuario
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
    /** El otro torneo que el club juega en paralelo (el federal o la división, el que no está en pantalla). */
    parallel?: TourState | null;
    /** Los demás torneos de la temporada, que avanzan fecha a fecha junto con el del usuario. */
    others?: Record<string, TourState> | null;
    /** Lo que rindió cada club en la cancha (se diluye cada año). */
    ratings?: Record<string, number>;
    /** Plantel de cada club de la rama. */
    rosters?: Record<string, Player[]>;
    /** Goleadores y tryman de cada torneo jugado por el club. */
    awards?: { season: number; comp: string; tries: Award[]; points: Award[] }[];
    /** Etapa que ya se asentó (lo que no juega el usuario ya está simulado). */
    settled?: CareerPhase | null;
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
        deltaAB?: Record<string, [number, number, number, number]>;
        note: string[];
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

function newRoster(): Player[] {
    return Array.from({ length: 7 }, () => ({ age: 19 + Math.floor(Math.random() * 15), q: Math.round(rand(-2, 2) * 10) / 10, gen: 0 }));
}

/** Lo que el plantel le suma o le resta al nivel del club. */
const rosterBoost = (roster: Player[] | undefined) => (roster ? (roster.reduce((a, p) => a + p.q, 0) / roster.length) * 0.9 : 0);

const boostCache = new WeakMap<CareerState, Record<string, number>>();
/** Lo que cambió el nivel de cada club: rendimiento más plantel. */
export function careerBoosts(r: CareerState): Record<string, number> {
    const hit = boostCache.get(r);
    if (hit) return hit;
    const out: Record<string, number> = { ...(r.ratings ?? {}) };
    for (const [club, roster] of Object.entries(r.rosters ?? {})) out[club] = (out[club] ?? 0) + rosterBoost(roster);
    boostCache.set(r, out);
    return out;
}

const applyBoosts = (r: CareerState) => setRatingBoost(careerBoosts(r));

/** Nivel actual de un club dentro de la carrera, redondeado. */
export const careerRating = (r: CareerState, club: string) => {
    applyBoosts(r);
    return Math.round(ratingOf(club));
};

/** Los nombres del plantel de un club en la carrera (con renovaciones y nombres editados). */
export function careerNames(r: CareerState, team: SevenTeam): PlayerName[] | null {
    const roster = r.rosters?.[team.id];
    if (!roster) return null;
    const base = defaultNames(team);
    return roster.map((p, slot) => (p.name ? nameFromText(p.name) : p.gen === 0 ? base[slot] : nameFromSeed(team, `${team.id}:${slot}:${p.gen}`)));
}

/** El plantel del club del usuario, para mostrarlo y editarlo. */
export function myRoster(r: CareerState): { slot: number; pos: string; name: PlayerName; age: number; q: number }[] {
    const team = arClubById(r.me);
    const roster = r.rosters?.[r.me];
    if (!team || !roster) return [];
    const names = careerNames(r, team) ?? defaultNames(team);
    return roster.map((p, slot) => ({ slot, pos: POSITIONS[slot], name: names[slot], age: p.age, q: p.q }));
}

/** Cambia el nombre de un jugador del plantel propio. */
export function renamePlayer(s: TourState, slot: number, text: string): TourState {
    const r = s.career;
    const roster = r?.rosters?.[r.me];
    if (!r || !roster?.[slot]) return s;
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 40);
    const next = roster.map((p, i) => (i === slot ? { ...p, name: clean || undefined } : p));
    return { ...s, career: { ...r, rosters: { ...r.rosters, [r.me]: next } } };
}

/** Un año más para todos: los jóvenes mejoran, los veteranos caen y se retiran, y llega la cantera. */
function evolveRosters(r: CareerState) {
    const mine: string[] = [];
    const team = arClubById(r.me);
    const before = team ? careerNames(r, team) : null;
    for (const [club, roster] of Object.entries(r.rosters ?? {})) {
        roster.forEach((p, slot) => {
            p.age += 1;
            if (p.age <= 22) p.q += rand(0.3, 1.6);
            else if (p.age <= 27) p.q += rand(-0.3, 0.8);
            else if (p.age <= 30) p.q += rand(-0.8, 0.3);
            else p.q += rand(-1.6, -0.2);
            const retires = p.age >= 37 || (p.age >= 31 && Math.random() < (p.age - 30) * 0.22);
            if (retires) {
                const old = club === r.me && before ? before[slot] : null;
                const age = p.age;
                p.age = 18 + Math.floor(Math.random() * 4);
                p.q = rand(-3, 1.5);
                p.gen += 1;
                delete p.name;
                if (old && team) {
                    const nuevo = nameFromSeed(team, `${club}:${slot}:${p.gen}`);
                    mine.push(`Se retiró ${old.first} ${old.last} (${age} años, ${POSITIONS[slot].toLowerCase()}); llega ${nuevo.first} ${nuevo.last} (${p.age}).`);
                }
            }
            p.q = Math.round(Math.max(-6, Math.min(6, p.q)) * 10) / 10;
        });
    }
    return mine;
}

/* ───────────────────────── definiciones ───────────────────────── */

function leagueDef(divId: string, clubs: string[], season: number): TourDef {
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
    sub: `El último del ${divisionLabel(p.up)} contra el campeón del ${divisionLabel(p.down)}.`,
    source: 'real',
    clubs: true,
    cat: 'Argentina',
    teams: [p.bottom, p.top],
    formatLabel: 'Partido único · el que gana juega arriba',
    stage: { kind: 'ko' },
});

const plazaDef = (d: Dispute, kind: 'rep' | 'rev', m: PlazaMatch, season: number): TourDef => ({
    id: `career-${kind}-${d.up}-${season}`,
    name: kind === 'rep' ? `Repechaje del ${TIER_NAME[d.up]} ${season}` : `Reválida ${TIER_NAME[d.up]} – ${TIER_NAME[d.low].replace('Torneo del Interior', 'TDI').replace('Nacional de Clubes', 'Nacional')} ${season}`,
    sub: kind === 'rep' ? 'El 3.º contra el 4.º de otra zona: el que pierde va a la reválida.' : 'El que gana deja la plaza en su región para el año que viene.',
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
    applyBoosts(r);
    const div = divisionOf(r, r.me) ?? Object.keys(r.divisions)[0];
    const tiers = tiersOf(r);
    const mineTier = myTier(r);
    const parallel = mineTier && tiers[mineTier] ? { ...createTour(tierDef(mineTier, tiers[mineTier]!, r.season), r.me, difficulty, duration), def: tierDef(mineTier, tiers[mineTier]!, r.season) } : null;
    const others: Record<string, TourState> = {};
    const add = (key: string, def: TourDef) => {
        const t: TourState = { ...createTour(def, '__nadie', 'normal', 3), def };
        delete t.stats; // los goleadores se llevan en los torneos del club
        others[key] = t;
    };
    for (const d of Object.keys(r.divisions)) if (d !== div && r.divisions[d].length >= 2) add(`div:${d}`, leagueDef(d, [...r.divisions[d]].sort(byRating), r.season));
    for (const t of TIERS_OF[formatOf(r, r.season)]) if (t !== mineTier && (tiers[t]?.length ?? 0) >= 2) add(`tier:${t}`, tierDef(t, tiers[t]!, r.season));
    return stage({ ...r, parallel, others, phase: 'liga', settled: null }, leagueDef(div, [...r.divisions[div]].sort(byRating), r.season), difficulty, duration);
}

/** Arranca la carrera con el club elegido, en su división de 2026. */
export function createCareer(meId: string, difficulty: Difficulty, duration: Duration): TourState {
    setRatingBoost({});
    const home = AR_SEVEN_DIVISIONS.find((d) => d.clubs.includes(meId));
    const branch: Branch = home?.branch ?? 'urba';
    const divisions: Record<string, string[]> = {};
    for (const d of AR_SEVEN_DIVISIONS) if (d.branch === branch) divisions[d.id] = [...d.clubs].sort(byRating);
    const rosters: Record<string, Player[]> = {};
    for (const clubs of Object.values(divisions)) for (const c of clubs) rosters[c] = newRoster();
    const r: CareerState = {
        v: 1, me: meId, branch, season: 2026, phase: 'liga', divisions,
        cupos: AR_SEVEN_CUPOS.map((c) => ({ region: c.region, source: c.sourceCompetitionId, tdiA: c.tdiA, tdiB: c.tdiB })),
        nacFormat: { '2026': 'final', '2027': 'final' },
        ratings: {}, rosters, awards: [], settled: null, parallel: null,
        pending: emptyPending(), history: [], log: [],
    };
    // 2026: los federales los juegan los de más nivel de cada regional, con las plazas de fábrica.
    r.tiers = tierFields(r, 'final', r.cupos, undefined, {});
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
    const s = advanceOthers(s0);
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
    if (!r?.others) return [];
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
        });
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

const addBonus = (r: CareerState, club: string | null | undefined, v: number) => {
    if (!club) return;
    const b = (r.pending.bonus ??= {});
    b[club] = (b[club] ?? 0) + v;
};

/** Goleadores y tryman de un torneo, con los nombres de este año. */
function awardsOf(r: CareerState, t: TourState, comp: string) {
    const name = (team: string, slot: number) => {
        const club = arClubById(team);
        if (!club) return '—';
        const n = (careerNames(r, club) ?? defaultNames(club))[slot];
        return `${n.first} ${n.last}`.trim();
    };
    const map = (by: 'tries' | 'points') => topStats(t.stats, by, 5).map((x) => ({ name: name(x.team, x.slot), club: x.team, n: by === 'tries' ? x.tries : x.points }));
    const tries = map('tries');
    const points = map('points');
    if (tries.length || points.length) (r.awards ??= []).push({ season: r.season, comp, tries, points });
}

/** Cierra la fase regular y los federales: simula el resto y decide qué viene. */
function settleLiga(s: TourState, r: CareerState) {
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
    for (const divId of Object.keys(rankings)) addBonus(r, rankings[divId][0], 1);
    r.history.push({ season: r.season, division: myDiv, place: rankings[myDiv].indexOf(r.me) + 1, note: '' });
    awardsOf(r, regional, divisionLabel(myDiv));

    // Ascensos y descensos.
    if (r.branch === 'urba') {
        const moves: CareerState['pending']['moves'] = [];
        for (const divId of Object.keys(r.divisions)) {
            const up = DIV[divId]?.promotesTo;
            if (!up || !r.divisions[up] || !rankings[divId]?.length) continue;
            const n = swapsFrom(divId);
            for (const club of rankings[divId].slice(0, n)) moves.push({ club, from: divId, to: up });
            for (const club of (rankings[up] ?? []).slice(-n)) moves.push({ club, from: up, to: divId });
        }
        r.pending.moves = moves;
        const mine = moves.find((m) => m.club === r.me);
        if (mine) r.pending.note.push(`${DIV[mine.from]?.promotesTo === mine.to ? 'Ascenso' : 'Descenso'}: el año que viene, ${divisionLabel(mine.to)}.`);
        r.pending.urbaOrder = rankings['ar-urba-top14'];
    } else {
        const promos: Promo[] = [];
        for (const up of Object.keys(r.divisions)) {
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
        r.pending.myPromo = null;
        promos.forEach((p, i) => {
            if (p.top === r.me || p.bottom === r.me) {
                r.pending.myPromo = i;
                const rival = p.top === r.me ? p.bottom : p.top;
                r.pending.note.push(
                    p.top === r.me
                        ? `Campeón: jugás la promoción contra ${nm(rival)} por un lugar en el ${divisionLabel(p.up)}.`
                        : `Último: jugás la promoción contra ${nm(rival)} para no bajar al ${divisionLabel(p.down)}.`,
                );
                return;
            }
            resolvePromo(r, p, simulate(p.bottom, p.top, true));
        });
        for (const cupo of r.cupos) r.pending.regional[cupo.source] = rankings[cupo.source] ?? [];
        // El Top 14 de este año (para el Nacional y las plazas de la URBA en el formato A/B).
        r.pending.urbaOrder = finalRanking(finish(createTour(leagueDef('ar-urba-top14', [...(DIV['ar-urba-top14']?.clubs ?? [])].sort(byRating), r.season), '__nadie', 'normal', 3)));
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
    r.pending.disputes = disputes;
    resolveDisputes(r);

    // El Nacional de Clubes (en el formato A/B, el campeón es el del Nacional A).
    if (fmt === 'ab') {
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
                nac.champion = sim.champion ?? undefined;
                addBonus(r, sim.champion, 2);
                if (sim.champion) r.log.push(`${r.season}: ${nm(sim.champion)} campeón del Nacional de Clubes.`);
            }
        }
    }

    // Lo que dejó esta tabla para los federales del año que viene.
    previewNext(r);
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
    const fmt = formatOf(r, r.season);
    const nextFmt = formatOf(r, r.season + 1);
    const cupos = fmt === 'ab' ? r.cupos : cuposAfter(r.cupos, r.pending.cupoDelta);
    let cuposAB = r.cuposAB;
    if (fmt === 'ab' && cuposAB) cuposAB = cuposABAfter(cuposAB, r.pending.deltaAB ?? {});
    if (nextFmt === 'ab' && !cuposAB) cuposAB = initialCuposAB(r);
    return { tiers: tierFields(r, nextFmt, cupos, cuposAB, r.pending.regional, r.pending.urbaOrder), cupos, cuposAB };
}

function cuposAfter(cupos: Cupo[], delta: Record<string, number>): Cupo[] {
    return cupos.map((c) => {
        const tdiA = Math.max(0, Math.min(c.tdiA + c.tdiB, c.tdiA + (delta[c.region] ?? 0)));
        return { ...c, tdiA, tdiB: c.tdiB + c.tdiA - tdiA };
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

/** Anota el resultado de una promoción y, si ganó el de abajo, el cambio de lugar. */
function resolvePromo(r: CareerState, p: Promo, score: [number, number]) {
    p.score = score;
    p.winner = score[1] > score[0] ? p.top : p.bottom;
    if (p.winner === p.top) {
        r.pending.moves.push({ club: p.top, from: p.down, to: p.up }, { club: p.bottom, from: p.up, to: p.down });
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
    addBonus(r, s.champion, 2);
    if (r.pending.nacional) r.pending.nacional.champion = s.champion ?? undefined;
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
    const roster = evolveRosters(r);
    boostCache.delete(r);
    const after = careerRating(r, r.me);
    const fmt = formatOf(r, r.season);
    if (fmt !== 'ab') {
        cupos.forEach((c, i) => {
            if (c.tdiA !== r.cupos[i].tdiA) r.log.push(`${r.season}: ${c.region} ${c.tdiA > r.cupos[i].tdiA ? 'gana' : 'pierde'} una plaza del TDI A.`);
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
        last.note = [...r.pending.note, ...roster, after !== before ? `Nivel ${before} → ${after}.` : `Nivel ${after}, sin cambios.`].join(' ');
    }
    r.season += 1;
    r.phase = 'liga';
    r.settled = null;
    r.parallel = null;
    r.others = null;
    r.pending = emptyPending();
}

/* ───────────────────────── etapas ───────────────────────── */

/**
 * Asienta la etapa terminada: simula lo que no juega el usuario y deja todo
 * escrito en la carrera. Idempotente: si ya se asentó, devuelve lo mismo.
 * Con dos torneos en paralelo, espera a que terminen los dos.
 */
export function settleCareer(s0: TourState): TourState {
    const s = careerTick(s0);
    if (!s.career || !s.done || s.career.settled === s.career.phase) return s;
    if (s.career.parallel && !s.career.parallel.done) return s;
    const r: CareerState = JSON.parse(JSON.stringify(s.career));
    applyBoosts(r);
    r.pending.noteMark = r.pending.note.length;
    if (r.phase === 'liga') settleLiga(s, r);
    else if (r.phase === 'playoff') settlePlayoff(s, r);
    else if (r.phase === 'promocion') settlePromo(s, r);
    else if (r.phase === 'tdi') settleTdiLegacy(s, r);
    else settleNacional(s, r);
    r.settled = r.phase;
    return { ...s, career: r };
}

/** Qué se juega después de la etapa en curso (null: se cierra la temporada). */
function nextStage(r: CareerState): { def: TourDef; phase: CareerPhase; alive?: string[] } | null {
    const p = r.pending;
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
    const next = nx ? (nx.phase === 'playoff' ? `Jugar el ${nx.def.name.replace(/ \d{4}$/, '').toLowerCase()}` : NEXT_LABEL[nx.phase]) : `Temporada ${r.season + 1}`;
    if (r.phase === 'liga') {
        const { regional } = seasonTours(s);
        const place = (r.pending.rankings?.[divisionOf(r, r.me) ?? ''] ?? finalRanking(regional)).indexOf(r.me) + 1;
        return { title: regional.champion === r.me ? 'Campeón' : `Terminaste ${place}.º`, text: text || 'Ni ascenso ni descenso.', next };
    }
    const won = s.champion === r.me;
    if (r.phase === 'playoff') return { title: won ? 'Ganaste' : 'Perdiste', text, next };
    if (r.phase === 'promocion') return { title: won ? 'Ganaste la promoción' : 'Perdiste la promoción', text, next };
    if (r.phase === 'tdi') return { title: won ? 'Campeón del interior' : 'Terminó el Torneo del Interior', text, next };
    return { title: won ? 'Campeón del Nacional de Clubes' : 'Terminó el Nacional', text: text || `Temporada ${r.season} cerrada.`, next };
}

/** Pasa a la etapa siguiente de la carrera. Al cerrar la temporada, `chosen` fija el Nacional de dentro de dos años. */
export function advanceCareer(s0: TourState, chosen?: NacFormat): TourState {
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
    // Partida vieja que cerró la fase regular clasificada al TDI como etapa aparte: lo juega ahora.
    if (r.phase === 'liga' && r.pending.tdi && !r.tiers && !r.tdi) {
        const which = r.pending.tdi;
        const f = tierFields(r, 'final', r.cupos, undefined, r.pending.regional);
        return stage({ ...r, phase: 'tdi', settled: null, parallel: null }, legacyTdiDef(which, which === 'A' ? f.tdiA ?? [] : f.tdiB ?? [], r.season), s.difficulty, s.duration);
    }
    // Partidas guardadas sin planteles: se arman al cerrar la primera temporada.
    if (!r.rosters) {
        r.rosters = {};
        for (const clubs of Object.values(r.divisions)) for (const c of clubs) r.rosters[c] = newRoster();
    }
    closeSeason(r, chosen);
    return seasonStart(r, s.difficulty, s.duration);
}

export function isCareerState(v: unknown): v is CareerState {
    const r = v as CareerState;
    return !!r && r.v === 1 && typeof r.me === 'string' && !!r.divisions && Array.isArray(r.history);
}

export const CAREER_PHASE_LABEL: Record<CareerPhase, string> = {
    liga: 'Temporada regular',
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
        const final = regional.def?.stage.kind === 'grupos' && regional.def.stage.advance === 2 ? 'final' : 'semifinales';
        items.push({ name: divisionLabel(myDiv), detail: `En juego · ${roundLabel(regional)} · después, ${final}`, state: 'live' });
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
    const myMatches = (p.disputes ?? []).flatMap((d) => [...d.rep.map((m) => ({ d, m, kind: 'Repechaje' })), ...(d.rev ?? []).map((m) => ({ d, m, kind: 'Reválida' }))]).filter((x) => x.m.a === r.me || x.m.b === r.me);
    for (const x of myMatches) {
        const rival = x.m.a === r.me ? x.m.b : x.m.a;
        items.push({
            name: `${x.kind} · ${TIER_NAME[x.d.up]}`,
            detail: x.m.winner ? (x.m.winner === r.me ? `Ganado contra ${nm(rival)}` : `Perdido contra ${nm(rival)}`) : `Te toca: contra ${nm(rival)}`,
            state: x.m.winner ? 'done' : r.phase === 'playoff' ? 'live' : 'next',
        });
    }
    if (!myMatches.length && t && !settledLiga) items.push({ name: 'Disputa de plazas', detail: 'Si terminás 3.º o 4.º de tu zona: repechaje, y si lo perdés, reválida', state: 'maybe' });

    // 4. Promoción (interior).
    if (r.branch === 'interior') {
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

    // 5. Nacional de Clubes.
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
    return items;
}

/** Goleadores y tryman en vivo de un torneo, con nombres. */
export function liveScorers(t: TourState, by: 'tries' | 'points', nameOf: (team: string, slot: number) => string, n = 10) {
    return topStats(t.stats, by, n).map((x) => ({ ...x, name: nameOf(x.team, x.slot) }));
}
